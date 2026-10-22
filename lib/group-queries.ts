// Consultas puras de grupos (sin 'use server'): reciben el householdId y el
// userId ya resueltos por el llamador, que es quien valida sesión y
// pertenencia. Así se evita repetir auth() + membresía por cada grupo
// (getGroupSummaries, snapshot) o por cada cálculo (seatNetDebit).
import { getLineSums } from '@/lib/debt-payments'
import type { SeatNet } from '@/lib/group-settle'
import { toCents } from '@/lib/money'
import { prisma } from '@/lib/prisma'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Gracia para reabrir un grupo cerrado: 5 días desde el cierre. */
export const GROUP_REOPEN_GRACE_MS = 5 * 24 * 60 * 60 * 1000

/**
 * Instante de cierre efectivo: `closedAt` explícito; en grupos cerrados
 * antes de registrarlo se usa `updatedAt` (congelado al cerrar).
 */
export function groupClosedTime(h: {
  closedAt: Date | null
  updatedAt: Date
}): Date {
  return h.closedAt ?? h.updatedAt
}

/** ¿Aún está dentro de la gracia de reapertura? */
export function groupReopenable(
  h: { closedAt: Date | null; updatedAt: Date },
  now: Date = new Date(),
): boolean {
  return now.getTime() - groupClosedTime(h).getTime() <= GROUP_REOPEN_GRACE_MS
}

/**
 * Neteo por seat: lo pagado menos lo consumido, ajustado por liquidaciones
 * CONFIRMED. Todo en centavos enteros para que la suma dé cero exacto.
 * El llamador debe haber verificado que el usuario es miembro del grupo.
 */
export async function computeGroupNets(
  householdId: string,
): Promise<Map<string, SeatNet>> {
  const [members, txs, settlements] = await Promise.all([
    prisma.householdMember.findMany({
      where: { householdId },
      select: { id: true, userId: true, displayName: true },
    }),
    prisma.transaction.findMany({
      where: { householdId, type: 'EXPENSE' },
      include: {
        shares: { select: { id: true, seatId: true, monthlyAmount: true } },
      },
    }),
    prisma.groupSettlement.findMany({
      where: { householdId, status: 'CONFIRMED' },
      select: { fromSeatId: true, toSeatId: true, amount: true },
    }),
  ])
  const nets = new Map<string, SeatNet>()
  for (const m of members) {
    nets.set(m.id, {
      seatId: m.id,
      userId: m.userId,
      displayName: m.displayName,
      paid: 0,
      consumed: 0,
      settledOut: 0,
      settledIn: 0,
      netCents: 0,
    })
  }
  for (const t of txs) {
    const payer =
      members.find((m) => m.id === t.paidBySeatId) ??
      members.find((m) => m.userId === t.createdById)
    if (payer) {
      const row = nets.get(payer.id)!
      row.paid = round2(row.paid + Number(t.amount))
    }
    // Las mensualidades se multiplican por los meses: lo consumido y los
    // nets son totales (igual que el monto pagado).
    const n = Math.max(1, Math.round(t.installments))
    let debtorSumC = 0
    for (const s of t.shares) {
      if (!s.seatId) continue
      const row = nets.get(s.seatId)
      if (row) {
        row.consumed = round2(row.consumed + Number(s.monthlyAmount) * n)
        debtorSumC += toCents(Number(s.monthlyAmount)) * n
      }
    }
    // Lo consumido por quien pagó (total − partes): sin esto el pagador
    // queda con saldo inflado y las sugerencias salen mal.
    const portionC = Math.max(0, toCents(Number(t.amount)) - debtorSumC)
    if (payer && portionC > 0) {
      const row = nets.get(payer.id)!
      row.consumed = round2(row.consumed + portionC / 100)
    }
  }
  // Pagos por línea confirmados legacy (hoy bloqueados en grupos): reducen
  // lo consumido pendiente, igual que una liquidación.
  const allShareIds = txs.flatMap((t) => t.shares.map((s) => s.id))
  if (allShareIds.length > 0) {
    const sums = await getLineSums(allShareIds)
    const confirmedByShare = new Map<string, number>()
    for (const [key, sm] of sums) {
      const sep = key.lastIndexOf(':')
      const sid = sep >= 0 ? key.slice(0, sep) : key
      confirmedByShare.set(sid, (confirmedByShare.get(sid) ?? 0) + sm.confirmed)
    }
    for (const t of txs) {
      for (const s of t.shares) {
        if (!s.seatId) continue
        const row = nets.get(s.seatId)
        const c = confirmedByShare.get(s.id) ?? 0
        if (row && c > 0) row.consumed = round2(row.consumed - c)
      }
    }
  }
  for (const st of settlements) {
    const from = nets.get(st.fromSeatId)
    const to = nets.get(st.toSeatId)
    const amt = Number(st.amount)
    if (from) from.settledOut = round2(from.settledOut + amt)
    if (to) to.settledIn = round2(to.settledIn + amt)
  }
  // Pagar reduce lo que debes (net menos negativo); cobrar reduce lo que
  // te deben (net menos positivo).
  for (const row of nets.values()) {
    row.netCents =
      toCents(row.paid) -
      toCents(row.consumed) +
      toCents(row.settledOut) -
      toCents(row.settledIn)
  }
  return nets
}

/** Total aún por liquidar (suma de nets positivos, en centavos). */
export async function computeGroupOutstandingCents(
  householdId: string,
): Promise<number> {
  const nets = await computeGroupNets(householdId)
  let rest = 0
  for (const row of nets.values()) {
    if (row.netCents > 0) rest += row.netCents
  }
  return rest
}

import type {
  MsiItemView,
  MsiPaymentsView,
} from '@/components/msi-concentrado'

import { installmentMonths } from '@/lib/calculations'
import { getLineSums } from '@/lib/debt-payments'
import { normalizeMoney, toCents } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import {
  activePeriods,
  installmentDate,
  periodContaining,
  type StatementTx,
} from '@/lib/statements'
import { startOfWallDay, utc, wallNow } from '@/lib/walltime'

/**
 * Concentrado de pagos a meses: mis compras a MSI + compartidas de pareja
 * donde estoy involucrado (la compré yo o la debo). Sin grupos.
 */
export async function getMsiConcentrado(meId: string): Promise<{
  msi: MsiItemView[]
  msiPayments: MsiPaymentsView
}> {
  const rows = await prisma.transaction.findMany({
    where: {
      type: 'EXPENSE',
      installments: { gt: 1 },
      householdId: null,
      OR: [{ createdById: meId }, { shares: { some: { debtorId: meId } } }],
    },
    include: {
      account: {
        select: { name: true, type: true, statementDay: true, dueDay: true },
      },
      createdBy: { select: { name: true } },
      shares: { include: { debtor: { select: { name: true } } } },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  })
  const sums = await getLineSums(rows.flatMap((t) => t.shares.map((s) => s.id)))
  const msiPayments: MsiPaymentsView = {}
  for (const [k, v] of sums) msiPayments[k] = { c: v.confirmed, p: v.pending }

  // Parcialidades liquidadas de MIS compras (clave de registro "YYYY-MM"):
  // - Débito: lo cargado ya salió de la cuenta.
  // - Crédito con corte: el periodo liquidado (cierre <= 0) liquida sus
  //   parcialidades (misma matemática que Cuentas por tarjeta).
  // Crédito sin corte: sin dato fiable, no se marca nada.
  const now = wallNow()
  const todayT = startOfWallDay(now).getTime()
  const settledByTx = new Map<string, Set<string>>()
  const pushSettled = (txId: string, payKey: string) => {
    const s = settledByTx.get(txId) ?? new Set<string>()
    s.add(payKey)
    settledByTx.set(txId, s)
  }
  for (const t of rows) {
    const n = Math.max(1, Math.round(t.installments))
    const payKeys = installmentMonths(new Date(t.date), n)
    if (t.account?.type === 'DEBIT') {
      for (let i = 0; i < n; i++) {
        if (installmentDate(new Date(t.date), i).getTime() <= todayT) {
          pushSettled(t.id, payKeys[i]!)
        }
      }
    }
  }
  const cards = new Map<
    string,
    { statementDay: number | null; dueDay: number | null }
  >()
  for (const t of rows) {
    if (
      t.accountId &&
      t.account?.type === 'CREDIT' &&
      t.account?.statementDay != null &&
      !cards.has(t.accountId)
    ) {
      cards.set(t.accountId, {
        statementDay: t.account.statementDay,
        dueDay: t.account.dueDay,
      })
    }
  }
  if (cards.size > 0) {
    const stmtStart = utc(now.getUTCFullYear(), now.getUTCMonth() - 30, 1)
    const srows = await prisma.transaction.findMany({
      where: {
        date: { gte: stmtStart },
        OR: [
          { accountId: { in: [...cards.keys()] } },
          { transferToAccountId: { in: [...cards.keys()] } },
        ],
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    })
    const txs: StatementTx[] = srows.map((t) => ({
      id: t.id,
      type: t.type as 'EXPENSE' | 'INCOME' | 'TRANSFER',
      amount: normalizeMoney(t.amount),
      concept: t.concept,
      date: t.date,
      accountId: t.accountId ?? '',
      transferToAccountId: t.transferToAccountId,
      installments: t.installments,
      statementKey: t.statementKey ?? null,
    }))
    for (const [cardId, opts] of cards) {
      const mine = txs.filter(
        (t) => t.accountId === cardId || t.transferToAccountId === cardId,
      )
      const { statements } = activePeriods(cardId, mine, opts, now)
      const liquidated = new Set(
        statements.filter((s) => toCents(s.closing) <= 0).map((s) => s.key),
      )
      if (liquidated.size === 0) continue
      for (const t of rows) {
        if (t.accountId !== cardId) continue
        const n = Math.max(1, Math.round(t.installments))
        const payKeys = installmentMonths(new Date(t.date), n)
        for (let i = 0; i < n; i++) {
          const key = periodContaining(installmentDate(new Date(t.date), i), {
            statementDay: opts.statementDay,
            dueDay: opts.dueDay,
          }).key
          if (liquidated.has(key)) pushSettled(t.id, payKeys[i]!)
        }
      }
    }
  }
  const msi: MsiItemView[] = rows.map((t) => {
    const shares = t.shares
      .filter((s) => s.debtorId != null || s.externalName != null)
      .map((s) => ({
        id: s.id,
        debtorId: s.debtorId,
        debtorName: s.debtor?.name ?? s.externalName ?? 'Pareja',
        sharePct: s.sharePct,
        monthlyAmount: normalizeMoney(s.monthlyAmount),
      }))
    const iAmDebtor = t.shares.some((s) => s.debtorId === meId)
    const iCreated = t.createdById === meId
    return {
      id: t.id,
      concept: t.concept,
      amount: normalizeMoney(t.amount),
      installments: t.installments,
      date: t.date.toISOString(),
      accountName: t.account?.name ?? 'Sin cuenta',
      accountType: (t.account?.type as 'DEBIT' | 'CREDIT' | undefined) ?? null,
      statementDay: t.account?.statementDay ?? null,
      dueDay: t.account?.dueDay ?? null,
      settledPayKeys: [...(settledByTx.get(t.id) ?? [])],
      isShared: t.isShared,
      createdById: t.createdById,
      creatorName: t.createdBy.name,
      myRole:
        !t.isShared || (!iAmDebtor && iCreated && shares.length === 0)
          ? ('mine' as const)
          : iCreated
            ? ('creditor' as const)
            : ('debtor' as const),
      shares,
    }
  })
  return { msi, msiPayments }
}

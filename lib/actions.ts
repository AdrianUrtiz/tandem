'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { debtorMonthlyAmount } from '@/lib/calculations'
import { checkCategory } from '@/lib/catalog'
import { getLineSums, lineKey } from '@/lib/debt-payments'
import {
  fromCents,
  moneySchema,
  optionalMoneySchema,
  toCents,
} from '@/lib/money'
import { PLACE_MAX_LEN } from '@/lib/place-format'
import { touchPlace } from '@/lib/places'
import { touchCompanions } from '@/lib/companions'
import { prisma } from '@/lib/prisma'
import { formatMoney } from '@/lib/utils'
import { parseWallInput, wallNow } from '@/lib/walltime'

import { auth } from '@/auth'

const AccountSchema = z.object({
  name: z.string().min(2, 'Nombre muy corto'),
  type: z.enum(['DEBIT', 'CREDIT']),
  lastFour: z.string().optional(),
  expiry: z.string().optional(),
  color: z.string().optional(),
  bankId: z.string().max(32).optional(),
  initialBalance: z.coerce
    .number()
    .min(0)
    .default(0)
    .transform((v) => fromCents(toCents(v))),
  creditLimit: z.coerce
    .number()
    .min(0)
    .optional()
    .transform((v) => (v == null ? v : fromCents(toCents(v)))),
  statementDay: z.coerce.number().min(1).max(31).optional(),
  dueDay: z.coerce.number().min(1).max(31).optional(),
  isFavorite: z.string().optional(),
})

const EXPIRY_RE = /^(0[1-9]|1[0-2])\/\d{2}$/

function normalizeExpiry(raw: unknown): string | null {
  const v = typeof raw === 'string' ? raw.trim() : ''
  return v === '' ? null : v
}

export async function createAccount(formData: FormData) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para guardar cuentas' }

  const parsed = AccountSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  if (v.type === 'CREDIT' && !v.creditLimit)
    return { error: 'La tarjeta necesita límite de crédito' }
  const expiry = normalizeExpiry(v.expiry)
  if (expiry && !EXPIRY_RE.test(expiry))
    return { error: 'Vencimiento inválido, usa MM/AA' }

  await prisma.account.create({
    data: {
      name: v.name,
      type: v.type,
      userId,
      lastFour: v.lastFour || null,
      expiry,
      color: v.color || '#6366f1',
      bankId: v.bankId?.trim() ? v.bankId.trim() : null,
      position: await prisma.account.count({ where: { userId } }),
      isFavorite: v.isFavorite === '1',
      initialBalance: v.type === 'DEBIT' ? v.initialBalance : null,
      creditLimit: v.type === 'CREDIT' ? (v.creditLimit ?? null) : null,
      statementDay: v.type === 'CREDIT' ? (v.statementDay ?? null) : null,
      dueDay: v.type === 'CREDIT' ? (v.dueDay ?? null) : null,
    },
  })
  if (v.isFavorite === '1') {
    const fav = await prisma.account.findFirst({
      where: { userId, isFavorite: true },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    if (fav) {
      await prisma.account.updateMany({
        where: { userId, id: { not: fav.id } },
        data: { isFavorite: false },
      })
    }
  }

  revalidatePath('/cuentas')
  return { ok: true }
}

const UpdateAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2, 'Nombre muy corto'),
  lastFour: z.string().optional(),
  expiry: z.string().optional(),
  color: z.string().optional(),
  bankId: z.string().max(32).optional(),
  creditLimit: z.coerce
    .number()
    .min(0)
    .optional()
    .transform((v) => (v == null ? v : fromCents(toCents(v)))),
  statementDay: z.coerce.number().min(1).max(31).optional(),
  dueDay: z.coerce.number().min(1).max(31).optional(),
  isFavorite: z.string().optional(),
})

// Edición solo del dueño. No se toca type ni initialBalance
// (el saldo se deriva de los movimientos, lib/balances.ts).
export async function updateAccount(formData: FormData) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para guardar cambios' }

  const parsed = UpdateAccountSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data
  const expiry = normalizeExpiry(v.expiry)
  if (expiry && !EXPIRY_RE.test(expiry))
    return { error: 'Vencimiento inválido, usa MM/AA' }

  const acc = await prisma.account.findFirst({
    where: { id: v.id, userId },
    select: { id: true, type: true, color: true, creditLimit: true },
  })
  if (!acc) return { error: 'Cuenta no encontrada' }

  // Escritura atómica con predicado de pertenencia: si la cuenta dejó de ser
  // mía entre la lectura y la escritura, `count` es 0 y no se toca nada.
  const written = await prisma.account.updateMany({
    where: { id: v.id, userId },
    data: {
      name: v.name,
      lastFour: v.lastFour?.trim() ? v.lastFour.trim() : null,
      expiry,
      color: v.color || acc.color,
      bankId: v.bankId?.trim() ? v.bankId.trim() : null,
      ...(acc.type === 'CREDIT'
        ? {
            creditLimit: v.creditLimit ?? acc.creditLimit,
            statementDay: v.statementDay ?? null,
            dueDay: v.dueDay ?? null,
          }
        : {}),
    },
  })
  if (written.count === 0) return { error: 'Cuenta no encontrada' }
  if (v.isFavorite === '1') {
    await prisma.account.updateMany({
      where: { userId, id: { not: v.id } },
      data: { isFavorite: false },
    })
    const fav = await prisma.account.updateMany({
      where: { id: v.id, userId },
      data: { isFavorite: true },
    })
    if (fav.count === 0) return { error: 'Cuenta no encontrada' }
  }

  revalidatePath('/cuentas')
  return { ok: true }
}

// Eliminado suave: oculta la cuenta pero conserva el historial de movimientos.
// Solo el dueño puede eliminarla.
export async function deleteAccount(id: string) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para eliminar cuentas' }

  const acc = await prisma.account.findFirst({
    where: { id, userId },
    select: { id: true },
  })
  if (!acc) return { error: 'Cuenta no encontrada' }

  const removed = await prisma.account.updateMany({
    where: { id, userId },
    data: { isActive: false, isFavorite: false },
  })
  if (removed.count === 0) return { error: 'Cuenta no encontrada' }

  revalidatePath('/cuentas')
  return { ok: true }
}

// Ocultar/mostrar: saca la cuenta de listas, totales y selectores sin borrar
// nada (el historial se conserva). Solo el dueño puede hacerlo.
export async function setAccountHidden(id: string, hidden: boolean) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para ocultar cuentas' }

  const acc = await prisma.account.findFirst({
    where: { id, userId },
    select: { id: true, isHidden: true },
  })
  if (!acc) return { error: 'Cuenta no encontrada' }

  // Siempre debe quedar al menos una cuenta visible.
  if (hidden && !acc.isHidden) {
    const others = await prisma.account.count({
      where: { userId, isActive: true, isHidden: false, id: { not: id } },
    })
    if (others === 0)
      return { error: 'Debe quedar al menos una cuenta visible' }
  }

  const updated = await prisma.account.updateMany({
    where: { id, userId },
    data: hidden ? { isHidden: true, isFavorite: false } : { isHidden: false },
  })
  if (updated.count === 0) return { error: 'Cuenta no encontrada' }

  revalidatePath('/cuentas')
  revalidatePath('/actividad')
  return { ok: true }
}

// Favorita: una sola por usuario; va primera en listas y preseleccionada
// en formularios (los selectores usan accountOptions[0]).
export async function setFavoriteAccount(id: string) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para guardar cambios' }

  const acc = await prisma.account.findFirst({
    where: { id, userId, isActive: true, isHidden: false },
    select: { id: true },
  })
  if (!acc) return { error: 'Cuenta no encontrada' }

  // La segunda escritura lleva el mismo predicado: si la cuenta dejó de ser
  // visible/mía entre ambas, no se marca favorita ajena.
  await prisma.$transaction([
    prisma.account.updateMany({
      where: { userId, isFavorite: true },
      data: { isFavorite: false },
    }),
    prisma.account.updateMany({
      where: { id, userId, isActive: true, isHidden: false },
      data: { isFavorite: true },
    }),
  ])

  revalidatePath('/cuentas')
  revalidatePath('/actividad')
  return { ok: true }
}

// Reorden manual con visibilidad: `visibleIds`/`hiddenIds` en el orden
// visual deseado (favorita excluida, siempre va primera y nunca se oculta
// por aquí). Las ocultas se numeran después de las visibles para no alterar
// los ordenamientos existentes. Debe quedar al menos una visible.
export async function reorderAccounts(input: {
  visibleIds: string[]
  hiddenIds: string[]
}) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para guardar cambios' }

  const owned = await prisma.account.findMany({
    where: { userId, isActive: true },
    select: { id: true, isHidden: true, isFavorite: true, position: true },
  })
  const ownedIds = new Set(owned.map((a) => a.id))
  const byId = new Map(owned.map((a) => [a.id, a]))
  const cleanVisible = input.visibleIds.filter((id) => ownedIds.has(id))
  // La favorita va fija y visible: si llega en ocultas se ignora ahí y se
  // repone abajo en visibles.
  const cleanHidden = input.hiddenIds.filter(
    (id) => ownedIds.has(id) && !byId.get(id)?.isFavorite,
  )
  // Cuentas propias no enviadas (cliente desactualizado): se conservan al
  // final de su grupo actual para no perderlas ni colisionar posiciones.
  const sent = new Set([...cleanVisible, ...cleanHidden])
  const missing = owned
    .filter((a) => !sent.has(a.id))
    .sort((x, y) => (x.position ?? 0) - (y.position ?? 0))
  const finalVisible = [...cleanVisible]
  const finalHidden = [...cleanHidden]
  for (const m of missing) {
    if (m.isFavorite || !m.isHidden) {
      if (!finalVisible.includes(m.id)) finalVisible.push(m.id)
    } else if (!finalHidden.includes(m.id)) {
      finalHidden.push(m.id)
    }
  }
  if (finalVisible.length === 0)
    return { error: 'Debe quedar al menos una cuenta visible' }

  await prisma.$transaction([
    ...finalVisible.map((id, i) =>
      prisma.account.updateMany({
        where: { id, userId },
        data: { position: i, isHidden: false },
      }),
    ),
    ...finalHidden.map((id, j) =>
      prisma.account.updateMany({
        where: { id, userId },
        data: {
          position: finalVisible.length + j,
          isHidden: true,
          isFavorite: false,
        },
      }),
    ),
  ])

  revalidatePath('/cuentas')
  revalidatePath('/actividad')
  return { ok: true }
}

const UpdateTxSchema = z.object({
  id: z.string().min(1),
  amount: moneySchema,
  concept: z.string().min(2, 'Agrega un concepto'),
  // Lugar de compra (opcional): se guarda para sugerirlo después.
  place: z.string().trim().max(PLACE_MAX_LEN).optional(),
  category: z.string().default('OTRO'),
  date: z.string(),
  // Opcional: los gastos grupales sin cuenta indicada no la tienen.
  accountId: z.string().optional(),
  transferToAccountId: z.string().optional(),
  // Compartido (solo gastos): permite activar/editar el reparto o el nombre
  // de la persona sin cuenta. El tipo y los MSI siguen fijos.
  isShared: z.coerce.boolean().default(false),
  sharePct: z.coerce.number().min(1).max(100).default(50),
  shareAmount: optionalMoneySchema,
  debtorId: z.string().optional(),
  externalName: z.string().trim().min(1).max(40).optional(),
  // Gasto en grupo (v1): N integrantes como JSON.
  // [{ debtorId?, externalName?, amount }] — uno de los dos por fila.
  sharesJson: z.string().optional(),
})

// Edición solo del creador. Editables: concepto, monto, categoría, fecha,
// cuenta y —en gastos— el compartido (con quién y su aportación).
// Tipo y MSI quedan fijos (definen las parcialidades).
// Gasto en grupo (v1): un integrante aporta una parte del total.
// Exactamente uno de debtorId / externalName por fila.
export type MultiShareInput = {
  debtorId?: string | null
  externalName?: string | null
  amount: number
}

function cleanExternal(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().replace(/\s+/g, ' ')
  if (v.length < 1 || v.length > 40) return null
  return v
}

/**
 * Parsea y valida `sharesJson` para gasto en grupo.
 * - 1..10 filas, cada una con debtorId XOR externalName y amount > 0.
 * - Deduplica por identidad: `debtor:<id>` vs `ext:<nombre-lower>`.
 *   "Michi" pareja + "michi" texto son 2 integrantes válidos.
 * - Suma de partes <= total (el resto lo absorbo yo).
 * Devuelve filas limpias o mensaje de error.
 */
function parseMultiShares(
  raw: unknown,
  total: number,
): { shares?: MultiShareInput[]; error?: string } {
  if (raw == null || raw === '') return {}
  if (typeof raw !== 'string') return { error: 'Reparto inválido' }
  let arr: unknown
  try {
    arr = JSON.parse(raw)
  } catch {
    return { error: 'Reparto inválido' }
  }
  if (!Array.isArray(arr) || arr.length === 0)
    return { error: 'Agrega al menos un integrante' }
  if (arr.length > 10) return { error: 'Máximo 10 integrantes' }
  const out: MultiShareInput[] = []
  const seen = new Set<string>()
  const totalC = toCents(total)
  let sumC = 0
  for (const row of arr) {
    if (typeof row !== 'object' || row == null)
      return { error: 'Reparto inválido' }
    const r = row as Record<string, unknown>
    const debtorId =
      typeof r.debtorId === 'string' && r.debtorId ? r.debtorId : null
    const externalName = cleanExternal(r.externalName)
    const amount = Number(r.amount)
    if (debtorId && externalName)
      return { error: 'Elige pareja o nombre, no ambos' }
    if (!debtorId && !externalName)
      return { error: 'Falta quién aporta en el reparto' }
    if (!(amount > 0) || Number.isNaN(amount))
      return { error: 'Reparto inválido' }
    const key = debtorId
      ? `debtor:${debtorId}`
      : `ext:${(externalName as string).toLowerCase()}`
    if (seen.has(key)) return { error: 'Hay integrantes duplicados' }
    seen.add(key)
    const amtC = toCents(amount)
    if (amtC <= 0) return { error: 'Reparto inválido' }
    sumC += amtC
    out.push({ debtorId, externalName, amount })
  }
  if (sumC - totalC > 0)
    return { error: 'La suma de las partes no puede ser mayor al total' }
  return { shares: out }
}

export async function updateTransaction(formData: FormData) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para guardar cambios' }

  const raw = Object.fromEntries(formData)
  const parsed = UpdateTxSchema.safeParse({
    ...raw,
    isShared: raw.isShared === 'on' || raw.isShared === 'true',
  })
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  const tx = await prisma.transaction.findFirst({
    where: { id: v.id },
    include: {
      account: true,
      shares: true,
      paidBySeat: { select: { userId: true } },
      household: { select: { kind: true, status: true } },
    },
  })
  if (!tx) return { error: 'Movimiento no encontrado' }
  // Permiso: el creador siempre; en gastos grupales también el pagador
  // (aunque otro lo haya registrado a su nombre).
  const groupTxPerm = tx.householdId != null
  const isCreator = tx.createdById === userId
  const isPayer = groupTxPerm && (tx.paidBySeat?.userId ?? null) === userId
  if (!isCreator && !isPayer) return { error: 'Movimiento no encontrado' }
  if (groupTxPerm && tx.household?.status === 'CLOSED')
    return { error: 'Este grupo está cerrado' }

  // Pagos de pareja ligados: CONFIRMED bloquea (historia acordada);
  // PENDING se sincroniza al nuevo monto (validado contra el restante).
  const linkedPayments = await prisma.debtPayment.findMany({
    where: { OR: [{ transactionId: v.id }, { debtorTransactionId: v.id }] },
    select: {
      id: true,
      status: true,
      shareId: true,
      month: true,
      amount: true,
    },
  })
  if (linkedPayments.some((p) => p.status === 'CONFIRMED')) {
    return { error: 'Este movimiento ya fue confirmado en Pareja' }
  }
  const pendingLinks = linkedPayments.filter((p) => p.status === 'PENDING')
  for (const p of pendingLinks) {
    const share = await prisma.transactionShare.findUnique({
      where: { id: p.shareId },
      select: { monthlyAmount: true },
    })
    if (!share) return { error: 'Aportación no encontrada' }
    const sums = await getLineSums([p.shareId])
    const confirmed = sums.get(lineKey(p.shareId, p.month))?.confirmed ?? 0
    const rest = fromCents(
      Math.max(0, toCents(share.monthlyAmount) - toCents(confirmed)) +
        toCents(p.amount),
    )
    if (toCents(v.amount) - toCents(rest) > 0) {
      return {
        error: `Solo restan ${formatMoney(rest)} en esa parcialidad`,
      }
    }
  }

  const catError = await checkCategory(
    userId,
    v.category,
    tx.type as 'EXPENSE' | 'INCOME' | 'TRANSFER',
  )
  if (catError) return { error: catError }

  const newAcc = v.accountId
    ? await prisma.account.findFirst({
        where: { id: v.accountId, userId },
      })
    : null
  // La cuenta de un gasto grupal se indica desde el grupo, no aquí.
  const groupTxEarly = tx.householdId != null
  if (!groupTxEarly && !newAcc) return { error: 'Cuenta no encontrada' }

  // Traspaso: solo se reescribe la fila (el saldo se deriva por suma).
  if (tx.type === 'TRANSFER') {
    if (groupTxEarly || !newAcc) return { error: 'Movimiento no editable aquí' }
    const newDestId = v.transferToAccountId
    if (!newDestId || newDestId === v.accountId)
      return { error: 'Elige una cuenta destino distinta' }
    const newDest = await prisma.account.findFirst({
      where: { id: newDestId, userId },
    })
    if (!newDest) return { error: 'Cuenta destino no encontrada' }
    if (newAcc.type !== 'DEBIT')
      return { error: 'El traspaso debe salir de una cuenta de débito' }
    if (!tx.transferToAccountId)
      return { error: 'Este movimiento no tiene destino registrado' }

    const transferWritten = await prisma.transaction.updateMany({
      where: { id: v.id, createdById: userId },
      data: {
        amount: v.amount,
        concept: v.concept,
        date: parseWallInput(v.date),
        accountId: v.accountId as string,
        transferToAccountId: newDestId,
      },
    })
    if (transferWritten.count === 0)
      return { error: 'Movimiento no encontrado' }
    await touchPlace(userId, v.place)

    revalidatePath('/actividad')
    revalidatePath('/resumen')
    revalidatePath('/cuentas')
    return { ok: true }
  }

  // Compartido (solo gastos individuales): resuelve el destino y valida el
  // reparto. Los gastos de grupo (householdId) conservan sus seats.
  // Gasto en grupo (v1): N shares vía sharesJson; legado: 1 share.
  const groupTx = tx.householdId != null
  const wantsShare = tx.type === 'EXPENSE' && !groupTx && v.isShared
  const multiParsed =
    wantsShare && tx.type === 'EXPENSE'
      ? parseMultiShares(v.sharesJson, v.amount)
      : {}
  if (multiParsed.error) return { error: multiParsed.error }
  const multiShares = multiParsed.shares ?? null
  let shareDebtorId: string | null = null
  let shareExternalName: string | null = null
  if (wantsShare && !multiShares) {
    if (v.externalName && v.debtorId)
      return { error: 'Elige una opción: tu pareja o un nombre, no ambas' }
    if (v.externalName) {
      shareExternalName = v.externalName
    } else {
      const { getPartnerId } = await import('@/lib/households')
      const partnerId = v.debtorId ?? (await getPartnerId(userId))
      if (!partnerId)
        return { error: 'Vincula una pareja o escribe con quién compartes' }
      if (v.debtorId && v.debtorId !== partnerId)
        return { error: 'Solo puedes compartir con tu pareja vinculada' }
      shareDebtorId = partnerId
    }
    if (v.shareAmount != null && v.shareAmount > v.amount)
      return { error: 'La aportación no puede ser mayor al total' }
  }
  if (wantsShare && multiShares) {
    const { getPartnerId } = await import('@/lib/households')
    const partnerId = await getPartnerId(userId)
    for (const s of multiShares) {
      if (s.debtorId === '__PARTNER__') {
        if (!partnerId) return { error: 'Vincula una pareja para incluirla' }
        s.debtorId = partnerId
      } else if (s.debtorId && s.debtorId !== partnerId) {
        return { error: 'Solo puedes compartir con tu pareja vinculada' }
      }
      if (s.externalName && !cleanExternal(s.externalName))
        return { error: 'Nombre inválido (1-40 letras)' }
    }
    // Sin pareja vinculada, solo externos.
    if (!partnerId && multiShares.some((s) => s.debtorId))
      return { error: 'Vincula una pareja para incluirla' }
  }

  // Pagos vivos sobre los shares de este gasto: con PENDING/CONFIRMED no se
  // tocan integrantes, reparto ni monto (primero cancélalos).
  const shareIds = tx.shares.map((s) => s.id)
  const sharePayments =
    shareIds.length > 0
      ? await prisma.debtPayment.findMany({
          where: {
            shareId: { in: shareIds },
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
          select: { id: true },
        })
      : []
  const hasSharePayments = sharePayments.length > 0
  const currentKey =
    tx.shares.length === 0
      ? null
      : tx.shares.length === 1 && !multiShares
        ? (tx.shares[0].debtorId ?? tx.shares[0].externalName)
        : `multi:${[...tx.shares]
            .map((s) => s.debtorId ?? `ext:${(s.externalName ?? '').toLowerCase()}`)
            .sort()
            .join('|')}`
  const nextKey = !wantsShare
    ? null
    : multiShares
      ? `multi:${[...multiShares]
          .map((s) => s.debtorId ?? `ext:${(s.externalName ?? '').toLowerCase()}`)
          .sort()
          .join('|')}`
      : (shareDebtorId ?? shareExternalName)
  const changedWho =
    !groupTx && tx.type === 'EXPENSE' && currentKey !== nextKey
  // Monto o reparto tocados con pagos vivos: se bloquea.
  const changedAmounts =
    !groupTx &&
    tx.type === 'EXPENSE' &&
    wantsShare &&
    (toCents(v.amount) !== toCents(tx.amount) || changedWho)
  if (hasSharePayments && (changedWho || changedAmounts))
    return {
      error:
        'Hay pagos registrados en este compartido: cancélalos para cambiarlo',
    }

  // Cambiar con quién se comparte (o quitarlo) con un pago pendiente vivo
  // dejaría el reclamo colgado: primero cancélalo.
  if (pendingLinks.length > 0 && changedWho)
    return {
      error:
        'Hay un pago pendiente en este compartido: cancélalo para cambiarlo',
    }

  // Escritura atómica con predicado de permiso (creador o pagador del gasto
  // grupal): si el permiso cambió entre la lectura y la escritura, no se toca.
  const txWritten = await prisma.transaction.updateMany({
    where: {
      id: v.id,
      OR: [{ createdById: userId }, { paidBySeat: { userId } }],
    },
    data: {
      amount: v.amount,
      concept: v.concept,
      category: v.category,
      date: parseWallInput(v.date),
      // La cuenta de un gasto grupal se indica desde el grupo, no aquí.
      ...(groupTx ? {} : { accountId: v.accountId as string }),
      ...(tx.type === 'EXPENSE' && !groupTx ? { isShared: wantsShare } : {}),
    },
  })
  if (txWritten.count === 0) return { error: 'Movimiento no encontrado' }

  // Sincroniza los reclamos pendientes al nuevo monto.
  for (const p of pendingLinks) {
    await prisma.debtPayment.update({
      where: { id: p.id },
      data: { amount: v.amount },
    })
  }

  // Aplica el compartido: quitar, crear o repartir de nuevo. Los montos
  // fijos pactados se recalculan igual al editar (ahora es editable).
  // En gastos grupales el reparto (seats) es fijo, pero si cambia el monto
  // se reescalan las partes proporcionalmente (se conserva cada sharePct).
  // Gasto en grupo: se reescriben los N shares (sin pagos vivos arriba).
  if (tx.type === 'EXPENSE' && !groupTx) {
    const n = Math.max(1, Math.round(tx.installments))
    if (!wantsShare) {
      if (tx.shares.length > 0) {
        await prisma.transactionShare.deleteMany({
          where: { transactionId: tx.id },
        })
      }
    } else if (multiShares) {
      await prisma.transactionShare.deleteMany({
        where: { transactionId: tx.id },
      })
      for (const s of multiShares) {
        const amtC = toCents(s.amount)
        await prisma.transactionShare.create({
          data: {
            transactionId: tx.id,
            debtorId: s.debtorId ?? null,
            externalName: s.externalName ?? null,
            sharePct: (amtC / toCents(v.amount)) * 100,
            monthlyAmount: fromCents(Math.round(amtC / n)),
            isFixedAmount: true,
          },
        })
      }
    } else {
      const sharePct =
        v.shareAmount != null
          ? (toCents(v.shareAmount) / toCents(v.amount)) * 100
          : v.sharePct
      const monthlyAmount =
        v.shareAmount != null
          ? fromCents(Math.round(toCents(v.shareAmount) / n))
          : debtorMonthlyAmount(v.amount, n, v.sharePct)
      const data = {
        debtorId: shareDebtorId,
        externalName: shareExternalName,
        sharePct,
        monthlyAmount,
        isFixedAmount: v.shareAmount != null,
      }
      const current = tx.shares[0] ?? null
      if (current && tx.shares.length === 1) {
        await prisma.transactionShare.update({
          where: { id: current.id },
          data,
        })
      } else {
        if (tx.shares.length > 1) {
          await prisma.transactionShare.deleteMany({
            where: { transactionId: tx.id },
          })
        }
        await prisma.transactionShare.create({
          data: { transactionId: tx.id, ...data },
        })
      }
    }
  }

  if (groupTx && tx.type === 'EXPENSE') {
    // El reparto (seats) es fijo, pero si cambió el monto se reescalan las
    // partes proporcionalmente (se conserva cada sharePct; el último absorbe
    // el redondeo para que la suma cuadre exacta).
    const newTotalC = toCents(v.amount)
    if (newTotalC !== toCents(tx.amount) && tx.shares.length > 0) {
      const ordered = [...tx.shares].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )
      let assigned = 0
      for (let i = 0; i < ordered.length; i++) {
        const last = i === ordered.length - 1
        const monthlyC = last
          ? newTotalC - assigned
          : Math.round((newTotalC * ordered[i].sharePct) / 100)
        assigned += monthlyC
        await prisma.transactionShare.update({
          where: { id: ordered[i].id },
          data: { monthlyAmount: fromCents(monthlyC) },
        })
      }
    }
    // El espejo personal del pagador sigue al gasto (mismo monto/datos).
    if (tx.payerTransactionId) {
      await prisma.transaction.updateMany({
        where: { id: tx.payerTransactionId },
        data: {
          amount: v.amount,
          concept: v.concept,
          category: v.category,
          date: parseWallInput(v.date),
        },
      })
    }
  }

  revalidatePath('/actividad')
  revalidatePath('/resumen')
  revalidatePath('/cuentas')
  revalidatePath('/grupos')
  await touchPlace(userId, v.place)
  // Amigos del gasto en grupo / compartido externo: sugerencias a futuro.
  await touchCompanions(userId, [
    ...(multiShares?.map((s) => s.externalName) ?? []),
    shareExternalName,
  ])
  return { ok: true }
}

// Borrado físico. El saldo se deriva por suma, así que basta borrar la fila.
// Permiso: el creador siempre; en gastos grupales también el pagador (aunque
// otro lo haya registrado a su nombre). Si el gasto tiene espejo personal
// del pagador, se borra con él (solo existe por este gasto).
// Solo el creador. Si el movimiento es parte de un pago de pareja:
// - PENDING (la contraparte aún no confirma) → se puede borrar; el reclamo
//   pendiente se elimina con él.
// - CONFIRMED (ya confirmado) → bloqueado, primero cancélalo en Pareja.
// Los cargos de suscripción siguen bloqueados (tienen su propio flujo).
// Los grupos cerrados no se tocan (consistencia con el resto de flujos).
export async function deleteTransaction(id: string) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para eliminar movimientos' }

  const tx = await prisma.transaction.findFirst({
    where: { id },
    include: {
      account: true,
      debtPayment: true,
      debtorSourcePayment: true,
      charges: { select: { id: true } },
      paidBySeat: { select: { userId: true } },
      household: { select: { kind: true, status: true } },
    },
  })
  if (!tx) return { error: 'Movimiento no encontrado' }
  const groupTx = tx.householdId != null
  const isCreator = tx.createdById === userId
  const isPayer = groupTx && (tx.paidBySeat?.userId ?? null) === userId
  if (!isCreator && !isPayer) return { error: 'Movimiento no encontrado' }
  if (groupTx && tx.household?.status === 'CLOSED')
    return { error: 'Este grupo está cerrado' }

  const linkedPayments = [tx.debtPayment, tx.debtorSourcePayment].filter(
    (p): p is NonNullable<typeof p> => p != null,
  )
  if (linkedPayments.some((p) => p.status === 'CONFIRMED')) {
    return {
      error: 'Este pago ya fue confirmado por tu pareja: cancélalo en Pareja',
    }
  }
  if (linkedPayments.length > 0) {
    // Reclamos aún no confirmados: mueren con el movimiento.
    await prisma.debtPayment.deleteMany({
      where: { id: { in: linkedPayments.map((p) => p.id) } },
    })
  }
  if (tx.charges.length > 0) {
    return { error: 'Este movimiento es un cargo de suscripción confirmado' }
  }
  if (tx.subscriptionId) {
    return { error: 'Este movimiento es un cargo de suscripción confirmado' }
  }

  const txDeleted = await prisma.transaction.deleteMany({
    where: {
      id,
      OR: [{ createdById: userId }, { paidBySeat: { userId } }],
    },
  })
  if (txDeleted.count === 0) return { error: 'Movimiento no encontrado' }
  // Espejo personal del pagador: solo existe por este gasto grupal.
  if (tx.payerTransactionId) {
    await prisma.transaction.deleteMany({
      where: { id: tx.payerTransactionId },
    })
  }

  revalidatePath('/actividad')
  revalidatePath('/resumen')
  revalidatePath('/cuentas')
  revalidatePath('/grupos')
  return { ok: true }
}

const TxSchema = z.object({
  type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']).default('EXPENSE'),
  amount: moneySchema,
  concept: z.string().min(2, 'Agrega un concepto'),
  // Lugar de compra (opcional): se guarda para sugerirlo después.
  place: z.string().trim().max(PLACE_MAX_LEN).optional(),
  category: z.string().default('OTRO'),
  date: z.string().default(() => wallNow().toISOString()),
  accountId: z.string().min(1, 'Elige una cuenta'),
  transferToAccountId: z.string().optional(),
  installments: z.coerce.number().min(1).max(24).default(1),
  statementKey: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Período inválido')
    .optional(),
  isShared: z.coerce.boolean().default(false),
  sharePct: z.coerce.number().min(1).max(100).default(50),
  shareAmount: optionalMoneySchema,
  debtorId: z.string().optional(),
  // Compartido con alguien sin cuenta (ej. "Mamá"): solo su nombre.
  // Excluyente con `debtorId`.
  externalName: z.string().trim().min(1).max(40).optional(),
  // Gasto en grupo (v1): N integrantes como JSON.
  sharesJson: z.string().optional(),
  // Llave de idempotencia de la cola offline (outbox): `temp-<uuid>`
  // generado en el dispositivo. Solo la manda el drenado offline.
  clientKey: z.string().min(1).max(64).optional(),
})

export async function createTransaction(formData: FormData) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para guardar movimientos' }

  const raw = Object.fromEntries(formData)
  const parsed = TxSchema.safeParse({
    ...raw,
    isShared: raw.isShared === 'on' || raw.isShared === 'true',
  })
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data
  const catError = await checkCategory(
    userId,
    v.category,
    v.type as 'EXPENSE' | 'INCOME' | 'TRANSFER',
  )
  if (catError) return { error: catError }

  // Solo cuentas propias: nadie opera ni ve cuentas de su pareja.
  const account = await prisma.account.findFirst({
    where: { id: v.accountId, userId },
  })
  if (!account) return { error: 'Cuenta no encontrada' }

  // Idempotencia offline: si esta llave ya se subió (reintento tras éxito),
  // no se duplica; se devuelve ok para que el dispositivo limpie su cola.
  if (v.clientKey) {
    const dup = await prisma.transaction.findUnique({
      where: { clientKey: v.clientKey },
      select: { id: true },
    })
    if (dup) {
      revalidatePath('/actividad')
      revalidatePath('/resumen')
      revalidatePath('/cuentas')
      return { ok: true }
    }
  }

  // Traspaso entre cuentas propias: sale de un débito y llega a débito o crédito.
  if (v.type === 'TRANSFER') {
    const destId = v.transferToAccountId
    if (!destId || destId === v.accountId)
      return { error: 'Elige una cuenta destino distinta' }
    const dest = await prisma.account.findFirst({
      where: { id: destId, userId },
    })
    if (!dest) return { error: 'Cuenta destino no encontrada' }
    if (account.type !== 'DEBIT')
      return { error: 'El traspaso debe salir de una cuenta de débito' }

    try {
      await prisma.transaction.create({
        data: {
          type: 'TRANSFER',
          amount: v.amount,
          concept: v.concept,
          category: v.category,
          date: parseWallInput(v.date),
          accountId: v.accountId,
          transferToAccountId: destId,
          createdById: userId,
          installments: 1,
          isShared: false,
          // Pago a crédito desde su botón Pagar: se aplica a ese período
          // aunque la fecha sea posterior al vencimiento.
          statementKey:
            dest.type === 'CREDIT' ? (v.statementKey ?? null) : null,
          clientKey: v.clientKey ?? null,
        },
      })
    } catch (e) {
      // Carrera de reintentos con la misma llave: el otro ya la guardó.
      if (
        v.clientKey &&
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code?: string }).code === 'P2002'
      ) {
        revalidatePath('/actividad')
        revalidatePath('/resumen')
        revalidatePath('/cuentas')
        return { ok: true }
      }
      throw e
    }

    await touchPlace(userId, v.place)
    revalidatePath('/actividad')
    revalidatePath('/resumen')
    revalidatePath('/cuentas')
    return { ok: true }
  }

  // Determina al deudor: mi pareja vinculada o una persona sin cuenta
  // (externalName). Sin uno de los dos no se puede compartir.
  // Gasto en grupo (v1): N integrantes vía sharesJson.
  let debtorId: string | null = null
  let externalName: string | null = null
  let multiShares: MultiShareInput[] | null = null
  if (v.isShared && v.sharesJson) {
    const parsed = parseMultiShares(v.sharesJson, v.amount)
    if (parsed.error) return { error: parsed.error }
    multiShares = parsed.shares ?? null
    if (multiShares && multiShares.length > 0) {
      const { getPartnerId } = await import('@/lib/households')
      const partnerId = await getPartnerId(userId)
      for (const s of multiShares) {
        if (s.debtorId === '__PARTNER__') {
          if (!partnerId)
            return { error: 'Vincula una pareja para incluirla' }
          s.debtorId = partnerId
        } else if (s.debtorId && s.debtorId !== partnerId) {
          return { error: 'Solo puedes compartir con tu pareja vinculada' }
        }
      }
      if (!partnerId && multiShares.some((s) => s.debtorId))
        return { error: 'Vincula una pareja para incluirla' }
      if (v.type !== 'EXPENSE')
        return { error: 'Solo los gastos se comparten' }
    }
  }
  if (v.isShared && !multiShares) {
    if (v.externalName && v.debtorId)
      return { error: 'Elige una opción: tu pareja o un nombre, no ambas' }
    if (v.externalName) {
      // Compartido "de recordatorio": persona sin cuenta en la app.
      externalName = v.externalName
    } else if (v.debtorId) {
      const { getPartnerId } = await import('@/lib/households')
      const partnerId = await getPartnerId(userId)
      if (!partnerId)
        return { error: 'Vincula una pareja en Ajustes para compartir' }
      if (v.debtorId !== partnerId)
        return { error: 'Solo puedes compartir con tu pareja vinculada' }
      debtorId = v.debtorId
    } else {
      const { getPartnerId } = await import('@/lib/households')
      debtorId = await getPartnerId(userId)
      if (!debtorId) return { error: 'Escribe con quién compartes el gasto' }
    }
    if (externalName == null && (!debtorId || debtorId === userId))
      return { error: 'Escribe con quién compartes el gasto' }
  }

  if (
    v.type === 'EXPENSE' &&
    v.isShared &&
    !multiShares &&
    v.shareAmount &&
    v.shareAmount > v.amount
  ) {
    return { error: 'La aportación no puede ser mayor al total' }
  }

  // El saldo se deriva por suma (lib/balances.ts): solo se crean filas.
  // Movimiento + share en una transacción para no dejar mitades.
  try {
    await prisma.$transaction(async (db) => {
      const tx = await db.transaction.create({
        data: {
          type: v.type as 'EXPENSE' | 'INCOME' | 'TRANSFER',
          amount: v.amount,
          concept: v.concept,
          category: v.category,
          date: parseWallInput(v.date),
          accountId: v.accountId,
          createdById: userId,
          installments: v.type === 'EXPENSE' ? Math.round(v.installments) : 1,
          isShared: v.type === 'EXPENSE' && v.isShared,
          // Abono directo a crédito desde su botón Pagar.
          statementKey:
            v.type === 'INCOME' && account.type === 'CREDIT'
              ? (v.statementKey ?? null)
              : null,
          clientKey: v.clientKey ?? null,
        },
      })

      if (v.type === 'EXPENSE' && v.isShared && multiShares && multiShares.length > 0) {
        // Gasto en grupo: N partes explícitas (montos ya validados, suman <= total).
        const n = Math.max(1, Math.round(v.installments))
        for (const s of multiShares) {
          const amtC = toCents(s.amount)
          await db.transactionShare.create({
            data: {
              transactionId: tx.id,
              debtorId: s.debtorId ?? null,
              externalName: s.externalName ?? null,
              sharePct: (amtC / toCents(v.amount)) * 100,
              monthlyAmount: fromCents(Math.round(amtC / n)),
              isFixedAmount: true,
            },
          })
        }
      } else if (v.type === 'EXPENSE' && v.isShared && (debtorId || externalName)) {
        // Cantidad fija pactada (ej. $125 de $400) o porcentaje (50/50 por defecto).
        const n = Math.max(1, Math.round(v.installments))
        await db.transactionShare.create({
          data: {
            transactionId: tx.id,
            debtorId,
            externalName,
            sharePct: v.shareAmount
              ? (toCents(v.shareAmount) / toCents(v.amount)) * 100
              : v.sharePct,
            monthlyAmount: v.shareAmount
              ? fromCents(Math.round(toCents(v.shareAmount) / n))
              : debtorMonthlyAmount(v.amount, v.installments, v.sharePct),
            isFixedAmount: Boolean(v.shareAmount),
          },
        })
      }
    })
  } catch (e) {
    // Carrera de reintentos con la misma llave: el otro ya la guardó.
    if (
      v.clientKey &&
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e as { code?: string }).code === 'P2002'
    ) {
      revalidatePath('/actividad')
      revalidatePath('/resumen')
      revalidatePath('/cuentas')
      return { ok: true }
    }
    throw e
  }

  await touchPlace(userId, v.place)
  // Amigos del gasto en grupo / compartido externo: sugerencias a futuro.
  await touchCompanions(userId, [
    ...(multiShares?.map((s) => s.externalName) ?? []),
    externalName,
  ])
  revalidatePath('/actividad')
  revalidatePath('/resumen')
  revalidatePath('/cuentas')
  return { ok: true }
}

export async function loginAction(formData: FormData) {
  // Credenciales malas con redirect:false llegan como excepción CredentialsSignin.
  const { CredentialsSignin } = await import('next-auth')
  const { signIn } = await import('@/auth')
  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '')
  // El throttle vive en authorize() (auth.ts): cubre este camino y el POST
  // directo a /api/auth/callback/credentials. Aquí solo mensaje genérico.
  try {
    // redirect:false → no lanza NEXT_REDIRECT; el fallo viene como excepción.
    const res = await signIn('credentials', {
      username,
      password,
      redirect: false,
    })
    if (res?.error) return { error: 'Revisa tu usuario y contraseña' }
    return { ok: true }
  } catch (e) {
    if (e instanceof CredentialsSignin)
      return { error: 'Revisa tu usuario y contraseña' }
    return { error: 'No se pudo iniciar sesión, intenta de nuevo' }
  }
}

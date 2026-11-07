'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { installmentMonths, payableInstallments } from '@/lib/calculations'
import { checkCategory } from '@/lib/catalog'
import {
  fromCents,
  moneySchema,
  optionalMoneySchema,
  splitMoney,
  toCents,
} from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { installmentDate, periodContaining } from '@/lib/statements'
import { formatMoney } from '@/lib/utils'
import { mexicoMonthKey, wallNow } from '@/lib/walltime'

import { auth } from '@/auth'

function revalidateMsi() {
  revalidatePath('/ajustes/meses')
  revalidatePath('/cuentas')
  revalidatePath('/resumen')
  revalidatePath('/actividad')
}

async function meId() {
  const session = await auth()
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

const PrepaySchema = z.object({
  transactionId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Mes inválido'),
  applied: moneySchema,
  discount: optionalMoneySchema,
})

/**
 * Adelanta una parcialidad futura de una compra a meses propia en crédito.
 * El usuario indica el monto que se aplica al mes (normalmente la
 * mensualidad completa) y, opcionalmente, el descuento por pronto pago.
 * No sale efectivo: el banco carga (aplicado − descuento) en el estado
 * actual y perdona la parcialidad objetivo. Se registra tal cual:
 * - EXPENSE con descuento (fecha hoy, cae en el periodo actual).
 * - INCOME por el monto aplicado (fecha hoy, fijado al periodo objetivo
 *   con `statementKey`, cancela el cargo original de ese mes).
 */
export async function prepayInstallment(formData: FormData) {
  const userId = await meId()
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para registrar adelantos' }

  const parsed = PrepaySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  const tx = await prisma.transaction.findUnique({
    where: { id: v.transactionId },
    include: { account: true },
  })
  if (!tx || tx.createdById !== userId || tx.householdId)
    return { error: 'Compra no encontrada' }
  if (tx.type !== 'EXPENSE' || tx.installments < 2)
    return { error: 'Solo aplica a compras a meses' }
  if (tx.isShared) return { error: 'Las compartidas se liquidan en Pareja' }
  if (!tx.accountId || tx.account?.type !== 'CREDIT')
    return { error: 'Solo aplica a compras con tarjeta de crédito' }

  const n = Math.round(tx.installments)
  const payKeys = installmentMonths(new Date(tx.date), n)
  const idx = payKeys.indexOf(v.month)
  if (idx < 0) return { error: 'Esa parcialidad no corresponde a esta compra' }
  // El INCOME cancela el cargo original: no puede exceder la mensualidad
  // programada (se permite parcial: cubre hasta lo aplicado y el saldo
  // restante descuenta la mensualidad completa).
  const full = splitMoney(tx.amount, n)[idx] ?? 0
  if (toCents(v.applied) - toCents(full) > 0) {
    return {
      error: `El monto no puede exceder la mensualidad de ${formatMoney(full)}`,
    }
  }
  const discount = v.discount ?? 0
  const charged = fromCents(toCents(v.applied) - toCents(discount))
  if (toCents(charged) <= 0) {
    return { error: 'El descuento debe ser menor al monto aplicado' }
  }

  // Solo parcialidades que vencen en mes futuro (la del mes en curso se
  // paga con Pagar periodo).
  const curKey = mexicoMonthKey()
  const parts = payableInstallments(
    new Date(tx.date),
    n,
    tx.account?.statementDay ?? null,
    tx.account?.dueDay ?? null,
  )
  const part = parts[idx]
  if (!part || part.dueKey <= curKey)
    return { error: 'Solo se pueden adelantar parcialidades futuras' }

  const existing = await prisma.transaction.count({
    where: { advanceForTxId: tx.id, advanceForMonth: v.month },
  })
  if (existing > 0) return { error: 'Esa parcialidad ya está adelantada' }

  const catError =
    (await checkCategory(userId, tx.category, 'EXPENSE')) ??
    (await checkCategory(userId, 'TRANSFERENCIA', 'INCOME'))
  if (catError) return { error: catError }

  // Periodo al que se fija la cancelación (el del cargo original).
  const periodKey = periodContaining(installmentDate(new Date(tx.date), idx), {
    statementDay: tx.account?.statementDay ?? null,
    dueDay: tx.account?.dueDay ?? null,
  }).key

  try {
    await prisma.$transaction(async (db) => {
      await db.transaction.create({
        data: {
          type: 'EXPENSE',
          amount: charged,
          concept: `Adelanto ${idx + 1}/${n} · ${tx.concept}`,
          category: tx.category,
          date: wallNow(),
          accountId: tx.accountId!,
          createdById: userId,
          installments: 1,
          advanceForTxId: tx.id,
          advanceForMonth: v.month,
        },
      })
      await db.transaction.create({
        data: {
          type: 'INCOME',
          amount: v.applied,
          concept: `Adelanto aplicado ${idx + 1}/${n} · ${tx.concept}`,
          category: 'TRANSFERENCIA',
          date: wallNow(),
          accountId: tx.accountId!,
          createdById: userId,
          installments: 1,
          statementKey: periodKey,
          advanceForTxId: tx.id,
          advanceForMonth: v.month,
        },
      })
    })
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002')
      return { error: 'Esa parcialidad ya está adelantada' }
    return { error: 'No se pudo registrar el adelanto' }
  }
  revalidateMsi()
  return { ok: true, saved: discount }
}

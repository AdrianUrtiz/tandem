import type {
  MsiItemView,
  MsiPaymentsView,
} from '@/components/msi-concentrado'

import { getLineSums } from '@/lib/debt-payments'
import { normalizeMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'

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
      account: { select: { name: true } },
      createdBy: { select: { name: true } },
      shares: { include: { debtor: { select: { name: true } } } },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  })
  const sums = await getLineSums(rows.flatMap((t) => t.shares.map((s) => s.id)))
  const msiPayments: MsiPaymentsView = {}
  for (const [k, v] of sums) msiPayments[k] = { c: v.confirmed, p: v.pending }
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

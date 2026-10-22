'use client'

import { useMemo, useState } from 'react'

import { ArrowUpRight, Check, HandCoins, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { AccountRow } from '@/components/account-card'
import { AccountDetail } from '@/components/account-detail'
import { AccountForm } from '@/components/account-form'
import { AccountIcon } from '@/components/account-icon'
import {
  AccountSwipeRow,
  HiddenAccountSwipeRow,
} from '@/components/account-swipe-row'
import { AccountsReorder } from '@/components/accounts-reorder'
import type { MonthOpt } from '@/components/activity-client'
import { BottomSheet } from '@/components/bottom-sheet'
import { CardPayReminders } from '@/components/card-pay-reminders'
import {
  type ExpiryAccount,
  ExpiryReminders,
} from '@/components/expiry-reminders'
import { FilterOptions, FilterPill } from '@/components/filter-dialog'
import { PartnerPayReminders } from '@/components/partner-pay-reminders'
import { PaymentSheet } from '@/components/payment-sheet'
import { type SubRow, SubscriptionTab } from '@/components/subscription-tab'
import { SwipeRow } from '@/components/swipe-row'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { CardPayCandidate } from '@/lib/card-pay'
import type { CatalogRow } from '@/lib/catalog'
import { useCuentasFilters } from '@/lib/cuentas-filters'
import type { GroupSummary } from '@/lib/group-actions'
import { toCents } from '@/lib/money'
import { isPendingId } from '@/lib/offline/pending'
import { syncForce } from '@/lib/offline/useSnapshotSync'
import {
  type DebtItemInput,
  type PartnerDebt,
  buildCarriedDebts,
  buildDebts,
} from '@/lib/partner-debts'
import { cancelPayment, confirmPaymentSource } from '@/lib/payment-actions'
import { useStatementFilters } from '@/lib/resumen-filters'
import type { DueCharge } from '@/lib/subscriptions'
import { formatMoney, monthKey, monthLabelEs } from '@/lib/utils'

/** Pago pendiente que mi pareja registró y yo debo confirmar (soy el acreedor). */
export type ToConfirmItem = {
  id: string
  amount: number
  month: string
  monthLabel: string
  concept: string
  monthly: number
  shareId: string
  registeredByName: string
}

/** Pago que yo registré y espera confirmación de mi pareja. */
export type MyPendingItem = {
  id: string
  amount: number
  month: string
  monthLabel: string
  concept: string
  monthly: number
  shareId: string
  confirmerName: string
}

/** Cobro que el acreedor dice recibido y espera que yo indique de qué cuenta salió. */
export type SourceConfirmItem = {
  id: string
  amount: number
  month: string
  monthLabel: string
  concept: string
  creditorName: string
}

export function CuentasClient({
  accounts,
  hiddenAccounts = [],
  meId,
  debtItems,
  owedItems,
  sums,
  partnerMonths,
  subs,
  dues,
  cats,
  toConfirm = [],
  myPending = [],
  toConfirmSource = [],
  editAccountId = null,
  cardPayItems = [],
  groups = [],
}: {
  accounts: AccountRow[]
  hiddenAccounts?: AccountRow[]
  meId: string
  debtItems: DebtItemInput[]
  owedItems: DebtItemInput[]
  sums: { key: string; confirmed: number; pending: number }[]
  partnerMonths: MonthOpt[]
  subs: SubRow[]
  dues: DueCharge[]
  cats: CatalogRow[]
  toConfirm?: ToConfirmItem[]
  myPending?: MyPendingItem[]
  toConfirmSource?: SourceConfirmItem[]
  /** Deep-link ?editar=<id>: abre la edición (recordatorio de renovación). */
  editAccountId?: string | null
  /** Cierre de MIS tarjetas (propietario): pago para no generar intereses. */
  cardPayItems?: CardPayCandidate[]
  /** Resúmenes de mis grupos (sección Grupos de Compartidos). */
  groups?: GroupSummary[]
}) {
  const router = useRouter()
  const tab = useCuentasFilters((s) => s.tab)
  const setTab = useCuentasFilters((s) => s.setTab)
  const setStmtCard = useStatementFilters((s) => s.setCardId)
  const setStmtPeriod = useStatementFilters((s) => s.setPeriod)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [selected, setSelected] = useState<AccountRow | null>(null)
  const [reordering, setReordering] = useState(false)
  const [paySheet, setPaySheet] = useState<{
    d: PartnerDebt
    mode: 'receive' | 'pay'
  } | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<ToConfirmItem | null>(null)
  const [sourceTarget, setSourceTarget] = useState<SourceConfirmItem | null>(
    null,
  )
  // Renovación: ?editar=<id> abre el formulario de esa cuenta.
  const [prevEditId, setPrevEditId] = useState<string | null>(editAccountId)
  const [renewId, setRenewId] = useState<string | null>(editAccountId)
  if (editAccountId !== prevEditId) {
    setPrevEditId(editAccountId)
    setRenewId(editAccountId)
  }
  const renewAccount = renewId
    ? (accounts.find((a) => a.id === renewId) ?? null)
    : null
  function closeRenew() {
    setRenewId(null)
    router.replace('/cuentas')
  }

  // Refresco post-mutación: Dexie primero (los shells son Dexie-first y
  // no verían el cambio hasta el próximo sync) y luego el RSC.
  const refresh = () => {
    void syncForce()
    router.refresh()
  }

  const mine = useMemo(
    () => accounts.filter((a) => a.ownerId === meId),
    [accounts, meId],
  )

  // Ocultas: fuera de listas, totales y selectores; solo viven en su tab.
  const hiddenMine = useMemo(
    () => hiddenAccounts.filter((a) => a.ownerId === meId),
    [hiddenAccounts, meId],
  )

  // Recordatorio de renovación: abre la edición de la cuenta directamente.
  const expiryAccounts: ExpiryAccount[] = useMemo(
    () =>
      mine.map((a) => ({
        id: a.id,
        name: a.name,
        lastFour: a.lastFour ?? null,
        expiry: a.expiry ?? null,
        color: a.color,
      })),
    [mine],
  )
  const openRenew = (id: string) => setRenewId(id)

  // Mes de Pareja (persistido): el mes puede no existir, se usa el más
  // reciente sin sobrescribir el store hasta que el usuario elija otro.
  const storedPartnerMonth = useCuentasFilters((s) => s.partnerMonth)
  const setPartnerMonth = useCuentasFilters((s) => s.setPartnerMonth)
  const partnerMonth =
    partnerMonths.some((m) => m.key === storedPartnerMonth) &&
    storedPartnerMonth
      ? storedPartnerMonth
      : (partnerMonths[0]?.key ?? storedPartnerMonth)
  const partnerLabel =
    partnerMonths.find((m) => m.key === partnerMonth)?.label ?? partnerMonth
  const isCurrentMonth = partnerMonth === monthKey(new Date())

  // Deudas del mes seleccionado (MSI: solo cae la parcialidad del periodo).
  const sumsMap = useMemo(
    () =>
      new Map(
        sums.map((s) => [
          s.key,
          { confirmed: s.confirmed, pending: s.pending },
        ]),
      ),
    [sums],
  )
  const debts = useMemo(
    () => buildDebts(debtItems, partnerMonth, sumsMap),
    [debtItems, partnerMonth, sumsMap],
  )
  const owed = useMemo(
    () => buildDebts(owedItems, partnerMonth, sumsMap),
    [owedItems, partnerMonth, sumsMap],
  )
  // Arrastre de meses anteriores al visto: lo exigible con dueKey previo
  // al mes seleccionado que aún tiene saldo. Si es anterior al mes real
  // actual es vencido (rojo); si aún está vigente (p. ej. octubre visto
  // desde noviembre) va en sección neutra sin rojo. "YYYY-MM" compara bien.
  const debtsCarriedAll = useMemo(
    () => buildCarriedDebts(debtItems, partnerMonth, sumsMap),
    [debtItems, partnerMonth, sumsMap],
  )
  const owedCarriedAll = useMemo(
    () => buildCarriedDebts(owedItems, partnerMonth, sumsMap),
    [owedItems, partnerMonth, sumsMap],
  )

  // Filtro de estado en Compartidos: por defecto solo pendientes de pago.
  // Las cards agrupan por cuenta+deudor, así que una cuenta con algún pago
  // pendiente se sigue mostrando; solo se oculta cuando queda en cero.
  // Filtro de persona: pareja (debtorId != null, incluye lo que le debo),
  // otras personas (externos sin cuenta, debtorId == null) o todos.
  const partnerState = useCuentasFilters((s) => s.partnerState)
  const setPartnerState = useCuentasFilters((s) => s.setPartnerState)
  const partnerWho = useCuentasFilters((s) => s.partnerWho)
  const setPartnerWho = useCuentasFilters((s) => s.setPartnerWho)
  const PARTNER_STATE_OPTS = [
    { value: 'pending', label: 'Pendientes' },
    { value: 'all', label: 'Todos' },
  ]
  const PARTNER_WHO_OPTS = [
    { value: 'all', label: 'Todos' },
    { value: 'partner', label: 'Pareja' },
    { value: 'external', label: 'Otras personas' },
  ]
  const matchesWho = (debtorId: string | null, who = partnerWho) =>
    who === 'all' ||
    (who === 'partner' ? debtorId != null : debtorId == null)
  const debtsByState = useMemo(
    () =>
      partnerState === 'all'
        ? debts
        : debts.filter((d) => toCents(d.remaining) > 0),
    [debts, partnerState],
  )
  const owedByState = useMemo(
    () =>
      partnerState === 'all'
        ? owed
        : owed.filter((d) => toCents(d.remaining) > 0),
    [owed, partnerState],
  )
  const debtsVisible = useMemo(
    () => debtsByState.filter((d) => matchesWho(d.debtorId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debtsByState, partnerWho],
  )
  const owedVisible = useMemo(
    () => owedByState.filter((d) => matchesWho(d.debtorId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owedByState, partnerWho],
  )
  // Vencido = anterior al mes real actual (no al mes visto): en octubre
  // aún hay tiempo para pagar octubre aunque se esté viendo noviembre.
  // Las cards van a rojo si alguna línea es vencida; si no, a la sección
  // neutra de meses anteriores. El arrastre siempre tiene saldo.
  const realCurrentMonth = monthKey(new Date())
  const isCardOverdue = (d: PartnerDebt) =>
    d.lines.some((l) => l.dueKey < realCurrentMonth)
  const debtsOverdueVisible = useMemo(
    () =>
      debtsCarriedAll.filter(
        (d) => matchesWho(d.debtorId) && isCardOverdue(d),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debtsCarriedAll, partnerWho, partnerMonth],
  )
  const owedOverdueVisible = useMemo(
    () =>
      owedCarriedAll.filter((d) => matchesWho(d.debtorId) && isCardOverdue(d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owedCarriedAll, partnerWho, partnerMonth],
  )
  // Anteriores aún vigentes (mes real actual <= dueKey < mes visto): solo
  // existe al ver meses futuros. Mismo estilo del mes, con origen marcado.
  const debtsPrevVisible = useMemo(
    () =>
      debtsCarriedAll.filter(
        (d) => matchesWho(d.debtorId) && !isCardOverdue(d),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debtsCarriedAll, partnerWho, partnerMonth],
  )
  const owedPrevVisible = useMemo(
    () =>
      owedCarriedAll.filter(
        (d) => matchesWho(d.debtorId) && !isCardOverdue(d),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owedCarriedAll, partnerWho, partnerMonth],
  )
  const oweOverdueTotal = useMemo(
    () => debtsOverdueVisible.reduce((a, d) => a + d.remaining, 0),
    [debtsOverdueVisible],
  )
  const owedOverdueTotal = useMemo(
    () => owedOverdueVisible.reduce((a, d) => a + d.remaining, 0),
    [owedOverdueVisible],
  )
  const owePrevTotal = useMemo(
    () => debtsPrevVisible.reduce((a, d) => a + d.remaining, 0),
    [debtsPrevVisible],
  )
  const owedPrevTotal = useMemo(
    () => owedPrevVisible.reduce((a, d) => a + d.remaining, 0),
    [owedPrevVisible],
  )
  // Las confirmaciones de pago solo existen con pareja: se ocultan al
  // filtrar por otras personas.
  const showPartnerFlows = partnerWho !== 'external'
  // Grupos: solo ACTIVE por defecto; los CLOSED se ocultan salvo que el
  // usuario los pida explícito (son eventos de días que ya se cerraron).
  const [showClosedGroups, setShowClosedGroups] = useState(false)
  const activeGroups = useMemo(
    () => groups.filter((g) => g.status !== 'CLOSED'),
    [groups],
  )
  const closedGroups = useMemo(
    () => groups.filter((g) => g.status === 'CLOSED'),
    [groups],
  )
  const groupsVisible = showClosedGroups ? groups : activeGroups
  // Recordatorio de pago a la pareja: abre Compartidos en el mes exigible.
  const openPartnerPay = (it: { dueKey: string }) => {
    setPartnerMonth(it.dueKey)
    setTab('compartidos')
  }
  // Recordatorio de pago de mis tarjetas (propietario): abre el corte
  // en Resumen > Estados de cuenta.
  const openCardPay = (it: { cardId: string; periodKey: string }) => {
    setStmtCard(it.cardId)
    setStmtPeriod(it.cardId, it.periodKey)
    router.push('/resumen')
  }

  const swipe = (a: AccountRow) => (
    <AccountSwipeRow
      key={a.id}
      a={a}
      open={openRow === a.id}
      onOpenChange={(o) => setOpenRow(o ? a.id : null)}
      onSelect={() => setSelected(a)}
      debitOptions={mine
        .filter((m) => m.type === 'DEBIT')
        .map((m) => ({ id: m.id, name: m.name, type: m.type, color: m.color }))}
    />
  )

  // Saldo total: suma débitos + disponible de créditos
  const totalOf = (list: AccountRow[]) =>
    list.reduce(
      (a, c) =>
        a +
        (c.type === 'CREDIT' ? (c.creditLimit ?? 0) - c.balance : c.balance),
      0,
    )
  const oweTotal = useMemo(
    () => debtsVisible.reduce((a, d) => a + d.remaining, 0),
    [debtsVisible],
  )

  const owedTotal = useMemo(
    () => owedVisible.reduce((a, d) => a + d.remaining, 0),
    [owedVisible],
  )

  const monthly = useMemo(
    () => subs.filter((s) => s.isActive).reduce((a, s) => a + s.amount, 0),
    [subs],
  )

  const accountOpts = useMemo(
    () =>
      mine.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        color: a.color,
      })),
    [mine],
  )

  // Filtros persistidos de cada tab + mes de Pareja.
  const accSort = useCuentasFilters((s) => s.accSort)
  const setAccSort = useCuentasFilters((s) => s.setAccSort)
  const accType = useCuentasFilters((s) => s.accType)
  const setAccType = useCuentasFilters((s) => s.setAccType)
  const [accSheet, setAccSheet] = useState<null | 'sort' | 'type'>(null)
  const [partnerSheet, setPartnerSheet] = useState<
    null | 'month' | 'state' | 'who'
  >(null)

  // Monto representativo: saldo en débito, disponible en crédito.
  const effValue = (a: AccountRow) =>
    a.type === 'CREDIT' ? (a.creditLimit ?? 0) - a.balance : a.balance

  function daysUntilDue(dueDay: number, now = new Date()): number {
    const dimThis = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const dayThis = Math.min(dueDay, dimThis)
    if (dayThis >= now.getDate()) return dayThis - now.getDate()
    const dimNext = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()
    return dimThis - now.getDate() + Math.min(dueDay, dimNext)
  }

  const filteredMine = useMemo(() => {
    let list = accType === 'hidden' ? [...hiddenMine] : mine
    if (accType === 'debit') list = list.filter((a) => a.type === 'DEBIT')
    else if (accType === 'credit')
      list = list.filter((a) => a.type === 'CREDIT')
    else if (accType === 'debt')
      list = list.filter((a) => a.type === 'CREDIT' && toCents(a.balance) > 0)
    else if (accType === 'due')
      list = list.filter(
        (a) =>
          a.type === 'CREDIT' &&
          a.dueDay != null &&
          daysUntilDue(a.dueDay) <= 7,
      )
    const sorted = [...list]
    if (accSort === 'high') sorted.sort((a, b) => effValue(b) - effValue(a))
    else if (accSort === 'low') sorted.sort((a, b) => effValue(a) - effValue(b))
    else if (accSort === 'az')
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    return sorted
  }, [mine, hiddenMine, accSort, accType])

  const typeCounts = useMemo(() => {
    const debt = mine.filter(
      (a) => a.type === 'CREDIT' && toCents(a.balance) > 0,
    ).length
    const due = mine.filter(
      (a) =>
        a.type === 'CREDIT' && a.dueDay != null && daysUntilDue(a.dueDay) <= 7,
    ).length
    return {
      all: mine.length,
      debit: mine.filter((a) => a.type === 'DEBIT').length,
      credit: mine.filter((a) => a.type === 'CREDIT').length,
      debt,
      due,
      hidden: hiddenMine.length,
    }
  }, [mine, hiddenMine])

  const SORT_OPTS = [
    { value: 'default', label: 'Predeterminado' },
    { value: 'high', label: 'Mayor monto' },
    { value: 'low', label: 'Menor monto' },
    { value: 'az', label: 'Nombre A–Z' },
  ]
  const TYPE_OPTS = [
    { value: 'all', label: 'Todas' },
    { value: 'debit', label: 'Débito' },
    { value: 'credit', label: 'Crédito' },
    { value: 'debt', label: 'Con deuda' },
    { value: 'due', label: 'Vence pronto' },
    { value: 'hidden', label: 'Ocultas' },
  ]

  // Header homologado: texto pequeño → monto grande (sin botones; la creación
  // vive en el speed-dial del FAB). En Cuentas el total responde al filtro.
  const header =
    tab === 'mias'
      ? {
          label: accType === 'hidden' ? 'En cuentas ocultas' : 'Saldo total',
          value: totalOf(filteredMine),
        }
      : tab === 'subs'
        ? { label: 'Comprometido/mes', value: monthly }
        : tab === 'compartidos'
          ? {
              label: isCurrentMonth
                ? 'Le debes este mes'
                : `Le debes en ${partnerLabel}`,
              value: oweTotal,
            }
          : { label: 'Saldo total', value: totalOf(mine) }

  return (
    <div className="space-y-4 px-5 pt-4">
      <div>
        <p className="text-xs font-medium text-(--muted-foreground)">
          {header.label}
        </p>
        <p className="text-4xl font-extrabold tracking-tight">
          {formatMoney(header.value)}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="mias">Cuentas</TabsTrigger>
          <TabsTrigger value="subs">Suscripciones</TabsTrigger>
          <TabsTrigger value="compartidos">Compartidos</TabsTrigger>
        </TabsList>
        <TabsContent value="mias" className="space-y-2">
          <ExpiryReminders accounts={expiryAccounts} onRenew={openRenew} />
          <PartnerPayReminders
            debtItems={debtItems}
            sums={sumsMap}
            onPay={openPartnerPay}
          />
          <CardPayReminders items={cardPayItems ?? []} onPay={openCardPay} />
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            <FilterPill
              label={SORT_OPTS.find((o) => o.value === accSort)!.label}
              active={accSort !== 'default'}
              onClick={() => setAccSheet('sort')}
            />
            <FilterPill
              label={TYPE_OPTS.find((o) => o.value === accType)!.label}
              active={accType !== 'all'}
              onClick={() => setAccSheet('type')}
            />
            {mine.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setAccSort('default')
                  setAccType('all')
                  setReordering(true)
                }}
                className="max-w-55 shrink-0 truncate rounded-full border border-(--border) bg-(--card) px-4 py-2 text-xs font-semibold text-(--muted-foreground) transition">
                ↕ Ordenar
              </button>
            )}
          </div>
          {reordering ? (
            <AccountsReorder
              key="reorder"
              accounts={mine}
              onClose={() => setReordering(false)}
            />
          ) : (
            <>
              {filteredMine.length === 0 && (
                <Empty
                  text={
                    mine.length === 0 && hiddenMine.length === 0
                      ? 'Sin cuentas aquí todavía.'
                      : accType === 'hidden'
                        ? 'Sin cuentas ocultas.'
                        : 'Sin resultados para ese filtro.'
                  }
                />
              )}
              {accType === 'hidden' && filteredMine.length > 0 && (
                <p className="-mt-1 text-[11px] text-(--muted-foreground)">
                  Fuera de totales y selectores · desliza para mostrar ›
                </p>
              )}
              {filteredMine.map((a) =>
                accType === 'hidden' ? (
                  <HiddenAccountSwipeRow
                    key={a.id}
                    a={a}
                    open={openRow === `hidden:${a.id}`}
                    onOpenChange={(o) =>
                      setOpenRow(o ? `hidden:${a.id}` : null)
                    }
                    onSelect={() => setSelected(a)}
                  />
                ) : (
                  swipe(a)
                ),
              )}
            </>
          )}
        </TabsContent>
        <TabsContent value="compartidos" className="space-y-4">
          <div className="no-scrollbar -mx-5 flex items-center justify-center gap-2 overflow-x-auto px-5 pb-1">
            <button
              onClick={() => setPartnerSheet('month')}
              className="shrink-0 rounded-full bg-(--muted) px-4 py-2 text-xs font-semibold capitalize">
              {partnerLabel} ▾
            </button>
            <FilterPill
              label={
                PARTNER_STATE_OPTS.find((o) => o.value === partnerState)!.label
              }
              active={partnerState === 'pending'}
              onClick={() => setPartnerSheet('state')}
            />
            <FilterPill
              label={
                PARTNER_WHO_OPTS.find((o) => o.value === partnerWho)!.label
              }
              active={partnerWho !== 'all'}
              onClick={() => setPartnerSheet('who')}
            />
          </div>
          {debts.length === 0 &&
            owed.length === 0 &&
            debtsCarriedAll.length === 0 &&
            owedCarriedAll.length === 0 &&
            toConfirm.length === 0 &&
            myPending.length === 0 &&
            toConfirmSource.length === 0 &&
            (groups.length === 0 ? (
              <Empty text="Sin compartidos todavía. Usa + para crear o unirte a un grupo, o vincula tu pareja en Ajustes." />
            ) : (
              <Empty text="Sin pendientes con tu pareja. Tus grupos están abajo. 🎉" />
            ))}
          {debtsVisible.length === 0 &&
            owedVisible.length === 0 &&
            debtsOverdueVisible.length === 0 &&
            owedOverdueVisible.length === 0 &&
            debtsPrevVisible.length === 0 &&
            owedPrevVisible.length === 0 &&
            (debts.length > 0 ||
              owed.length > 0 ||
              debtsCarriedAll.length > 0 ||
              owedCarriedAll.length > 0) &&
            (showPartnerFlows
              ? toConfirm.length === 0 &&
                myPending.length === 0 &&
                toConfirmSource.length === 0
              : true) && (
              <Empty
                text={
                  partnerWho !== 'all'
                    ? 'Sin resultados para ese filtro.'
                    : 'Sin pendientes este mes. 🎉'
                }
              />
            )}
          {showPartnerFlows && toConfirmSource.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-(--muted-foreground)">
                Confirma de qué cuenta salió ·{' '}
                {formatMoney(toConfirmSource.reduce((a, p) => a + p.amount, 0))}
              </p>
              {toConfirmSource.map((p) => (
                <SourceConfirmRow
                  key={p.id}
                  p={p}
                  onOpen={() => setSourceTarget(p)}
                />
              ))}
            </section>
          )}
          {showPartnerFlows && toConfirm.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-(--muted-foreground)">
                Por confirmar ·{' '}
                {formatMoney(toConfirm.reduce((a, p) => a + p.amount, 0))}
              </p>
              {toConfirm.map((p) => (
                <ToConfirmRow
                  key={p.id}
                  p={p}
                  onOpen={() => setConfirmTarget(p)}
                />
              ))}
            </section>
          )}
          {showPartnerFlows && myPending.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-(--muted-foreground)">
                En espera de confirmación
              </p>
              {myPending.map((p) => (
                <MyPendingRow key={p.id} p={p} onDone={refresh} />
              ))}
            </section>
          )}
          {debtsOverdueVisible.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-red-500">
                Vencidos · le debes · {formatMoney(oweOverdueTotal)}
              </p>
              <p className="-mt-1 text-[11px] text-(--muted-foreground)">
                De meses pasados ›
              </p>
              {debtsOverdueVisible.map((d) => (
                <DebtSwipeRow
                  key={`overdue:${debtKey(d)}`}
                  d={d}
                  meId={meId}
                  overdue
                  nowMonth={realCurrentMonth}
                  open={openRow === `overdue:${debtKey(d)}`}
                  onOpenChange={(o) =>
                    setOpenRow(o ? `overdue:${debtKey(d)}` : null)
                  }
                  onPay={(mode) => setPaySheet({ d, mode })}
                />
              ))}
            </section>
          )}
          {owedOverdueVisible.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-red-500">
                Vencidos · te deben · {formatMoney(owedOverdueTotal)}
              </p>
              <p className="-mt-1 text-[11px] text-(--muted-foreground)">
                De meses pasados ›
              </p>
              {owedOverdueVisible.map((d) => (
                <DebtSwipeRow
                  key={`overdue:${debtKey(d)}`}
                  d={d}
                  meId={meId}
                  overdue
                  nowMonth={realCurrentMonth}
                  open={openRow === `overdue:${debtKey(d)}`}
                  onOpenChange={(o) =>
                    setOpenRow(o ? `overdue:${debtKey(d)}` : null)
                  }
                  onPay={(mode) => setPaySheet({ d, mode })}
                />
              ))}
            </section>
          )}
          {debtsPrevVisible.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-(--muted-foreground)">
                Pendientes anteriores · le debes · {formatMoney(owePrevTotal)}
              </p>
              <p className="-mt-1 text-[11px] text-(--muted-foreground)">
                De meses anteriores · aún con tiempo ›
              </p>
              {debtsPrevVisible.map((d) => (
                <DebtSwipeRow
                  key={`prev:${debtKey(d)}`}
                  d={d}
                  meId={meId}
                  carried
                  nowMonth={realCurrentMonth}
                  open={openRow === `prev:${debtKey(d)}`}
                  onOpenChange={(o) =>
                    setOpenRow(o ? `prev:${debtKey(d)}` : null)
                  }
                  onPay={(mode) => setPaySheet({ d, mode })}
                />
              ))}
            </section>
          )}
          {owedPrevVisible.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-(--muted-foreground)">
                Pendientes anteriores · te deben · {formatMoney(owedPrevTotal)}
              </p>
              <p className="-mt-1 text-[11px] text-(--muted-foreground)">
                De meses anteriores · aún con tiempo ›
              </p>
              {owedPrevVisible.map((d) => (
                <DebtSwipeRow
                  key={`prev:${debtKey(d)}`}
                  d={d}
                  meId={meId}
                  carried
                  nowMonth={realCurrentMonth}
                  open={openRow === `prev:${debtKey(d)}`}
                  onOpenChange={(o) =>
                    setOpenRow(o ? `prev:${debtKey(d)}` : null)
                  }
                  onPay={(mode) => setPaySheet({ d, mode })}
                />
              ))}
            </section>
          )}
          {debtsVisible.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-(--muted-foreground)">
                Le debes · {formatMoney(oweTotal)}
              </p>
              <p className="-mt-1 text-[11px] text-(--muted-foreground)">
                Desliza a la derecha para registrar tu pago ›
              </p>
              {debtsVisible.map((d) => (
                <DebtSwipeRow
                  key={debtKey(d)}
                  d={d}
                  meId={meId}
                  open={openRow === debtKey(d)}
                  onOpenChange={(o) => setOpenRow(o ? debtKey(d) : null)}
                  onPay={(mode) => setPaySheet({ d, mode })}
                />
              ))}
            </section>
          )}
          {owedVisible.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-(--muted-foreground)">
                Te deben · {formatMoney(owedTotal)}
              </p>
              <p className="-mt-1 text-[11px] text-(--muted-foreground)">
                Desliza a la derecha para registrar el cobro ›
              </p>
              {owedVisible.map((d) => (
                <DebtSwipeRow
                  key={debtKey(d)}
                  d={d}
                  meId={meId}
                  open={openRow === debtKey(d)}
                  onOpenChange={(o) => setOpenRow(o ? debtKey(d) : null)}
                  onPay={(mode) => setPaySheet({ d, mode })}
                />
              ))}
            </section>
          )}
          {groupsVisible.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-(--muted-foreground)">
                Grupos · {groupsVisible.length}
                {closedGroups.length > 0 && !showClosedGroups
                  ? ` · ${closedGroups.length} cerrado${closedGroups.length === 1 ? '' : 's'} oculto${closedGroups.length === 1 ? '' : 's'}`
                  : ''}
              </p>
              {groupsVisible.map((g) => (
                <GroupCard key={g.id} g={g} />
              ))}
              {closedGroups.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClosedGroups((v) => !v)}
                  className="w-full rounded-full border border-(--border) bg-(--card) px-4 py-2 text-xs font-semibold text-(--muted-foreground) transition">
                  {showClosedGroups
                    ? 'Ocultar cerrados'
                    : `Mostrar cerrados (${closedGroups.length})`}
                </button>
              )}
            </section>
          )}
          {groupsVisible.length === 0 &&
            closedGroups.length > 0 &&
            !showClosedGroups && (
              <section className="space-y-2">
                <p className="text-xs font-semibold text-(--muted-foreground)">
                  Grupos · 0 activos
                </p>
                <button
                  type="button"
                  onClick={() => setShowClosedGroups(true)}
                  className="w-full rounded-full border border-(--border) bg-(--card) px-4 py-2 text-xs font-semibold text-(--muted-foreground) transition">
                  {`Mostrar cerrados (${closedGroups.length})`}
                </button>
              </section>
            )}
        </TabsContent>
        <TabsContent value="subs" className="space-y-2">
          <SubscriptionTab
            subs={subs}
            dues={dues}
            accountOptions={accountOpts}
            cats={cats}
          />
        </TabsContent>
      </Tabs>

      <BottomSheet
        open={paySheet != null}
        onOpenChange={(o) => !o && setPaySheet(null)}>
        {paySheet && (
          <PaymentSheet
            key={`${debtKey(paySheet.d)}:${paySheet.mode}`}
            mode={paySheet.mode}
            lines={paySheet.d.lines.flatMap((l) =>
              l.shareId
                ? [
                    {
                      shareId: l.shareId,
                      concept: l.concept,
                      installment: l.installment,
                      installments: l.installments,
                      month: l.month,
                      monthly: l.monthly,
                      paid: l.paid,
                      pending: l.pending,
                    },
                  ]
                : [],
            )}
            accountOptions={accountOpts}
            onDone={() => {
              setPaySheet(null)
              refresh()
            }}
          />
        )}
      </BottomSheet>
      <BottomSheet
        open={confirmTarget != null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}>
        {confirmTarget && (
          <PaymentSheet
            key={confirmTarget.id}
            mode="confirm"
            payment={confirmTarget}
            accountOptions={accountOpts}
            onDone={() => {
              setConfirmTarget(null)
              refresh()
            }}
          />
        )}
      </BottomSheet>
      <BottomSheet
        open={sourceTarget != null}
        onOpenChange={(o) => !o && setSourceTarget(null)}>
        {sourceTarget && (
          <SourceConfirmSheet
            key={sourceTarget.id}
            p={sourceTarget}
            accountOptions={accountOpts}
            onDone={() => {
              setSourceTarget(null)
              refresh()
            }}
          />
        )}
      </BottomSheet>
      <BottomSheet
        open={selected != null}
        onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <AccountDetail key={selected.id} a={selected} cats={cats} />
        )}
      </BottomSheet>
      <BottomSheet
        open={renewAccount != null}
        onOpenChange={(o) => !o && closeRenew()}>
        {renewAccount && (
          <AccountForm
            key={renewAccount.id}
            account={renewAccount}
            onDone={() => {
              closeRenew()
              refresh()
            }}
          />
        )}
      </BottomSheet>

      <Dialog
        open={accSheet !== null}
        onOpenChange={(o) => !o && setAccSheet(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {accSheet === 'sort' ? 'Ordenar cuentas' : 'Filtrar cuentas'}
            </DialogTitle>
          </DialogHeader>
          {accSheet === 'sort' ? (
            <FilterOptions
              items={SORT_OPTS}
              value={accSort}
              onPick={(v) => {
                setAccSort(v)
                setAccSheet(null)
              }}
            />
          ) : (
            <FilterOptions
              items={TYPE_OPTS.map((o) => ({
                ...o,
                meta: `${typeCounts[o.value as keyof typeof typeCounts]} · ${
                  typeCounts[o.value as keyof typeof typeCounts] === 1
                    ? 'cuenta'
                    : 'cuentas'
                }`,
              }))}
              value={accType}
              onPick={(v) => {
                setAccType(v)
                setAccSheet(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={partnerSheet !== null}
        onOpenChange={(o) => !o && setPartnerSheet(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {partnerSheet === 'state'
                ? 'Filtrar compartidos'
                : partnerSheet === 'who'
                  ? '¿Con quién?'
                  : 'Seleccionar mes'}
            </DialogTitle>
          </DialogHeader>
          {partnerSheet === 'state' ? (
            <FilterOptions
              items={PARTNER_STATE_OPTS.map((o) => ({
                ...o,
                meta:
                  o.value === 'pending'
                    ? `${debtsVisible.length + owedVisible.length + debtsOverdueVisible.length + owedOverdueVisible.length + debtsPrevVisible.length + owedPrevVisible.length} · con saldo`
                    : `${debts.length + owed.length + debtsCarriedAll.length + owedCarriedAll.length} · todos`,
              }))}
              value={partnerState}
              onPick={(v) => {
                setPartnerState(v)
                setPartnerSheet(null)
              }}
            />
          ) : partnerSheet === 'who' ? (
            <FilterOptions
              items={PARTNER_WHO_OPTS.map((o) => {
                const monthN =
                  o.value === 'partner'
                    ? debtsByState.length +
                      owedByState.filter((d) => d.debtorId != null).length
                    : o.value === 'external'
                      ? owedByState.filter((d) => d.debtorId == null).length
                      : debtsByState.length + owedByState.length
                const overdueN =
                  o.value === 'partner'
                    ? debtsCarriedAll.filter((d) => d.debtorId != null).length +
                      owedCarriedAll.filter((d) => d.debtorId != null).length
                    : o.value === 'external'
                      ? owedCarriedAll.filter((d) => d.debtorId == null).length
                      : debtsCarriedAll.length + owedCarriedAll.length
                const n = monthN + overdueN
                const whoLabel =
                  o.value === 'partner'
                    ? 'pareja'
                    : o.value === 'external'
                      ? n === 1
                        ? 'persona'
                        : 'personas'
                      : n === 1
                        ? 'registro'
                        : 'registros'
                return { ...o, meta: `${n} · ${whoLabel}` }
              })}
              value={partnerWho}
              onPick={(v) => {
                setPartnerWho(v)
                setPartnerSheet(null)
              }}
            />
          ) : (
            <FilterOptions
              items={partnerMonths.map((m) => ({
                value: m.key,
                label: m.label,
                total: m.total,
                cap: true,
              }))}
              value={partnerMonth}
              onPick={(v) => {
                setPartnerMonth(v)
                setPartnerSheet(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Identidad de una deuda: cuenta + deudor (el nombre normalizado desempata a externos). */
function debtKey(d: PartnerDebt) {
  return `${d.accountId}:${d.debtorId ?? `ext:${d.debtorName.trim().toLowerCase()}`}`
}

function DebtCard({
  d,
  meId,
  tone = 'month',
  nowMonth,
}: {
  d: PartnerDebt
  meId: string
  tone?: 'month' | 'overdue' | 'carried'
  /** "YYYY-MM" real actual: la línea es vencida si su dueKey es anterior. */
  nowMonth?: string
}) {
  const owe = d.debtorId === meId
  const overdue = tone === 'overdue'
  const carried = tone === 'carried'
  const past = overdue || carried
  // Fecha real de pago: periodo de corte de la tarjeta; débito o sin
  // datos → día límite de la tarjeta o fin de mes.
  const due =
    d.dueLabel ??
    (d.accountType === 'CREDIT' && d.dueDay
      ? `para el día ${d.dueDay}`
      : 'antes de fin de mes')
  const dueKeys = [...new Set(d.lines.map((l) => l.dueKey))].sort()
  const monthLabelOf = (key: string) => {
    const [y, mo] = key.split('-').map(Number)
    if (!y || !mo) return null
    return monthLabelEs(new Date(y, mo - 1, 1))
  }
  const firstLabel = dueKeys.length > 0 ? monthLabelOf(dueKeys[0]) : null
  const multi = dueKeys.length > 1
  const originLabel = past
    ? overdue
      ? firstLabel
        ? multi
          ? `vencidos desde ${firstLabel}`
          : `vencido de ${firstLabel}`
        : 'vencido'
      : firstLabel
        ? multi
          ? `desde ${firstLabel}`
          : `de ${firstLabel}`
        : null
    : null
  return (
    <div
      className={`space-y-1 rounded-3xl border p-4 ${overdue ? 'debt-overdue' : owe ? 'debt-owe' : 'debt-owed'}`}>
      <p className="flex items-center gap-1.5 text-sm text-(--muted-foreground)">
        <HandCoins
          className={`size-4 ${overdue ? 'debt-overdue-text' : owe ? 'debt-owe-text' : 'debt-owed-text'}`}
        />{' '}
        {owe ? (
          <>
            Le debes a <b className="text-(--foreground)">{d.creditorName}</b>
          </>
        ) : (
          <>
            <b className="text-(--foreground)">{d.debtorName}</b> te debe
          </>
        )}
        {overdue && (
          <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-500 uppercase">
            Vencido
          </span>
        )}
      </p>
      <p className="text-2xl font-extrabold tracking-tight">
        {formatMoney(d.remaining)}
      </p>
      <p className="text-xs font-medium text-(--muted-foreground)">
        a {d.accountName} · {past && originLabel ? originLabel : due}
      </p>
      <ul className="mt-2 space-y-1.5 border-t border-(--border) pt-2 text-xs text-(--muted-foreground)">
        {d.lines.map((l, i) => {
          const rest = Math.max(0, l.monthly - l.paid)
          const settled = l.shareId != null && toCents(rest) <= 0
          const lineOverdue =
            past && nowMonth ? l.dueKey < nowMonth : overdue
          const lineLabel = past ? monthLabelOf(l.dueKey) : null
          // Solo se marca la línea si aporta info: cards multi-mes o
          // líneas que difieren del tono de la card (p. ej. octubre vigente
          // dentro de una card roja por septiembre).
          const showLineLabel =
            past && lineLabel && (multi || lineOverdue !== overdue)
          return (
            <li key={i}>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">
                  · {l.concept}{' '}
                  <span className="font-semibold text-(--foreground)">
                    (
                    {l.installments > 1
                      ? `${l.installment}/${l.installments}`
                      : 'único'}
                    )
                  </span>
                </span>
                <span className="shrink-0 font-bold text-(--foreground)">
                  {formatMoney(l.monthly)}/mes
                </span>
              </span>
              {showLineLabel &&
                (lineOverdue ? (
                  <span className="mt-0.5 flex items-center gap-1 font-semibold text-red-500">
                    <span className="size-1.5 rounded-full bg-red-500" />
                    Vencido · {lineLabel}
                  </span>
                ) : (
                  <span className="mt-0.5 block font-medium">
                    De {lineLabel} · aún con tiempo
                  </span>
                ))}
              {l.shareId != null && isPendingId(l.shareId) && (
                <span className="mt-0.5 flex items-center gap-1 font-semibold text-amber-500">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Pendiente
                </span>
              )}
              {l.shareId != null &&
                (settled ? (
                  <span className="mt-0.5 flex items-center gap-1 font-semibold text-emerald-500">
                    <Check className="size-3" /> Liquidado
                  </span>
                ) : (
                  (l.paid > 0 || l.pending > 0) && (
                    <span className="mt-0.5 block">
                      {l.paid > 0 && <>Abonado {formatMoney(l.paid)}</>}
                      {l.pending > 0 && (
                        <> · Por confirmar {formatMoney(l.pending)}</>
                      )}
                    </span>
                  )
                ))}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function DebtSwipeRow({
  d,
  meId,
  open,
  onOpenChange,
  onPay,
  overdue = false,
  carried = false,
  nowMonth,
}: {
  d: PartnerDebt
  meId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  onPay: (mode: 'receive' | 'pay') => void
  overdue?: boolean
  carried?: boolean
  nowMonth?: string
}) {
  const owe = d.debtorId === meId // yo debo → "Le pagué"; me deben → "Me pagó"
  const settled =
    d.lines.length > 0 &&
    d.lines.every(
      (l) => l.shareId == null || toCents(l.monthly) - toCents(l.paid) <= 0,
    )
  const tone = overdue ? 'overdue' : carried ? 'carried' : 'month'
  const card = <DebtCard d={d} meId={meId} tone={tone} nowMonth={nowMonth} />
  if (!d.lines.some((l) => l.shareId)) return card // demo: sin pagos
  return (
    <SwipeRow
      open={open}
      onOpenChange={onOpenChange}
      leftActionsWidth={132}
      disabled={settled}
      leftActions={
        <button
          type="button"
          onClick={() => {
            onOpenChange(false)
            onPay(owe ? 'pay' : 'receive')
          }}
          className={
            owe
              ? 'flex h-full flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl bg-amber-500 text-xs font-semibold text-white shadow-xs transition-all hover:bg-amber-600 active:scale-95'
              : 'flex h-full flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl bg-emerald-500 text-xs font-semibold text-white shadow-xs transition-all hover:bg-emerald-600 active:scale-95'
          }>
          {owe ? (
            <ArrowUpRight className="size-4" />
          ) : (
            <HandCoins className="size-4" />
          )}
          <span>{owe ? 'Le pagué' : 'Me pagó'}</span>
        </button>
      }>
      {card}
    </SwipeRow>
  )
}

function ToConfirmRow({ p, onOpen }: { p: ToConfirmItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-3xl border border-emerald-500/40 p-4 text-left transition active:scale-[.99]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15">
        <HandCoins className="size-5 text-emerald-500" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {p.concept} · {p.monthLabel}
        </span>
        <span className="block truncate text-xs text-(--muted-foreground)">
          {p.registeredByName} dice que te pagó
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-base font-extrabold">
          {formatMoney(p.amount)}
        </span>
        <span className="block text-[11px] font-semibold text-emerald-500">
          Revisar ›
        </span>
      </span>
    </button>
  )
}

function SourceConfirmRow({
  p,
  onOpen,
}: {
  p: SourceConfirmItem
  onOpen: () => void
}) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-3xl border border-sky-500/40 p-4 text-left transition active:scale-[.99]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15">
        <ArrowUpRight className="size-5 text-sky-500" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {p.concept} · {p.monthLabel}
        </span>
        <span className="block truncate text-xs text-(--muted-foreground)">
          {p.creditorName} dice que le pagaste · ¿de qué cuenta salió?
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-base font-extrabold">
          {formatMoney(p.amount)}
        </span>
        <span className="block text-[11px] font-semibold text-sky-500">
          Indicar ›
        </span>
      </span>
    </button>
  )
}

function SourceConfirmSheet({
  p,
  accountOptions,
  onDone,
}: {
  p: SourceConfirmItem
  accountOptions: { id: string; name: string; type?: string; color?: string }[]
  onDone: () => void
}) {
  const [accountId, setAccountId] = useState(accountOptions[0]?.id ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function confirm() {
    if (!accountId) {
      setMsg('Elige de qué cuenta salió')
      return
    }
    setMsg(null)
    setPending(true)
    const fd = new FormData()
    fd.set('paymentId', p.id)
    fd.set('accountId', accountId)
    const res = await confirmPaymentSource(fd)
    setPending(false)
    if ('error' in res && res.error) {
      setMsg(res.error)
      toast.error(res.error)
    } else {
      toast.success('Origen confirmado')
      onDone()
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6">
      <div className="space-y-1 text-center">
        <p className="text-sm font-bold">
          {p.concept} · {p.monthLabel}
        </p>
        <p className="text-xs text-(--muted-foreground)">
          {p.creditorName} registró que le pagaste{' '}
          <b className="text-(--foreground)">{formatMoney(p.amount)}</b>. Elige
          de qué cuenta salió para reflejar tu egreso.
        </p>
      </div>
      <ul className="max-h-56 space-y-1 overflow-y-auto">
        {accountOptions.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setAccountId(a.id)}
              className={`flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left transition hover:bg-(--muted) ${accountId === a.id ? 'bg-(--muted)' : ''}`}>
              <AccountIcon type={a.type} color={a.color} />
              <span className="flex-1 text-sm font-semibold">{a.name}</span>
              {accountId === a.id && (
                <Check className="size-4 text-(--primary)" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {msg && (
        <p className="text-center text-sm font-medium text-red-500">{msg}</p>
      )}
      <Button
        type="button"
        className="h-12 w-full rounded-2xl text-base"
        disabled={pending || !accountId}
        onClick={confirm}>
        {pending ? 'Guardando…' : 'Confirmar origen'}
      </Button>
    </div>
  )
}

function MyPendingRow({ p, onDone }: { p: MyPendingItem; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  async function cancel() {
    setBusy(true)
    const res = await cancelPayment(p.id)
    setBusy(false)
    if ('error' in res && res.error) toast.error(res.error)
    else {
      toast.success('Registro cancelado')
      onDone()
    }
  }
  return (
    <div className="flex w-full items-center gap-3 rounded-3xl border border-dashed border-(--border) p-4">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {p.concept} · {p.monthLabel}
        </span>
        <span className="block truncate text-xs text-(--muted-foreground)">
          Esperando a {p.confirmerName}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-base font-extrabold">
          {formatMoney(p.amount)}
        </span>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="block text-[11px] font-semibold text-red-500 disabled:opacity-50">
          {busy ? 'Cancelando…' : 'Cancelar'}
        </button>
      </span>
    </div>
  )
}

function GroupCard({ g }: { g: GroupSummary }) {
  const net = g.myOwed - g.myOwe
  return (
    <Link
      href={`/cuentas/grupos/${g.id}`}
      className="flex w-full items-center gap-3 rounded-3xl border border-(--border) p-4 text-left transition active:scale-[.99]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15">
        <Users className="size-5 text-sky-500" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-sm font-semibold">{g.name}</span>
          {g.status === 'CLOSED' && (
            <span className="shrink-0 rounded-full bg-(--muted) px-2 py-0.5 text-[10px] font-bold text-(--muted-foreground) uppercase">
              Cerrado
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-(--muted-foreground)">
          {g.memberCount} {g.memberCount === 1 ? 'integrante' : 'integrantes'} ·{' '}
          {g.expenseCount} {g.expenseCount === 1 ? 'gasto' : 'gastos'}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {net === 0 ? (
          <span className="block text-base font-extrabold">A mano</span>
        ) : net > 0 ? (
          <>
            <span className="block text-base font-extrabold text-emerald-500">
              {formatMoney(net)}
            </span>
            <span className="block text-[11px] font-semibold text-(--muted-foreground)">
              a tu favor
            </span>
          </>
        ) : (
          <>
            <span className="block text-base font-extrabold text-amber-500">
              {formatMoney(-net)}
            </span>
            <span className="block text-[11px] font-semibold text-(--muted-foreground)">
              debes
            </span>
          </>
        )}
      </span>
    </Link>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-3xl border border-dashed border-(--border) p-8 text-center text-sm text-(--muted-foreground)">
      {text}
    </p>
  )
}

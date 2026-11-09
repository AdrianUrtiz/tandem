'use client'

import { useMemo, useState } from 'react'

import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock,
  CreditCard,
  User,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import { payableInstallments } from '@/lib/calculations'
import { fromCents, splitMoney, toCents } from '@/lib/money'
import { syncForce } from '@/lib/offline/useSnapshotSync'
import { prepayInstallment } from '@/lib/prepay-installment'
import { formatMoney, monthLabelEs } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  fmtDayMonth,
  fmtMonthLong,
  fmtMonthShort,
  mexicoMonthKey,
  todayMexicoYMD,
  wallDay,
} from '@/lib/walltime'

export type MsiShareView = {
  id: string
  debtorId: string | null
  debtorName: string
  sharePct: number
  monthlyAmount: number
}

export type MsiItemView = {
  id: string
  concept: string
  amount: number
  installments: number
  date: string // ISO
  accountName: string
  accountType: 'DEBIT' | 'CREDIT' | null
  /** Corte/vencimiento de la tarjeta de compra (null = mes calendario). */
  statementDay: number | null
  dueDay: number | null
  /** Parcialidades liquidadas de mis compras (claves "YYYY-MM"). */
  settledPayKeys: string[]
  /** Adelantos registrados: payKey → { aplicado al mes, cargado hoy }. */
  advances: Record<string, { applied: number; paidNow: number }>
  isShared: boolean
  createdById: string
  creatorName: string
  /** 'mine' = solo mía · 'creditor' = yo la compré y me deben · 'debtor' = la compró mi pareja y le debo */
  myRole: 'mine' | 'creditor' | 'debtor'
  shares: MsiShareView[]
}

export type MsiPaymentsView = Record<string, { c: number; p: number }>

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const label = monthLabelEs(new Date(y, (m ?? 1) - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** "nov 2026": mes corto para filas de lista (cabe en una línea). */
function monthShortLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, 1))
  return `${fmtMonthShort(dt)} ${y}`
}

/** "5 nov 2026": fecha corta de compra (evita truncar el año). */
function fmtShort(d: string): string {
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return `${fmtDayMonth(dt)} ${dt.getUTCFullYear()}`
}

function fmtFull(d: string): string {
  const dt = new Date(d)
  const s = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type Computed = {
  months: string[]
  /** Exigibilidad por parcialidad (corte de la tarjeta o mes calendario). */
  due: { dueKey: string; dueDate: Date | null }[]
  split: number[]
  curKey: string
  /** índice 0-based de la parcialidad actual (clamp). */
  curIdx: number
  finished: boolean
  notStarted: boolean
  monthlyNow: number
  remainingTotal: number
  paidTotal: number
  progress: number
}

/** "YYYY-MM-DD" de una hora-muro (para comparar con todayMexicoYMD). */
function ymdWall(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

function computeItem(it: MsiItemView, curKey: string): Computed {
  const n = Math.max(1, Math.round(it.installments))
  // Cada parcialidad se vuelve exigible en el mes de su vencimiento
  // (corte de la tarjeta en crédito con corte; mes calendario en el resto).
  // `months` (clave de registro de abonos) no cambia.
  const parts = payableInstallments(
    new Date(it.date),
    n,
    it.statementDay ?? null,
    it.dueDay ?? null,
  )
  const months = parts.map((p) => p.payKey)
  const due = parts.map((p) => ({ dueKey: p.dueKey, dueDate: p.dueDate }))
  const split = splitMoney(it.amount, n)
  let elapsed = due.filter((d) => d.dueKey <= curKey).length
  if (elapsed < 1) elapsed = 1
  if (elapsed > n) elapsed = n
  const curIdx = elapsed - 1
  const finished = curKey > due[n - 1]!.dueKey
  const notStarted = curKey < due[0]!.dueKey
  const monthlyNow = split[curIdx] ?? 0
  // Cubiertas (liquidadas o adelantadas) ya no restan, aunque venzan después.
  const isCovered = (m: string) =>
    it.settledPayKeys.includes(m) || (it.advances != null && m in it.advances)
  const remainingTotal = finished
    ? 0
    : split
        .filter((_, i) => i >= curIdx && !isCovered(months[i]!))
        .reduce((a, v) => a + v, 0)
  const paidTotal = finished
    ? it.amount
    : split.slice(0, curIdx).reduce((a, v) => a + v, 0)
  return {
    months,
    due,
    split,
    curKey,
    curIdx,
    finished,
    notStarted,
    monthlyNow,
    remainingTotal: Math.round(remainingTotal * 100) / 100,
    paidTotal: Math.round(paidTotal * 100) / 100,
    progress: finished ? 100 : Math.round((curIdx / n) * 100),
  }
}

function shareTotals(
  shareId: string,
  months: string[],
  monthly: number,
  payments: MsiPaymentsView,
) {
  let confirmed = 0
  let pending = 0
  for (const m of months) {
    const s = payments[`${shareId}:${m}`]
    if (s) {
      confirmed += s.c
      pending += s.p
    }
  }
  const total = Math.round(monthly * months.length * 100) / 100
  const remaining = Math.max(0, Math.round((total - confirmed) * 100) / 100)
  return { total, confirmed, pending, remaining }
}

/** Estado de pago de una parcialidad compartida (lo que se debe vs abonado). */
type MonthState =
  | 'paid'
  | 'prepaid'
  | 'charged'
  | 'toConfirm'
  | 'partial'
  | 'overdue'
  | 'due'
  | 'upcoming'

const MONTH_PILL: Record<
  MonthState,
  { text: string; cls: string; Icon: LucideIcon | null }
> = {
  paid: {
    text: 'Pagada',
    cls: 'bg-emerald-500/15 text-emerald-500',
    Icon: Check,
  },
  prepaid: {
    text: 'Adelantada',
    cls: 'bg-emerald-500/15 text-emerald-500',
    Icon: CalendarClock,
  },
  charged: {
    text: 'Cargada',
    cls: 'bg-(--muted) text-(--muted-foreground)',
    Icon: Check,
  },
  toConfirm: {
    text: 'Por confirmar',
    cls: 'bg-amber-500/15 text-amber-500',
    Icon: Clock,
  },
  partial: {
    text: 'Abono parcial',
    cls: 'bg-amber-500/15 text-amber-500',
    Icon: Clock,
  },
  overdue: {
    text: 'Vencida · por pagar',
    cls: 'bg-red-500/15 text-red-500',
    Icon: AlertTriangle,
  },
  due: {
    text: 'Actual · por pagar',
    cls: 'bg-amber-500/15 text-amber-500',
    Icon: Clock,
  },
  upcoming: {
    text: 'Próxima',
    cls: 'bg-(--muted) text-(--muted-foreground)',
    Icon: null,
  },
}

/** Formulario inline para adelantar una parcialidad futura (solo-mías). */
function PrepayForm({
  txId,
  month,
  monthly,
  label,
  onDone,
}: {
  txId: string
  month: string
  monthly: number
  label: string
  onDone: () => void
}) {
  const router = useRouter()
  const [applied, setApplied] = useState(String(monthly))
  const [hasDiscount, setHasDiscount] = useState(false)
  const [discount, setDiscount] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const appliedC = toCents(Number(applied) || 0)
  const discountC = hasDiscount ? toCents(Number(discount) || 0) : 0
  const chargedC = appliedC - discountC

  async function submit() {
    setMsg(null)
    setPending(true)
    const fd = new FormData()
    fd.set('transactionId', txId)
    fd.set('month', month)
    fd.set('applied', applied)
    if (hasDiscount) fd.set('discount', discount)
    const res = await prepayInstallment(fd)
    setPending(false)
    if ('error' in res && res.error) {
      setMsg(res.error)
      toast.error(res.error)
    } else {
      await syncForce()
      toast.success(
        discountC > 0
          ? `Adelanto registrado, te ahorraste ${formatMoney(fromCents(discountC))}`
          : 'Adelanto registrado',
      )
      router.refresh()
      onDone()
    }
  }

  return (
    <div className="space-y-2 rounded-2xl bg-(--muted)/60 p-3">
      <p className="text-xs font-semibold">
        Adelantar {label} · mensualidad {formatMoney(monthly)}
      </p>
      <p className="text-[11px] text-(--muted-foreground)">
        Se aplica al mes y hoy se carga en tu tarjeta la diferencia.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="prepay-applied">Se aplica al mes</Label>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-bold text-(--muted-foreground)">$</span>
          <Input
            id="prepay-applied"
            type="number"
            min={0.01}
            step={0.01}
            value={applied}
            onChange={(e) => setApplied(e.target.value)}
            className="h-11 text-lg font-bold"
            inputMode="decimal"
          />
        </div>
      </div>
      <div className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-1">
        <button
          type="button"
          onClick={() => setHasDiscount((v) => !v)}
          className="text-left text-xs font-semibold">
          Tiene descuento
        </button>
        <Switch checked={hasDiscount} onCheckedChange={setHasDiscount} />
      </div>
      {hasDiscount && (
        <div className="space-y-1.5">
          <Label htmlFor="prepay-discount">Descuento</Label>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold text-(--muted-foreground)">
              $
            </span>
            <Input
              id="prepay-discount"
              type="number"
              min={0}
              step={0.01}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="h-11 text-lg font-bold"
              inputMode="decimal"
              placeholder="0"
            />
          </div>
        </div>
      )}
      {appliedC > 0 && chargedC > 0 && (
        <p className="text-center text-xs font-semibold text-emerald-500">
          Hoy se cargan {formatMoney(fromCents(chargedC))}
          {discountC > 0 &&
            ` · te ahorras ${formatMoney(fromCents(discountC))}`}
        </p>
      )}
      {msg && (
        <p className="text-center text-xs font-medium text-red-500">{msg}</p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-10 flex-1 rounded-xl"
          disabled={pending}
          onClick={onDone}>
          Cancelar
        </Button>
        <Button
          type="button"
          className="h-10 flex-1 rounded-xl"
          disabled={pending || appliedC <= 0 || chargedC <= 0}
          onClick={submit}>
          {pending ? 'Guardando…' : 'Confirmar adelanto'}
        </Button>
      </div>
    </div>
  )
}

export function MsiConcentrado({
  meId,
  items,
  payments,
}: {
  meId?: string
  items: MsiItemView[]
  payments: MsiPaymentsView
}) {
  const [selId, setSelId] = useState<string | null>(null)
  const [prepay, setPrepay] = useState<{
    txId: string
    month: string
    monthly: number
  } | null>(null)
  const curKey = useMemo(() => mexicoMonthKey(), [])
  const todayKey = useMemo(() => todayMexicoYMD(), [])
  const computed = useMemo(() => {
    const map = new Map<string, Computed>()
    for (const it of items) map.set(it.id, computeItem(it, curKey))
    return map
  }, [items, curKey])

  const sel = items.find((i) => i.id === selId) ?? null
  const selComp = sel ? computed.get(sel.id) : null

  const summary = useMemo(() => {
    let monthly = 0
    let remaining = 0
    let active = 0
    for (const it of items) {
      const c = computed.get(it.id)
      if (!c || c.finished) continue
      active += 1
      // Mi mensualidad: si soy deudor, mi parte; si no, el total.
      if (it.myRole === 'debtor' && meId) {
        const mine = it.shares.find((s) => s.debtorId === meId)
        monthly += mine?.monthlyAmount ?? c.monthlyNow
        const st = mine
          ? shareTotals(mine.id, c.months, mine.monthlyAmount, payments)
          : null
        remaining += st?.remaining ?? c.remainingTotal
      } else {
        monthly += c.monthlyNow
        remaining += c.remainingTotal
      }
    }
    return { monthly, remaining, active }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, computed, meId])

  if (items.length === 0) {
    return (
      <section className="w-full space-y-2 rounded-3xl border border-(--border) p-4">
        <p className="text-xs font-semibold text-(--muted-foreground)">
          Pagos a meses
        </p>
        <p className="py-6 text-center text-sm text-(--muted-foreground)">
          Sin compras a meses por ahora.
        </p>
      </section>
    )
  }

  return (
    <section className="w-full space-y-2 rounded-3xl border border-(--border) p-4">
      <p className="text-xs font-semibold text-(--muted-foreground)">
        Pagos a meses
      </p>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xl font-extrabold tracking-tight tabular-nums">
          {formatMoney(summary.monthly)}
        </p>
        <p className="shrink-0 text-right text-[11px] leading-tight text-(--muted-foreground) tabular-nums">
          este mes · {summary.active}{' '}
          {summary.active === 1 ? 'compra activa' : 'compras activas'}
          <br />
          restan {formatMoney(summary.remaining)}
        </p>
      </div>

      <ul className="space-y-2">
        {items.map((it) => {
          const c = computed.get(it.id)!
          const RoleIcon = it.myRole === 'mine' ? User : Users
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => {
                  setSelId(it.id)
                  setPrepay(null)
                }}
                className="w-full rounded-2xl bg-(--muted)/60 p-3.5 text-left transition hover:bg-(--muted) active:scale-[.99]">
                <span className="flex items-center gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--card)">
                    <CreditCard className="size-4 text-(--primary)" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {it.concept}
                    </span>
                    <span className="block truncate text-[11px] whitespace-nowrap text-(--muted-foreground)">
                      {it.accountName} · {fmtShort(it.date)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Badge variant="warning" className="tabular-nums">
                      {it.installments} MSI
                    </Badge>
                  </span>
                </span>
                <span className="mt-2.5 flex items-baseline justify-between gap-2 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-1 font-semibold text-(--muted-foreground)">
                    <RoleIcon className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {c.finished
                        ? `Liquidado ${it.installments}/${it.installments}`
                        : `Parcialidad ${c.curIdx + 1}/${it.installments}`}
                    </span>
                  </span>
                  <span className="shrink-0 font-extrabold tabular-nums">
                    {formatMoney(c.monthlyNow)}
                    <span className="font-medium text-(--muted-foreground)">
                      /mes
                    </span>
                  </span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-(--border)/60">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      c.finished ? 'bg-emerald-500' : 'bg-(--primary)',
                    )}
                    style={{
                      width: `${c.finished ? 100 : Math.round(((c.curIdx + 1) / it.installments) * 100)}%`,
                    }}
                  />
                </span>
                <span className="mt-1.5 block truncate text-[11px] text-(--muted-foreground) tabular-nums">
                  {c.finished ? (
                    <span className="font-semibold text-emerald-500">
                      Sin saldo restante
                    </span>
                  ) : (
                    <>
                      Restan {formatMoney(c.remainingTotal)} · Actual{' '}
                      {monthShortLabel(c.months[c.curIdx]!)}
                    </>
                  )}
                  {it.isShared && (
                    <>
                      {' · '}
                      {it.myRole === 'debtor'
                        ? `le debo a ${it.creatorName}`
                        : it.myRole === 'creditor'
                          ? 'compartida'
                          : ''}
                    </>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Dialog
        open={sel != null}
        onOpenChange={(o) => !o && (setSelId(null), setPrepay(null))}>
        <DialogContent>
          {sel && selComp && (
            <>
              <DialogHeader>
                <DialogTitle className="text-center">
                  {sel.installments} meses sin intereses
                </DialogTitle>
              </DialogHeader>
              <div className="max-h-[70dvh] space-y-4 overflow-y-auto px-1 pb-2">
                <div className="text-center">
                  <p className="text-lg font-extrabold tracking-tight text-balance">
                    {sel.concept}
                  </p>
                  <p className="mt-0.5 text-3xl font-extrabold tracking-tight tabular-nums">
                    {formatMoney(sel.amount)}
                  </p>
                  <p className="mt-0.5 text-xs text-(--muted-foreground)">
                    {fmtFull(sel.date)} · {sel.accountName} · registrada por{' '}
                    {sel.creatorName}
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-1">
                    <Badge variant="warning">{sel.installments} MSI</Badge>
                    {sel.isShared ? (
                      <Badge>
                        {sel.myRole === 'debtor'
                          ? `Compartida · le debo a ${sel.creatorName}`
                          : sel.myRole === 'creditor'
                            ? 'Compartida · me deben'
                            : 'Compartida'}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Solo mía</Badge>
                    )}
                    {selComp.finished && (
                      <Badge variant="secondary">Liquidada</Badge>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-(--muted)/60 p-3">
                    <dt className="flex items-center justify-center gap-1 text-[10px] font-semibold tracking-wide text-(--muted-foreground) uppercase">
                      <CalendarClock className="size-3 shrink-0" /> Parcialidad
                    </dt>
                    <dd className="mt-1 text-base font-extrabold tabular-nums">
                      {selComp.finished
                        ? `${sel.installments}/${sel.installments}`
                        : `${selComp.curIdx + 1}/${sel.installments}`}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-(--muted)/60 p-3">
                    <dt className="text-[10px] font-semibold tracking-wide text-(--muted-foreground) uppercase">
                      Monto mensual
                    </dt>
                    <dd className="mt-1 text-base font-extrabold tabular-nums">
                      {formatMoney(selComp.monthlyNow)}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-(--muted)/60 p-3">
                    <dt className="text-[10px] font-semibold tracking-wide text-(--muted-foreground) uppercase">
                      Saldo restante
                    </dt>
                    <dd className="mt-1 text-base font-extrabold tabular-nums">
                      {formatMoney(selComp.remainingTotal)}
                    </dd>
                  </div>
                </dl>

                {sel.isShared && sel.shares.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-(--muted-foreground)">
                      Reparto con pareja
                    </p>
                    {sel.shares.map((s) => {
                      const st = shareTotals(
                        s.id,
                        selComp.months,
                        s.monthlyAmount,
                        payments,
                      )
                      return (
                        <div
                          key={s.id}
                          className="rounded-2xl bg-(--muted)/60 p-3.5 text-sm">
                          <p>
                            <b>{s.debtorName}</b> aporta{' '}
                            <b>{formatMoney(s.monthlyAmount)}/mes</b>{' '}
                            <span className="text-(--muted-foreground)">
                              ({s.sharePct}%)
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-(--muted-foreground)">
                            Total de su parte {formatMoney(st.total)} · abonado{' '}
                            {formatMoney(st.confirmed)}
                            {st.pending > 0 && (
                              <> · por confirmar {formatMoney(st.pending)}</>
                            )}{' '}
                            · <b>restan {formatMoney(st.remaining)}</b>
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div>
                  <div className="mb-2 space-y-1.5">
                    <p className="text-xs font-semibold text-(--muted-foreground)">
                      Calendario de parcialidades
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-semibold text-(--muted-foreground)">
                      {sel.isShared ? (
                        <span className="inline-flex items-center gap-1">
                          <Check className="size-3 text-emerald-500" /> Pagada
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="size-3 text-emerald-500" />{' '}
                            Adelantada
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Check className="size-3 text-emerald-500" /> Pagada
                          </span>
                        </>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3 text-amber-500" /> Pendiente
                      </span>
                    </p>
                  </div>
                  <ul className="divide-y divide-(--border)/60 rounded-2xl border border-(--border)/60">
                    {selComp.months.map((m, i) => {
                      const amt = selComp.split[i] ?? 0
                      const isCur = i === selComp.curIdx && !selComp.finished
                      const part = selComp.due[i] ?? {
                        dueKey: m,
                        dueDate: null,
                      }
                      const isPast =
                        selComp.finished || part.dueKey < selComp.curKey
                      // Abonos de la deuda compartida en este mes (suma de shares).
                      let confirmed = 0
                      let pending = 0
                      let expected = 0
                      if (sel.isShared) {
                        for (const s of sel.shares) {
                          expected += s.monthlyAmount
                          const v = payments[`${s.id}:${m}`]
                          if (v) {
                            confirmed += v.c
                            pending += v.p
                          }
                        }
                      }
                      const paid =
                        sel.isShared &&
                        toCents(expected) > 0 &&
                        toCents(confirmed) >= toCents(expected)
                      const hasPending = toCents(pending) > 0
                      const hasPartial = !paid && toCents(confirmed) > 0
                      // Mis compras: periodo liquidado o débito ya cargado =
                      // pagada; adelanto registrado = adelantada. Sin corte
                      // configurado no hay dato: queda como cargada.
                      const adv = !sel.isShared ? sel.advances[m] : undefined
                      const minePaid =
                        !sel.isShared &&
                        (sel.settledPayKeys.includes(m) || adv != null)
                      const hasPayInfo =
                        !sel.isShared &&
                        (sel.accountType === 'DEBIT' ||
                          (sel.accountType === 'CREDIT' &&
                            sel.statementDay != null))
                      // Vencida = mes de vencimiento pasado, o ya pasó el día
                      // límite dentro del mes en curso.
                      const overdue =
                        !paid &&
                        (part.dueKey < selComp.curKey ||
                          (part.dueDate != null &&
                            ymdWall(part.dueDate) < todayKey))
                      let state: MonthState
                      if (sel.isShared) {
                        if (paid) state = 'paid'
                        else if (hasPending) state = 'toConfirm'
                        else if (hasPartial) state = 'partial'
                        else if (overdue) state = 'overdue'
                        else if (isCur) state = 'due'
                        else state = 'upcoming'
                      } else if (minePaid) {
                        state = adv != null ? 'prepaid' : 'paid'
                      } else if (!hasPayInfo && isPast) {
                        state = 'charged'
                      } else if (overdue) {
                        state = 'overdue'
                      } else if (isCur) {
                        state = 'due'
                      } else {
                        state = 'upcoming'
                      }
                      const pill = MONTH_PILL[state]
                      // Fecha límite de la tarjeta (solo si aún no está pagada).
                      const showDue =
                        part.dueDate != null && (sel.isShared ? !paid : !isPast)
                      // Adelantar: solo-mías, futura y sin cubrir.
                      const canPrepay =
                        !sel.isShared && !minePaid && state === 'upcoming'
                      const prepayOpen =
                        prepay?.txId === sel.id && prepay?.month === m
                      return (
                        <li
                          key={m}
                          className={cn(
                            'px-4 py-3 text-sm',
                            isCur && 'bg-(--primary)/10',
                          )}>
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                              {i + 1}/{sel.installments} · {monthLabel(m)}
                            </p>
                            <p
                              className={cn(
                                'shrink-0 text-[13px] font-bold tabular-nums',
                                paid && 'text-emerald-500',
                              )}>
                              {formatMoney(amt)}
                            </p>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                              <span
                                className={cn(
                                  'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                                  pill.cls,
                                )}>
                                {pill.Icon && <pill.Icon className="size-3" />}
                                {pill.text}
                              </span>
                              {showDue && (
                                <span className="text-[11px] text-(--muted-foreground)">
                                  {overdue ? 'Venció' : 'Vence'}{' '}
                                  {wallDay(part.dueDate!)} de{' '}
                                  {fmtMonthLong(part.dueDate!)}
                                </span>
                              )}
                            </div>
                            {canPrepay && !prepayOpen && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPrepay({
                                    txId: sel.id,
                                    month: m,
                                    monthly: amt,
                                  })
                                }
                                className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-600 transition hover:bg-amber-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 active:scale-[.97] dark:text-amber-500">
                                Adelantar
                              </button>
                            )}
                          </div>
                          {(hasPending || hasPartial || adv != null) && (
                            <p className="mt-1 text-right text-[11px] font-medium text-amber-600 tabular-nums dark:text-amber-500">
                              {adv != null ? (
                                <>
                                  Adelanto {formatMoney(adv.paidNow)} · te
                                  ahorraste{' '}
                                  {formatMoney(
                                    fromCents(
                                      toCents(adv.applied) -
                                        toCents(adv.paidNow),
                                    ),
                                  )}
                                </>
                              ) : (
                                <>
                                  {hasPartial && (
                                    <>Abonado {formatMoney(confirmed)}</>
                                  )}
                                  {hasPartial && hasPending && ' · '}
                                  {hasPending && (
                                    <>Por confirmar {formatMoney(pending)}</>
                                  )}
                                </>
                              )}
                            </p>
                          )}
                          {prepayOpen && prepay && (
                            <div className="pt-3">
                              <PrepayForm
                                txId={prepay.txId}
                                month={prepay.month}
                                monthly={prepay.monthly}
                                label={`${i + 1}/${sel.installments} · ${monthLabel(m)}`}
                                onDone={() => setPrepay(null)}
                              />
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {!sel.isShared && (
                    <p className="mt-2 text-[11px] leading-relaxed text-(--muted-foreground)">
                      Adelantada = la registraste con este flujo. Pagada = el
                      periodo quedó liquidado o el cargo ya se aplicó (débito).
                      Sin corte configurado solo se muestra como cargada.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

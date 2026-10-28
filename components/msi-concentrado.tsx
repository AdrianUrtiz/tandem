'use client'

import { useMemo, useState } from 'react'

import { CalendarClock, CreditCard, User, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { installmentMonths } from '@/lib/calculations'
import { splitMoney } from '@/lib/money'
import { formatMoney, monthLabelEs } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { mexicoMonthKey } from '@/lib/walltime'

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

function computeItem(it: MsiItemView, curKey: string): Computed {
  const n = Math.max(1, Math.round(it.installments))
  const months = installmentMonths(new Date(it.date), n)
  const split = splitMoney(it.amount, n)
  let elapsed = months.filter((m) => m <= curKey).length
  if (elapsed < 1) elapsed = 1
  if (elapsed > n) elapsed = n
  const curIdx = elapsed - 1
  const finished = curKey > months[n - 1]!
  const notStarted = curKey < months[0]!
  const monthlyNow = split[curIdx] ?? 0
  const remainingTotal = finished
    ? 0
    : split.slice(curIdx).reduce((a, v) => a + v, 0)
  const paidTotal = finished
    ? it.amount
    : split.slice(0, curIdx).reduce((a, v) => a + v, 0)
  return {
    months,
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
  const curKey = useMemo(() => mexicoMonthKey(), [])
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
        <p className="text-2xl font-extrabold tracking-tight">
          {formatMoney(summary.monthly)}
        </p>
        <p className="text-right text-[11px] leading-tight text-(--muted-foreground)">
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
                onClick={() => setSelId(it.id)}
                className="w-full rounded-2xl bg-(--muted)/60 p-3.5 text-left transition active:scale-[.99] hover:bg-(--muted)">
                <span className="flex items-center gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--card)">
                    <CreditCard className="size-4 text-(--primary)" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {it.concept}
                    </span>
                    <span className="block truncate text-[11px] text-(--muted-foreground)">
                      {it.accountName} · {fmtFull(it.date)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Badge variant="warning">
                      {it.installments} MSI
                    </Badge>
                  </span>
                </span>
                <span className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-(--muted-foreground)">
                    <RoleIcon className="size-3.5" />
                    {c.finished
                      ? `Liquidado ${it.installments}/${it.installments}`
                      : `Parcialidad ${c.curIdx + 1}/${it.installments}`}
                  </span>
                  <span className="font-extrabold">
                    {formatMoney(c.monthlyNow)}
                    <span className="font-medium text-(--muted-foreground)">
                      /mes
                    </span>
                  </span>
                </span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-(--border)/60">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      c.finished ? 'bg-emerald-500' : 'bg-(--primary)',
                    )}
                    style={{ width: `${c.finished ? 100 : Math.round(((c.curIdx + 1) / it.installments) * 100)}%` }}
                  />
                </span>
                <span className="mt-1 block text-[11px] text-(--muted-foreground)">
                  {c.finished ? (
                    <span className="font-semibold text-emerald-500">
                      Sin saldo restante
                    </span>
                  ) : (
                    <>
                      Restan {formatMoney(c.remainingTotal)} ·{' '}
                      {monthLabel(c.months[c.curIdx]!)} es la parcialidad actual
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

      <Dialog open={sel != null} onOpenChange={(o) => !o && setSelId(null)}>
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
                  <p className="text-lg font-extrabold tracking-tight">
                    {sel.concept}
                  </p>
                  <p className="text-3xl font-extrabold tracking-tight">
                    {formatMoney(sel.amount)}
                  </p>
                  <p className="mt-0.5 text-xs text-(--muted-foreground)">
                    {fmtFull(sel.date)} · {sel.accountName} · registrada por{' '}
                    {sel.creatorName}
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-1">
                    <Badge variant="warning">
                      {sel.installments} MSI
                    </Badge>
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
                    <dt className="flex items-center justify-center gap-1 text-[10px] font-semibold text-(--muted-foreground) uppercase">
                      <CalendarClock className="size-3" /> Parcialidad
                    </dt>
                    <dd className="mt-0.5 text-base font-extrabold">
                      {selComp.finished
                        ? `${sel.installments}/${sel.installments}`
                        : `${selComp.curIdx + 1}/${sel.installments}`}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-(--muted)/60 p-3">
                    <dt className="text-[10px] font-semibold text-(--muted-foreground) uppercase">
                      Monto mensual
                    </dt>
                    <dd className="mt-0.5 text-base font-extrabold">
                      {formatMoney(selComp.monthlyNow)}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-(--muted)/60 p-3">
                    <dt className="text-[10px] font-semibold text-(--muted-foreground) uppercase">
                      Saldo restante
                    </dt>
                    <dd className="mt-0.5 text-base font-extrabold">
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
                            Total de su parte {formatMoney(st.total)} ·
                            abonado {formatMoney(st.confirmed)}
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
                  <p className="mb-1 text-xs font-semibold text-(--muted-foreground)">
                    Calendario de parcialidades
                  </p>
                  <ul className="divide-y divide-(--border)/60 rounded-2xl border border-(--border)/60">
                    {selComp.months.map((m, i) => {
                      const amt = selComp.split[i] ?? 0
                      const isCur = i === selComp.curIdx && !selComp.finished
                      const isPast =
                        selComp.finished || m < selComp.curKey
                      return (
                        <li
                          key={m}
                          className={cn(
                            'flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm',
                            isCur && 'bg-(--primary)/10 font-semibold',
                          )}>
                          <span>
                            <span className="block font-semibold">
                              {i + 1}/{sel.installments} · {monthLabel(m)}
                            </span>
                            <span className="block text-[11px] text-(--muted-foreground)">
                              {isCur
                                ? 'Parcialidad actual'
                                : isPast
                                  ? sel.isShared
                                    ? 'Parcialidad pasada'
                                    : 'Mensualidad pasada'
                                  : 'Próxima'}
                            </span>
                          </span>
                          <span className="font-bold">
                            {formatMoney(amt)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  {!sel.isShared && (
                    <p className="mt-1 text-center text-[11px] text-(--muted-foreground)">
                      El avance es por calendario: se descuenta cada mes que
                      pasa.
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

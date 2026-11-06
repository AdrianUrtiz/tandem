'use client'

import { useMemo, useState } from 'react'

import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeftRight,
  ArrowUpRight,
  CreditCard,
  Landmark,
  Star,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { AccountRow } from '@/components/account-card'

import { setFavoriteAccount } from '@/lib/actions'
import { getBank } from '@/lib/banks'
import { useActivityFilters } from '@/lib/activity-filters'
import type { CatalogRow } from '@/lib/catalog'
import { lookupCategory } from '@/lib/categories'
import { type OfflineTransaction, db } from '@/lib/offline/db'
import { isPendingId } from '@/lib/offline/pending'
import { syncForce } from '@/lib/offline/useSnapshotSync'
import { type StatementTx, activePeriods } from '@/lib/statements'
import { formatMoney } from '@/lib/utils'
import { fmtDayMonth } from '@/lib/walltime'

const PREVIEW = 5
const EXPANDED = 30

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-xs font-medium text-(--muted-foreground)">
        {label}
      </span>
      <span className="text-right text-sm font-semibold">{value}</span>
    </div>
  )
}

/** Texto oscuro si el fondo es claro (ej. HSBC/Scotiabank en blanco). */
function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '').trim()
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6
}

/** Tarjeta simulada con los datos de la cuenta. */
function CardVisual({
  a,
  fav,
  favBusy,
  onToggleFavorite,
  future = 0,
}: {
  a: AccountRow
  fav: boolean
  favBusy: boolean
  onToggleFavorite: () => void
  /** MSI aún no exigibles del corte vigente (segundo segmento). */
  future?: number
}) {
  const credit = a.type === 'CREDIT'
  const bank = getBank(a.bankId)
  const FallbackIcon = credit ? CreditCard : Landmark
  const BankIcon = bank?.Icon
  const limit = a.creditLimit ?? 0
  const available = credit ? limit - a.balance : a.balance
  // Deuda total = actual (exigible) + meses (futuro). Orden: actual primero
  // (blanco sólido), meses después (blanco tenue que se tiñe del color de
  // la tarjeta), disponible al final (pista oscura).
  const futureAmt =
    credit && limit > 0
      ? Math.min(Math.max(0, future), Math.max(0, a.balance))
      : 0
  const dueAmt = credit ? Math.max(0, a.balance - futureAmt) : 0
  let futurePct = limit > 0 ? (futureAmt / limit) * 100 : 0
  let duePct = limit > 0 ? (dueAmt / limit) * 100 : 0
  // Deuda sobre el límite: se escala para no desbordar la barra.
  if (futurePct + duePct > 100) {
    const s = 100 / (futurePct + duePct)
    futurePct *= s
    duePct *= s
  }
  const light = isLightColor(a.color)
  const fg = light ? '#0f172a' : '#ffffff'
  const ringCls = light ? 'ring-black/20' : 'ring-white/40'
  return (
    <div
      className="relative overflow-hidden rounded-3xl p-6 shadow-lg"
      style={{
        background: `linear-gradient(135deg, ${a.color}, ${a.color}88)`,
        color: fg,
      }}>
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{a.name}</p>
          <p className="text-xs font-medium opacity-80">
            {credit ? 'Crédito' : 'Débito'} · {a.owner}
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-2xl bg-black/25 px-3 py-2">
          {BankIcon ? (
            <span style={{ color: bank?.iconColor ?? '#ffffff' }}>
              <BankIcon className="size-5" aria-hidden />
            </span>
          ) : (
            <FallbackIcon className="size-5" />
          )}
          {!a.isHidden &&
            (fav ? (
              <Star
                aria-label="Cuenta favorita"
                className="size-5 fill-amber-300 text-amber-300"
              />
            ) : (
              <button
                type="button"
                onClick={onToggleFavorite}
                disabled={favBusy}
                aria-label="Marcar como favorita"
                title="Marcar como favorita"
                className="transition active:scale-90 disabled:opacity-50">
                <Star className="size-5 opacity-70" />
              </button>
            ))}
        </span>
      </div>
      <p className="relative mt-4 font-mono text-base font-semibold tracking-widest">
        {a.lastFour ? `···· ···· ···· ${a.lastFour}` : '···· ···· ···· ····'}
      </p>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium opacity-80">
            {credit ? 'Deuda total' : 'Saldo'}
          </p>
          <p className="text-2xl font-extrabold tracking-tight">
            {formatMoney(credit ? a.balance : available)}
          </p>
          {a.expiry && (
            <p className="text-[10px] opacity-80">Vence {a.expiry}</p>
          )}
        </div>
        <div className="font-semibold opacity-85">
          {credit && a.creditLimit != null && (
            <div className="relative flex flex-col gap-0.5 text-[10px] font-semibold opacity-80">
              <span className="flex items-center gap-1">
                <span
                  className="size-2 shrink-0 rounded-full opacity-90"
                  style={{ backgroundColor: fg }}
                />
                Actual {formatMoney(dueAmt)}
              </span>
              {futureAmt > 0 && (
                <span className="flex items-center gap-1">
                  <span
                    className="size-2 shrink-0 rounded-full opacity-40"
                    style={{ backgroundColor: fg }}
                  />
                  Meses {formatMoney(futureAmt)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <span
                  className={`size-2 shrink-0 rounded-full bg-black/25 ring-1 ${ringCls}`}
                />
                Disponible {formatMoney(available)}
              </span>
            </div>
          )}
        </div>
      </div>
      {credit && a.creditLimit != null && (
        <>
          <div
            className="relative mt-3 flex h-1.5 overflow-hidden rounded-full bg-black/25"
            title={`Actual ${formatMoney(dueAmt)} · Meses ${formatMoney(futureAmt)} · Disponible ${formatMoney(available)}`}>
            {duePct > 0 && (
              <div
                className="h-full opacity-90"
                style={{ width: `${duePct}%`, backgroundColor: fg }}
              />
            )}
            {futurePct > 0 && (
              <div
                className="h-full opacity-40"
                style={{ width: `${futurePct}%`, backgroundColor: fg }}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function RecentRow({
  t,
  accountId,
  cats,
}: {
  t: OfflineTransaction
  accountId: string
  cats: CatalogRow[]
}) {
  const income = t.type === 'INCOME'
  const transfer = t.type === 'TRANSFER'
  const incomingTransfer =
    transfer && t.transferToAccountId === accountId && t.accountId !== accountId
  const cat = lookupCategory(t.category, cats)
  const CatIcon = cat.icon
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${cat.color}22`, color: cat.color }}>
        {transfer ? (
          <ArrowLeftRight className="size-4" />
        ) : (
          <CatIcon className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{t.concept}</p>
        <p className="truncate text-xs text-(--muted-foreground)">
          {fmtDayMonth(t.date)}
          {transfer && (
            <>
              {' · '}
              {incomingTransfer
                ? `Desde ${t.accountName}`
                : `Hacia ${t.transferToAccountName ?? ''}`}
            </>
          )}
          {isPendingId(t.id) && ' · Pendiente'}
        </p>
      </div>
      <span
        className={`shrink-0 text-sm font-extrabold ${income || incomingTransfer ? 'text-emerald-500' : ''}`}>
        {transfer ? '' : income ? '+' : '−'}
        {formatMoney(t.amount)}
      </span>
    </li>
  )
}

/** Detalle de una cuenta (se monta dentro de un BottomSheet). */
export function AccountDetail({
  a,
  cats,
}: {
  a: AccountRow
  cats: CatalogRow[]
}) {
  const router = useRouter()
  const setAccount = useActivityFilters((s) => s.setAccount)
  const setRange = useActivityFilters((s) => s.setRange)
  const [expanded, setExpanded] = useState(false)
  const [fav, setFav] = useState(a.isFavorite)
  const [favBusy, setFavBusy] = useState(false)
  const credit = a.type === 'CREDIT'

  async function toggleFavorite() {
    if (fav || favBusy || a.isHidden) return
    setFavBusy(true)
    const res = await setFavoriteAccount(a.id)
    setFavBusy(false)
    if ('error' in res && res.error) {
      toast.error(res.error)
      return
    }
    // Optimista en el modal; la lista se actualiza con el re-sync.
    setFav(true)
    toast.success(`«${a.name}» ahora es tu favorita`)
    await syncForce()
    router.refresh()
  }

  // Recientes de la cuenta (origen o destino de traspasos), Dexie-first:
  // funciona online y offline sin tocar el servidor.
  const txs = useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    return all
      .filter((t) => t.accountId === a.id || t.transferToAccountId === a.id)
      .sort((x, y) => y.date.localeCompare(x.date))
  }, [a.id])

  const visible = (txs ?? []).slice(0, expanded ? EXPANDED : PREVIEW)
  const remaining = (txs ?? []).length - visible.length

  // MSI aún no exigibles del corte vigente (mismo `future` de Resumen >
  // Estados de cuenta). Dexie-first: se deriva de los movimientos locales
  // sin tocar el servidor; si no hay MSI, queda en 0 y la barra no cambia.
  const futureMsi = useMemo(() => {
    if (!credit) return 0
    if (!txs || txs.length === 0 || a.balance <= 0) return 0
    try {
      const stmtTxs: StatementTx[] = []
      for (const t of txs) {
        if (t.accountId !== a.id && t.transferToAccountId !== a.id) continue
        if (
          t.type !== 'EXPENSE' &&
          t.type !== 'INCOME' &&
          t.type !== 'TRANSFER'
        )
          continue
        stmtTxs.push({
          id: t.id,
          type: t.type as 'EXPENSE' | 'INCOME' | 'TRANSFER',
          amount: t.amount,
          concept: t.concept,
          date: new Date(t.date),
          accountId: t.accountId,
          transferToAccountId: t.transferToAccountId ?? null,
          installments: t.installments,
          statementKey: t.statementKey ?? null,
        })
      }
      if (
        !stmtTxs.some(
          (t) =>
            t.type === 'EXPENSE' &&
            t.accountId === a.id &&
            Math.round(t.installments) > 1,
        )
      )
        return 0
      const { statements, currentKey } = activePeriods(a.id, stmtTxs, {
        statementDay: a.statementDay,
        dueDay: a.dueDay,
      })
      const cur = statements.find((s) => s.key === currentKey)
      if (!cur || cur.future <= 0) return 0
      return Math.min(cur.future, a.balance)
    } catch {
      return 0
    }
  }, [txs, credit, a.id, a.statementDay, a.dueDay, a.balance])

  function seeAll() {
    setAccount(a.name)
    // Rango total: la Actividad mensual ocultaría movimientos viejos.
    setRange('todo')
    router.push('/actividad')
  }

  return (
    <div className="space-y-4 overflow-y-auto px-5 pt-1 pb-8">
      <CardVisual
        a={a}
        fav={fav}
        favBusy={favBusy}
        onToggleFavorite={toggleFavorite}
        future={futureMsi}
      />

      <div className="divide-y divide-(--border) rounded-3xl border border-(--border) bg-(--muted)/40 px-4">
        <Row label="Tipo" value={credit ? 'Crédito' : 'Débito'} />
        <Row label="Titular" value={a.owner} />
        {credit && a.creditLimit != null && (
          <Row label="Límite" value={formatMoney(a.creditLimit)} />
        )}
        {credit && a.statementDay != null && (
          <Row label="Día de corte" value={a.statementDay} />
        )}
        {credit && a.dueDay != null && (
          <Row label="Día de pago" value={a.dueDay} />
        )}
        {a.expiry && <Row label="Vencimiento" value={a.expiry} />}
        {a.lastFour && <Row label="Terminación" value={`·· ${a.lastFour}`} />}
        {a.isHidden && <Row label="Estado" value="Oculta" />}
      </div>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-(--muted-foreground)">
            Movimientos recientes
            {txs != null && txs.length > 0 && ` · ${txs.length}`}
          </p>
          <button
            type="button"
            onClick={seeAll}
            className="flex items-center gap-0.5 text-xs font-bold text-(--primary)">
            Ver en Actividad <ArrowUpRight className="size-3.5" />
          </button>
        </div>
        {txs == null ? (
          <p className="rounded-3xl border border-(--border) p-6 text-center text-sm text-(--muted-foreground)">
            Cargando movimientos…
          </p>
        ) : txs.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-(--border) p-6 text-center text-sm text-(--muted-foreground)">
            Sin movimientos en esta cuenta.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-(--border) rounded-3xl border border-(--border) bg-(--card) px-4">
              {visible.map((t) => (
                <RecentRow key={t.id} t={t} accountId={a.id} cats={cats} />
              ))}
            </ul>
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-2 w-full rounded-2xl border border-(--border) bg-(--card) py-2.5 text-xs font-bold text-(--muted-foreground) transition active:scale-[0.99]">
                Ver más ({remaining})
              </button>
            )}
          </>
        )}
      </section>
    </div>
  )
}

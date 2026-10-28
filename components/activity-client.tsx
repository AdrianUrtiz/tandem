'use client'

import { useMemo, useState } from 'react'

import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { AccountIcon } from '@/components/account-icon'
import { ActivityChart } from '@/components/activity-chart'
import { BottomSheet } from '@/components/bottom-sheet'
import { CardPayReminders } from '@/components/card-pay-reminders'
import {
  type ExpiryAccount,
  ExpiryReminders,
} from '@/components/expiry-reminders'
import { PartnerPayReminders } from '@/components/partner-pay-reminders'
import { TransactionDetail } from '@/components/transaction-detail'
import type { AccountOpt } from '@/components/transaction-form'
import { TransactionRow, type TxRow } from '@/components/transaction-list'
import { TransactionSwipeRow } from '@/components/transaction-swipe-row'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { byAccountOrder } from '@/lib/accounts'
import {
  type ActivityKind,
  type ActivityRange,
  useActivityFilters,
} from '@/lib/activity-filters'
import type { CardPayCandidate } from '@/lib/card-pay'
import type { CatalogRow } from '@/lib/catalog'
import { lookupCategory } from '@/lib/categories'
import { useCuentasFilters } from '@/lib/cuentas-filters'
import { db } from '@/lib/offline/db'
import type { PartnerPayItem } from '@/lib/partner-pay'
import { extractPlaceSuffix } from '@/lib/place-format'
import { useStatementFilters } from '@/lib/resumen-filters'
import { formatMoney } from '@/lib/utils'
import {
  WD_ES,
  addWallDays,
  addWallMonths,
  daysInWallMonth,
  endOfWallDay,
  fmtDayMonth,
  fmtMonthShort,
  fmtMonthYear,
  mexicoMonthKey,
  monthKeyOfWall,
  rangeStartWall,
  utc,
  wallNow,
} from '@/lib/walltime'

export type MonthOpt = { key: string; label: string; total: number }

type Sheet =
  | null
  | 'kind'
  | 'range'
  | 'month'
  | 'week'
  | 'year'
  | 'six'
  | 'account'
  | 'category'
  | 'place'

const RANGES: { value: ActivityRange; label: string }[] = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'seis', label: 'Últimos 6 meses' },
  { value: 'anio', label: 'Todo el año' },
  { value: 'todo', label: 'Todo el tiempo' },
]

const KINDS: { value: ActivityKind; label: string }[] = [
  { value: 'todos', label: 'Toda la actividad' },
  { value: 'gastos', label: 'Gastos' },
  { value: 'ingresos', label: 'Ingresos' },
]

const RANGE_DESC: Record<ActivityRange, string> = {
  mensual: '',
  semanal: 'Por día · últimos 7 días',
  trimestral: `Por trimestre · ${new Date().getFullYear()}`,
  seis: 'Por mes · últimos 6 meses',
  anio: `Por mes · ${new Date().getFullYear()}`,
  todo: 'Acumulado por año',
}

function keyOf(iso: string) {
  // Hora-muro (ver lib/walltime.ts): el ISO de la BD ya viene etiquetado
  // UTC = día real en México.
  return monthKeyOfWall(new Date(iso))
}

function dayKey(d: Date) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
}

function shortMonth(d: Date) {
  const s = fmtMonthShort(d)
  return d.getUTCFullYear() === Number(mexicoMonthKey().slice(0, 4))
    ? s
    : `${s} ${String(d.getUTCFullYear()).slice(2)}`
}

/** Inicio del rango (el fin siempre es hoy). Null = mes seleccionado. */
function rangeStart(range: ActivityRange): Date | null {
  return rangeStartWall(range, wallNow())
}

export function ActivityClient({
  txs,
  months,
  cats,
  expiryAccounts = [],
  filterAccounts = [],
  partnerDebtItems = [],
  partnerSums = [],
  cardPayItems = [],
}: {
  txs: TxRow[]
  months: MonthOpt[]
  cats: CatalogRow[]
  expiryAccounts?: ExpiryAccount[]
  /** Cuentas propias no ocultas para el filtro (débito y crédito). */
  filterAccounts?: AccountOpt[]
  /** Lo que le debo a mi pareja (origen Cuentas > Pareja). */
  partnerDebtItems?: PartnerPayItem[]
  partnerSums?: { key: string; confirmed: number; pending: number }[]
  /** Cierre de MIS tarjetas (propietario): pago para no generar intereses. */
  cardPayItems?: CardPayCandidate[]
}) {
  const router = useRouter()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [selected, setSelected] = useState<TxRow | null>(null)
  const storedMonth = useActivityFilters((s) => s.month)
  const kind = useActivityFilters((s) => s.kind)
  const range = useActivityFilters((s) => s.range)
  const account = useActivityFilters((s) => s.account)
  const category = useActivityFilters((s) => s.category)
  const place = useActivityFilters((s) => s.place)
  const setMonth = useActivityFilters((s) => s.setMonth)
  const setKind = useActivityFilters((s) => s.setKind)
  const setRange = useActivityFilters((s) => s.setRange)
  const setAccount = useActivityFilters((s) => s.setAccount)
  const setCategory = useActivityFilters((s) => s.setCategory)
  const setPlace = useActivityFilters((s) => s.setPlace)
  const setPartnerMonth = useCuentasFilters((s) => s.setPartnerMonth)
  const setCuentasTab = useCuentasFilters((s) => s.setTab)
  const setStmtCard = useStatementFilters((s) => s.setCardId)
  const setStmtPeriod = useStatementFilters((s) => s.setPeriod)
  const [q, setQ] = useState('')
  const [bucketSel, setBucketSel] = useState<number | null>(null)
  // Desplazamiento del periodo visible (0 = actual). Se resetea al cambiar
  // de rango. Mensual usa `month`; el resto usa estos offsets.
  const [weekShift, setWeekShift] = useState(0)
  const [yearShift, setYearShift] = useState(0)
  const [sixShift, setSixShift] = useState(0)

  // Sumas CONFIRMED/PENDING por línea para suprimir avisos ya pagados.
  const partnerPaySumsMap = useMemo(
    () =>
      new Map(
        partnerSums.map((s) => [
          s.key,
          { confirmed: s.confirmed, pending: s.pending },
        ]),
      ),
    [partnerSums],
  )

  // El mes persistido puede no existir (p. ej. datos nuevos): se usa el más
  // reciente sin sobrescribir el store hasta que el usuario elija otro.
  const month =
    months.some((m) => m.key === storedMonth) && storedMonth
      ? storedMonth
      : (months[0]?.key ?? storedMonth)

  const monthLabel =
    months.find((m) => m.key === month)?.label ??
    (() => {
      const [y, m] = month.split('-').map(Number)
      if (!y || !m) return month
      return fmtMonthYear(new Date(Date.UTC(y, m - 1, 1)))
    })()
  const start = rangeStart(range)

  // 1) Rango temporal (el fin es hoy completo: los movimientos de hoy
  // con hora posterior a este momento también cuentan). Con swipe el fin
  // se desplaza: semanas ±7 días, seis ±1 mes, trimestral/anio ±1 año.
  const rangeTxs = useMemo(() => {
    if (range === 'mensual') return txs.filter((t) => keyOf(t.date) === month)
    const now = wallNow()
    if (range === 'semanal') {
      const shiftedEnd = endOfWallDay(addWallDays(now, weekShift * 7))
      const shiftedStart = addWallDays(start!, weekShift * 7)
      return txs.filter((t) => {
        const d = new Date(t.date)
        return d >= shiftedStart && d <= shiftedEnd
      })
    }
    if (range === 'seis') {
      const { y: ey, m0: em0 } = addWallMonths(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        sixShift,
      )
      const { y: sy, m0: sm0 } = addWallMonths(ey, em0, -5)
      const s = utc(sy, sm0, 1)
      const e =
        sixShift === 0
          ? endOfWallDay(now)
          : endOfWallDay(utc(ey, em0, daysInWallMonth(ey, em0)))
      return txs.filter((t) => {
        const d = new Date(t.date)
        return d >= s && d <= e
      })
    }
    if (range === 'trimestral' || range === 'anio') {
      const targetY = now.getUTCFullYear() + yearShift
      if (yearShift === 0) {
        const end = endOfWallDay(now)
        return txs.filter((t) => {
          const d = new Date(t.date)
          return d.getUTCFullYear() === targetY && d >= start! && d <= end
        })
      }
      const s = utc(targetY, 0, 1)
      const e = endOfWallDay(utc(targetY, 11, 31))
      return txs.filter((t) => {
        const d = new Date(t.date)
        return d >= s && d <= e
      })
    }
    const end = endOfWallDay(now)
    return txs.filter((t) => {
      const d = new Date(t.date)
      return d >= start! && d <= end
    })
  }, [txs, range, month, start, weekShift, yearShift, sixShift])

  // Suma según el tipo activo (para totales de cuentas/categorías).
  const inKind = (t: TxRow) =>
    kind === 'ingresos' ? t.type === 'INCOME' : t.type === 'EXPENSE'

  // 2) Filtros restantes (un traspaso matchea por origen o destino)
  const filtered = useMemo(() => {
    return rangeTxs.filter((t) => {
      if (kind !== 'todos' && !inKind(t)) return false
      if (
        account !== 'todas' &&
        t.accountName !== account &&
        t.transferToAccountName !== account
      )
        return false
      if (category !== 'todas' && t.category !== category) return false
      if (
        place !== 'todos' &&
        extractPlaceSuffix(t.concept)?.toLowerCase() !== place.toLowerCase()
      )
        return false
      if (
        q &&
        !`${t.concept} ${t.category}`.toLowerCase().includes(q.toLowerCase())
      )
        return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeTxs, kind, account, category, place, q])

  const shownTotal = useMemo(
    () => filtered.filter(inKind).reduce((a, t) => a + t.amount, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, kind],
  )

  // 2b) Filtro por bucket seleccionado en la gráfica. El total grande se
  // conserva (usa `filtered`); solo la lista se acota a la fecha exacta.
  const visible = useMemo(() => {
    if (bucketSel == null) return filtered
    if (range === 'mensual') {
      const [y, m] = month.split('-').map(Number)
      const dim = daysInWallMonth(y, m - 1)
      if (bucketSel < 0 || bucketSel >= dim) return filtered
      const day = bucketSel + 1
      return filtered.filter((t) => {
        const d = new Date(t.date)
        return (
          d.getUTCFullYear() === y &&
          d.getUTCMonth() + 1 === m &&
          d.getUTCDate() === day
        )
      })
    }
    if (range === 'semanal') {
      if (start == null) return filtered
      const keys: string[] = []
      const cur = addWallDays(start, weekShift * 7)
      const today = addWallDays(wallNow(), weekShift * 7)
      while (cur <= today) {
        keys.push(dayKey(cur))
        cur.setUTCDate(cur.getUTCDate() + 1)
      }
      const key = keys[bucketSel]
      if (!key) return filtered
      return filtered.filter((t) => dayKey(new Date(t.date)) === key)
    }
    if (range === 'trimestral') {
      const y = wallNow().getUTCFullYear() + yearShift
      return filtered.filter((t) => {
        const d = new Date(t.date)
        return (
          d.getUTCFullYear() === y &&
          Math.floor(d.getUTCMonth() / 3) === bucketSel
        )
      })
    }
    if (range === 'seis') {
      const now = wallNow()
      const { y: ey, m0: em0 } = addWallMonths(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        sixShift,
      )
      const ym: { y: number; m: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const p = addWallMonths(ey, em0, -i)
        ym.push({ y: p.y, m: p.m0 })
      }
      const sel = ym[bucketSel]
      if (!sel) return filtered
      return filtered.filter((t) => {
        const d = new Date(t.date)
        return d.getUTCFullYear() === sel.y && d.getUTCMonth() === sel.m
      })
    }
    if (range === 'anio') {
      const y = wallNow().getUTCFullYear() + yearShift
      return filtered.filter((t) => {
        const d = new Date(t.date)
        return d.getUTCFullYear() === y && d.getUTCMonth() === bucketSel
      })
    }
    // todo: acumulado por año (mismo minY que los buckets)
    const years = new Set<number>()
    for (const t of rangeTxs) {
      if (t.type !== 'EXPENSE') continue
      years.add(new Date(t.date).getUTCFullYear())
    }
    const sorted = [...years].sort((a, b) => a - b)
    const nowY = wallNow().getUTCFullYear()
    const minY = sorted.length ? sorted[0] : nowY
    const target = minY + bucketSel
    return filtered.filter((t) => new Date(t.date).getUTCFullYear() === target)
  }, [
    filtered,
    bucketSel,
    range,
    month,
    start,
    rangeTxs,
    weekShift,
    yearShift,
    sixShift,
  ])

  // 3) Buckets del gráfico según la granularidad del periodo:
  //    mensual → días · semanal → 7 días · trimestral → T1-T4 del año ·
  //    seis → 6 meses · anio → 12 meses · todo → por año.
  // Todo en hora-muro (getters UTC): los ISO de la BD ya vienen etiquetados.
  const { buckets, todayIndex } = useMemo(() => {
    const onlyExpenses = rangeTxs.filter((t) => t.type === 'EXPENSE')
    const now = wallNow()

    if (range === 'mensual') {
      const [y, m] = month.split('-').map(Number)
      const dim = daysInWallMonth(y, m - 1)
      const arr = Array.from({ length: dim }, (_, i) => ({
        label: `${i + 1}`,
        total: 0,
      }))
      for (const t of onlyExpenses) {
        const d = new Date(t.date).getUTCDate()
        if (d >= 1 && d <= dim) arr[d - 1].total += t.amount
      }
      const isCur = monthKeyOfWall(now) === month
      return {
        buckets: arr,
        todayIndex: isCur ? now.getUTCDate() - 1 : null,
      }
    }

    if (range === 'semanal') {
      const days: { label: string; total: number }[] = []
      const idxByDay = new Map<string, number>()
      const cur = addWallDays(start!, weekShift * 7)
      const today = addWallDays(now, weekShift * 7)
      while (cur <= today) {
        idxByDay.set(dayKey(cur), days.length)
        days.push({
          label: `${WD_ES[cur.getUTCDay()]} ${cur.getUTCDate()}`,
          total: 0,
        })
        cur.setUTCDate(cur.getUTCDate() + 1)
      }
      for (const t of onlyExpenses) {
        const i = idxByDay.get(dayKey(new Date(t.date)))
        if (i !== undefined) days[i].total += t.amount
      }
      return {
        buckets: days,
        todayIndex: weekShift === 0 ? days.length - 1 : null,
      }
    }

    if (range === 'trimestral') {
      const y = now.getUTCFullYear() + yearShift
      const arr = ['T1', 'T2', 'T3', 'T4'].map((label) => ({
        label,
        total: 0,
      }))
      for (const t of onlyExpenses) {
        const d = new Date(t.date)
        if (d.getUTCFullYear() !== y) continue
        if (yearShift === 0 && d > now) continue
        arr[Math.floor(d.getUTCMonth() / 3)].total += t.amount
      }
      return {
        buckets: arr,
        todayIndex: yearShift === 0 ? Math.floor(now.getUTCMonth() / 3) : null,
      }
    }

    if (range === 'seis') {
      const { y: ey, m0: em0 } = addWallMonths(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        sixShift,
      )
      const arr: { label: string; total: number; y: number; m: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const p = addWallMonths(ey, em0, -i)
        const d = new Date(Date.UTC(p.y, p.m0, 1))
        arr.push({ label: shortMonth(d), total: 0, y: p.y, m: p.m0 })
      }
      for (const t of onlyExpenses) {
        const d = new Date(t.date)
        const b = arr.find(
          (b) => b.y === d.getUTCFullYear() && b.m === d.getUTCMonth(),
        )
        if (b) b.total += t.amount
      }
      return {
        buckets: arr,
        todayIndex: sixShift === 0 ? arr.length - 1 : null,
      }
    }

    if (range === 'anio') {
      const y = now.getUTCFullYear() + yearShift
      const arr = Array.from({ length: 12 }, (_, m) => ({
        label: shortMonth(new Date(Date.UTC(y, m, 1))),
        total: 0,
      }))
      for (const t of onlyExpenses) {
        const d = new Date(t.date)
        if (d.getUTCFullYear() !== y) continue
        if (yearShift === 0 && d > now) continue
        arr[d.getUTCMonth()].total += t.amount
      }
      return {
        buckets: arr,
        todayIndex: yearShift === 0 ? now.getUTCMonth() : null,
      }
    }

    // todo: acumulado por año
    const years = new Map<number, number>()
    for (const t of onlyExpenses) {
      const y = new Date(t.date).getUTCFullYear()
      years.set(y, (years.get(y) ?? 0) + t.amount)
    }
    const keys = [...years.keys()].sort((a, b) => a - b)
    const minY = keys.length ? keys[0] : now.getUTCFullYear()
    const arr: { label: string; total: number }[] = []
    for (let y = minY; y <= now.getUTCFullYear(); y++)
      arr.push({ label: `${y}`, total: years.get(y) ?? 0 })
    return { buckets: arr, todayIndex: arr.length - 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeTxs, range, month, weekShift, yearShift, sixShift])

  // Opciones de cuenta para el diálogo de edición (solo las mías, ya filtradas;
  // las filas de pareja son solo lectura y no aportan cuentas).
  const accountOptionsAll = useMemo(() => {
    const metaById = new Map(filterAccounts.map((a) => [a.id, a]))
    const map = new Map<string, { name: string; type: string }>()
    for (const t of txs)
      if (!t.partnerShare)
        map.set(t.accountId, { name: t.accountName, type: t.accountType })
    return [...map.entries()]
      .map(([id, v]) => {
        const meta = metaById.get(id)
        return {
          id,
          name: v.name,
          type: v.type,
          color: meta?.color,
          isFavorite: meta?.isFavorite,
          position: meta?.position,
        }
      })
      .sort(byAccountOrder)
  }, [txs, filterAccounts])

  // Opciones: todas las cuentas propias no ocultas (débito y crédito),
  // en orden global (favorita primero, luego manual). Un traspaso involucra
  // dos cuentas: aparece al filtrar por cualquiera de las dos (sin duplicarse).
  const accountOpts = useMemo(() => {
    return [...filterAccounts].sort(byAccountOrder)
  }, [filterAccounts])

  const categoryOpts = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of rangeTxs) {
      if (!inKind(t)) continue
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeTxs, kind])

  // Lugares del periodo (del sufijo "desc - lugar" de cada concepto):
  // conteo calculado sobre movimientos, del tipo activo.
  const placeOpts = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const t of rangeTxs) {
      if (!inKind(t)) continue
      const suffix = extractPlaceSuffix(t.concept)
      if (!suffix) continue
      const key = suffix.toLowerCase()
      const row = map.get(key)
      if (row) row.count += 1
      else map.set(key, { label: suffix, count: 1 })
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeTxs, kind])

  // Opciones del selector de periodo (como el de mes): últimas 12 semanas
  // con su total de gastos, últimos 12 meses como ancla de la ventana de
  // 6 meses, y años con registro para trimestral/anual.
  const weekOptions = useMemo(() => {
    const now = wallNow()
    const baseStart = rangeStartWall('semanal', now)!
    const out: { value: string; label: string; total: number }[] = []
    for (let i = 0; i >= -11; i--) {
      const s = addWallDays(baseStart, i * 7)
      const e = endOfWallDay(addWallDays(now, i * 7))
      let total = 0
      for (const t of txs) {
        if (t.type !== 'EXPENSE') continue
        const d = new Date(t.date)
        if (d >= s && d <= e) total += t.amount
      }
      const label =
        i === 0
          ? `Esta semana · ${fmtDayMonth(s)} – ${fmtDayMonth(e)}`
          : `${fmtDayMonth(s)} – ${fmtDayMonth(e)}`
      out.push({ value: String(i), label, total })
    }
    return out
  }, [txs])

  const yearOptions = useMemo(() => {
    const nowY = wallNow().getUTCFullYear()
    const totals = new Map<number, number>()
    for (const t of txs) {
      if (t.type !== 'EXPENSE') continue
      const y = new Date(t.date).getUTCFullYear()
      totals.set(y, (totals.get(y) ?? 0) + t.amount)
    }
    if (!totals.has(nowY)) totals.set(nowY, 0)
    return [...totals.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, total]) => ({ value: String(y), label: `${y}`, total }))
  }, [txs])

  const sixOptions = useMemo(() => {
    const now = wallNow()
    const nowY = now.getUTCFullYear()
    const nowM = now.getUTCMonth()
    const out: { value: string; label: string; meta: string; total: number }[] =
      []
    for (let k = 0; k >= -11; k--) {
      const end = addWallMonths(nowY, nowM, k)
      const startM = addWallMonths(end.y, end.m0, -5)
      const key = `${end.y}-${String(end.m0 + 1).padStart(2, '0')}`
      const s = utc(startM.y, startM.m0, 1)
      const e =
        k === 0
          ? endOfWallDay(now)
          : endOfWallDay(utc(end.y, end.m0, daysInWallMonth(end.y, end.m0)))
      let total = 0
      for (const t of txs) {
        if (t.type !== 'EXPENSE') continue
        const d = new Date(t.date)
        if (d >= s && d <= e) total += t.amount
      }
      out.push({
        value: key,
        label: fmtMonthYear(new Date(Date.UTC(end.y, end.m0, 1))),
        meta: `${fmtMonthShort(new Date(Date.UTC(startM.y, startM.m0, 1)))} – ${fmtMonthShort(new Date(Date.UTC(end.y, end.m0, 1)))}`,
        total,
      })
    }
    return out
  }, [txs])

  // Etiquetas de la pill de periodo (siempre visibles, como en mensual).
  const weekLabel = useMemo(() => {
    const now = wallNow()
    const baseStart = rangeStartWall('semanal', now)!
    const s = addWallDays(baseStart, weekShift * 7)
    const e = addWallDays(now, weekShift * 7)
    const rangeLabel = `${fmtDayMonth(s)} – ${fmtDayMonth(e)}`
    return weekShift === 0 ? `Esta semana · ${rangeLabel}` : rangeLabel
  }, [weekShift])

  const sixLabel = useMemo(() => {
    const now = wallNow()
    const end = addWallMonths(now.getUTCFullYear(), now.getUTCMonth(), sixShift)
    const startM = addWallMonths(end.y, end.m0, -5)
    return `${fmtMonthShort(new Date(Date.UTC(startM.y, startM.m0, 1)))} – ${fmtMonthShort(new Date(Date.UTC(end.y, end.m0, 1)))} ${end.y}`
  }, [sixShift])

  const yearLabel = useMemo(() => {
    return `${wallNow().getUTCFullYear() + yearShift}`
  }, [yearShift])

  const kindLabel = KINDS.find((k) => k.value === kind)!.label
  const rangeLabel = RANGES.find((r) => r.value === range)!.label

  // Lugares conocidos (para partir "desc - lugar" en el detalle).
  const knownPlaces = useLiveQuery(
    () => db.places.orderBy('lastUsedAt').reverse().toArray(),
    [],
  )

  function resetShifts() {
    setWeekShift(0)
    setYearShift(0)
    setSixShift(0)
  }

  // Swipe horizontal sobre la gráfica: dir 1 = siguiente (más reciente),
  // dir -1 = anterior. Se acota para no ir al futuro.
  function handleSwipe(dir: 1 | -1) {
    setBucketSel(null)
    if (range === 'mensual') {
      const [y, m] = month.split('-').map(Number)
      const p = addWallMonths(y, m - 1, dir)
      const key = `${p.y}-${String(p.m0 + 1).padStart(2, '0')}`
      if (key > mexicoMonthKey()) return
      setMonth(key)
      return
    }
    if (range === 'semanal') {
      setWeekShift((s) => Math.min(0, s + dir))
      return
    }
    if (range === 'trimestral' || range === 'anio') {
      setYearShift((s) => Math.min(0, s + dir))
      return
    }
    if (range === 'seis') {
      setSixShift((s) => Math.min(0, s + dir))
    }
  }

  const isShifted =
    (range === 'semanal' && weekShift !== 0) ||
    (range === 'seis' && sixShift !== 0) ||
    ((range === 'trimestral' || range === 'anio') && yearShift !== 0)

  function close() {
    setSheet(null)
  }

  return (
    <div className="space-y-4 px-5 pt-4">
      <ExpiryReminders accounts={expiryAccounts} />
      <PartnerPayReminders
        debtItems={partnerDebtItems}
        sums={partnerPaySumsMap}
        onPay={(it) => {
          setPartnerMonth(it.dueKey)
          setCuentasTab('pareja')
          router.push('/cuentas')
        }}
      />
      <CardPayReminders
        items={cardPayItems ?? []}
        onPay={(it) => {
          setStmtCard(it.cardId)
          setStmtPeriod(it.cardId, it.periodKey)
          router.push('/resumen')
        }}
      />
      {range === 'mensual' ? (
        <div className="flex items-center justify-center">
          <button
            onClick={() => setSheet('month')}
            className="rounded-full bg-(--muted) px-4 py-1.5 text-xs font-semibold capitalize">
            {monthLabel} ▾
          </button>
        </div>
      ) : range === 'todo' ? (
        <p className="text-center text-xs font-semibold text-(--muted-foreground)">
          {RANGE_DESC[range]}
        </p>
      ) : (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() =>
              setSheet(
                range === 'semanal'
                  ? 'week'
                  : range === 'seis'
                    ? 'six'
                    : 'year',
              )
            }
            className="rounded-full bg-(--muted) px-4 py-1.5 text-xs font-semibold capitalize">
            {range === 'semanal'
              ? `${weekLabel} ▾`
              : range === 'seis'
                ? `${sixLabel} ▾`
                : `${yearLabel} ▾`}
          </button>
          {isShifted && (
            <button
              onClick={() => {
                resetShifts()
                setBucketSel(null)
              }}
              className="rounded-full bg-(--muted) px-3 py-1 text-xs font-semibold">
              Hoy
            </button>
          )}
        </div>
      )}
      <p className="text-center text-5xl font-extrabold tracking-tight">
        {formatMoney(shownTotal)}
      </p>

      <ActivityChart
        buckets={buckets}
        todayIndex={todayIndex}
        selected={
          bucketSel != null && bucketSel < buckets.length ? bucketSel : null
        }
        onSelect={setBucketSel}
        onSwipe={handleSwipe}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-full border border-(--border) bg-(--card) px-4 py-2.5">
          <Search className="size-4 text-(--muted-foreground)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar"
            className="w-full bg-transparent text-sm outline-none placeholder:text-(--muted-foreground)"
          />
        </div>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          <FilterPill
            label={kindLabel}
            active={kind !== 'todos'}
            onClick={() => setSheet('kind')}
          />
          <FilterPill
            label={rangeLabel}
            active={range !== 'mensual'}
            onClick={() => setSheet('range')}
          />
          <FilterPill
            label={account === 'todas' ? 'Todas las cuentas' : account}
            active={account !== 'todas'}
            onClick={() => setSheet('account')}
          />
          <FilterPill
            label={
              category === 'todas'
                ? 'Todas las categorías'
                : lookupCategory(category, cats).label
            }
            active={category !== 'todas'}
            onClick={() => setSheet('category')}
          />
          <FilterPill
            label={place === 'todos' ? 'Todos los lugares' : place}
            active={place !== 'todos'}
            onClick={() => setSheet('place')}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-(--border) p-8 text-center text-sm text-(--muted-foreground)">
          {bucketSel != null
            ? 'Sin movimientos en esta fecha.'
            : 'Sin movimientos en este periodo.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) =>
            t.locked ? (
              <TransactionRow
                key={t.id}
                t={t}
                cats={cats}
                onSelect={() => setSelected(t)}
              />
            ) : (
              <TransactionSwipeRow
                key={t.id}
                t={t}
                accountOptions={accountOptionsAll}
                cats={cats}
                open={openRow === t.id}
                onOpenChange={(o) => setOpenRow(o ? t.id : null)}
                onSelect={() => setSelected(t)}
              />
            ),
          )}
        </ul>
      )}

      <BottomSheet
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <TransactionDetail
            t={selected}
            cats={cats}
            places={knownPlaces ?? []}
          />
        )}
      </BottomSheet>

      <Dialog open={sheet !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {sheet === 'kind' && 'Tipo de movimiento'}
              {sheet === 'range' && 'Periodo'}
              {sheet === 'month' && 'Seleccionar mes'}
              {sheet === 'week' && 'Seleccionar semana'}
              {sheet === 'year' && 'Seleccionar año'}
              {sheet === 'six' && 'Ventana de 6 meses'}
              {sheet === 'account' && 'Filtrar por cuenta'}
              {sheet === 'category' && 'Filtrar por categoría'}
              {sheet === 'place' && 'Filtrar por lugar'}
            </DialogTitle>
          </DialogHeader>

          {sheet === 'kind' && (
            <Options
              items={KINDS.map((k) => ({ value: k.value, label: k.label }))}
              value={kind}
              onPick={(v) => {
                setKind(v as ActivityKind)
                close()
              }}
            />
          )}
          {sheet === 'range' && (
            <Options
              items={RANGES.map((r) => ({ value: r.value, label: r.label }))}
              value={range}
              onPick={(v) => {
                setRange(v as ActivityRange)
                setBucketSel(null)
                resetShifts()
                close()
              }}
            />
          )}
          {sheet === 'month' && (
            <Options
              items={months.map((m) => ({
                value: m.key,
                label: m.label,
                cap: true,
              }))}
              value={month}
              onPick={(v) => {
                setMonth(v)
                setBucketSel(null)
                close()
              }}
            />
          )}
          {sheet === 'week' && (
            <Options
              items={weekOptions.map((w) => ({
                value: w.value,
                label: w.label,
                total: w.total,
              }))}
              value={String(weekShift)}
              onPick={(v) => {
                setWeekShift(Math.min(0, Number(v)))
                setBucketSel(null)
                close()
              }}
            />
          )}
          {sheet === 'year' && (
            <Options
              items={yearOptions.map((y) => ({
                value: y.value,
                label: y.label,
                total: y.total,
              }))}
              value={String(wallNow().getUTCFullYear() + yearShift)}
              onPick={(v) => {
                const nowY = wallNow().getUTCFullYear()
                setYearShift(Math.min(0, Number(v) - nowY))
                setBucketSel(null)
                close()
              }}
            />
          )}
          {sheet === 'six' && (
            <Options
              items={sixOptions.map((o) => ({
                value: o.value,
                label: o.label,
                total: o.total,
                meta: o.meta,
                cap: true,
              }))}
              value={(() => {
                const now = wallNow()
                const end = addWallMonths(
                  now.getUTCFullYear(),
                  now.getUTCMonth(),
                  sixShift,
                )
                return `${end.y}-${String(end.m0 + 1).padStart(2, '0')}`
              })()}
              onPick={(v) => {
                const [y, m] = v.split('-').map(Number)
                const now = wallNow()
                const shift =
                  (y - now.getUTCFullYear()) * 12 + (m - 1 - now.getUTCMonth())
                setSixShift(Math.min(0, shift))
                setBucketSel(null)
                close()
              }}
            />
          )}
          {sheet === 'account' && (
            <Options
              items={[
                { value: 'todas', label: 'Todas las cuentas' },
                ...accountOpts.map((a) => ({
                  value: a.name,
                  label: a.name,
                  iconType: a.type,
                  iconColor: a.color,
                })),
              ]}
              value={account}
              onPick={(v) => {
                setAccount(v)
                close()
              }}
            />
          )}
          {sheet === 'category' && (
            <Options
              items={[
                { value: 'todas', label: 'Todas las categorías' },
                ...categoryOpts.map(([cat, total]) => ({
                  value: cat,
                  label: lookupCategory(cat, cats).label,
                  total,
                })),
              ]}
              value={category}
              onPick={(v) => {
                setCategory(v)
                close()
              }}
            />
          )}
          {sheet === 'place' && (
            <Options
              items={[
                { value: 'todos', label: 'Todos los lugares' },
                ...placeOpts.map((p) => ({
                  value: p.label,
                  label: p.label,
                  meta: `${p.count} ${p.count === 1 ? 'compra' : 'compras'}`,
                })),
              ]}
              value={place}
              onPick={(v) => {
                setPlace(v)
                close()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`max-w-55 shrink-0 truncate rounded-full border px-4 py-2 text-xs font-semibold transition ${
        active
          ? 'border-transparent bg-(--foreground) text-(--background)'
          : 'border-(--border) bg-(--card) text-(--muted-foreground)'
      }`}>
      {label}
    </button>
  )
}

function Options({
  items,
  value,
  onPick,
}: {
  items: {
    value: string
    label: string
    total?: number
    meta?: string
    cap?: boolean
    iconType?: string
    iconColor?: string
  }[]
  value: string
  onPick: (v: string) => void
}) {
  return (
    <ul className="max-h-[50dvh] space-y-1 overflow-y-auto">
      {items.map((it) => (
        <li key={it.value}>
          <button
            onClick={() => onPick(it.value)}
            className={`flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left transition hover:bg-(--muted) ${
              it.value === value ? 'bg-(--muted)' : ''
            }`}>
            {it.iconColor && (
              <AccountIcon type={it.iconType} color={it.iconColor} />
            )}
            <span
              className={`flex-1 text-sm font-semibold ${it.cap ? 'capitalize' : ''}`}>
              {it.label}
            </span>
            {it.total !== undefined && (
              <span className="text-sm font-bold">{formatMoney(it.total)}</span>
            )}
            {it.meta !== undefined && (
              <span className="text-xs text-(--muted-foreground)">
                {it.meta}
              </span>
            )}
            {it.value === value && (
              <Check className="size-4 text-(--primary)" />
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

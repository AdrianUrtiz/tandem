'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  LayoutGrid,
  MapPin,
  NotebookPen,
  Plus,
  User,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import { AccountIcon } from '@/components/account-icon'
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

import { createTransaction, updateTransaction } from '@/lib/actions'
import type { CatalogRow } from '@/lib/catalog'
import { useLiveQuery } from 'dexie-react-hooks'
import type { CompanionRow } from '@/lib/companions'
import {
  CATEGORY_COLORS,
  ICONS,
  ICON_PRESETS,
  lookupCategory,
  prettyCat,
} from '@/lib/categories'
import { createCategory } from '@/lib/category-actions'
import { fromCents, normalizeMoney, toCents, toFixedCents } from '@/lib/money'
import {
  type EnqueueInput,
  enqueueOfflineCreate,
  resolvePartner,
  validateOfflineCreate,
} from '@/lib/offline/outbox'
import { isPendingId } from '@/lib/offline/pending'
import { db } from '@/lib/offline/db'
import {
  joinConcept,
  PLACE_MAX_LEN,
  splitConcept,
  type PlaceRow,
} from '@/lib/place-format'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { syncForce } from '@/lib/offline/useSnapshotSync'
import { cn, formatMoney } from '@/lib/utils'
import {
  addWallDays,
  fmtDayMonth,
  todayMexicoYMD,
  utc,
  wallNow,
  ymdOfWall,
} from '@/lib/walltime'

export type AccountOpt = {
  id: string
  name: string
  type?: string
  color?: string
  isFavorite?: boolean
  position?: number
}

export type TxEditData = {
  id: string
  amount: number
  concept: string
  category: string
  date: string // ISO
  accountId: string
  transferToAccountId?: string | null
  type: string
  installments: number
  isShared: boolean
  /** Reparto actual del compartido (para prefill al editar). */
  sharePct?: number
  shareMonthly?: number
  shareFixed?: boolean
  shareExternalName?: string | null
  /** Gasto en grupo (v1): N partes explícitas. Monto total por integrante. */
  shares?: { debtorId?: string | null; externalName?: string | null; amount: number }[]
  /** Nombres de todos los integrantes (pareja + externos). */
  shareNames?: string[]
  /** Gasto de grupo: su reparto no se edita desde aquí. */
  isGroup?: boolean
}

type Mode = 'cargo' | 'abono' | 'pago'
const MODE_TYPE: Record<Mode, string> = {
  cargo: 'EXPENSE',
  abono: 'INCOME',
  pago: 'TRANSFER',
}
const MSI_OPTS = [1, 3, 6, 9, 12, 15, 24]
const msiLabel = (m: number) => (m === 1 ? 'Contado' : `${m} MSI`)

type Panel =
  null | 'cats' | 'account' | 'dest' | 'date' | 'addcat' | 'msi' | 'share' | 'desc'

/** "hoy" o "12 oct" para la fila de sugerencia de amigo. */
function lastCompanionUse(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
    return 'hoy'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function shortDate(ymd: string) {  // Hora-muro (ver lib/walltime.ts): el día se interpreta en UTC para que
  // no se desfase según el runtime.
  const [y, m, d] = ymd.split('-').map(Number)
  return fmtDayMonth(utc(y, (m || 1) - 1, d || 1))
}
/** Hora-muro HH:MM:SS.mmm de un Date guardado (getters UTC, ver lib/walltime.ts). */
function timeOfWall(d: Date) {
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`
}
/**
 * Día elegido + hora-muro real. Al crear: hora-muro actual de México. Al
 * editar: se conserva la hora original (solo cambia el día si el usuario lo
 * movió). Si el día no cambió, se devuelve el timestamp original intacto para
 * no tocar la hora por re-construcción ni por zona horaria del dispositivo.
 */
function buildDateTime(ymd: string, entryDate?: string) {
  if (entryDate) {
    const t = new Date(entryDate)
    if (!Number.isNaN(t.getTime())) {
      if (ymdOfWall(t) === ymd) return entryDate
      return `${ymd}T${timeOfWall(t)}`
    }
  }
  return `${ymd}T${timeOfWall(wallNow())}`
}
function fmtAmount(s: string) {
  const [i, dec] = s.split('.')
  const int = Number(i || '0').toLocaleString('es-MX')
  return dec !== undefined ? `${int}.${dec}` : int
}

export function TransactionForm({
  accountOptions,
  cats,
  entry,
  onDone,
}: {
  accountOptions: AccountOpt[]
  cats: CatalogRow[]
  entry?: TxEditData
  onDone?: () => void
}) {
  const editing = Boolean(entry)
  const initialMode: Mode = entry
    ? entry.type === 'INCOME'
      ? 'abono'
      : entry.type === 'TRANSFER'
        ? 'pago'
        : 'cargo'
    : 'cargo'

  const [mode, setMode] = useState<Mode>(initialMode)
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [dateYMD, setDateYMD] = useState(
    entry ? ymdOfWall(new Date(entry.date)) : todayMexicoYMD(),
  )
  const [desc, setDesc] = useState(entry?.concept ?? '')
  const [descTouched, setDescTouched] = useState(Boolean(entry?.concept))
  const [editingDesc, setEditingDesc] = useState(false)
  // Lugar de compra (opcional): se combina como "desc - lugar" y se guarda
  // para sugerirlo. Al editar se recupera partiendo el concepto guardado.
  const [place, setPlace] = useState('')
  const [userEdited, setUserEdited] = useState(false)
  // Foco al abrir el modal de descripción (input + teclado).
  const descRef = useRef<HTMLInputElement>(null)
  const placeRef = useRef<HTMLInputElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [accountId, setAccountId] = useState(
    entry?.accountId ?? accountOptions[0]?.id ?? '',
  )
  const [destId, setDestId] = useState(entry?.transferToAccountId ?? '')
  const [category, setCategory] = useState(
    entry?.category ?? (initialMode === 'abono' ? 'NOMINA' : 'COMIDA'),
  )
  const [msi, setMsi] = useState(1)
  // Al editar un gasto compartido, prefill con su reparto actual.
  // Tabs: Pareja (solo pareja, % o monto) y Otros (1+ integrantes).
  const editShare = editing && entry!.type === 'EXPENSE' && entry!.isShared
  const editShares =
    editShare && entry!.shares && entry!.shares.length > 0
      ? entry!.shares
      : null
  // El gasto ya es grupo (2+ partes) → tab Otros fija; si no, según con
  // quién sea el simple (externo → Otros, pareja → Pareja).
  const isGroupEdit = (editShares?.length ?? 0) > 1
  const [shared, setShared] = useState(Boolean(editShare))
  const [shareTab, setShareTab] = useState<'pareja' | 'otros'>(
    isGroupEdit || (editShare && entry!.shareExternalName)
      ? 'otros'
      : 'pareja',
  )
  // — % o monto fijo (Tab Pareja y Tab Otros con 1 integrante) —
  const [shareMode, setShareMode] = useState<'pct' | 'amount'>(
    editShare && !isGroupEdit && entry!.shareFixed ? 'amount' : 'pct',
  )
  const [sharePct, setSharePct] = useState(
    editShare && !isGroupEdit && !entry!.shareFixed && entry!.sharePct != null
      ? Math.round(entry!.sharePct)
      : 50,
  )
  const [shareAmt, setShareAmt] = useState(
    editShare &&
      !isGroupEdit &&
      entry!.shareFixed &&
      entry!.shareMonthly != null
      ? String(
          fromCents(
            toCents(entry!.shareMonthly) * Math.max(1, entry!.installments),
          ),
        )
      : '',
  )
  // — Tab Otros: integrantes (pareja opcional + nombres libres).
  // Al editar se prellena como importes explícitos (exacto).
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>(
    editShare ? 'custom' : 'equal',
  )
  const [includePartner, setIncludePartner] = useState(
    editShares
      ? editShares.some((s) => s.debtorId)
      : editShare
        ? !entry!.shareExternalName
        : false,
  )
  const [memberNames, setMemberNames] = useState<string[]>(() => {
    if (editShares) {
      return editShares
        .map((s) => s.externalName)
        .filter((n): n is string => Boolean(n))
    }
    return editShare && entry!.shareExternalName
      ? [entry!.shareExternalName]
      : []
  })
  const [memberDraft, setMemberDraft] = useState('')
  const memberKeyOf = (name: string) => `ext:${name.trim().toLowerCase()}`
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(
    () => {
      if (editShares) {
        const out: Record<string, string> = {}
        for (const s of editShares) {
          if (s.debtorId) out.__partner__ = String(s.amount)
          else if (s.externalName)
            out[memberKeyOf(s.externalName)] = String(s.amount)
        }
        return out
      }
      if (editShare && entry) {
        // Legado (1 compartido): monto total que debe la otra persona.
        const n = Math.max(1, entry.installments)
        const total =
          entry.shareFixed && entry.shareMonthly != null
            ? fromCents(toCents(entry.shareMonthly) * n)
            : fromCents(
                Math.round(
                  (toCents(entry.amount) * (entry.sharePct ?? 50)) / 100,
                ),
              )
        if (entry.shareExternalName)
          return { [memberKeyOf(entry.shareExternalName)]: String(total) }
        return { __partner__: String(total) }
      }
      return {}
    },
  )
  const [panel, setPanel] = useState<Panel>(null)
  // Input de integrante (tab Otros): ref para devolverle el foco al añadir.
  const memberRef = useRef<HTMLInputElement>(null)
  // Alta de integrante: valida, evita duplicados (case-insensitive) y tope.
  // La pareja homónima sí convive (identidad distinta: debtor vs texto).
  function addMember(raw: string): boolean {
    const clean = raw.trim().replace(/\s+/g, ' ')
    if (clean.length < 1 || clean.length > 30) return false
    if (
      memberNames.some((x) => x.toLowerCase() === clean.toLowerCase())
    )
      return false
    if (memberNames.length + (includePartner ? 1 : 0) >= 10) return false
    setMemberNames((prev) => [...prev, clean])
    setMemberDraft('')
    return true
  }
  // Al abrir el modal de descripción se enfoca su input (abre el teclado).
  useEffect(() => {
    if (panel !== 'desc') return
    const t = window.setTimeout(
      () => descRef.current?.focus({ preventScroll: true }),
      80,
    )
    return () => window.clearTimeout(t)
  }, [panel])
  const [localRows, setLocalRows] = useState<CatalogRow[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState<string>(ICON_PRESETS[0])
  const [newCatColor, setNewCatColor] = useState<string>('#fb923c')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [savingCat, setSavingCat] = useState(false)
  const online = useOnlineStatus()
  // Nombre e id de la pareja (desde la copia local) para el panel Compartir.
  // También al editar: hace falta el id para reescribir el share de pareja.
  const [partnerName, setPartnerName] = useState<string | null>(null)
  // Lugares guardados (Dexie-first + fallback API en primera carga).
  const localPlaces = useLiveQuery(
    () => db.places.orderBy('lastUsedAt').reverse().toArray(),
    [],
  )
  const [remotePlaces, setRemotePlaces] = useState<PlaceRow[] | null>(null)
  useEffect(() => {
    if (
      !online ||
      localPlaces === undefined ||
      localPlaces.length > 0 ||
      remotePlaces !== null
    )
      return
    let alive = true
    fetch('/api/places', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j && Array.isArray(j.places)) setRemotePlaces(j.places)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [online, localPlaces, remotePlaces])
  const places = useMemo(
    () => (localPlaces?.length ? localPlaces : (remotePlaces ?? [])),
    [localPlaces, remotePlaces],
  )
  // Amigos guardados (Dexie-first + fallback API en primera carga).
  const localCompanions = useLiveQuery(
    () => db.companions.orderBy('lastUsedAt').reverse().toArray(),
    [],
  )
  const [remoteCompanions, setRemoteCompanions] = useState<CompanionRow[] | null>(
    null,
  )
  useEffect(() => {
    if (
      !online ||
      localCompanions === undefined ||
      localCompanions.length > 0 ||
      remoteCompanions !== null
    )
      return
    let alive = true
    fetch('/api/companions', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j && Array.isArray(j.companions))
          setRemoteCompanions(j.companions)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [online, localCompanions, remoteCompanions])
  const companions = useMemo(
    () =>
      localCompanions?.length
        ? localCompanions
        : (remoteCompanions ?? []),
    [localCompanions, remoteCompanions],
  )
  // Sugerencias de amigos: recientes primero, filtran mientras se escribe
  // (excluye el texto exacto ya escrito y los ya agregados).
  const memberQ = memberDraft.trim().toLowerCase()
  const memberExists = companions.some(
    (c) => c.name.toLowerCase() === memberQ,
  )
  const memberSuggestions = useMemo(() => {
    const added = new Set(memberNames.map((n) => n.toLowerCase()))
    return companions
      .filter((c) => c.name.toLowerCase() !== memberQ)
      .filter((c) => !added.has(c.name.toLowerCase()))
      .filter((c) => !memberQ || c.name.toLowerCase().includes(memberQ))
      .slice(0, 6)
  }, [companions, memberQ, memberNames])

  // Al editar un gasto, parte el concepto guardado ("desc - lugar"):
  // ajuste durante el render (una sola vez por montaje, cuando la lista
  // local ya cargó y el usuario aún no tocó los campos).
  const [didSplit, setDidSplit] = useState(!editing)
  if (
    !didSplit &&
    editing &&
    entry &&
    entry.type === 'EXPENSE' &&
    localPlaces !== undefined &&
    !userEdited
  ) {
    const { desc: d, place: p } = splitConcept(entry.concept, places)
    if (p) {
      setDesc(d)
      setPlace(p)
    }
    setDidSplit(true)
  }

  // Sugerencias: recientes primero, filtran mientras se escribe (excluye el
  // texto exacto ya escrito).
  const placeQ = place.trim().toLowerCase()
  const placeExists = places.some((p) => p.name.toLowerCase() === placeQ)
  const placeSuggestions = useMemo(() => {
    return places
      .filter((p) => p.name.toLowerCase() !== placeQ)
      .filter((p) => !placeQ || p.name.toLowerCase().includes(placeQ))
      .slice(0, 6)
  }, [places, placeQ])

  useEffect(() => {
    let alive = true
    resolvePartner()
      .then((p) => {
        if (alive && p) {
          setPartnerName(p.name)
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  // ¿Se puede incluir a la pareja en Otros? Igual que antes: si hay
  // vínculo, o al editar un compartido que ya la incluye.
  const partnerAvailable =
    Boolean(partnerName) ||
    Boolean(editing && entry?.isShared && !entry?.shareExternalName) ||
    Boolean(editShares?.some((s) => s.debtorId))

  // Al crear una categoría, llega por `localRows` y —tras revalidar el
  // servidor— también por el prop `cats`: se deduplica por código para
  // no renderizarla dos veces (misma key).
  const catalog = useMemo(() => {
    const seen = new Set(cats.map((c) => c.code))
    return [...cats, ...localRows.filter((r) => !seen.has(r.code))]
  }, [cats, localRows])

  // Solo las categorías del modo activo (gasto o ingreso), resueltas a icono.
  // Si la actual (legado) no está en la lista, se antepone para no perderla.
  const visibleCats = useMemo(() => {
    const want = mode === 'abono' ? 'income' : 'expense'
    const list = catalog
      .map((r) => lookupCategory(r.code, catalog))
      .filter((c) => c.kind === want || c.kind === 'both')
    if (entry && !list.some((c) => c.code === entry.category)) {
      return [lookupCategory(entry.category, catalog), ...list]
    }
    return list
  }, [catalog, mode, entry])

  // La categoría elegida siempre va primera en el slider.
  const sliderCats = useMemo(() => {
    const i = visibleCats.findIndex((c) => c.code === category)
    if (i <= 0) return visibleCats
    return [
      visibleCats[i],
      ...visibleCats.slice(0, i),
      ...visibleCats.slice(i + 1),
    ]
  }, [visibleCats, category])
  const sliderRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    sliderRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }, [category])

  // En Chrome desktop el picker nativo solo abre al clickear el icono.
  // Con showPicker() abre al clickear en cualquier parte del campo.
  function openNativeDatePicker() {
    try {
      dateInputRef.current?.showPicker?.()
    } catch {
      // Sin soporte o picker ya abierto: el input sigue editable.
    }
  }

  const debits = accountOptions.filter((a) => a.type !== 'CREDIT')
  const hasTypes = accountOptions.some((a) => a.type)

  function switchMode(m: Mode) {
    setMode(m)
    // Los lugares son solo de gastos: al salir se descarta el escrito y se
    // cierra el editor simple por si quedó abierto.
    if (m !== 'cargo') {
      setPlace('')
      setEditingDesc(false)
    }
    if (m === 'pago') {
      setPanel(null)
      // En pago el origen solo admite débito: si la cuenta actual es la
      // favorita de crédito, preselecciona el débito más arriba en el orden.
      if (hasTypes) {
        const isValidOrigin = debits.some((a) => a.id === accountId)
        if (!isValidOrigin) {
          const firstDebit = debits[0]?.id ?? ''
          setAccountId(firstDebit)
          if (destId === firstDebit) setDestId('')
        } else if (destId === accountId) {
          setDestId('')
        }
      }
      return
    }
    const want = m === 'abono' ? 'income' : 'expense'
    const ok = [...cats, ...localRows].some(
      (c) => c.code === category && (c.kind === want || c.kind === 'both'),
    )
    if (!ok) setCategory(m === 'abono' ? 'NOMINA' : 'COMIDA')
  }
  const originOpts = hasTypes ? debits : accountOptions
  // Destino: cualquier cuenta propia distinta del origen (crédito o débito).
  const destOpts = accountOptions.filter((a) => a.id !== accountId)
  const destFallback = destOpts[0]?.id ?? ''
  const shownDest = destId || destFallback
  const destIsDebit =
    (accountOptions.find((a) => a.id === shownDest)?.type ?? 'CREDIT') !==
    'CREDIT'

  // "Hoy"/"ayer" en día real de México (el dispositivo está en México).
  const todayYMD = todayMexicoYMD()
  const yesterdayYMD = ymdOfWall(addWallDays(wallNow(), -1))
  const dateLabel =
    dateYMD === todayYMD
      ? 'Hoy'
      : dateYMD === yesterdayYMD
        ? 'Ayer'
        : shortDate(dateYMD)
  const accountLabel =
    accountOptions.find((a) => a.id === accountId)?.name ?? 'Cuenta'
  const destLabel =
    accountOptions.find((a) => a.id === shownDest)?.name ?? 'Cuenta'

  // Vista previa del reparto (total y mensual según MSI, en centavos).
  // Gasto en grupo: tú pagas el total ahora y cada integrante te debe su parte.
  // Los integrantes siempre consumen; tú eliges si participas o no
  // (si no, todo te lo deben). Igual que el pagador en gastos de grupo.
  const totalC = toCents(amount || '0')
  const per = editing ? Math.max(1, entry!.installments) : Math.max(1, msi)
  const debtorCount = memberNames.length + (includePartner ? 1 : 0)
  const [iParticipate, setIParticipate] = useState(true)
  // Divisor en iguales: deudores + tú (si participas).
  const participantCount = debtorCount + (iParticipate ? 1 : 0)
  // Nombres de integrantes para mostrar (pareja primero).
  const debtorLabels: { key: string; label: string }[] = [
    ...(includePartner
      ? [{ key: '__partner__', label: partnerName ?? 'Mi pareja' }]
      : []),
    ...memberNames.map((n) => ({ key: memberKeyOf(n), label: n })),
  ]
  // Reparto igual con centavos exactos (el resto se reparte +1¢ al inicio;
  // si participas, tu lugar va primero para que cuadre con el total).
  const debtorKeys = debtorLabels.map((d) => d.key).join('|')
  const equalAmounts = useMemo(() => {
    const out = new Map<string, number>()
    if (totalC <= 0 || debtorCount === 0 || participantCount <= 0) return out
    const base = Math.floor(totalC / participantCount)
    const rem = totalC % participantCount
    // Orden de participantes: [yo?, ...deudores].
    const order = [
      ...(iParticipate ? ['__me__'] : []),
      ...debtorLabels.map((d) => d.key),
    ]
    order.forEach((key, idx) => {
      if (key === '__me__') return
      out.set(key, fromCents(base + (idx < rem ? 1 : 0)))
    })
    return out
  }, [totalC, debtorCount, participantCount, debtorKeys, iParticipate])
  const equalOwedC =
    [...equalAmounts.values()].reduce((a, v) => a + toCents(String(v)), 0) || 0
  const equalMine = fromCents(Math.max(0, totalC - equalOwedC))
  const customSumC = debtorLabels.reduce(
    (a, d) => a + (toCents(customAmounts[d.key] || '0') || 0),
    0,
  )
  const customMine = fromCents(Math.max(0, totalC - customSumC))
  // Con tu participación el resto lo absorbes tú; sin ella, las partes
  // deben sumar el total exacto.
  const customValid =
    debtorCount > 0 &&
    totalC > 0 &&
    customSumC > 0 &&
    (iParticipate ? customSumC - totalC <= 0 : customSumC === totalC) &&
    debtorLabels.every((d) => toCents(customAmounts[d.key] || '0') > 0)
  const owedTotal =
    splitMode === 'equal' ? fromCents(equalOwedC) : fromCents(customSumC)
  // — Nombre de la contraparte para el selector %/monto —
  // Tab Pareja: siempre la pareja. Tab Otros con 1 integrante: ese integrante.
  const parejaName = partnerName ?? 'tu pareja'
  const otrosSingleName =
    debtorCount === 1 ? debtorLabels[0].label : 'la otra persona'
  const singleName = shareTab === 'pareja' ? parejaName : otrosSingleName
  // sharePct = % que aporta LA OTRA PERSONA; tú pagas el total ahora.
  const pctMonthly = fromCents(
    Math.round(Math.round((totalC * sharePct) / 100) / per),
  )
  const amtC = toCents(shareAmt || '0')
  const amtMonthly = fromCents(Math.round(amtC / per))
  const amtNum = fromCents(amtC)
  const amtPct = totalC > 0 ? (amtC / totalC) * 100 : 0
  const singleLabel =
    shareMode === 'pct'
      ? `${sharePct}%`
      : shareAmt
        ? `$${fmtAmount(shareAmt)}`
        : 'Monto'
  const grupoLabel =
    debtorCount === 0
      ? 'Compartir'
      : debtorCount === 1
        ? `${debtorLabels[0].label} · ${singleLabel}`
        : `${debtorCount + 1} personas`
  const shareLabel = !shared
    ? 'Compartir'
    : shareTab === 'pareja'
      ? singleLabel
      : grupoLabel

  // Sanea lo que llega del teclado numérico nativo: dígitos y un punto
  // con hasta 2 decimales. Devuelve null si supera los 9 dígitos.
  function sanitizeAmount(v: string): string | null {
    let next = v.replace(/[^0-9.]/g, '')
    if (next === '') return ''
    const parts = next.split('.')
    if (parts.length > 2) next = parts[0] + '.' + parts.slice(1).join('')
    if (next.startsWith('.')) next = '0' + next
    const dot = next.indexOf('.')
    if (dot !== -1) next = next.slice(0, dot + 1) + next.slice(dot + 1, dot + 3)
    next = next.replace(/^0+(?=\d)/, '')
    if (next.replace('.', '').length > 9) return null
    return next
  }

  // Selector % / monto fijo para 1 contraparte (Tab Pareja con tu pareja,
// Tab Otros con su único integrante). Usa el estado compartido
// shareMode/sharePct/shareAmt y singleName según la tab activa.
function renderSinglePanels() {
    return (
      <>
        <div>
          <p className="mb-1.5 text-center text-xs font-semibold text-(--muted-foreground)">
            ¿Cuánto te debe?
          </p>
          <div className="mx-auto grid w-fit grid-cols-2 gap-2 rounded-full bg-(--muted) p-1">
            {(['pct', 'amount'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setShareMode(m)}
                className={cn(
                  'rounded-full px-5 py-2 text-sm font-semibold',
                  shareMode === m
                    ? 'bg-(--card) shadow'
                    : 'text-(--muted-foreground)',
                )}>
                {m === 'pct' ? 'Porcentaje' : 'Cantidad fija'}
              </button>
            ))}
          </div>
        </div>

        {shareMode === 'pct' ? (
          <div className="space-y-2 rounded-3xl border border-(--border) p-4">
            <p className="text-center text-4xl font-extrabold tabular-nums">
              {sharePct}%
            </p>
            <input
              type="range"
              min={1}
              max={100}
              value={sharePct}
              onChange={(e) => setSharePct(Number(e.target.value))}
              aria-label="Porcentaje que aporta la otra persona"
              className="w-full accent-(--primary)"
            />
            <div className="flex justify-between text-[11px] text-(--muted-foreground)">
              <span>Tú {100 - sharePct}%</span>
              <span>
                {singleName} {sharePct}%
              </span>
            </div>
            <p className="text-center text-sm">
              {singleName} te debe{' '}
              <b>
                ${fmtAmount(toFixedCents(pctMonthly))}/mes
                {per > 1 ? ` × ${per}` : ''}
              </b>{' '}
              de ${fmtAmount(amount || '0')}
            </p>
          </div>
        ) : (
          <div className="space-y-2 rounded-3xl border border-(--border) p-4">
            <Label htmlFor="share-amt">
              ¿Cuánto te debe {singleName} en total?
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-(--muted-foreground)">
                $
              </span>
              <Input
                id="share-amt"
                type="number"
                min={0.01}
                step={0.01}
                value={shareAmt}
                onChange={(e) => setShareAmt(e.target.value)}
                placeholder="125"
                inputMode="decimal"
              />
            </div>
            {amtNum > 0 && (
              <p className="text-center text-sm">
                Equivale al <b>{amtPct.toFixed(1)}%</b> ·{' '}
                <b>
                  ${fmtAmount(toFixedCents(amtMonthly))}/mes
                  {per > 1 ? ` × ${per}` : ''}
                </b>
              </p>
            )}
            <p className="text-center text-[11px] text-(--muted-foreground)">
              Monto fijo pactado: no cambiará aunque edites el total
            </p>
          </div>
        )}
      </>
    )
  }

  async function submit() {
    if (pending) return
    const value = normalizeMoney(amount)
    if (!amount || Number.isNaN(toCents(amount)) || toCents(amount) <= 0) {
      setMsg('Ingresa un monto mayor a 0')
      return
    }
    if (!accountId) {
      setMsg('Elige una cuenta')
      return
    }
    if (mode === 'pago' && (!shownDest || shownDest === accountId)) {
      setMsg('Elige una cuenta destino distinta')
      return
    }
    setMsg(null)
    setPending(true)
    const fd = new FormData()
    if (editing) fd.set('id', entry!.id)
    fd.set('type', MODE_TYPE[mode])
    fd.set('amount', String(value))
    const autoConcept =
      mode === 'pago'
        ? destIsDebit
          ? 'Transferencia entre cuentas'
          : 'Pago de tarjeta'
        : prettyCat(category)
    // Concepto final: "descripción - lugar" (el lugar es opcional).
    const descPart = descTouched ? desc.trim() || autoConcept : autoConcept
    const placePart = place.trim()
    fd.set('concept', joinConcept(descPart, placePart))
    if (placePart) fd.set('place', placePart)
    fd.set('category', mode === 'pago' ? 'OTRO' : category)
    fd.set('date', buildDateTime(dateYMD, editing ? entry!.date : undefined))
    fd.set('accountId', accountId)
    if (mode === 'pago') fd.set('transferToAccountId', shownDest)
    // Compartido (solo gastos individuales): aplica al crear y al editar.
    // Tab Pareja: solo pareja, formato legado (sharePct/shareAmount).
    // Tab Otros: 1 integrante → legado (sharePct/shareAmount + externalName
    // si no es pareja); 2+ → N partes vía sharesJson.
    const shareEditable = mode === 'cargo' && !(editing && entry?.isGroup)
    // Solo tab Otros con 2+: la tab Pareja y Otros-con-1 usan legado.
    const otrosMulti =
      shareEditable && mode === 'cargo' && shared && shareTab === 'otros' && debtorCount > 1
    // Construye las partes (iguales o importes) antes de validar red.
    let multiParts: { debtorId?: string; externalName?: string; amount: number }[] | null = null
    if (otrosMulti) {
      if (splitMode === 'equal') {
        if (!(totalC > 0)) {
          setMsg('Ingresa el monto total primero')
          setPending(false)
          return
        }
        multiParts = debtorLabels.map((d) => {
          const amt = equalAmounts.get(d.key) ?? 0
          return d.key === '__partner__'
            ? { debtorId: '__PARTNER__', amount: amt }
            : { externalName: d.label, amount: amt }
        })
      } else {
        if (!customValid) {
          setMsg(
            customSumC - totalC > 0
              ? 'La suma de las partes no puede ser mayor al total'
              : !iParticipate
                ? 'Sin tu parte, deben sumar el total exacto'
                : 'Reparte el monto entre integrantes',
          )
          setPending(false)
          return
        }
        multiParts = debtorLabels.map((d) => {
          const amt = fromCents(toCents(customAmounts[d.key] || '0'))
          return d.key === '__partner__'
            ? { debtorId: '__PARTNER__', amount: amt }
            : { externalName: d.label, amount: amt }
        })
      }
    }
    if (shareEditable) {
      if (!editing) fd.set('installments', String(msi))
      if (otrosMulti) {
        fd.set('isShared', 'true')
        if (multiParts && multiParts.length > 0) {
          // La pareja se resuelve en el servidor (getPartnerId); aquí viaja
          // la marca y el servidor la valida contra el vínculo real.
          const wire = multiParts.map((p) =>
            p.debtorId === '__PARTNER__'
              ? { debtorId: '__PARTNER__', amount: p.amount }
              : { externalName: p.externalName, amount: p.amount },
          )
          fd.set('sharesJson', JSON.stringify(wire))
        }
      } else if (shareTab === 'otros' && shared && debtorCount === 0) {
        setMsg('Agrega al menos un integrante')
        setPending(false)
        return
      } else {
        fd.set('isShared', shared ? 'true' : 'false')
        if (shared) {
          // Tab Pareja: siempre la pareja (el servidor la resuelve).
          if (shareTab === 'pareja' && !partnerAvailable) {
            setMsg('Vincula una pareja en Ajustes para compartir')
            setPending(false)
            return
          }
          if (shareTab === 'otros' && debtorCount === 1 && !includePartner) {
            // Tab Otros con 1 integrante externo: viaja su nombre.
            const onlyName = memberNames[0]?.trim()
            if (!onlyName) {
              setMsg('Escribe con quién compartes')
              setPending(false)
              return
            }
            fd.set('externalName', onlyName)
          }
          if (shareMode === 'pct') {
            fd.set('sharePct', String(sharePct)) // % que aporta la otra persona
          } else {
            const amtC = toCents(shareAmt || '0')
            if (
              !shareAmt ||
              Number.isNaN(amtC) ||
              amtC <= 0 ||
              amtC > toCents(value)
            ) {
              setMsg('La aportación debe ser mayor a 0 y no mayor al total')
              setPending(false)
              return
            }
            fd.set('shareAmount', String(fromCents(amtC)))
          }
        }
      }
    }
    // Sin red: solo CREACIÓN → cola offline con eco local. La edición
    // necesita la fila en la central (o ya subida): se bloquea con mensaje.
    if (!online) {
      if (editing) {
        setMsg(
          entry && isPendingId(entry.id)
            ? 'Aún no se sube: se podrá editar al sincronizar'
            : 'Sin conexión: conéctate para guardar cambios',
        )
        setPending(false)
        return
      }
      // Tab Otros con 2+: sin red se pide conexión (cola legacy = 1).
      // Tab Pareja y Otros-con-1 usan el formato legado del fd.
      const strOrUndef = (v: FormDataEntryValue | null) =>
        v == null ? undefined : String(v)
      let wireCount = 0
      try {
        const rawWire = fd.get('sharesJson')
        if (typeof rawWire === 'string' && rawWire) {
          const parsedWire: unknown = JSON.parse(rawWire)
          if (Array.isArray(parsedWire)) wireCount = parsedWire.length
        }
      } catch {
        wireCount = 0
      }
      if (mode === 'cargo' && shared && wireCount > 1) {
        setMsg('Conéctate para dividir entre varias personas')
        setPending(false)
        return
      }
      // Deudor desde la copia local (el servidor ya no puede resolverlo).
      // Con externo no hay id: solo viaja el nombre.
      let debtor: { id: string; name: string } | null = null
      if (mode === 'cargo' && shared && !strOrUndef(fd.get('externalName'))) {
        try {
          debtor = await resolvePartner()
        } catch {
          debtor = null
        }
      }
      const transferId = strOrUndef(fd.get('transferToAccountId'))
      const shareAmountRaw = strOrUndef(fd.get('shareAmount'))
      const input: EnqueueInput = {
        type: String(fd.get('type')) as 'EXPENSE' | 'INCOME' | 'TRANSFER',
        amount: Number(fd.get('amount')),
        concept: String(fd.get('concept')),
        category: String(fd.get('category')),
        date: String(fd.get('date')),
        accountId: String(fd.get('accountId')),
        accountType: accountOptions.find((a) => a.id === accountId)?.type,
        transferToAccountId: transferId,
        transferToAccountType: transferId
          ? accountOptions.find((a) => a.id === transferId)?.type
          : undefined,
        installments: Number(fd.get('installments') ?? 1),
        isShared: fd.get('isShared') === 'true',
        sharePct: Number(fd.get('sharePct') ?? 50),
        shareAmount: shareAmountRaw != null ? Number(shareAmountRaw) : null,
        debtorId: debtor?.id,
        debtorName: debtor?.name,
        externalName: strOrUndef(fd.get('externalName')),
        place: strOrUndef(fd.get('place')),
      }
      const invalid = validateOfflineCreate(input, {
        accounts: accountOptions.map((a) => ({ id: a.id, type: a.type })),
        categoryCodes: new Set([...cats, ...localRows].map((c) => c.code)),
      })
      if (invalid) {
        setMsg(invalid)
        setPending(false)
        return
      }
      try {
        await enqueueOfflineCreate(input)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'No se pudo guardar'
        setMsg(message)
        toast.error(message)
        setPending(false)
        return
      }
      setPending(false)
      setMsg(null)
      toast.success('Guardado en el dispositivo · se subirá solo')
      onDone?.()
      return
    }
    const res = editing
      ? await updateTransaction(fd)
      : await createTransaction(fd)
    if ('error' in res && res.error) {
      setPending(false)
      setMsg(res.error)
      toast.error(res.error)
    } else {
      // Online: el Server Action ya guardó en Neon; forzar la descarga para
      // que Dexie-first muestre el cambio sin esperar al sync de 15 min.
      await syncForce()
      setPending(false)
      setMsg(null)
      toast.success(
        editing ? 'Movimiento actualizado' : 'Movimiento registrado',
      )
      onDone?.()
    }
  }

  async function saveCustomCat() {
    if (!online) {
      setMsg('Conéctate para crear categorías')
      return
    }
    if (newCatName.trim().length < 2) {
      setMsg('La categoría necesita al menos 2 letras')
      return
    }
    setSavingCat(true)
    const fd = new FormData()
    fd.set('name', newCatName.trim())
    fd.set('iconName', newCatIcon)
    fd.set('color', newCatColor)
    fd.set('kind', mode === 'abono' ? 'income' : 'expense')
    const res = await createCategory(fd)
    setSavingCat(false)
    if ('error' in res && res.error) {
      setMsg(res.error)
      return
    }
    if ('category' in res && res.category) {
      const c = res.category
      setLocalRows((prev) =>
        prev.some((x) => x.code === c.code)
          ? prev
          : [
              ...prev,
              {
                id: c.id,
                code: c.code,
                name: c.name,
                iconName: c.iconName,
                color: c.color,
                kind: c.kind as 'expense' | 'income' | 'both',
                isDefault: false,
                mine: true,
              },
            ],
      )
      setCategory(c.code)
      toast.success('Categoría creada')
      void syncForce()
    }
    setNewCatName('')
    setPanel('cats')
    setMsg(null)
  }

  const pagoBlocked =
    mode === 'pago' && (debits.length === 0 || accountOptions.length < 2)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-1 pb-6">
      {/* Tipo de movimiento: dropdown arriba a la derecha */}
      {!editing && (
        <div className="flex justify-end pt-2">
          <ModeDropdown mode={mode} onPick={switchMode} />
        </div>
      )}
      {/* Monto con teclado numérico nativo */}
      <div className="flex items-center justify-center gap-2 py-14">
        <span className="text-2xl font-bold text-(--muted-foreground)">$</span>
        <input
          value={amount}
          onChange={(e) => {
            setMsg(null)
            const next = sanitizeAmount(e.target.value)
            if (next !== null) setAmount(next)
          }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="0"
          inputMode="decimal"
          autoComplete="off"
          aria-label="Monto"
          className="w-full max-w-56 bg-transparent text-center text-5xl font-extrabold tracking-tight tabular-nums outline-none placeholder:text-(--muted-foreground)/40"
        />
      </div>

      {/* Pills: fecha · descripción · cuenta.
          Ingreso/pago: editor simple inline solo-descripción (como antes).
          Gasto: la pill abre el modal flotante con descripción + lugar. */}
      {mode !== 'cargo' && editingDesc ? (
        <div className="flex items-center gap-2">
          <Input
            value={desc}
            onChange={(e) => {
              setDesc(e.target.value)
              setDescTouched(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setEditingDesc(false)
              }
            }}
            placeholder="Descripción"
            maxLength={60}
            autoFocus
            className="h-11"
          />
          <Button
            type="button"
            size="icon"
            aria-label="Confirmar descripción"
            onClick={() => setEditingDesc(false)}>
            <Check className="size-4" />
          </Button>
        </div>
      ) : (
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        <button
          type="button"
          onClick={() => setPanel('date')}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-(--border) bg-(--muted)/60 px-4 py-2 text-xs font-semibold">
          <CalendarDays className="size-3.5" /> {dateLabel}
        </button>
        <button
          type="button"
          onClick={() =>
            mode === 'cargo' ? setPanel('desc') : setEditingDesc(true)
          }
          className={cn(
            'flex max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold',
            desc || place
              ? 'border-transparent bg-(--foreground) text-(--background)'
              : 'border-(--border) bg-(--muted)/60',
          )}>
          <NotebookPen className="size-3.5" />
          <span className="truncate">
            {desc || place
              ? [desc, place].filter(Boolean).join(' · ')
              : 'Descripción'}
          </span>
        </button>
          {mode === 'pago' ? (
            <>
              <button
                type="button"
                onClick={() => setPanel('account')}
                className="flex max-w-[200px] shrink-0 items-center gap-1.5 rounded-full border border-(--border) bg-(--muted)/60 px-4 py-2 text-xs font-semibold">
                <ArrowUpRight className="size-3.5 shrink-0 text-red-400" />
                <span className="truncate">De {accountLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setPanel('dest')}
                className="flex max-w-[200px] shrink-0 items-center gap-1.5 rounded-full border border-(--border) bg-(--muted)/60 px-4 py-2 text-xs font-semibold">
                <ArrowDownLeft className="size-3.5 shrink-0 text-emerald-400" />
                <span className="truncate">A {destLabel}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPanel('account')}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-(--border) bg-(--muted)/60 px-4 py-2 text-xs font-semibold">
                <Wallet className="size-3.5" /> {accountLabel}
              </button>
              {mode === 'cargo' && !editing && (
                <button
                  type="button"
                  onClick={() => setPanel('msi')}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold',
                    msi !== 1
                      ? 'border-transparent bg-(--foreground) text-(--background)'
                      : 'border-(--border) bg-(--muted)/60',
                  )}>
                  <CalendarClock className="size-3.5" /> {msiLabel(msi)}
                </button>
              )}
              {mode === 'cargo' && !(editing && entry?.isGroup) && (
                <button
                  type="button"
                  onClick={() => setPanel('share')}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold',
                    shared
                      ? 'border-transparent bg-(--foreground) text-(--background)'
                      : 'border-(--border) bg-(--muted)/60',
                  )}>
                  <Users className="size-3.5" /> {shareLabel}
                </button>
              )}
            </>
          )}
      </div>
      )}

      {/* Categorías: slider ~85% + botón fijo al grid */}
      {mode !== 'pago' && (
        <div className="mt-2 flex items-center gap-2">
          <div
            ref={sliderRef}
            className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {sliderCats.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCategory(c.code)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2.5 text-xs font-semibold',
                  category === c.code
                    ? 'border-transparent bg-(--foreground) text-(--background)'
                    : 'border-(--border) bg-(--muted)/60',
                )}>
                <c.icon
                  className="size-4 shrink-0"
                  style={{ color: c.color }}
                />{' '}
                {c.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Ver todas las categorías"
            onClick={() => setPanel('cats')}
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-(--border) bg-(--muted)/60 transition active:scale-95">
            <LayoutGrid className="size-4" />
          </button>
        </div>
      )}

      {editing &&
        mode === 'cargo' &&
        (entry!.installments > 1 || entry!.isShared) && (
          <p className="mt-2 text-center text-[11px] text-(--muted-foreground)">
            {entry!.installments > 1
              ? 'Los MSI no se modifican'
              : 'Si hay pagos registrados, el reparto ya no se puede cambiar'}
          </p>
        )}

      {msg && (
        <p className="mt-2 text-center text-sm font-medium text-red-500">
          {msg}
        </p>
      )}

      {/* Guardar (el monto usa el teclado numérico nativo) */}
      <Button
        type="button"
        onClick={submit}
        disabled={pending || pagoBlocked}
        className="mt-3 h-12 w-full rounded-2xl text-base">
        {pending
          ? 'Guardando…'
          : editing
            ? 'Guardar cambios'
            : 'Guardar movimiento'}
      </Button>
      {pagoBlocked && (
        <p className="mt-2 text-center text-xs text-(--muted-foreground)">
          Necesitas una cuenta de débito y una tarjeta de crédito.
        </p>
      )}

      {/* Panel: grid de categorías (solo del modo actual) */}
      <Dialog
        open={panel === 'cats'}
        onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent className="max-h-[86dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="sr-only">Categorías</DialogTitle>
          </DialogHeader>
          {mode !== 'pago' && (
            <div className="grid grid-cols-4 gap-2 pb-2">
              {visibleCats.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setCategory(c.code)
                    setPanel(null)
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-3xl border p-3 transition active:scale-95',
                    category === c.code
                      ? 'border-(--primary) bg-(--primary)/10'
                      : 'border-transparent bg-(--muted)/60',
                  )}>
                  <c.icon className="size-7" style={{ color: c.color }} />
                  <span className="w-full truncate text-center text-[11px] font-medium">
                    {c.label}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPanel('addcat')}
                className="flex flex-col items-center justify-center gap-1.5 rounded-3xl border border-dashed border-(--border) p-3 text-(--muted-foreground) transition active:scale-95">
                <Plus className="size-6" />
                <span className="text-[11px] font-medium">Nueva</span>
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Panel: nueva categoría */}
      <Dialog
        open={panel === 'addcat'}
        onOpenChange={(o) => !o && setPanel('cats')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva categoría</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {ICON_PRESETS.map((name) => {
                const Icon = ICONS[name] ?? ICONS.Shapes
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setNewCatIcon(name)}
                    aria-label={name}
                    className={cn(
                      'flex size-11 items-center justify-center rounded-2xl border',
                      newCatIcon === name
                        ? 'border-(--primary) bg-(--primary)/10'
                        : 'border-(--border)',
                    )}>
                    <Icon className="size-5" style={{ color: newCatColor }} />
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-8 gap-2">
              {CATEGORY_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setNewCatColor(hex)}
                  aria-label={`Color ${hex}`}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border-2 ring-1 ring-black/10 ring-inset',
                    newCatColor === hex
                      ? 'border-(--foreground)'
                      : 'border-transparent',
                  )}
                  style={{ backgroundColor: hex }}>
                  {newCatColor === hex && (
                    <Check className="size-4 text-white" />
                  )}
                </button>
              ))}
            </div>
            <Input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Nombre (ej. Videojuegos)"
              maxLength={30}
            />
            <Button
              type="button"
              className="w-full"
              onClick={saveCustomCat}
              disabled={savingCat}>
              {savingCat ? 'Creando…' : 'Crear categoría'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Panel: cuenta (origen / destino) */}
      <Dialog
        open={panel === 'account' || panel === 'dest'}
        onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {panel === 'dest'
                ? '¿A qué cuenta llega?'
                : mode === 'pago'
                  ? '¿De qué cuenta sale?'
                  : 'Cuenta'}
            </DialogTitle>
          </DialogHeader>
          <ul className="max-h-[50dvh] space-y-1 overflow-y-auto">
            {(panel === 'dest'
              ? destOpts
              : mode === 'pago'
                ? originOpts
                : accountOptions
            ).map((a) => {
              const selected =
                panel === 'dest' ? shownDest === a.id : accountId === a.id
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (panel === 'dest') setDestId(a.id)
                      else {
                        setAccountId(a.id)
                        if (destId === a.id) setDestId('')
                      }
                      setPanel(null)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left transition hover:bg-(--muted)',
                      selected && 'bg-(--muted)',
                    )}>
                    <AccountIcon type={a.type} color={a.color} />
                    <span className="flex-1 text-sm font-semibold">
                      {a.name}
                    </span>
                    {selected && <Check className="size-4 text-(--primary)" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Panel: meses sin intereses */}
      <Dialog open={panel === 'msi'} onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meses sin intereses</DialogTitle>
          </DialogHeader>
          <ul className="max-h-[50dvh] space-y-1 overflow-y-auto">
            {MSI_OPTS.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => {
                    setMsi(m)
                    setPanel(null)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left transition hover:bg-(--muted)',
                    msi === m && 'bg-(--muted)',
                  )}>
                  <span className="flex-1 text-sm font-semibold">
                    {msiLabel(m)}
                  </span>
                  {msi === m && <Check className="size-4 text-(--primary)" />}
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Panel: dividir gasto en grupo (N integrantes, iguales o importes) */}
      <Dialog
        open={panel === 'share'}
        onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent className="max-h-[86dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dividir gasto</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-2xl border border-(--border) px-4 py-3">
            <div>
              <p className="text-sm font-semibold">
                {shareTab === 'pareja'
                  ? shared
                    ? `Dividido con ${singleName}`
                    : 'Dividir este gasto'
                  : shared && debtorCount === 1
                    ? `Dividido con ${singleName}`
                    : shared && debtorCount > 1
                      ? `Dividido entre ${participantCount}`
                      : 'Dividir este gasto'}
              </p>
              <p className="text-xs text-(--muted-foreground)">
                Tú pagas el total ahora
                {shareTab === 'pareja'
                  ? shared
                    ? ` · ${singleName} te debe su parte`
                    : ''
                  : shared && debtorCount === 1
                    ? ` · ${singleName} te debe su parte`
                    : shared && debtorCount > 1
                      ? ` · te deben ${formatMoney(owedTotal)}`
                      : ''}
              </p>
            </div>
            <Switch
              checked={shared}
              onCheckedChange={setShared}
              aria-label="Dividir gasto"
            />
          </div>

          {shared && !isGroupEdit && (
            <div>
              <p className="mb-1.5 text-center text-xs font-semibold text-(--muted-foreground)">
                ¿Cómo lo divides?
              </p>
              <div className="mx-auto grid w-fit grid-cols-2 gap-2 rounded-full bg-(--muted) p-1">
                {(['pareja', 'otros'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setShareTab(t)}
                    className={cn(
                      'rounded-full px-5 py-2 text-sm font-semibold',
                      shareTab === t
                        ? 'bg-(--card) shadow'
                        : 'text-(--muted-foreground)',
                    )}>
                    {t === 'pareja' ? 'Pareja' : 'Otros'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {shared && shareTab === 'pareja' && (
            <>
              {renderSinglePanels()}

              <Button
                type="button"
                className="w-full"
                onClick={() => setPanel(null)}>
                Listo
              </Button>
            </>
          )}

          {shared && shareTab === 'otros' && (
            <>
              {/* Integrantes: pareja (si hay vínculo) + nombres libres.
                  La pareja y un homónimo escrito son 2 integrantes distintos. */}
              <div className="space-y-1.5">
                <Label>Quiénes participan</Label>
                <div className="flex flex-wrap gap-2">
                  {includePartner && (
                    <span className="flex items-center gap-1.5 rounded-full border border-(--primary)/40 bg-(--primary)/10 py-1.5 pr-2 pl-4 text-sm font-semibold">
                      {partnerName ?? 'Mi pareja'}
                      <span className="text-[11px] font-bold text-(--primary)">
                        · pareja
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIncludePartner(false)
                          setCustomAmounts((prev) => {
                            const next = { ...prev }
                            delete next.__partner__
                            return next
                          })
                        }}
                        aria-label="Quitar a tu pareja"
                        className="flex size-6 items-center justify-center rounded-full bg-(--card) text-xs shadow transition active:scale-95">
                        ×
                      </button>
                    </span>
                  )}
                  {memberNames.map((n) => (
                    <span
                      key={memberKeyOf(n)}
                      className="flex items-center gap-1.5 rounded-full border border-(--border) bg-(--muted) py-1.5 pr-2 pl-4 text-sm font-semibold">
                      {n}
                      <button
                        type="button"
                        onClick={() => {
                          setMemberNames((prev) =>
                            prev.filter(
                              (x) => x.toLowerCase() !== n.toLowerCase(),
                            ),
                          )
                          setCustomAmounts((prev) => {
                            const next = { ...prev }
                            delete next[memberKeyOf(n)]
                            return next
                          })
                        }}
                        aria-label={`Quitar a ${n}`}
                        className="flex size-6 items-center justify-center rounded-full bg-(--card) text-xs shadow transition active:scale-95">
                        ×
                      </button>
                    </span>
                  ))}
                  {!includePartner && memberNames.length === 0 && (
                    <span className="text-xs text-(--muted-foreground)">
                      Agrega a tu pareja o escribe nombres abajo.
                    </span>
                  )}
                </div>
              </div>

              {partnerAvailable && !includePartner && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => setIncludePartner(true)}>
                  + Incluir a {partnerName ?? 'mi pareja'}
                </Button>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="tx-member">Agregar integrante</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-(--muted-foreground)" />
                    <Input
                      id="tx-member"
                      ref={memberRef}
                      role="combobox"
                      aria-expanded={memberSuggestions.length > 0}
                      aria-controls="tx-member-list"
                      aria-autocomplete="list"
                      value={memberDraft}
                      onChange={(e) => setMemberDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (addMember(memberDraft))
                            memberRef.current?.focus()
                        }
                      }}
                      placeholder="Buscar o escribir un nombre…"
                      maxLength={30}
                      autoComplete="off"
                      className="pl-10"
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={!memberDraft.trim()}
                    onClick={() => {
                      if (addMember(memberDraft)) memberRef.current?.focus()
                    }}>
                    Añadir
                  </Button>
                </div>
                {memberSuggestions.length > 0 ? (
                  <ul
                    id="tx-member-list"
                    role="listbox"
                    aria-label="Amigos guardados"
                    className="max-h-56 space-y-1 overflow-y-auto">
                    {memberSuggestions.map((c) => (
                      <li key={c.name.toLowerCase()} role="option" aria-selected={false}>
                        <button
                          type="button"
                          onClick={() => {
                            if (addMember(c.name)) memberRef.current?.focus()
                          }}
                          className="flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition hover:bg-(--muted)">
                          <User className="size-4 shrink-0 text-(--muted-foreground)" />
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="shrink-0 text-[11px] font-medium text-(--muted-foreground)">
                            {lastCompanionUse(c.lastUsedAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  memberQ &&
                  !memberExists && (
                    <p className="text-center text-xs text-(--muted-foreground)">
                      Se guardará «{memberDraft.trim()}» como nuevo amigo.
                    </p>
                  )
                )}
              </div>

              {debtorCount <= 1 ? (
                <>
                  {debtorCount === 1 && renderSinglePanels()}
                  {debtorCount === 0 && (
                    <p className="text-center text-xs text-(--muted-foreground)">
                      Agrega al menos un integrante arriba para repartir.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-2xl border border-(--border) px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">
                        ¿Tú también participas?
                      </p>
                      <p className="text-xs text-(--muted-foreground)">
                        {iParticipate
                          ? 'Consumes tu parte del gasto'
                          : 'Pagaste todo, nada es para ti'}
                      </p>
                    </div>
                    <Switch
                      checked={iParticipate}
                      onCheckedChange={setIParticipate}
                      aria-label="Yo también participo del gasto"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-center text-xs font-semibold text-(--muted-foreground)">
                      ¿Cuánto te debe cada uno?
                    </p>
                    <div className="mx-auto grid w-fit grid-cols-2 gap-2 rounded-full bg-(--muted) p-1">
                      {(['equal', 'custom'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSplitMode(m)}
                          className={cn(
                            'rounded-full px-5 py-2 text-sm font-semibold',
                            splitMode === m
                              ? 'bg-(--card) shadow'
                              : 'text-(--muted-foreground)',
                          )}>
                          {m === 'equal' ? 'Iguales' : 'Importes'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {splitMode === 'equal' ? (
                    <div className="space-y-2 rounded-3xl border border-(--border) p-4">
                      <ul className="space-y-1.5">
                        {debtorLabels.map((d) => (
                          <li
                            key={d.key}
                            className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate font-semibold">
                              {d.label}
                            </span>
                            <b className="shrink-0 tabular-nums">
                              {totalC > 0
                                ? formatMoney(equalAmounts.get(d.key) ?? 0)
                                : '—'}
                            </b>
                          </li>
                        ))}
                      </ul>
                      {totalC > 0 && (
                        <p className="text-center text-sm">
                          Te deben{' '}
                          <b>{formatMoney(fromCents(equalOwedC))} en total</b>{' '}
                          {iParticipate ? (
                            <>
                              · tú absorbes {formatMoney(equalMine)}
                              {per > 1
                                ? ` (${formatMoney(fromCents(Math.round(equalOwedC / per)))}/mes)`
                                : ''}
                            </>
                          ) : (
                            <>· tú no consumes nada</>
                          )}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-3xl border border-(--border) p-4">
                      <ul className="space-y-1.5">
                        {debtorLabels.map((d) => (
                          <li
                            key={d.key}
                            className="flex items-center gap-2 text-sm">
                            <span className="min-w-0 flex-1 truncate font-semibold">
                              {d.label}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <span className="text-xs font-bold text-(--muted-foreground)">
                                $
                              </span>
                              <Input
                                value={customAmounts[d.key] ?? ''}
                                onChange={(e) => {
                                  const next = sanitizeAmount(e.target.value)
                                  if (next === null) return
                                  setCustomAmounts((prev) => ({
                                    ...prev,
                                    [d.key]: next,
                                  }))
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                inputMode="decimal"
                                autoComplete="off"
                                aria-label={`Importe de ${d.label}`}
                                className="h-9 w-24 px-2 text-right text-sm font-bold tabular-nums"
                              />
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p
                        className={cn(
                          'text-center text-xs font-semibold',
                          customSumC - totalC > 0
                            ? 'text-red-500'
                            : customValid
                              ? 'text-emerald-500'
                              : 'text-(--muted-foreground)',
                        )}>
                        Suman {formatMoney(fromCents(customSumC))} de{' '}
                        {formatMoney(fromCents(totalC))}
                        {customValid
                          ? iParticipate
                            ? ` · tú absorbes ${formatMoney(customMine)} ✓`
                            : ' · te lo deben todo ✓'
                          : !iParticipate
                            ? ' · deben sumar el total'
                            : ''}
                      </p>
                    </div>
                  )}
                </>
              )}

              <Button
                type="button"
                className="w-full"
                onClick={() => setPanel(null)}>
                Listo
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal flotante: descripción + lugar (solo gastos; combo buscador) */}
      <Dialog
        open={panel === 'desc'}
        onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent className="max-h-[86dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Descripción</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-desc">Descripción</Label>
              <Input
                id="tx-desc"
                ref={descRef}
                value={desc}
                onChange={(e) => {
                  setDesc(e.target.value)
                  setDescTouched(true)
                  setUserEdited(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') placeRef.current?.focus()
                }}
                placeholder="Ej. Supermercado, Uber, Netflix…"
                maxLength={60}
                autoComplete="off"
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-place">Lugar (opcional)</Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-(--muted-foreground)" />
                <Input
                  id="tx-place"
                  ref={placeRef}
                  role="combobox"
                  aria-expanded={placeSuggestions.length > 0}
                  aria-controls="tx-place-list"
                  aria-autocomplete="list"
                  value={place}
                  onChange={(e) => {
                    setPlace(e.target.value)
                    setUserEdited(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setPanel(null)
                  }}
                  placeholder="Buscar o escribir un lugar…"
                  maxLength={PLACE_MAX_LEN}
                  autoComplete="off"
                  className="h-12 pl-10 text-base"
                />
              </div>
              {placeSuggestions.length > 0 ? (
                <ul
                  id="tx-place-list"
                  role="listbox"
                  aria-label="Lugares guardados"
                  className="max-h-56 space-y-1 overflow-y-auto">
                  {placeSuggestions.map((p) => {
                    const selected =
                      place.trim().toLowerCase() === p.name.toLowerCase()
                    return (
                      <li key={p.name} role="option" aria-selected={selected}>
                        <button
                          type="button"
                          onClick={() => {
                            setPlace(p.name)
                            setUserEdited(true)
                            placeRef.current?.focus()
                          }}
                          className={`flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition hover:bg-(--muted) ${selected ? 'bg-(--muted)' : ''}`}>
                          <MapPin className="size-4 shrink-0 text-(--muted-foreground)" />
                          <span className="flex-1 truncate">{p.name}</span>
                          {selected && (
                            <Check className="size-4 text-(--primary)" />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                placeQ && !placeExists && (
                  <p className="text-center text-xs text-(--muted-foreground)">
                    Se guardará «{place.trim()}» como nuevo lugar.
                  </p>
                )
              )}
            </div>
            <Button
              type="button"
              className="h-12 w-full rounded-2xl text-base"
              onClick={() => setPanel(null)}>
              Listo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Panel: fecha */}
      <Dialog
        open={panel === 'date'}
        onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fecha</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={dateYMD === todayYMD ? 'default' : 'secondary'}
              onClick={() => {
                setDateYMD(todayYMD)
                setPanel(null)
              }}>
              Hoy
            </Button>
            <Button
              type="button"
              variant={dateYMD === yesterdayYMD ? 'default' : 'secondary'}
              onClick={() => {
                setDateYMD(yesterdayYMD)
                setPanel(null)
              }}>
              Ayer
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-date-pick">Otra fecha</Label>
            <Input
              id="tx-date-pick"
              ref={dateInputRef}
              type="date"
              value={dateYMD}
              max={todayYMD}
              onClick={openNativeDatePicker}
              onChange={(e) => {
                if (e.target.value) {
                  setDateYMD(e.target.value)
                  setPanel(null)
                }
              }}
              className="cursor-pointer"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Dropdown de tipo de movimiento (Gasto / Ingreso / Pago). */
function ModeDropdown({
  mode,
  onPick,
}: {
  mode: Mode
  onPick: (m: Mode) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open ])

  const label = mode === 'cargo' ? 'Gasto' : mode === 'abono' ? 'Ingreso' : 'Pago'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tipo de movimiento"
        className="flex items-center gap-1.5 rounded-full border border-(--border) bg-(--muted)/60 px-4 py-2 text-xs font-semibold">
        {label}
        <ChevronDown
          className={cn('size-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Tipo de movimiento"
          className="absolute right-0 z-30 mt-2 w-40 overflow-hidden rounded-2xl border border-(--border) bg-(--card) p-1 shadow-xl">
          {(['cargo', 'abono', 'pago'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={mode === m}
              onClick={() => {
                onPick(m)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-(--muted)',
                mode === m && 'bg-(--muted)',
              )}>
              <span className="flex-1">
                {m === 'cargo' ? 'Gasto' : m === 'abono' ? 'Ingreso' : 'Pago'}
              </span>
              {mode === m && <Check className="size-4 text-(--primary)" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

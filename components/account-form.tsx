'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Check,
  ChevronDown,
  CreditCard,
  Landmark,
  LayoutGrid,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'

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

import { createAccount, updateAccount } from '@/lib/actions'
import { BANKS, getBank } from '@/lib/banks'
import { ACCOUNT_COLORS } from '@/lib/categories'
import { syncForce } from '@/lib/offline/useSnapshotSync'
import { cn } from '@/lib/utils'

export type AccountEditData = {
  id: string
  name: string
  type: 'DEBIT' | 'CREDIT'
  lastFour?: string
  expiry?: string
  color: string
  bankId?: string | null
  creditLimit?: number
  statementDay?: number
  dueDay?: number
  isFavorite: boolean
}

function maskExpiry(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}/${d.slice(2)}`
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
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.6
}

const fieldCls =
  'h-12 rounded-2xl border border-(--border) bg-(--muted)/50 px-4 text-sm outline-none focus:border-(--primary)'

export function AccountForm({
  account,
  onDone,
}: {
  account?: AccountEditData
  onDone?: () => void
}) {
  const editing = Boolean(account)
  const [type, setType] = useState<'DEBIT' | 'CREDIT'>(account?.type ?? 'DEBIT')
  const [name, setName] = useState(account?.name ?? '')
  const [lastFour, setLastFour] = useState(account?.lastFour ?? '')
  const [expiry, setExpiry] = useState(account?.expiry ?? '')
  const [color, setColor] = useState(account?.color ?? '#6366f1')
  const [bankId, setBankId] = useState<string | null>(account?.bankId ?? null)
  const [favorite, setFavorite] = useState(account?.isFavorite ?? false)
  const [initialBalance, setInitialBalance] = useState('')
  const [creditLimit, setCreditLimit] = useState(
    account?.creditLimit != null ? String(account.creditLimit) : '',
  )
  const [statementDay, setStatementDay] = useState(
    account?.statementDay != null ? String(account.statementDay) : '',
  )
  const [dueDay, setDueDay] = useState(
    account?.dueDay != null ? String(account.dueDay) : '',
  )
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [bankOpen, setBankOpen] = useState(false)
  const [bankQuery, setBankQuery] = useState('')

  const bank = getBank(bankId)
  const FallbackIcon = type === 'DEBIT' ? Landmark : CreditCard
  const PreviewIcon = bank?.Icon ?? FallbackIcon
  const previewIconColor = bank?.iconColor ?? '#ffffff'
  const previewLight = isLightColor(color)

  function pickBank(id: string) {
    const next = getBank(id)
    if (!next) return
    setBankId(next.id)
    // Preselección: icono (derivado de bankId) + color del banco.
    // El nombre no se toca y el color sigue siendo editable manualmente.
    setColor(next.color)
  }

  // El color elegido siempre va primero en el deslizable (igual que las
  // categorías en el formulario de movimiento).
  const filteredBanks = useMemo(() => {
    const q = bankQuery.trim().toLowerCase()
    if (!q) return BANKS
    return BANKS.filter((b) => b.name.toLowerCase().includes(q))
  }, [bankQuery])
  const sliderColors = useMemo(() => {
    const i = ACCOUNT_COLORS.findIndex(
      (h) => h.toLowerCase() === color.toLowerCase(),
    )
    if (i <= 0) return ACCOUNT_COLORS
    return [
      ACCOUNT_COLORS[i]!,
      ...ACCOUNT_COLORS.slice(0, i),
      ...ACCOUNT_COLORS.slice(i + 1),
    ]
  }, [color])
  const sliderRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    sliderRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }, [color])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setPending(true)
    const res = editing
      ? await updateAccount(new FormData(e.currentTarget))
      : await createAccount(new FormData(e.currentTarget))
    if ('error' in res && res.error) {
      setPending(false)
      setMsg(res.error)
      toast.error(res.error)
    } else {
      await syncForce()
      setPending(false)
      setMsg(null)
      toast.success(editing ? 'Cuenta actualizada' : 'Cuenta agregada')
      onDone?.()
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      autoComplete="off"
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {editing && <input type="hidden" name="id" value={account!.id} />}
      {/* Vista previa en vivo */}
      <div
        className="rounded-3xl p-4 shadow-lg"
        style={{
          background: color,
          color: previewLight ? '#0f172a' : '#ffffff',
        }}>
        <div className="flex items-center justify-between">
          <span style={{ color: previewIconColor }}>
            <PreviewIcon className="h-5 w-auto max-w-24" aria-hidden />
          </span>
          <span className="text-[11px] font-bold tracking-widest uppercase opacity-80">
            {type === 'DEBIT' ? 'Débito' : 'Crédito'}
          </span>
        </div>
        <p className="mt-3 truncate text-lg font-bold">
          {name.trim() || 'Mi cuenta'}
        </p>
        <p className="mt-0.5 text-sm font-medium tabular-nums opacity-80">
          ···· {lastFour || '····'}
          {'  ·  '}
          {expiry || 'MM/AA'}
        </p>
      </div>

      {editing ? (
        <p className="rounded-2xl bg-(--muted) px-4 py-2.5 text-center text-xs font-semibold text-(--muted-foreground)">
          {type === 'DEBIT' ? 'Débito' : 'Crédito'} · el tipo no se puede
          cambiar
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 rounded-full bg-(--muted) p-1">
          {(['DEBIT', 'CREDIT'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'rounded-full py-2 text-sm font-semibold transition',
                type === t ? 'bg-(--card) shadow' : 'text-(--muted-foreground)',
              )}>
              {t === 'DEBIT' ? 'Débito' : 'Crédito'}
            </button>
          ))}
        </div>
      )}
      <input type="hidden" name="type" value={type} />

      <div className="space-y-1.5">
        <Label>Banco</Label>
        <button
          type="button"
          onClick={() => setBankOpen(true)}
          className={cn(
            'flex w-full items-center gap-3 rounded-2xl border border-(--border) bg-(--card) px-4 py-3 text-left transition active:scale-[0.99]',
          )}>
          {bank ? (
            <>
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: bank.color, color: bank.iconColor }}>
                <PreviewIcon className="h-auto max-h-4 w-[75%]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {bank.name}
                </span>
                <span className="block text-xs text-(--muted-foreground)">
                  {type === 'DEBIT' ? 'Débito' : 'Crédito'} · toca para cambiar
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--muted) text-(--muted-foreground)">
                <FallbackIcon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  Seleccionar banco
                </span>
                <span className="block text-xs text-(--muted-foreground)">
                  Opcional
                </span>
              </span>
            </>
          )}
          <ChevronDown className="size-4 shrink-0 text-(--muted-foreground)" />
        </button>
        <input type="hidden" name="bankId" value={bankId ?? ''} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="acc-name">Nombre</Label>
        <Input
          id="acc-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'DEBIT' ? 'BBVA Débito' : 'Nu Crédito'}
          required
          className="h-12 text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="acc-last">Terminación</Label>
          <Input
            id="acc-last"
            name="lastFour"
            value={lastFour}
            onChange={(e) =>
              setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))
            }
            inputMode="numeric"
            placeholder="1234"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acc-exp">Vence</Label>
          <Input
            id="acc-exp"
            name="expiry"
            value={expiry}
            onChange={(e) => setExpiry(maskExpiry(e.target.value))}
            inputMode="numeric"
            placeholder="MM/AA"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex items-center gap-2">
          <div
            ref={sliderRef}
            className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5">
            {sliderColors.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setColor(hex)}
                aria-label={`Color ${hex}`}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 ring-1 ring-black/10 transition ring-inset active:scale-95',
                  color.toLowerCase() === hex
                    ? 'border-(--foreground)'
                    : 'border-transparent',
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Ver todos los colores"
            onClick={() => setPaletteOpen(true)}
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-(--border) bg-(--muted)/60 transition active:scale-95">
            <LayoutGrid className="size-4" />
          </button>
        </div>
        <input type="hidden" name="color" value={color} />
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-(--border) px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Star
            className={cn(
              'size-5',
              favorite
                ? 'fill-amber-400 text-amber-400'
                : 'text-(--muted-foreground)',
            )}
          />
          <div>
            <p className="text-sm font-semibold">Cuenta favorita</p>
          </div>
        </div>
        <Switch
          checked={favorite}
          onCheckedChange={setFavorite}
          aria-label="Cuenta favorita"
        />
        <input type="hidden" name="isFavorite" value={favorite ? '1' : ''} />
      </div>

      {type === 'DEBIT' ? (
        !editing && (
          <div className="space-y-1.5">
            <Label htmlFor="acc-init">Saldo inicial</Label>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold text-(--muted-foreground)">
                $
              </span>
              <Input
                id="acc-init"
                name="initialBalance"
                type="number"
                min={0}
                step={0.01}
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                required
                className="h-12 text-xl font-bold"
                inputMode="decimal"
                placeholder="0"
              />
            </div>
          </div>
        )
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="acc-limit">Límite de crédito</Label>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold text-(--muted-foreground)">
                $
              </span>
              <Input
                id="acc-limit"
                name="creditLimit"
                type="number"
                min={0}
                step={0.01}
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="50000"
                required
                className="h-12 text-xl font-bold"
                inputMode="decimal"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acc-corte">Día de corte</Label>
              <Input
                id="acc-corte"
                name="statementDay"
                type="number"
                min={1}
                max={31}
                value={statementDay}
                onChange={(e) => setStatementDay(e.target.value)}
                placeholder="15"
                className={fieldCls}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-pago">Día de pago</Label>
              <Input
                id="acc-pago"
                name="dueDay"
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="5"
                className={fieldCls}
              />
            </div>
          </div>
        </>
      )}
      {msg && (
        <p className="text-center text-sm font-medium text-red-500">{msg}</p>
      )}
      <Button
        type="submit"
        className="h-12 w-full shrink-0 rounded-2xl text-base"
        disabled={pending}>
        {pending
          ? 'Guardando…'
          : editing
            ? 'Guardar cambios'
            : 'Agregar cuenta'}
      </Button>

      {/* Selector de banco (escala a N bancos con buscador) */}
      <Dialog
        open={bankOpen}
        onOpenChange={(o) => {
          setBankOpen(o)
          if (!o) setBankQuery('')
        }}>
        <DialogContent className="max-h-[86dvh]">
          <DialogHeader>
            <DialogTitle>Seleccionar banco</DialogTitle>
          </DialogHeader>
          <Input
            value={bankQuery}
            onChange={(e) => setBankQuery(e.target.value)}
            placeholder="Buscar banco…"
            className="h-11"
          />
          <ul className="grid max-h-[50dvh] grid-cols-3 gap-2 overflow-y-auto pb-2">
            {filteredBanks.map((b) => {
              const BIcon = b.Icon
              const selected = bankId === b.id
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      pickBank(b.id)
                      setBankOpen(false)
                      setBankQuery('')
                    }}
                    title={b.name}
                    aria-label={b.name}
                    aria-pressed={selected}
                    className={cn(
                      'flex w-full flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition active:scale-95',
                      selected
                        ? 'border-(--primary) bg-(--primary)/10'
                        : 'border-(--border) hover:bg-(--muted)',
                    )}>
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: b.color,
                        color: b.iconColor,
                      }}>
                      <BIcon className="h-auto max-h-5 w-[75%]" aria-hidden />
                    </span>
                    <span className="w-full truncate text-xs font-semibold">
                      {b.name}
                    </span>
                  </button>
                </li>
              )
            })}
            {filteredBanks.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-(--muted-foreground)">
                Sin resultados para “{bankQuery.trim()}”.
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Paleta completa de colores */}
      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent className="max-h-[86dvh]">
          <DialogHeader>
            <DialogTitle>Color de la cuenta</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-8 gap-2 pb-2">
            {ACCOUNT_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => {
                  setColor(hex)
                  setPaletteOpen(false)
                }}
                aria-label={`Color ${hex}`}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 ring-1 ring-black/10 transition ring-inset active:scale-95',
                  color.toLowerCase() === hex
                    ? 'border-(--foreground)'
                    : 'border-transparent',
                )}
                style={{ backgroundColor: hex }}>
                {color.toLowerCase() === hex && (
                  <Check className="size-4 text-white" />
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </form>
  )
}

import { CreditCard, Landmark, Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

import { getBank } from '@/lib/banks'
import { formatMoney } from '@/lib/utils'

export type AccountRow = {
  id: string
  name: string
  type: 'DEBIT' | 'CREDIT'
  owner: string
  ownerId: string
  balance: number
  creditLimit?: number
  statementDay?: number
  dueDay?: number
  lastFour?: string
  expiry?: string
  color: string
  bankId?: string | null
  isHidden: boolean
  position: number
  isFavorite: boolean
}

export function AccountCard({ a }: { a: AccountRow }) {
  const credit = a.type === 'CREDIT'
  const available = credit ? (a.creditLimit ?? 0) - a.balance : a.balance
  const bank = getBank(a.bankId)
  const FallbackIcon = credit ? CreditCard : Landmark
  const BankIcon = bank?.Icon
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-(--border) bg-(--card) p-4">
      <span
        className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl"
        style={{
          background: a.color,
          color: bank?.iconColor ?? '#ffffff',
        }}>
        {BankIcon ? (
          <BankIcon className="h-auto max-h-5 w-[75%]" aria-hidden />
        ) : (
          <FallbackIcon className="size-5" />
        )}
        {a.isFavorite && (
          <span
            aria-label="Cuenta favorita"
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-(--card) shadow">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {a.name}{' '}
          {a.lastFour && (
            <span className="text-(--muted-foreground)">· ·{a.lastFour}</span>
          )}{' '}
        </p>
        <p className="text-xs text-(--muted-foreground)">
          {a.expiry && (
            <span className="text-(--muted-foreground)">{a.expiry} · </span>
          )}
          {credit ? 'Crédito' : 'Débito'}
        </p>
        {credit && a.statementDay && a.dueDay && (
          <div className="mt-0.5 flex gap-1">
            <Badge variant="secondary" className="text-xs px-1">Corte {a.statementDay}</Badge>
            <Badge variant="secondary" className="text-xs px-1">Pago {a.dueDay}</Badge>
          </div>
        )}
      </div>
      <div className="text-right">
        <p className="text-base font-extrabold">
          {formatMoney(credit ? a.balance : available)}
        </p>
        <p className="text-[11px] text-(--muted-foreground)">
          {credit ? `Disponible ${formatMoney(available)}` : 'Saldo'}
        </p>
      </div>
    </div>
  )
}

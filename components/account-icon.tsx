import { CreditCard, Landmark } from 'lucide-react'

import { getBank } from '@/lib/banks'
import { cn } from '@/lib/utils'

/**
 * Icono de cuenta. Con `bankId` muestra el logo del banco dentro de un
 * distintivo con el color de la cuenta (funciona online y offline);
 * sin banco, el icono Lucide genérico teñido con el color.
 */
export function AccountIcon({
  type,
  color,
  bankId,
  className,
}: {
  type?: string
  color?: string | null
  bankId?: string | null
  className?: string
}) {
  const bank = getBank(bankId)
  if (bank) {
    const BankIcon = bank.Icon
    return (
      <span
        aria-hidden
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-xl',
          className,
        )}
        style={{ backgroundColor: color ?? bank.color, color: bank.iconColor }}>
        <BankIcon className="size-4 max-w-[75%]" />
      </span>
    )
  }
  const Icon = type === 'CREDIT' ? CreditCard : Landmark
  return (
    <Icon
      aria-hidden
      className={cn('size-5 shrink-0', className)}
      style={{ color: color ?? '#6366f1' }}
    />
  )
}

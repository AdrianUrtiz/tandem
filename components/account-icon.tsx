import { CreditCard, Landmark } from 'lucide-react'

import { getBank } from '@/lib/banks'
import { cn } from '@/lib/utils'

/**
 * Icono de cuenta dentro de un distintivo con el color de la cuenta
 * (funciona online y offline). Con `bankId` muestra el logo del banco;
 * sin banco, el icono Lucide genérico en blanco. Así todas las filas
 * de selectores se ven iguales.
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
  const bg = color ?? bank?.color ?? '#6366f1'
  const BankIcon = bank?.Icon
  const FallbackIcon = type === 'CREDIT' ? CreditCard : Landmark
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-xl',
        className,
      )}
      style={{ backgroundColor: bg, color: bank?.iconColor ?? '#ffffff' }}>
      {BankIcon ? (
        <BankIcon className="h-auto max-h-4 w-[75%]" />
      ) : (
        <FallbackIcon className="size-4" />
      )}
    </span>
  )
}

'use client'

import { Plus } from 'lucide-react'

import { useBottomNavHidden } from '@/components/use-bottom-nav-hidden'
import { cn } from '@/lib/utils'

/** Botón flotante de alta (misma posición y estilo que el FAB global). */
export function AddFab({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  const navHidden = useBottomNavHidden()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'fixed right-5 z-40 flex size-14 items-center justify-center rounded-full bg-(--primary) text-(--primary-foreground) shadow-2xl transition-all duration-300 active:scale-95',
        navHidden ? 'bottom-6' : 'bottom-20',
      )}>
      <Plus className="size-7" />
    </button>
  )
}

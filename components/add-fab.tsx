'use client'

import { Plus } from 'lucide-react'

/** Botón flotante de alta (misma posición y estilo que el FAB global). */
export function AddFab({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed right-5 bottom-20 z-40 flex size-14 items-center justify-center rounded-full bg-(--primary) text-(--primary-foreground) shadow-2xl transition active:scale-95">
      <Plus className="size-7" />
    </button>
  )
}

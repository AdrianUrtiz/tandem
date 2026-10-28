'use client'

import { useEffect, useState } from 'react'

import { ArrowUp } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/** Botón para volver arriba: aparece sobre el FAB al desplazar hacia abajo. */
export function ScrollTopButton() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setVisible(window.scrollY > 400)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Sin FAB propio (mismo criterio que `Fab`): ocupa su posición; con FAB
  // visible se muestra centrado sobre él. Lugares/categorías (AddFab) y el
  // detalle del grupo (FAB propio) sí tienen botón.
  const globalFabHidden =
    pathname.startsWith('/resumen') ||
    pathname.startsWith('/ajustes') ||
    pathname.startsWith('/cuentas/grupos')
  const hasOwnFab =
    (pathname.startsWith('/cuentas/grupos/') &&
      !pathname.endsWith('/integrantes')) ||
    pathname.startsWith('/ajustes/categorias') ||
    pathname.startsWith('/ajustes/lugares')
  const atFabSpot = globalFabHidden && !hasOwnFab

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Volver arriba"
      tabIndex={visible ? 0 : -1}
      className={cn(
        'fixed z-40 flex size-10 items-center justify-center rounded-full border border-(--border) bg-(--card)/95 text-(--foreground) shadow-xl backdrop-blur transition-all duration-300 active:scale-95',
        atFabSpot ? 'right-5 bottom-20' : 'right-7 bottom-37',
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0',
      )}>
      <ArrowUp className="size-4" />
    </button>
  )
}

'use client'

import { LayoutList, PieChart, User, Wallet } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useBottomNavHidden } from '@/components/use-bottom-nav-hidden'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/actividad', label: 'Actividad', icon: LayoutList },
  { href: '/resumen', label: 'Resumen', icon: PieChart },
  { href: '/cuentas', label: 'Cuentas', icon: Wallet },
  { href: '/ajustes', label: 'Perfil', icon: User },
]

export function BottomNav() {
  const pathname = usePathname()
  const hidden = useBottomNavHidden()

  return (
    <nav
      className={cn(
        'pb-safe fixed inset-x-0 bottom-0 z-40 px-4 pb-4 transition-transform duration-300',
        hidden && 'translate-y-[150%]',
      )}>
      <div className="mx-auto flex max-w-md items-center justify-around rounded-[1.75rem] border border-(--border) bg-(--card)/95 px-2 py-2 shadow-2xl backdrop-blur">
        {ITEMS.map((it) => {
          const active =
            pathname === it.href || pathname.startsWith(it.href + '/')
          const Icon = it.icon
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition',
                active
                  ? 'bg-(--primary)/15 text-(--foreground)'
                  : 'text-(--muted-foreground)',
              )}>
              <Icon className={cn('size-5', active && 'text-(--primary)')} />
              {it.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

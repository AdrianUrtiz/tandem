import {
  Cat,
  Dog,
  Ghost,
  Heart,
  Music,
  Rocket,
  Smile,
  Star,
  User,
} from 'lucide-react'

import { parseAvatar } from '@/lib/profile'
import { cn } from '@/lib/utils'

const ICONS: Record<string, typeof User> = {
  User,
  Smile,
  Star,
  Heart,
  Cat,
  Dog,
  Ghost,
  Rocket,
  Music,
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/** Círculo de avatar: iniciales o icono genérico sobre el color elegido. */
export function ProfileAvatar({
  name,
  avatar,
  size = 'md',
  className,
}: {
  name: string
  avatar?: string | null
  size?: 'md' | 'lg' | 'sm'
  className?: string
}) {
  const { color, icon } = parseAvatar(avatar)
  const Icon = icon === 'initials' ? null : (ICONS[icon] ?? User)
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-extrabold text-white',
        size === 'lg' && 'size-16 text-2xl',
        size === 'md' && 'size-11 text-base',
        size === 'sm' && 'size-8 text-xs',
        className,
      )}
      style={{ backgroundColor: color }}>
      {Icon ? <Icon className="size-1/2" /> : initialsOf(name)}
    </span>
  )
}

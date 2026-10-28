'use client'

import { useState } from 'react'

import {
  Cat,
  Check,
  Dog,
  Ghost,
  Heart,
  Music,
  Pencil,
  Rocket,
  Smile,
  Star,
  User,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { BottomSheet } from '@/components/bottom-sheet'
import { ProfileAvatar } from '@/components/profile-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { ACCOUNT_COLORS } from '@/lib/categories'
import { PROFILE_ICONS } from '@/lib/profile'
import { updateProfile } from '@/lib/profile-actions'
import { syncForce } from '@/lib/offline/useSnapshotSync'
import { cn } from '@/lib/utils'

const ICON_COMPONENTS: Record<string, typeof User> = {
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

const ICON_LABELS: Record<string, string> = {
  initials: 'Iniciales',
  User: 'Persona',
  Smile: 'Carita',
  Star: 'Estrella',
  Heart: 'Corazón',
  Cat: 'Gato',
  Dog: 'Perro',
  Ghost: 'Fantasma',
  Rocket: 'Cohete',
  Music: 'Música',
}

const AVATAR_COLORS = ACCOUNT_COLORS.slice(0, 12)

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/** Apartado de perfil: avatar, nombre y edición (requiere conexión). */
export function ProfileSection({
  name,
  username,
  avatar,
  online,
}: {
  name: string
  username?: string
  avatar?: string | null
  online: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [color, setColor] = useState(
    avatar?.split(':')[0] && /^#[0-9a-fA-F]{6}$/.test(avatar.split(':')[0]!)
      ? avatar.split(':')[0]!
      : '#6366f1',
  )
  const [icon, setIcon] = useState<string>(
    avatar?.split(':')[1] &&
      (PROFILE_ICONS as readonly string[]).includes(avatar.split(':')[1]!)
      ? avatar.split(':')[1]!
      : 'initials',
  )
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function openEditor() {
    setDraftName(name)
    const [c, i] = (avatar ?? '').split(':')
    if (c && /^#[0-9a-fA-F]{6}$/.test(c)) setColor(c)
    if (i && (PROFILE_ICONS as readonly string[]).includes(i)) setIcon(i)
    setMsg(null)
    setOpen(true)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setPending(true)
    const fd = new FormData()
    fd.set('name', draftName)
    fd.set('color', color)
    fd.set('icon', icon)
    const res = await updateProfile(fd)
    setPending(false)
    if ('error' in res && res.error) {
      setMsg(res.error)
      toast.error(res.error)
    } else {
      await syncForce().catch(() => {})
      setMsg(null)
      toast.success('Perfil actualizado')
      setOpen(false)
      router.refresh()
    }
  }

  const PreviewIcon =
    icon === 'initials' ? null : (ICON_COMPONENTS[icon] ?? User)

  return (
    <>
      <section className="flex w-full items-center gap-3 rounded-2xl border border-(--border) p-3">
        <ProfileAvatar name={name} avatar={avatar} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xl font-extrabold tracking-tight">
            {name}
          </span>
          {username && (
            <span className="block truncate text-xs font-medium text-(--muted-foreground) uppercase">
              @{username}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={openEditor}
          disabled={!online}
          title={online ? 'Editar perfil' : 'Sin conexión'}
          aria-label="Editar perfil"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--muted) transition active:scale-[.99] disabled:opacity-50">
          <Pencil className="size-5" />
        </button>
      </section>

      <BottomSheet open={open} onOpenChange={setOpen}>
        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6">
          <p className="text-center text-sm font-bold">Editar perfil</p>

          {/* Vista previa en vivo */}
          <div className="flex items-center gap-3 rounded-3xl bg-(--muted)/60 p-4">
            <span
              className="flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-extrabold text-white"
              style={{ backgroundColor: color }}>
              {PreviewIcon ? (
                <PreviewIcon className="size-8" />
              ) : (
                initialsOf(draftName.trim() || name)
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-extrabold">
                {draftName.trim() || name}
              </span>
              <span className="block text-xs text-(--muted-foreground)">
                {ICON_LABELS[icon] ?? icon}
              </span>
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Nombre</Label>
            <Input
              id="profile-name"
              name="name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Tu nombre"
              required
              maxLength={40}
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-3 rounded-3xl border border-(--border) p-4">
            <div className="flex items-baseline justify-between">
              <Label>Avatar</Label>
              <span className="text-xs font-semibold text-(--primary)">
                {ICON_LABELS[icon] ?? icon}
              </span>
            </div>
            <div className="grid grid-cols-5 justify-items-center gap-2.5">
              {PROFILE_ICONS.map((key) => {
                const Cmp =
                  key === 'initials' ? null : (ICON_COMPONENTS[key] ?? User)
                const active = icon === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    title={ICON_LABELS[key] ?? key}
                    aria-label={ICON_LABELS[key] ?? key}
                    aria-pressed={active}
                    className={cn(
                      'flex size-13 items-center justify-center rounded-full text-base font-extrabold text-white ring-offset-2 ring-offset-(--background) transition active:scale-95',
                      active
                        ? 'ring-2 ring-(--primary)'
                        : 'ring-1 ring-black/10 hover:ring-2 hover:ring-(--muted-foreground)/40',
                    )}
                    style={{ backgroundColor: color }}>
                    {Cmp ? (
                      <Cmp className="size-5" />
                    ) : (
                      initialsOf(draftName.trim() || name)
                    )}
                  </button>
                )
              })}
            </div>

            <hr className="border-(--border)/60" />

            <div className="flex items-baseline justify-between">
              <Label>Color</Label>
            </div>
            <div className="grid grid-cols-6 justify-items-center gap-2.5">
              {AVATAR_COLORS.map((hex) => {
                const active = color.toLowerCase() === hex
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setColor(hex)}
                    aria-label={`Color ${hex}`}
                    aria-pressed={active}
                    className={cn(
                      'flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-(--background) transition active:scale-95',
                      active
                        ? 'ring-2 ring-(--foreground)'
                        : 'ring-1 ring-black/10 hover:ring-2 hover:ring-(--muted-foreground)/40',
                    )}
                    style={{ backgroundColor: hex }}>
                    {active && <Check className="size-4 text-white" />}
                  </button>
                )
              })}
            </div>
          </div>

          {msg && (
            <p className="text-center text-sm font-medium text-red-500">
              {msg}
            </p>
          )}
          <Button
            type="submit"
            className="h-12 w-full rounded-2xl text-base"
            disabled={pending || draftName.trim().length === 0}>
            {pending ? 'Guardando…' : 'Guardar perfil'}
          </Button>
        </form>
      </BottomSheet>
    </>
  )
}

'use client'

import { useState } from 'react'

import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type { CatalogRow } from '@/lib/catalog'
import { CATEGORY_COLORS, ICONS, ICON_PRESETS } from '@/lib/categories'
import { createCategory } from '@/lib/category-actions'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { syncForce } from '@/lib/offline/useSnapshotSync'
import { cn } from '@/lib/utils'

/** Colores visibles antes de expandir el acordeón (2 filas de 8). */
const VISIBLE_COLORS = 16
/** Iconos visibles antes de expandir el acordeón (3 filas de 6). */
const VISIBLE_ICONS = 18

export type CreatedCategory = Pick<
  CatalogRow,
  'id' | 'code' | 'name' | 'iconName' | 'color' | 'kind'
>

/**
 * Campos para crear una categoría (icono + color + nombre), con el diseño
 * del formulario de movimiento en actividad: iconos en wrap, paleta en dos
 * filas con acordeón para verla completa, nombre y botón de crear.
 */
export function NewCategoryFields({
  kind,
  onCreated,
}: {
  kind: 'expense' | 'income'
  onCreated: (category: CreatedCategory) => void
}) {
  const online = useOnlineStatus()
  const [iconName, setIconName] = useState<string>(ICON_PRESETS[0]!)
  const [color, setColor] = useState<string>('#fb923c')
  const [name, setName] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [iconsExpanded, setIconsExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!online) {
      setError('Conéctate para crear categorías')
      return
    }
    if (name.trim().length < 2) {
      setError('La categoría necesita al menos 2 letras')
      return
    }
    setSaving(true)
    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('iconName', iconName)
    fd.set('color', color)
    fd.set('kind', kind)
    const res = await createCategory(fd)
    setSaving(false)
    if ('error' in res && res.error) {
      setError(res.error)
      return
    }
    if ('category' in res && res.category) {
      const c = res.category
      toast.success('Categoría creada')
      void syncForce()
      setName('')
      setError(null)
      setExpanded(false)
      setIconsExpanded(false)
      onCreated({
        id: c.id,
        code: c.code,
        name: c.name,
        iconName: c.iconName,
        color: c.color,
        kind: c.kind as CreatedCategory['kind'],
      })
    }
  }

  function iconButton(preset: string, tabbable: boolean) {
    const Icon = ICONS[preset] ?? ICONS.Shapes
    return (
      <button
        key={preset}
        type="button"
        onClick={() => setIconName(preset)}
        aria-label={preset}
        tabIndex={tabbable ? 0 : -1}
        className={cn(
          'flex aspect-square w-full items-center justify-center rounded-2xl border',
          iconName === preset
            ? 'border-(--primary) bg-(--primary)/10'
            : 'border-(--border)',
        )}>
        <Icon className="size-5" style={{ color }} />
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="grid grid-cols-6 gap-2">
          {ICON_PRESETS.slice(0, VISIBLE_ICONS).map((preset) =>
            iconButton(preset, true),
          )}
        </div>
        <div
          className={cn(
            'grid transition-all duration-300 ease-in-out',
            iconsExpanded
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0',
          )}>
          <div className="overflow-hidden">
            <div className="grid grid-cols-6 gap-2 pt-2">
              {ICON_PRESETS.slice(VISIBLE_ICONS).map((preset) =>
                iconButton(preset, iconsExpanded),
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIconsExpanded((v) => !v)}
          aria-expanded={iconsExpanded}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-full border border-(--border) bg-(--muted)/60 py-1.5 text-xs font-semibold text-(--muted-foreground) transition active:scale-[.98]">
          {iconsExpanded
            ? 'Ver menos'
            : `Ver más (${ICON_PRESETS.length - VISIBLE_ICONS})`}
          <ChevronDown
            className={cn(
              'size-4 transition-transform duration-300',
              iconsExpanded && 'rotate-180',
            )}
          />
        </button>
      </div>
      <div>
        <div className="grid grid-cols-8 gap-2">
          {CATEGORY_COLORS.slice(0, VISIBLE_COLORS).map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setColor(hex)}
              aria-label={`Color ${hex}`}
              className={cn(
                'flex size-8 items-center justify-center rounded-full border-2 ring-1 ring-black/10 ring-inset',
                color === hex ? 'border-(--foreground)' : 'border-transparent',
              )}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
        <div
          className={cn(
            'grid transition-all duration-300 ease-in-out',
            expanded
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0',
          )}>
          <div className="overflow-hidden">
            <div className="grid grid-cols-8 gap-2 pt-2">
              {CATEGORY_COLORS.slice(VISIBLE_COLORS).map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  aria-label={`Color ${hex}`}
                  tabIndex={expanded ? 0 : -1}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border-2 ring-1 ring-black/10 ring-inset',
                    color === hex
                      ? 'border-(--foreground)'
                      : 'border-transparent',
                  )}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-full border border-(--border) bg-(--muted)/60 py-1.5 text-xs font-semibold text-(--muted-foreground) transition active:scale-[.98]">
          {expanded
            ? 'Ver menos'
            : `Ver más (${CATEGORY_COLORS.length - VISIBLE_COLORS})`}
          <ChevronDown
            className={cn(
              'size-4 transition-transform duration-300',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </div>
      <Input
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          if (error) setError(null)
        }}
        placeholder="Nombre (ej. Videojuegos)"
        maxLength={30}
      />
      {error && (
        <p className="text-center text-sm font-medium text-red-500">{error}</p>
      )}
      <Button type="button" className="w-full" onClick={save} disabled={saving}>
        {saving ? 'Creando…' : 'Crear categoría'}
      </Button>
    </div>
  )
}

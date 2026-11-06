'use client'

import { useState } from 'react'

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Star } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { AccountRow } from '@/components/account-card'
import { AccountIcon } from '@/components/account-icon'
import { Button } from '@/components/ui/button'
import { useBottomNavHidden } from '@/components/use-bottom-nav-hidden'

import { reorderAccounts } from '@/lib/actions'
import { syncForce } from '@/lib/offline/useSnapshotSync'
import { cn } from '@/lib/utils'

type ContainerId = 'visible' | 'hidden'

function SortableRow({ a, dimmed }: { a: AccountRow; dimmed?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: a.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 rounded-3xl border border-(--border) bg-(--card) p-3 pr-4',
        dimmed && 'opacity-60',
        isDragging && 'z-10 opacity-100 shadow-xl ring-2 ring-(--primary)',
      )}>
      <button
        type="button"
        aria-label={`Arrastrar ${a.name}`}
        {...attributes}
        {...listeners}
        className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-(--muted-foreground) active:cursor-grabbing">
        <GripVertical className="size-5" />
      </button>
      <AccountIcon type={a.type} color={a.color} bankId={a.bankId} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {a.name}
      </span>
      <span className="shrink-0 text-[11px] text-(--muted-foreground)">
        {dimmed ? 'Oculta' : a.type === 'CREDIT' ? 'Crédito' : 'Débito'}
      </span>
    </li>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: ContainerId
  title: string
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <section ref={setNodeRef} className="space-y-2">
      <p className="text-xs font-semibold text-(--muted-foreground)">{title}</p>
      {children}
    </section>
  )
}

/**
 * Modo reordenar: la favorita queda fija arriba (siempre primera y visible)
 * y el resto se arrastra entre Visibles y Ocultas. Soltar en Ocultas oculta
 * la cuenta; soltar en Visibles la muestra, en la posición elegida. En
 * táctil se arrastra manteniendo presionado el handle para no pelear con
 * el scroll.
 */
export function AccountsReorder({
  accounts,
  hiddenAccounts = [],
  onClose,
}: {
  accounts: AccountRow[]
  hiddenAccounts?: AccountRow[]
  onClose: () => void
}) {
  const router = useRouter()
  const favorite = accounts.find((a) => a.isFavorite) ?? null
  const [lists, setLists] = useState<Record<ContainerId, string[]>>(() => ({
    visible: accounts.filter((a) => a.id !== favorite?.id).map((a) => a.id),
    hidden: hiddenAccounts.filter((a) => a.id !== favorite?.id).map((a) => a.id),
  }))
  const [saving, setSaving] = useState(false)
  const navHidden = useBottomNavHidden()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
  )

  const byId = new Map([...accounts, ...hiddenAccounts].map((a) => [a.id, a]))

  function containerOf(id: string): ContainerId | undefined {
    if (id === 'visible' || id === 'hidden') return id
    if (lists.visible.includes(id)) return 'visible'
    if (lists.hidden.includes(id)) return 'hidden'
    return undefined
  }

  // Cambio de sección: mueve el item a la otra lista (en la posición
  // soltada, o al final si se suelta sobre la sección vacía).
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return
    const from = containerOf(activeId)
    const to = containerOf(overId)
    if (!from || !to || from === to) return
    setLists((prev) => {
      if (!prev[from].includes(activeId)) return prev
      const nextFrom = prev[from].filter((id) => id !== activeId)
      const nextTo = [...prev[to]]
      const overIndex = nextTo.indexOf(overId)
      nextTo.splice(overIndex === -1 ? nextTo.length : overIndex, 0, activeId)
      return { ...prev, [from]: nextFrom, [to]: nextTo }
    })
  }

  // Reorden dentro de la misma sección.
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return
    const from = containerOf(activeId)
    const to = containerOf(overId)
    if (!from || !to || from !== to) return
    setLists((prev) => {
      const list = prev[from]
      const a = list.indexOf(activeId)
      const b = list.indexOf(overId)
      if (a === -1 || b === -1) return prev
      return { ...prev, [from]: arrayMove(list, a, b) }
    })
  }

  const visibleRows = lists.visible
    .map((id) => byId.get(id))
    .filter((a): a is AccountRow => Boolean(a))
  const hiddenRows = lists.hidden
    .map((id) => byId.get(id))
    .filter((a): a is AccountRow => Boolean(a))
  const total = (favorite ? 1 : 0) + visibleRows.length + hiddenRows.length

  async function save() {
    setSaving(true)
    const res = await reorderAccounts({
      visibleIds: lists.visible,
      hiddenIds: lists.hidden,
    })
    if ('error' in res && res.error) {
      setSaving(false)
      toast.error(res.error)
      return
    }
    await syncForce()
    setSaving(false)
    toast.success('Orden guardado')
    onClose()
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <p className="-mt-1 text-[11px] text-(--muted-foreground)">
        Mantén presionado ⠿ y arrastra para ordenar o para ocultar/mostrar
      </p>
      {favorite && (
        <div className="flex items-center gap-3 rounded-3xl border border-amber-500/30 bg-amber-500/[0.07] p-3 pr-4">
          <span className="flex size-9 shrink-0 items-center justify-center">
            <Star className="size-5 fill-amber-400 text-amber-400" />
          </span>
          <AccountIcon
            type={favorite.type}
            color={favorite.color}
            bankId={favorite.bankId}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {favorite.name}
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-amber-500">
            Favorita
          </span>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}>
        <Section title={`Visibles · ${visibleRows.length}`} id="visible">
          <SortableContext
            items={lists.visible}
            strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {visibleRows.map((a) => (
                <SortableRow key={a.id} a={a} />
              ))}
            </ul>
          </SortableContext>
          {visibleRows.length === 0 && (
            <p className="rounded-3xl border border-dashed border-red-500/40 p-6 text-center text-sm text-(--muted-foreground)">
              Arrastra aquí para mostrar · debe quedar al menos una visible
            </p>
          )}
        </Section>
        <Section title={`Ocultas · ${hiddenRows.length}`} id="hidden">
          <SortableContext
            items={lists.hidden}
            strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {hiddenRows.map((a) => (
                <SortableRow key={a.id} a={a} dimmed />
              ))}
            </ul>
          </SortableContext>
          {hiddenRows.length === 0 && (
            <p className="rounded-3xl border border-dashed border-(--border) p-6 text-center text-sm text-(--muted-foreground)">
              Arrastra aquí para ocultar
            </p>
          )}
        </Section>
      </DndContext>
      {total < 2 && (
        <p className="rounded-3xl border border-dashed border-(--border) p-6 text-center text-sm text-(--muted-foreground)">
          Agrega otra cuenta para poder ordenar.
        </p>
      )}
      <div
        className={cn(
          'fixed inset-x-0 z-30 transition-[bottom] duration-300',
          navHidden ? 'bottom-6' : 'bottom-20',
        )}>
        <div className="mx-auto w-full max-w-md px-5">
          <div className="flex gap-2 rounded-3xl border border-(--border) bg-(--card)/95 p-2 shadow-xl backdrop-blur">
        <Button
          type="button"
          variant="secondary"
          className="h-12 flex-1 rounded-2xl"
          onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          className="h-12 flex-1 rounded-2xl"
          disabled={saving || total < 2 || visibleRows.length === 0}
          onClick={save}>
          {saving ? 'Guardando…' : 'Guardar orden'}
        </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

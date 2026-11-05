'use client'

import { useState } from 'react'

import { Pencil, Trash2, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { AddFab } from '@/components/add-fab'
import { BottomSheet } from '@/components/bottom-sheet'
import {
  type CompanionEditData,
  CompanionForm,
} from '@/components/companion-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { syncForce } from '@/lib/offline/useSnapshotSync'
import { deleteCompanion } from '@/lib/companion-actions'
import {
  type CompanionRow,
  companionKey,
} from '@/lib/companion-format'

function lastUsedLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  if (sameDay) return 'hoy'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export function CompanionManager({ companions }: { companions: CompanionRow[] }) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<CompanionEditData | null>(null)
  const [deleting, setDeleting] = useState<CompanionRow | null>(null)
  const [busy, setBusy] = useState(false)

  async function remove() {
    if (!deleting) return
    setBusy(true)
    const res = await deleteCompanion(deleting.name)
    if ('error' in res && res.error) {
      setBusy(false)
      toast.error(res.error)
    } else {
      await syncForce()
      setBusy(false)
      setDeleting(null)
      toast.success('Amigo eliminado')
      router.refresh()
    }
  }

  return (
    <div className="space-y-5 px-5 pt-4 pb-28">
      <div>
        <p className="text-xs font-medium text-(--muted-foreground)">
          Mis amigos
        </p>
        <p className="text-4xl font-extrabold tracking-tight">
          {companions.length}
        </p>
      </div>

      <section className="space-y-2">
        {companions.length === 0 && (
          <p className="rounded-3xl border border-dashed border-(--border) p-8 text-center text-sm text-(--muted-foreground)">
            Aún no tienes amigos. Se guardan solos al escribirlos en un gasto
            en grupo.
          </p>
        )}
        {companions.map((c) => (
          <div
            key={c.name}
            className="flex items-center gap-3 rounded-3xl border border-(--border) bg-(--card) p-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-(--muted)">
              <User className="size-5 text-(--muted-foreground)" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{c.name}</p>
              <p className="text-xs text-(--muted-foreground)">
                Último uso {lastUsedLabel(c.lastUsedAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                aria-label={`Editar ${c.name}`}
                onClick={() =>
                  setEditing({ key: companionKey(c.name), name: c.name })
                }
                className="rounded-full p-2 text-(--muted-foreground) hover:bg-(--muted) hover:text-(--foreground)">
                <Pencil className="size-4" />
              </button>
              <button
                aria-label={`Eliminar ${c.name}`}
                onClick={() => setDeleting(c)}
                className="rounded-full p-2 text-(--muted-foreground) hover:bg-(--muted) hover:text-red-500">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </section>

      <p className="text-center text-[11px] text-(--muted-foreground)">
        Editar o eliminar solo afecta sugerencias futuras: tus gastos
        conservan sus nombres.
      </p>

      <AddFab label="Agregar amigo" onClick={() => setAddOpen(true)} />

      <BottomSheet open={addOpen} onOpenChange={setAddOpen}>
        <CompanionForm onDone={() => setAddOpen(false)} />
      </BottomSheet>

      <BottomSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <CompanionForm
            key={editing.key}
            initial={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </BottomSheet>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar {deleting?.name}?</DialogTitle>
            <DialogDescription>
              Dejará de sugerirse en tus gastos en grupo. Tus gastos guardados
              no cambian.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={busy}
              onClick={remove}>
              {busy ? 'Eliminando…' : 'Sí, eliminar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { syncForce } from '@/lib/offline/useSnapshotSync'
import { createPlace, renamePlace } from '@/lib/place-actions'
import { PLACE_MAX_LEN } from '@/lib/place-format'

export type PlaceEditData = { key: string; name: string }

export function PlaceForm({
  initial,
  onDone,
}: {
  initial?: PlaceEditData
  onDone?: () => void
}) {
  const editing = Boolean(initial)
  const [name, setName] = useState(initial?.name ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (name.trim().length < 2) {
      setMsg('Nombre muy corto')
      return
    }
    setMsg(null)
    setPending(true)
    const fd = new FormData()
    if (editing) fd.set('key', initial!.key)
    fd.set('name', name.trim())
    const res = editing ? await renamePlace(fd) : await createPlace(fd)
    if ('error' in res && res.error) {
      setPending(false)
      setMsg(res.error)
      toast.error(res.error)
    } else {
      await syncForce()
      setPending(false)
      setMsg(null)
      toast.success(editing ? 'Lugar actualizado' : 'Lugar creado')
      onDone?.()
      router.refresh()
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6">
      {editing && <input type="hidden" name="key" value={initial!.key} />}

      <div className="space-y-1.5">
        <Label htmlFor="place-name">Nombre del lugar</Label>
        <Input
          id="place-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Abarrotes Arenas"
          maxLength={PLACE_MAX_LEN}
          required
          autoComplete="off"
          className="h-12 text-base"
        />
      </div>
      {editing && (
        <p className="text-center text-[11px] text-(--muted-foreground)">
          Solo aplica a futuro: tus movimientos guardados conservan el texto
          anterior.
        </p>
      )}

      {msg && (
        <p className="text-center text-sm font-medium text-red-500">{msg}</p>
      )}
      <Button
        type="submit"
        className="h-12 w-full rounded-2xl text-base"
        disabled={pending}>
        {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear lugar'}
      </Button>
    </form>
  )
}

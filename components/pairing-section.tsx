'use client'

import { useState } from 'react'

import {
  Check,
  ChevronRight,
  Copy,
  HeartHandshake,
  Link2,
  Unlink,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  type PairingState,
  acceptPairing,
  cancelPairing,
  getPairingState,
  rejectPairing,
  requestPairing,
  unlinkCouple,
} from '@/lib/couple-actions'
import { cn } from '@/lib/utils'

/** Perfil > Pareja: fila compacta; el detalle vive en un BottomSheet. */
export function PairingSection({ initial }: { initial: PairingState | null }) {
  const [state, setState] = useState<PairingState | null>(initial)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const [open, setOpen] = useState(false)

  async function refresh() {
    const res = await getPairingState()
    if ('error' in res) {
      toast.error(res.error)
    } else {
      setState({
        pairCode: res.pairCode,
        partner: res.partner,
        householdId: res.householdId,
        sent: res.sent,
        received: res.received,
      })
    }
  }

  async function run(fn: () => Promise<{ error?: string }>, okMsg?: string) {
    setBusy(true)
    try {
      const res = await fn()
      if ('error' in res && res.error) toast.error(res.error)
      else {
        if (okMsg) toast.success(okMsg)
        await refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  const pendingCount =
    (state?.received.length ?? 0) + (state?.sent.length ?? 0)
  const subtitle = !state
    ? 'Conéctate para ver tu código de vínculo'
    : state.partner
      ? `Vinculado con ${state.partner.name}`
      : state.received.length > 0
        ? `${state.received.length} ${state.received.length === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}`
        : 'Comparte gastos y suscripciones'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-(--border) p-3 text-left transition active:scale-[.99]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--muted)">
          <HeartHandshake className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            Pareja
            {pendingCount > 0 && !state?.partner && (
              <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-extrabold text-white">
                {pendingCount}
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-(--muted-foreground)">
            {subtitle}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-(--muted-foreground)" />
      </button>

      <BottomSheet open={open} onOpenChange={setOpen}>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6">
          <p className="text-center text-sm font-bold">Pareja</p>
          {!state ? (
            <p className="py-4 text-center text-sm text-(--muted-foreground)">
              Conéctate para ver tu código de vínculo.
            </p>
          ) : (
            <PairingBody
              state={state}
              code={code}
              setCode={setCode}
              busy={busy}
              run={run}
              confirmUnlink={confirmUnlink}
              setConfirmUnlink={setConfirmUnlink}
            />
          )}
        </div>
      </BottomSheet>
    </>
  )
}

function PairingBody({
  state,
  code,
  setCode,
  busy,
  run,
  confirmUnlink,
  setConfirmUnlink,
}: {
  state: PairingState
  code: string
  setCode: (v: string) => void
  busy: boolean
  run: (fn: () => Promise<{ error?: string }>, okMsg?: string) => Promise<void>
  confirmUnlink: boolean
  setConfirmUnlink: (v: boolean) => void
}) {
  return (
    <>
      {/* Mi código: solo sin vínculo (vinculado ya no se necesita). */}
      {!state.partner && (
        <div className="flex items-center gap-2 rounded-2xl bg-(--muted) p-3">
          <span className="flex-1 text-center text-lg font-extrabold tracking-widest">
            {state.pairCode}
          </span>
          <button
            type="button"
            aria-label="Copiar mi código"
            onClick={() => {
              void navigator.clipboard?.writeText(state.pairCode)
              toast.success('Código copiado')
            }}
            className="flex size-9 items-center justify-center rounded-xl bg-(--card) shadow transition active:scale-95">
            <Copy className="size-4" />
          </button>
        </div>
      )}

      {state.partner ? (
        <>
          <p className="text-center text-sm">
            Vinculado con <b>{state.partner.name}</b>
          </p>
          {!confirmUnlink ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setConfirmUnlink(true)}>
              <Unlink className="size-4" /> Desvincular pareja
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  run(() => unlinkCouple(), 'Pareja desvinculada')
                }>
                Confirmar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmUnlink(false)}>
                Cancelar
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Solicitudes recibidas */}
          {state.received.length > 0 && (
            <div className="space-y-2">
              {state.received.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-2xl border border-emerald-500/40 p-3">
                  <span className="min-w-0 flex-1 text-sm">
                    <b>{r.fromName}</b> quiere vincularse
                  </span>
                  <button
                    type="button"
                    aria-label={`Aceptar a ${r.fromName}`}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => acceptPairing(r.id),
                        `Vinculado con ${r.fromName}`,
                      )
                    }
                    className="flex size-9 items-center justify-center rounded-xl bg-emerald-500 text-white transition active:scale-95 disabled:opacity-50">
                    <Check className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Rechazar a ${r.fromName}`}
                    disabled={busy}
                    onClick={() => run(() => rejectPairing(r.id))}
                    className="flex size-9 items-center justify-center rounded-xl bg-(--muted) transition active:scale-95 disabled:opacity-50">
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Solicitudes enviadas */}
          {state.sent.length > 0 && (
            <div className="space-y-2">
              {state.sent.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-2xl border border-dashed border-(--border) p-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    Esperando a <b>{s.toName}</b>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => cancelPairing(s.id))}
                    className="text-[11px] font-semibold text-red-500 disabled:opacity-50">
                    Cancelar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pegar código */}
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!code.trim()) return
              void run(() => requestPairing(code), 'Solicitud enviada').then(
                () => setCode(''),
              )
            }}>
            <Label htmlFor="pair-code">Pega el código de tu pareja</Label>
            <div className="flex gap-2">
              <Input
                id="pair-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Q-XXXXXX"
                autoComplete="off"
                className={cn('flex-1 uppercase')}
              />
              <Button type="submit" disabled={busy || !code.trim()}>
                <Link2 className="size-4" /> Vincular
              </Button>
            </div>
            <p className="text-xs text-(--muted-foreground)">
              Tu pareja lo acepta desde su Perfil. Sin aceptación no se
              comparte nada.
            </p>
          </form>
        </>
      )}
    </>
  )
}

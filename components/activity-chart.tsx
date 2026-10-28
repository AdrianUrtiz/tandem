'use client'

import { useMemo, useRef } from 'react'

import { formatMoney } from '@/lib/utils'

export type Bucket = { label: string; total: number }

/** Barras diarias genéricas: sirve para un mes o para un rango (7/90/180/365 días). */
export function ActivityChart({
  buckets,
  todayIndex,
  selected,
  onSelect,
  onSwipe,
}: {
  buckets: Bucket[]
  todayIndex?: number | null
  selected: number | null
  onSelect: (i: number | null) => void
  /** dir 1 = siguiente (swipe a la izquierda), -1 = anterior. */
  onSwipe?: (dir: 1 | -1) => void
}) {
  const sel = selected
  const n = buckets.length
  const max = Math.max(0, ...buckets.map((b) => b.total))
  const peakIdx = buckets.findIndex((b) => max > 0 && b.total === max)

  const ticks = useMemo(() => {
    if (n <= 1) return [0]
    const pts = new Set<number>([0, n - 1])
    for (let i = 1; i < 4; i++) pts.add(Math.round(((n - 1) * i) / 4))
    return [...pts].sort((a, b) => a - b)
  }, [n])

  const gap = n > 120 ? 'gap-0' : n > 31 ? 'gap-px' : 'gap-[3px]'
  const barW = n > 31 ? 'w-full' : 'w-full max-w-3'

  // Swipe horizontal para cambiar de mes/periodo. No usa preventDefault
  // para no bloquear el scroll vertical; solo dispara si predomina X.
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const suppressRef = useRef(false)

  function swipeEnd(x: number, y: number) {
    const s = startRef.current
    startRef.current = null
    if (!s || !onSwipe) return
    const dx = x - s.x
    const dy = y - s.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      suppressRef.current = true
      onSwipe(dx < 0 ? 1 : -1)
    }
  }

  return (
    <div>
      <div className="flex h-8 items-center justify-center">
        {sel != null && buckets[sel] ? (
          <button
            onClick={() => onSelect(null)}
            className="rounded-full bg-(--foreground) px-4 py-1.5 text-xs font-semibold text-(--background)">
            {buckets[sel].label} · {formatMoney(buckets[sel].total)} ✕
          </button>
        ) : (
          <span className="text-xs font-semibold text-(--muted-foreground)">
            {peakIdx >= 0 && buckets[peakIdx]
              ? `Pico: ${buckets[peakIdx].label} · ${formatMoney(max)}`
              : 'Sin gastos en el periodo'}
          </span>
        )}
      </div>
      <div
        className={`flex h-28 touch-pan-y items-stretch select-none ${gap}`}
        role="img"
        aria-label="Gastos por día"
        onTouchStart={(e) => {
          const t = e.touches[0]
          startRef.current = { x: t.clientX, y: t.clientY }
          suppressRef.current = false
        }}
        onTouchMove={(e) => {
          const s = startRef.current
          if (!s) return
          const t = e.touches[0]
          if (Math.abs(t.clientX - s.x) > 24) suppressRef.current = true
        }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0]
          swipeEnd(t.clientX, t.clientY)
        }}
        onMouseDown={(e) => {
          startRef.current = { x: e.clientX, y: e.clientY }
          suppressRef.current = false
        }}
        onMouseUp={(e) => swipeEnd(e.clientX, e.clientY)}>
        {buckets.map((b, i) => {
          const active = sel === i
          const isPeak = peakIdx === i
          return (
            <button
              key={i}
              onClick={() => {
                if (suppressRef.current) {
                  suppressRef.current = false
                  return
                }
                onSelect(sel === i ? null : i)
              }}
              aria-label={`${b.label}: ${formatMoney(b.total)}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1 py-0.5">
              <div
                className={`bar-anim ${barW} rounded-full ${
                  active
                    ? 'bg-(--foreground)'
                    : isPeak
                      ? 'bg-(--primary)'
                      : 'bg-(--primary)/50'
                }`}
                style={{
                  height: `${b.total > 0 ? Math.max(4, (b.total / Math.max(1, max)) * 100) : 2}%`,
                  opacity: b.total > 0 ? 1 : 0.35,
                }}
              />
              {todayIndex === i ? (
                <span className="size-1 rounded-full bg-(--foreground)" />
              ) : (
                <span className="size-1" />
              )}
            </button>
          )
        })}
      </div>

      <div className="relative mt-1 h-4 text-[10px] text-(--muted-foreground)">
        {ticks.map((i) => (
          <span
            key={i}
            className="absolute max-w-18 -translate-x-1/2 truncate"
            style={{ left: `${((i + 0.5) / Math.max(1, n)) * 100}%` }}>
            {buckets[i]?.label}
          </span>
        ))}
      </div>
    </div>
  )
}

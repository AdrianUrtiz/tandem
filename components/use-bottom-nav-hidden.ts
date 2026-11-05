'use client'

import { useSyncExternalStore } from 'react'

let hidden = false
const listeners = new Set<() => void>()
let lastY = 0
let ticking = false
let listening = false

function emit() {
  for (const l of listeners) l()
}

function handleScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    const y = window.scrollY
    const dy = y - lastY
    if (y <= 80) {
      if (hidden) {
        hidden = false
        emit()
      }
    } else if (dy > 6) {
      if (!hidden) {
        hidden = true
        emit()
      }
    } else if (dy < -6) {
      if (hidden) {
        hidden = false
        emit()
      }
    }
    lastY = y
    ticking = false
  })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  if (typeof window !== 'undefined' && !listening) {
    listening = true
    lastY = window.scrollY
    window.addEventListener('scroll', handleScroll, { passive: true })
  }
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && typeof window !== 'undefined' && listening) {
      listening = false
      window.removeEventListener('scroll', handleScroll)
    }
  }
}

function getSnapshot() {
  return hidden
}

function getServerSnapshot() {
  return false
}

/** `true` cuando el bottom menu está oculto por scroll hacia abajo. */
export function useBottomNavHidden() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

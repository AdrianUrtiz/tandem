import { create } from 'zustand'

import { mexicoMonthKey } from '@/lib/walltime'

export type ActivityRange =
  'mensual' | 'semanal' | 'trimestral' | 'seis' | 'anio' | 'todo'
export type ActivityKind = 'gastos' | 'ingresos' | 'todos'

type ActivityFiltersState = {
  /** Mes en formato YYYY-MM. Solo aplica cuando range === 'mensual'. */
  month: string
  kind: ActivityKind
  range: ActivityRange
  account: string
  category: string
  /** Lugar ('todos' = sin filtrar). Se compara contra el sufijo del concepto. */
  place: string
  setMonth: (month: string) => void
  setKind: (kind: ActivityKind) => void
  setRange: (range: ActivityRange) => void
  setAccount: (account: string) => void
  setCategory: (category: string) => void
  setPlace: (place: string) => void
}

function currentMonthKey() {
  return mexicoMonthKey()
}

export const useActivityFilters = create<ActivityFiltersState>()((set) => ({
  month: currentMonthKey(),
  kind: 'todos',
  range: 'mensual',
  account: 'todas',
  category: 'todas',
  place: 'todos',
  setMonth: (month) => set({ month }),
  setKind: (kind) => set({ kind }),
  setRange: (range) => set({ range }),
  setAccount: (account) => set({ account }),
  setCategory: (category) => set({ category }),
  setPlace: (place) => set({ place }),
}))

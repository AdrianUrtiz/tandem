import { create } from 'zustand'

import { mexicoMonthKey } from '@/lib/walltime'

type CuentasFiltersState = {
  /** Tab activa de Cuentas. */
  tab: string
  /** Tab Cuentas: orden + tipo/estado. */
  accSort: string
  accType: string
  /** Tab Pareja: mes seleccionado en formato YYYY-MM. */
  partnerMonth: string
  /** Tab Compartidos: 'pending' = solo con saldo por pagar (default), 'all' = todos. */
  partnerState: string
  /** Tab Compartidos: quién debe — 'all' (default), 'partner' (pareja) o 'external' (otras personas). */
  partnerWho: string
  setTab: (tab: string) => void
  setAccSort: (v: string) => void
  setAccType: (v: string) => void
  setPartnerMonth: (month: string) => void
  setPartnerState: (v: string) => void
  setPartnerWho: (v: string) => void
}

function currentMonthKey() {
  return mexicoMonthKey()
}

export const useCuentasFilters = create<CuentasFiltersState>()((set) => ({
  tab: 'mias',
  accSort: 'default',
  accType: 'all',
  partnerMonth: currentMonthKey(),
  partnerState: 'pending',
  partnerWho: 'all',
  setTab: (tab) => set({ tab }),
  setAccSort: (accSort) => set({ accSort }),
  setAccType: (accType) => set({ accType }),
  setPartnerMonth: (partnerMonth) => set({ partnerMonth }),
  setPartnerState: (partnerState) => set({ partnerState }),
  setPartnerWho: (partnerWho) => set({ partnerWho }),
}))

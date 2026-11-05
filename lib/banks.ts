import type { ComponentType, SVGProps } from 'react'

import { Landmark } from 'lucide-react'

import {
  BBVA,
  BanCoppel,
  Banamex,
  Banorte,
  HSBC,
  Santander,
  Scotiabank,
} from '@/components/icons'

export type BankIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string
}
export type BankIcon = ComponentType<BankIconProps>

export interface Bank {
  /** Identificador estable (ej. 'bbva'). Se guarda tal cual si agregas columna bankId. */
  id: string
  /** Nombre a mostrar en el selector y sugerir en el nombre de la cuenta. */
  name: string
  /** Color de fondo predeterminado de la tarjeta. El usuario puede cambiarlo. */
  color: string
  /**
   * Color del logo. Los iconos usan `fill="currentColor"`, así que se aplica con
   * `style={{ color: bank.iconColor }}`.
   */
  iconColor: string
  /** Logo del banco (componente de `@/components/icons`). */
  Icon: BankIcon
}

export const BANKS: Bank[] = [
  {
    id: 'bbva',
    name: 'BBVA',
    color: '#001391',
    iconColor: '#ffffff',
    Icon: BBVA,
  },
  {
    id: 'santander',
    name: 'Santander',
    color: '#FB2323',
    iconColor: '#ffffff',
    Icon: Santander,
  },
  {
    id: 'banorte',
    name: 'Banorte',
    color: '#EB0029',
    iconColor: '#ffffff',
    Icon: Banorte,
  },
  {
    id: 'banamex',
    name: 'Banamex',
    color: '#ED1C24',
    iconColor: '#ffffff',
    Icon: Banamex,
  },
  {
    id: 'hsbc',
    name: 'HSBC',
    color: '#FFFFFF',
    iconColor: '#DA0011',
    Icon: HSBC,
  },
  {
    id: 'scotiabank',
    name: 'Scotiabank',
    color: '#FFFFFF',
    iconColor: '#EC111A',
    Icon: Scotiabank,
  },
  {
    id: 'bancoppel',
    name: 'Bancoppel',
    color: '#02143D',
    iconColor: '#F0D224',
    Icon: BanCoppel,
  },
  {
    id: 'otro',
    name: 'Otro banco',
    color: '#6366f1',
    iconColor: '#ffffff',
    Icon: Landmark,
  },
]

export const BANK_MAP: Record<string, Bank> = Object.fromEntries(
  BANKS.map((b) => [b.id, b]),
)

export function getBank(id?: string | null): Bank | undefined {
  if (!id) return undefined
  return BANK_MAP[id]
}

export function getBankColor(id?: string | null, fallback = '#6366f1'): string {
  return getBank(id)?.color ?? fallback
}

export function getBankIconColor(
  id?: string | null,
  fallback = '#ffffff',
): string {
  return getBank(id)?.iconColor ?? fallback
}

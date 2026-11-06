import type { ComponentType, SVGProps } from 'react'

import { Landmark } from 'lucide-react'

import {
  Afirme,
  Amex,
  Aplazo,
  BBVA,
  BanBajio,
  BanCoppel,
  Banamex,
  BancoAzteca,
  Banorte,
  Banregio,
  CajaPopular,
  Cashi,
  Didi,
  Efectivo,
  HSBC,
  HeyBanco,
  Inbursa,
  Invex,
  Klar,
  Kueski,
  Liverpool,
  MercadoPago,
  Mifel,
  NuBank,
  Openbank,
  PayPal,
  Plata,
  Rappi,
  Revolut,
  Santander,
  Scotiabank,
  Sears,
  Stori,
  Suburbia,
  Uala,
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
    id: 'banorte',
    name: 'Banorte',
    color: '#EB0029',
    iconColor: '#ffffff',
    Icon: Banorte,
  },
  {
    id: 'santander',
    name: 'Santander',
    color: '#FB2323',
    iconColor: '#ffffff',
    Icon: Santander,
  },
  {
    id: 'banamex',
    name: 'Banamex',
    color: '#063A49',
    iconColor: '#ED1C24',
    Icon: Banamex,
  },
  {
    id: 'bancoazteca',
    name: 'Banco Azteca',
    color: '#054D38',
    iconColor: '#ffffff',
    Icon: BancoAzteca,
  },
  {
    id: 'bancoppel',
    name: 'Bancoppel',
    color: '#02143D',
    iconColor: '#F0D224',
    Icon: BanCoppel,
  },
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    color: '#009EE3',
    iconColor: '#ffffff',
    Icon: MercadoPago,
  },
  {
    id: 'nubank',
    name: 'NuBank',
    color: '#8A05BE',
    iconColor: '#ffffff',
    Icon: NuBank,
  },
  {
    id: 'paypal',
    name: 'PayPal',
    color: '#ffffff',
    iconColor: '#ffffff',
    Icon: PayPal,
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
    id: 'inbursa',
    name: 'Inbursa',
    color: '#141E4E',
    iconColor: '#ffffff',
    Icon: Inbursa,
  },
  {
    id: 'amex',
    name: 'American Express',
    color: '#006FCF',
    iconColor: '#ffffff',
    Icon: Amex,
  },
  {
    id: 'didi',
    name: 'Didi',
    color: '#F38031',
    iconColor: '#ffffff',
    Icon: Didi,
  },
  {
    id: 'liverpool',
    name: 'Liverpool',
    color: '#E00198',
    iconColor: '#ffffff',
    Icon: Liverpool,
  },
  {
    id: 'heybanco',
    name: 'Hey Banco',
    color: '#313131',
    iconColor: '#ffffff',
    Icon: HeyBanco,
  },
  {
    id: 'stori',
    name: 'Stori',
    color: '#003D42',
    iconColor: '#ffffff',
    Icon: Stori,
  },
  {
    id: 'klar',
    name: 'Klar',
    color: '#F6FFFA',
    iconColor: '#276468',
    Icon: Klar,
  },
  {
    id: 'rappi',
    name: 'Rappi',
    color: '#FF2300',
    iconColor: '#ffffff',
    Icon: Rappi,
  },
  {
    id: 'uala',
    name: 'Ualá',
    color: '#022A9B',
    iconColor: '#ffffff',
    Icon: Uala,
  },
  {
    id: 'banbajio',
    name: 'BanBajio',
    color: '#573B95',
    iconColor: '#ffffff',
    Icon: BanBajio,
  },
  {
    id: 'banregio',
    name: 'Banregio',
    color: '#FF6B00',
    iconColor: '#ffffff',
    Icon: Banregio,
  },
  {
    id: 'afirme',
    name: 'Afirme',
    color: '#00913E',
    iconColor: '#ffffff',
    Icon: Afirme,
  },
  {
    id: 'kueski',
    name: 'Kueski',
    color: '#0075FF',
    iconColor: '#ffffff',
    Icon: Kueski,
  },
  {
    id: 'invex',
    name: 'Invex',
    color: '#A41D36',
    iconColor: '#ffffff',
    Icon: Invex,
  },
  {
    id: 'cashi',
    name: 'Cashi',
    color: '#6212B2',
    iconColor: '#ffffff',
    Icon: Cashi,
  },
  {
    id: 'sears',
    name: 'Sears',
    color: '#E3002F',
    iconColor: '#ffffff',
    Icon: Sears,
  },
  {
    id: 'suburbia',
    name: 'Suburbia',
    color: '#E50695',
    iconColor: '#ffffff',
    Icon: Suburbia,
  },
  {
    id: 'mifel',
    name: 'Mifel',
    color: '#002856',
    iconColor: '#ffffff',
    Icon: Mifel,
  },
  {
    id: 'aplazo',
    name: 'Aplazo',
    color: '#61E1EF',
    iconColor: '#000000',
    Icon: Aplazo,
  },
  {
    id: 'plata',
    name: 'Plata',
    color: '#FF4000',
    iconColor: '#ffffff',
    Icon: Plata,
  },
  {
    id: 'openbank',
    name: 'Openbank',
    color: '#002A3F',
    iconColor: '#E9004C',
    Icon: Openbank,
  },
  {
    id: 'caja-popular',
    name: 'Caja Popular',
    color: '#00833D',
    iconColor: '#ffffff',
    Icon: CajaPopular,
  },
  {
    id: 'revolut',
    name: 'Revolut',
    color: '#191C1F',
    iconColor: '#ffffff',
    Icon: Revolut,
  },
  {
    id: 'efectivo',
    name: 'Efectivo',
    color: '#00913E',
    iconColor: '#ffffff',
    Icon: Efectivo,
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

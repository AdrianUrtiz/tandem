import { NextResponse } from 'next/server'

import { getPlaces } from '@/lib/places'

import { auth } from '@/auth'

// Sugerencias de lugares para el formulario (primera carga sin copia
// local; después salen de Dexie vía snapshot).
export async function GET() {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId)
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'Configura DATABASE_URL para sincronizar' },
      { status: 503 },
    )
  }
  try {
    return NextResponse.json(
      { places: await getPlaces(userId) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { error: 'No se pudieron cargar los lugares' },
      { status: 500 },
    )
  }
}

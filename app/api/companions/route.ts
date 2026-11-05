import { NextResponse } from 'next/server'

import { getCompanions } from '@/lib/companions'

import { auth } from '@/auth'

// Sugerencias de amigos para el formulario (primera carga sin copia
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
      { companions: await getCompanions(userId) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { error: 'No se pudieron cargar los amigos' },
      { status: 500 },
    )
  }
}

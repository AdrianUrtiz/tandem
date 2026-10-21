'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PLACE_MAX_LEN, PLACE_MIN_LEN, placeKey } from '@/lib/place-format'
import { prisma } from '@/lib/prisma'

import { auth } from '@/auth'

function revalidateAll() {
  revalidatePath('/actividad')
  revalidatePath('/cuentas')
  revalidatePath('/ajustes/lugares')
}

const PlaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(PLACE_MIN_LEN, 'Nombre muy corto')
    .max(PLACE_MAX_LEN, 'Máximo 40 letras'),
})

export async function createPlace(formData: FormData) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL) return { error: 'Configura DATABASE_URL' }

  const parsed = PlaceSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const name = parsed.data.name
  const key = placeKey(name)

  const clash = await prisma.place.findUnique({
    where: { userId_key: { userId, key } },
  })
  if (clash) return { error: 'Ya tienes ese lugar' }

  await prisma.place.create({ data: { userId, name, key } })
  revalidateAll()
  return { ok: true as const }
}

// Las filas se identifican por `key` (única por usuario): así el gestor no
// necesita el `id` y el snapshot/Dexie no cambian.
export async function renamePlace(formData: FormData) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL) return { error: 'Configura DATABASE_URL' }

  const parsed = PlaceSchema.extend({
    key: z.string().min(1),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const key = placeKey(parsed.data.key)
  const name = parsed.data.name
  const newKey = placeKey(name)

  const row = await prisma.place.findUnique({
    where: { userId_key: { userId, key } },
  })
  if (!row) return { error: 'Lugar no encontrado' }

  const clash = await prisma.place.findFirst({
    where: { userId, key: newKey, id: { not: row.id } },
  })
  if (clash) return { error: 'Ya tienes un lugar con ese nombre' }

  const placeWritten = await prisma.place.updateMany({
    where: { id: row.id, userId },
    data: { name, key: newKey, lastUsedAt: new Date() },
  })
  if (placeWritten.count === 0) return { error: 'Lugar no encontrado' }
  revalidateAll()
  return { ok: true as const }
}

// Eliminar solo quita la sugerencia: los movimientos guardados conservan
// su texto tal cual (el concepto es una cadena congelada).
export async function deletePlace(rawKey: string) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL) return { error: 'Configura DATABASE_URL' }

  const key = placeKey(rawKey)
  const row = await prisma.place.findUnique({
    where: { userId_key: { userId, key } },
  })
  if (!row) return { error: 'Lugar no encontrado' }

  const placeDeleted = await prisma.place.deleteMany({
    where: { id: row.id, userId },
  })
  if (placeDeleted.count === 0) return { error: 'Lugar no encontrado' }
  revalidateAll()
  return { ok: true as const }
}

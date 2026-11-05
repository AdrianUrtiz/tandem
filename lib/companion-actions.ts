'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  COMPANION_MAX_LEN,
  COMPANION_MIN_LEN,
  companionKey,
} from '@/lib/companion-format'
import { prisma } from '@/lib/prisma'

import { auth } from '@/auth'

function revalidateAll() {
  revalidatePath('/actividad')
  revalidatePath('/cuentas')
  revalidatePath('/ajustes/listas')
}

const CompanionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(COMPANION_MIN_LEN, 'Nombre muy corto')
    .max(COMPANION_MAX_LEN, 'Máximo 30 letras'),
})

export async function createCompanion(formData: FormData) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL) return { error: 'Configura DATABASE_URL' }

  const parsed = CompanionSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const name = parsed.data.name.replace(/\s+/g, ' ')
  const key = companionKey(name)

  const clash = await prisma.companion.findUnique({
    where: { userId_key: { userId, key } },
  })
  if (clash) return { error: 'Ya tienes ese amigo' }

  await prisma.companion.create({ data: { userId, name, key } })
  revalidateAll()
  return { ok: true as const }
}

// Las filas se identifican por `key` (única por usuario): así el gestor no
// necesita el `id` y el snapshot/Dexie no cambian.
export async function renameCompanion(formData: FormData) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL) return { error: 'Configura DATABASE_URL' }

  const parsed = CompanionSchema.extend({
    key: z.string().min(1),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const key = companionKey(parsed.data.key)
  const name = parsed.data.name.replace(/\s+/g, ' ')
  const newKey = companionKey(name)

  const row = await prisma.companion.findUnique({
    where: { userId_key: { userId, key } },
  })
  if (!row) return { error: 'Amigo no encontrado' }

  const clash = await prisma.companion.findFirst({
    where: { userId, key: newKey, id: { not: row.id } },
  })
  if (clash) return { error: 'Ya tienes un amigo con ese nombre' }

  const companionWritten = await prisma.companion.updateMany({
    where: { id: row.id, userId },
    data: { name, key: newKey, lastUsedAt: new Date() },
  })
  if (companionWritten.count === 0) return { error: 'Amigo no encontrado' }
  revalidateAll()
  return { ok: true as const }
}

// Eliminar solo quita la sugerencia: los gastos guardados conservan sus
// nombres tal cual (el externalName del share es texto congelado).
export async function deleteCompanion(rawKey: string) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL) return { error: 'Configura DATABASE_URL' }

  const key = companionKey(rawKey)
  const row = await prisma.companion.findUnique({
    where: { userId_key: { userId, key } },
  })
  if (!row) return { error: 'Amigo no encontrado' }

  const companionDeleted = await prisma.companion.deleteMany({
    where: { id: row.id, userId },
  })
  if (companionDeleted.count === 0) return { error: 'Amigo no encontrado' }
  revalidateAll()
  return { ok: true as const }
}

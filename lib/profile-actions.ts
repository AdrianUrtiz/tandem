'use server'

import { z } from 'zod'

import { encodeAvatar, PROFILE_ICONS } from '@/lib/profile'
import { prisma } from '@/lib/prisma'

import { auth } from '@/auth'

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido')

const ProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ingresa tu nombre')
    .max(40, 'Máximo 40 caracteres'),
  color: HexColor,
  icon: z.enum(PROFILE_ICONS),
})

/** Actualiza nombre y avatar del usuario en sesión. */
export async function updateProfile(formData: FormData) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return { error: 'No autenticado' }
  if (!process.env.DATABASE_URL)
    return { error: 'Configura DATABASE_URL para actualizar tu perfil' }

  const parsed = ProfileSchema.safeParse({
    name: formData.get('name'),
    color: formData.get('color'),
    icon: formData.get('icon'),
  })
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  await prisma.user.update({
    where: { id: userId },
    data: { name: v.name.trim(), avatar: encodeAvatar(v.color, v.icon) },
  })
  return { ok: true }
}

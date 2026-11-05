// Amigos del usuario (autocompletado del formulario de gasto en grupo).
//
// Los nombres se guardan solos al escribirlos (online en el server action,
// offline en la cola/Dexie), igual que los lugares.
import {
  COMPANION_MAX_LEN,
  COMPANION_MIN_LEN,
  type CompanionRow,
  companionKey,
} from '@/lib/companion-format'
import { prisma } from '@/lib/prisma'

export type { CompanionRow }

/** Amigos del usuario, más recientes primero. */
export async function getCompanions(userId: string): Promise<CompanionRow[]> {
  try {
    const rows = await prisma.companion.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      take: 100,
    })
    return rows.map((r) => ({
      name: r.name,
      lastUsedAt: r.lastUsedAt.toISOString(),
    }))
  } catch {
    return []
  }
}

/**
 * Guarda (o refresca) amigos: upsert por (userId, key) que solo suma un
 * uso y refresca la fecha. La capitalización guardada NO se toca (queda la
 * primera que se escribió); para cambiarla está Renombrar en Ajustes.
 * Silencioso si es inválido: el amigo nunca debe tumbar el movimiento.
 */
export async function touchCompanions(
  userId: string,
  rawNames: (string | null | undefined)[],
): Promise<void> {
  const keys = new Set<string>()
  const names: { name: string; key: string }[] = []
  for (const raw of rawNames) {
    const name = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, COMPANION_MAX_LEN)
    if (name.length < COMPANION_MIN_LEN) continue
    const key = companionKey(name)
    if (keys.has(key)) continue
    keys.add(key)
    names.push({ name, key })
  }
  for (const { name, key } of names) {
    try {
      await prisma.companion.upsert({
        where: { userId_key: { userId, key } },
        update: { lastUsedAt: new Date() },
        create: { userId, name, key },
      })
    } catch (e) {
      // Mejor esfuerzo: el movimiento ya se guardó. En desarrollo se registra
      // para no tragar fallos de configuración (p. ej. cliente Prisma viejo
      // sin el modelo tras una migración: reinicia el servidor).
      if (process.env.NODE_ENV === 'development') {
        console.error('[companions] touch falló:', e)
      }
    }
  }
}

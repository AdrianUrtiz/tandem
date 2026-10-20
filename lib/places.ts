// Lugares de compra del usuario (autocompletado del formulario).
//
// El concepto guardado combina descripción + lugar ("Tortillas - Pollo
// Feliz"); los lugares viven aparte para sugerirlos. Se guardan solos al
// escribirlos (online en el server action, offline en la cola/Dexie).
import {
  PLACE_MAX_LEN,
  PLACE_MIN_LEN,
  type PlaceRow,
  placeKey,
} from '@/lib/place-format'
import { prisma } from '@/lib/prisma'

export type { PlaceRow }

/** Lugares del usuario, más recientes primero. */
export async function getPlaces(userId: string): Promise<PlaceRow[]> {
  try {
    const rows = await prisma.place.findMany({
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
 * Guarda (o refresca) un lugar: upsert por (userId, key) que solo suma un
 * uso y refresca la fecha. La capitalización guardada NO se toca (queda la
 * primera que se escribió); para cambiarla está Renombrar en Ajustes.
 * Silencioso si es inválido: el lugar nunca debe tumbar el movimiento.
 */
export async function touchPlace(
  userId: string,
  raw: string | null | undefined,
): Promise<void> {
  const name = (raw ?? '').trim().slice(0, PLACE_MAX_LEN)
  if (name.length < PLACE_MIN_LEN) return
  const key = placeKey(name)
  try {
    await prisma.place.upsert({
      where: { userId_key: { userId, key } },
      update: { lastUsedAt: new Date() },
      create: { userId, name, key },
    })
  } catch {
    // Mejor esfuerzo: el movimiento ya se guardó.
  }
}

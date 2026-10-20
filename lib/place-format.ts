// Formato descripción + lugar (sin dependencias: apto para cliente).
//
// El concepto guardado combina ambas partes ej. ("Tortillas - Abarrotes
// Arenas"); el lugar vive aparte (tabla `Place` / Dexie `places`) para
// sugerirlo en el formulario.

/** Separador entre descripción y lugar dentro del concepto. */
export const PLACE_SEP = ' - '

export const PLACE_MIN_LEN = 2
export const PLACE_MAX_LEN = 40
export const PLACES_LIMIT = 100

export type PlaceRow = {
  name: string
  /** ISO del último uso. */
  lastUsedAt: string
}

/** Normaliza para dedup: trim + minúsculas ("Oxxo" y "OXXO" son el mismo). */
export function placeKey(name: string): string {
  return name.trim().toLowerCase()
}

/** "Tortillas - Abarrotes Arenas" a partir de sus partes (lugar opcional). */
export function joinConcept(desc: string, place: string): string {
  const d = desc.trim()
  const p = place.trim()
  return p ? `${d}${PLACE_SEP}${p}` : d
}

/**
 * Parte un concepto guardado en { desc, place }: si termina en " - <lugar
 * conocido>" (el más largo primero), se separa; si no, todo es descripción.
 */
export function splitConcept(
  concept: string,
  places: { name: string }[],
): { desc: string; place: string } {
  const full = (concept ?? '').trim()
  const sorted = [...places].sort((a, b) => b.name.length - a.name.length)
  for (const p of sorted) {
    const suffix = `${PLACE_SEP}${p.name}`
    if (
      full.length > suffix.length &&
      full.toLowerCase().endsWith(suffix.toLowerCase())
    ) {
      return {
        desc: full.slice(0, full.length - suffix.length).trim(),
        place: p.name,
      }
    }
  }
  return { desc: full, place: '' }
}

/**
 * Lugar inferido de un concepto ("desc - lugar" → "lugar"): el texto tras
 * el último " - ". Null si no hay. Es la base del filtro por lugar y de
 * los conteos (se calculan sobre movimientos, no se almacenan).
 */
export function extractPlaceSuffix(concept: string): string | null {
  const full = (concept ?? '').trim()
  const i = full.lastIndexOf(PLACE_SEP)
  if (i <= 0) return null
  const place = full.slice(i + PLACE_SEP.length).trim()
  return place || null
}

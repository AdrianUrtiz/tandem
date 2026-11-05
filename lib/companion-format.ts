// Amigos / compañeros de gasto (sin dependencias: apto para cliente).
//
// Los nombres escritos en el formulario de gasto en grupo (tab Otros) se
// guardan aparte para sugerirlos, igual que los lugares. El share guarda su
// propio texto (externalName congelado); aquí solo viven sugerencias.

export const COMPANION_MIN_LEN = 1
export const COMPANION_MAX_LEN = 30
export const COMPANIONS_LIMIT = 100

export type CompanionRow = {
  name: string
  /** ISO del último uso. */
  lastUsedAt: string
}

/** Normaliza para dedup: trim + minúsculas ("Juan" y "JUAN" son el mismo). */
export function companionKey(name: string): string {
  return name.trim().toLowerCase()
}

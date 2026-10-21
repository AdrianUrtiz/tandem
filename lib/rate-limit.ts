import { Redis } from '@upstash/redis'

// Límites contra fuerza bruta y enumeración de códigos.
// - Producción: Upstash Redis (compartido entre instancias serverless).
//   Requiere UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en Vercel.
// - Sin esas variables (desarrollo local): cubeta en memoria por instancia.
//   No protege con varias instancias; solo para no bloquear el flujo local.
//
// Ventana fija + bloqueo progresivo: al agotar la ventana se registra un
// bloqueo de 1 min, 2, 4… hasta 15 min (por ámbito y clave).

export const LOGIN_MAX = 5
export const LOGIN_WINDOW_MS = 10 * 60 * 1000
export const CODES_MAX = 10
export const CODES_WINDOW_MS = 10 * 60 * 1000
const MAX_BLOCK_MS = 15 * 60 * 1000
const BLOCKS_TTL_S = 24 * 3600

type Check = { ok: boolean; retryAfterMs?: number }

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
const blocks = new Map<string, { until: number; strikes: number }>()

function sweep(now: number) {
  if (buckets.size < 1000 && blocks.size < 1000) return
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  for (const [k, b] of blocks) if (b.until <= now) blocks.delete(k)
}

function memoryCheck(
  scope: string,
  key: string,
  max: number,
  windowMs: number,
): Check {
  const now = Date.now()
  sweep(now)
  const bKey = `tandem-rl:block:${scope}:${key}`
  const blocked = blocks.get(bKey)
  if (blocked && blocked.until > now) {
    return { ok: false, retryAfterMs: blocked.until - now }
  }
  const wKey = `tandem-rl:${scope}:${key}`
  const cur = buckets.get(wKey)
  if (!cur || cur.resetAt <= now) {
    buckets.set(wKey, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }
  if (cur.count >= max) {
    const strikes = (blocked?.strikes ?? 0) + 1
    const backoff = Math.min(MAX_BLOCK_MS, 60 * 1000 * 2 ** (strikes - 1))
    blocks.set(bKey, { until: now + backoff, strikes })
    buckets.delete(wKey)
    return { ok: false, retryAfterMs: backoff }
  }
  cur.count += 1
  return { ok: true }
}

function memoryReset(scope: string, key: string) {
  buckets.delete(`tandem-rl:${scope}:${key}`)
  blocks.delete(`tandem-rl:block:${scope}:${key}`)
}

let redis: Redis | null | undefined

function backend(): Redis | null {
  if (redis === undefined) {
    // Conexión Upstash manual o vía Vercel Storage (KV_* se inyecta solo al
    // conectar Upstash al proyecto). Se necesita el token de lectura/escritura.
    const url =
      process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
    redis = url && token ? new Redis({ url, token }) : null
    if (!redis && process.env.NODE_ENV === 'production') {
      console.warn(
        '[rate-limit] sin Redis configurado: límite en memoria por instancia',
      )
    }
  }
  return redis
}

/**
 * Registra un intento y dice si pasa. `scope` separa ámbitos (login, codes);
 * `key` identifica al actor (IP+usuario o userId+acción).
 */
export async function checkLimit(
  scope: string,
  key: string,
  max: number,
  windowMs: number,
): Promise<Check> {
  const db = backend()
  if (!db) return memoryCheck(scope, key, max, windowMs)
  const bKey = `tandem-rl:block:${scope}:${key}`
  const wKey = `tandem-rl:${scope}:${key}`
  const windowS = Math.max(1, Math.ceil(windowMs / 1000))
  const blockedTtl = await db.pttl(bKey)
  if (blockedTtl > 0) return { ok: false, retryAfterMs: blockedTtl }
  // La clave siempre nace con TTL: si INCR falla después, la ventana expira
  // sola y nadie queda bloqueado para siempre.
  const count = await db.incr(wKey)
  if (count === 1) {
    await db.expire(wKey, windowS)
    return { ok: true }
  }
  const ttl = await db.pttl(wKey)
  if (ttl === -1) await db.expire(wKey, windowS)
  if (count > max) {
    const strikes = (await db.incr(`${bKey}:strikes`)) || 1
    if (strikes === 1) await db.expire(`${bKey}:strikes`, BLOCKS_TTL_S)
    const backoff = Math.min(MAX_BLOCK_MS, 60 * 1000 * 2 ** (strikes - 1))
    await db.psetex(bKey, backoff, '1')
    await db.del(wKey)
    return { ok: false, retryAfterMs: backoff }
  }
  return { ok: true }
}

/** Limpia cuota, bloqueo y escalado tras un éxito. */
export async function resetLimit(scope: string, key: string): Promise<void> {
  const db = backend()
  if (!db) {
    memoryReset(scope, key)
    return
  }
  await db.del(`tandem-rl:${scope}:${key}`)
  await db.del(`tandem-rl:block:${scope}:${key}`)
  await db.del(`tandem-rl:block:${scope}:${key}:strikes`)
}

/** Identificador del cliente para componer claves (cabeceras de proxy). */
export function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    'unknown'
  )
}

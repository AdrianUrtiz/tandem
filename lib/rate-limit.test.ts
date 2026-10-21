import assert from 'node:assert/strict'
import { before, test } from 'node:test'

import { checkLimit, resetLimit } from './rate-limit.js'

// Los tests corren contra el backend en memoria: backend() es perezoso y lee
// las envs en cada invocación, así que basta con limpiarlas antes del primer
// checkLimit (aunque existan en CI, aquí no se toca Redis).
before(() => {
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  delete process.env.KV_REST_API_URL
  delete process.env.KV_REST_API_TOKEN
})

const uniq = () => `t${Date.now()}-${Math.random().toString(36).slice(2)}`

test('rate-limit: permite hasta el máximo y bloquea el siguiente', async () => {
  const key = uniq()
  for (let i = 0; i < 5; i++) {
    const r = await checkLimit('test', key, 5, 60_000)
    assert.equal(r.ok, true, `intento ${i + 1} debería pasar`)
  }
  const blocked = await checkLimit('test', key, 5, 60_000)
  assert.equal(blocked.ok, false, 'el sexto intento debe bloquearse')
})

test('rate-limit: resetLimit limpia la cuota tras un éxito', async () => {
  const key = uniq()
  for (let i = 0; i < 5; i++) await checkLimit('test', key, 5, 60_000)
  const blocked = await checkLimit('test', key, 5, 60_000)
  assert.equal(blocked.ok, false)
  await resetLimit('test', key)
  const again = await checkLimit('test', key, 5, 60_000)
  assert.equal(again.ok, true, 'tras reset debe permitir de nuevo')
})

test('rate-limit: ámbitos distintos no comparten cuota', async () => {
  const key = uniq()
  for (let i = 0; i < 5; i++) await checkLimit('scope-a', key, 5, 60_000)
  const other = await checkLimit('scope-b', key, 5, 60_000)
  assert.equal(other.ok, true, 'otro ámbito no debe estar bloqueado')
})

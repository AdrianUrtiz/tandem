import assert from 'node:assert/strict'
import { test } from 'node:test'

import { newGroupCode, newPairCode, normalizeCode } from './households.js'
import { fromCents, toCents } from './money.js'
import { clientIp } from './rate-limit.js'

// Propiedades de seguridad básicas (lógica pura, sin DB).

test('códigos: formato Q-/G- + 6 caracteres del alfabeto', () => {
  assert.match(newPairCode(), /^Q-[A-Z2-9]{6}$/)
  assert.match(newGroupCode(), /^G-[A-Z2-9]{6}$/)
})

test('códigos: normalizeCode acepta variantes y rechaza basura', () => {
  // Alfabeto sin 0/1 (se confunden con O/I): ABC234.
  assert.equal(normalizeCode('q-abc234'), 'Q-ABC234')
  assert.equal(normalizeCode('  g xyz 789 '), 'G-XYZ789')
  assert.equal(normalizeCode('X-ABC234'), null)
  assert.equal(normalizeCode('Q-ABC'), null)
  assert.equal(normalizeCode('Q-ABC123'), null) // el 1 no es válido
  assert.equal(normalizeCode(''), null)
  assert.equal(normalizeCode(null), null)
})

test('dinero: centavos exactos sin deriva flotante', () => {
  assert.equal(toCents(19.99), 1999)
  assert.equal(toCents('100'), 10000)
  assert.equal(fromCents(1999), 19.99)
  assert.equal(toCents(0.1) + toCents(0.2), toCents(0.3))
})

test('rate-limit: clientIp prefiere x-forwarded-for', () => {
  const h = new Headers({
    'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    'x-real-ip': '9.9.9.9',
  })
  assert.equal(clientIp(h), '1.2.3.4')
  assert.equal(clientIp(new Headers()), 'unknown')
})

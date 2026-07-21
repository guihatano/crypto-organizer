import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, computeBackoffMs } from '../auth.ts'

describe('hashPassword', () => {
  it('returns an Argon2id string encoding m=19456,t=2,p=1', async () => {
    const hash = await hashPassword('hunter2')
    expect(hash.startsWith('$argon2id$')).toBe(true)
    // Param order in the encoded hash is driver-dependent (m,p,t here) —
    // assert on the individual values, not a fixed substring order.
    expect(hash).toMatch(/m=19456/)
    expect(hash).toMatch(/t=2/)
    expect(hash).toMatch(/p=1/)
  })
})

describe('verifyPassword', () => {
  it('resolves true for the correct password', async () => {
    const hash = await hashPassword('hunter2')
    await expect(verifyPassword(hash, 'hunter2')).resolves.toBe(true)
  })

  it('resolves false for the wrong password', async () => {
    const hash = await hashPassword('hunter2')
    await expect(verifyPassword(hash, 'wrong')).resolves.toBe(false)
  })

  it('resolves false (never throws) for a malformed hash', async () => {
    await expect(verifyPassword('not-a-hash', 'x')).resolves.toBe(false)
  })
})

describe('computeBackoffMs', () => {
  it('returns 0 under 5 failed attempts', () => {
    expect(computeBackoffMs(0)).toBe(0)
    expect(computeBackoffMs(4)).toBe(0)
  })

  it('grows strictly for 5, 6, 7 failed attempts', () => {
    const at5 = computeBackoffMs(5)
    const at6 = computeBackoffMs(6)
    const at7 = computeBackoffMs(7)
    expect(at5).toBe(2000)
    expect(at6).toBe(4000)
    expect(at7).toBe(8000)
    expect(at6).toBeGreaterThan(at5)
    expect(at7).toBeGreaterThan(at6)
  })

  it('caps the backoff so it never becomes a permanent lockout', () => {
    expect(computeBackoffMs(20)).toBeLessThanOrEqual(30_000)
    expect(computeBackoffMs(100)).toBeLessThanOrEqual(30_000)
  })
})

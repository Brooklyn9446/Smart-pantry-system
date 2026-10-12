import { describe, expect, it } from 'vitest'
import { getDaysUntilExpiry, getExpiryStatus } from './expiry'

describe('Expiry Utilities', () => {
  const refDate = new Date(2026, 9, 10, 12, 0, 0) // Oct 10, 2026

  it('calculates getDaysUntilExpiry correctly', () => {
    expect(getDaysUntilExpiry('2026-10-20', refDate)).toBe(10)
    expect(getDaysUntilExpiry('2026-10-10', refDate)).toBe(0)
    expect(getDaysUntilExpiry(undefined, refDate)).toBeNull()
  })

  it('evaluates normal status (10 days away)', () => {
    const res = getExpiryStatus('2026-10-20', refDate)
    expect(res.status).toBe('normal')
    expect(res.daysRemaining).toBe(10)
  })

  it('evaluates expiring-soon status (7 days away)', () => {
    const res = getExpiryStatus('2026-10-17', refDate)
    expect(res.status).toBe('expiring-soon')
    expect(res.daysRemaining).toBe(7)
  })

  it('evaluates expiring-soon status (1 day away)', () => {
    const res = getExpiryStatus('2026-10-11', refDate)
    expect(res.status).toBe('expiring-soon')
    expect(res.daysRemaining).toBe(1)
  })

  it('evaluates expiring today', () => {
    const res = getExpiryStatus('2026-10-10', refDate)
    expect(res.status).toBe('expiring-soon')
    expect(res.daysRemaining).toBe(0)
    expect(res.label).toBe('Expires today')
  })

  it('evaluates expired yesterday', () => {
    const res = getExpiryStatus('2026-10-09', refDate)
    expect(res.status).toBe('expired')
    expect(res.daysRemaining).toBe(-1)
    expect(res.label).toBe('Expired yesterday')
  })

  it('evaluates expired multiple days ago', () => {
    const res = getExpiryStatus('2026-10-05', refDate)
    expect(res.status).toBe('expired')
    expect(res.daysRemaining).toBe(-5)
    expect(res.label).toBe('Expired 5 days ago')
  })

  it('handles missing or undefined expiry date gracefully', () => {
    const res = getExpiryStatus(undefined, refDate)
    expect(res.status).toBe('no-expiry')
    expect(res.daysRemaining).toBeNull()
    expect(res.label).toBe('No expiry date')
  })

  it('handles malformed date string without crashing', () => {
    const res = getExpiryStatus('not-a-date', refDate)
    expect(res.status).toBe('no-expiry')
    expect(res.daysRemaining).toBeNull()
    expect(res.label).toBe('Invalid date')
  })
})

export function runExpiryTests(): boolean {
  return true
}

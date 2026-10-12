import { describe, expect, it } from 'vitest'
import {
  calculateFoodWeight,
  formatHumidity,
  formatRelativeTime,
  formatTemperature,
  formatWeightDisplay,
  getDeviceStatus,
} from './sensorCalculations'

describe('sensorCalculations utilities', () => {
  const refNow = new Date('2026-10-07T12:00:00.000Z')

  describe('getDeviceStatus', () => {
    it('returns "waiting" when timestamp is missing or empty', () => {
      expect(getDeviceStatus(undefined, refNow)).toBe('waiting')
      expect(getDeviceStatus(null, refNow)).toBe('waiting')
      expect(getDeviceStatus('', refNow)).toBe('waiting')
    })

    it('returns "online" when reading occurred within 60 seconds', () => {
      const recent = new Date('2026-10-07T11:59:45.000Z').toISOString() // 15s ago
      expect(getDeviceStatus(recent, refNow)).toBe('online')
    })

    it('returns "stale" when reading occurred between 60 seconds and 5 minutes ago', () => {
      const staleTime = new Date('2026-10-07T11:57:00.000Z').toISOString() // 3m ago
      expect(getDeviceStatus(staleTime, refNow)).toBe('stale')
    })

    it('returns "offline" when reading occurred more than 5 minutes ago', () => {
      const offlineTime = new Date('2026-10-07T11:50:00.000Z').toISOString() // 10m ago
      expect(getDeviceStatus(offlineTime, refNow)).toBe('offline')
    })
  })

  describe('formatRelativeTime', () => {
    it('returns "Waiting for data" when timestamp is not provided', () => {
      expect(formatRelativeTime(undefined, refNow)).toBe('Waiting for data')
    })

    it('formats seconds ago', () => {
      const time = new Date('2026-10-07T11:59:35.000Z').toISOString() // 25s ago
      expect(formatRelativeTime(time, refNow)).toBe('25 seconds ago')
    })

    it('formats minutes ago', () => {
      const time = new Date('2026-10-07T11:56:00.000Z').toISOString() // 4m ago
      expect(formatRelativeTime(time, refNow)).toBe('4 minutes ago')
    })
  })

  describe('calculateFoodWeight', () => {
    it('subtracts container tare accurately', () => {
      expect(calculateFoodWeight(2500, 350)).toBe(2150)
    })

    it('clamps negative weight to zero', () => {
      // Noise below tare
      expect(calculateFoodWeight(340, 350)).toBe(0)
    })

    it('handles zero tare', () => {
      expect(calculateFoodWeight(1250, 0)).toBe(1250)
    })
  })

  describe('Formatting helpers', () => {
    it('formats weight in kg and g', () => {
      expect(formatWeightDisplay(2450, 'kg')).toBe('2.45 kg')
      expect(formatWeightDisplay(500, 'g')).toBe('500 g')
      expect(formatWeightDisplay(null)).toBe('—')
    })

    it('formats temperature and humidity', () => {
      expect(formatTemperature(24.8)).toBe('24.8°C')
      expect(formatTemperature(null)).toBe('—')
      expect(formatHumidity(61.2)).toBe('61%')
      expect(formatHumidity(undefined)).toBe('—')
    })
  })
})

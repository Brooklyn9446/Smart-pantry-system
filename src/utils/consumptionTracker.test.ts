import { describe, expect, it } from 'vitest'
import { CONTAINER_ID, TRACKING_METHOD } from '../types/inventory'
import type { SensorReading } from '../types/sensors'
import {
  computeConsumptionStats,
  detectQuantityEvents,
  filterReadingsByRange,
  formatHistoryPoints,
} from './consumptionTracker'

function makeReading(
  id: string,
  measuredWeight: number,
  timestamp: string,
  extra?: Partial<SensorReading>
): SensorReading {
  return {
    id,
    deviceId: 'device-01',
    containerId: CONTAINER_ID,
    trackingMethod: TRACKING_METHOD,
    measuredWeight,
    weightUnit: 'g',
    timestamp,
    sensorStatus: 'ok',
    ...extra,
  }
}

describe('Phase 6: Consumption & Refill Tracking Algorithms', () => {
  const baseDate = new Date('2026-10-07T12:00:00.000Z')

  describe('Test 1: Sensor noise suppression', () => {
    it('does not generate consumption/refill events for small fluctuations (2500 -> 2498 -> 2502 -> 2499)', () => {
      const readings: SensorReading[] = [
        makeReading('r1', 2500, '2026-10-07T10:00:00.000Z'),
        makeReading('r2', 2498, '2026-10-07T10:01:00.000Z'),
        makeReading('r3', 2502, '2026-10-07T10:02:00.000Z'),
        makeReading('r4', 2499, '2026-10-07T10:03:00.000Z'),
      ]

      const events = detectQuantityEvents(readings, 50)
      expect(events).toHaveLength(0)
    })
  })

  describe('Test 2: Consumption detection', () => {
    it('detects 200g consumption when weight drops from 2500g to 2300g', () => {
      const readings: SensorReading[] = [
        makeReading('r1', 2500, '2026-10-07T10:00:00.000Z'),
        makeReading('r2', 2300, '2026-10-07T10:30:00.000Z'),
      ]

      const events = detectQuantityEvents(readings, 50)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('consumption')
      expect(events[0].amountGrams).toBe(200)
      expect(events[0].previousWeightGrams).toBe(2500)
      expect(events[0].newWeightGrams).toBe(2300)
      expect(events[0].timestamp).toBe('2026-10-07T10:30:00.000Z')
    })
  })

  describe('Test 3: Refill detection', () => {
    it('detects 2000g refill when weight increases from 1000g to 3000g', () => {
      const readings: SensorReading[] = [
        makeReading('r1', 1000, '2026-10-07T08:00:00.000Z'),
        makeReading('r2', 3000, '2026-10-07T09:00:00.000Z'),
      ]

      const events = detectQuantityEvents(readings, 50)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('refill')
      expect(events[0].amountGrams).toBe(2000)
      expect(events[0].previousWeightGrams).toBe(1000)
      expect(events[0].newWeightGrams).toBe(3000)
    })
  })

  describe('Test 4: Multiple consumption events', () => {
    it('records multiple separate legitimate consumption steps', () => {
      const readings: SensorReading[] = [
        makeReading('r1', 3000, '2026-10-07T08:00:00.000Z'),
        makeReading('r2', 2700, '2026-10-07T10:00:00.000Z'), // -300g
        makeReading('r3', 2702, '2026-10-07T10:05:00.000Z'), // noise
        makeReading('r4', 2400, '2026-10-07T12:00:00.000Z'), // -300g
      ]

      const events = detectQuantityEvents(readings, 50)
      expect(events).toHaveLength(2)
      expect(events[0].amountGrams).toBe(300)
      expect(events[0].type).toBe('consumption')
      expect(events[1].amountGrams).toBe(300)
      expect(events[1].type).toBe('consumption')
    })
  })

  describe('Test 5: Refill-aware consumption', () => {
    it('resets baseline on refill: 3000 -> 2500 -> 5000 -> 4500 yields 1000g consumption, not 3000-4500', () => {
      const readings: SensorReading[] = [
        makeReading('r1', 3000, '2026-10-05T10:00:00.000Z'),
        makeReading('r2', 2500, '2026-10-05T18:00:00.000Z'), // -500g consumption
        makeReading('r3', 5000, '2026-10-06T10:00:00.000Z'), // +2500g refill
        makeReading('r4', 4500, '2026-10-07T10:00:00.000Z'), // -500g consumption
      ]

      const events = detectQuantityEvents(readings, 50)
      expect(events).toHaveLength(3)
      expect(events[0]).toMatchObject({ type: 'consumption', amountGrams: 500 })
      expect(events[1]).toMatchObject({ type: 'refill', amountGrams: 2500 })
      expect(events[2]).toMatchObject({ type: 'consumption', amountGrams: 500 })

      const stats = computeConsumptionStats(events, readings, baseDate)
      expect(stats.totalRecordedConsumptionGrams).toBe(1000) // 500 + 500
      expect(stats.totalRefillGrams).toBe(2500)
    })
  })

  describe('Test 6: Duplicate processing / Idempotency', () => {
    it('produces identical deterministic event IDs when run multiple times on the same readings', () => {
      const readings: SensorReading[] = [
        makeReading('readA', 2500, '2026-10-07T08:00:00.000Z'),
        makeReading('readB', 2200, '2026-10-07T09:00:00.000Z'),
      ]

      const run1 = detectQuantityEvents(readings, 50)
      const run2 = detectQuantityEvents(readings, 50)

      expect(run1).toHaveLength(1)
      expect(run2).toHaveLength(1)
      expect(run1[0].id).toBe('qevent_readA_readB')
      expect(run2[0].id).toBe('qevent_readA_readB')
    })
  })

  describe('Test 7: Out-of-order readings', () => {
    it('sorts readings chronologically before computing transitions', () => {
      // Readings provided in reverse arrival order
      const outOfOrder: SensorReading[] = [
        makeReading('r3', 2000, '2026-10-07T12:00:00.000Z'),
        makeReading('r1', 3000, '2026-10-07T08:00:00.000Z'),
        makeReading('r2', 2500, '2026-10-07T10:00:00.000Z'),
      ]

      const events = detectQuantityEvents(outOfOrder, 50)
      expect(events).toHaveLength(2)
      expect(events[0].previousWeightGrams).toBe(3000)
      expect(events[0].newWeightGrams).toBe(2500)
      expect(events[1].previousWeightGrams).toBe(2500)
      expect(events[1].newWeightGrams).toBe(2000)
    })
  })

  describe('Test 8: Insufficient data handling', () => {
    it('safely indicates insufficient data for daily average when readings span less than 24 hours', () => {
      const readings: SensorReading[] = [
        makeReading('r1', 2500, '2026-10-07T10:00:00.000Z'),
        makeReading('r2', 2300, '2026-10-07T11:00:00.000Z'), // 1 hour span
      ]

      const events = detectQuantityEvents(readings, 50)
      const stats = computeConsumptionStats(events, readings, baseDate)

      expect(stats.todayConsumptionGrams).toBe(200)
      expect(stats.hasEnoughDataForAvg).toBe(false)
      expect(stats.avgDailyConsumptionGrams).toBeNull()
    })

    it('calculates daily average when readings span multiple days', () => {
      const readings: SensorReading[] = [
        makeReading('r1', 3000, '2026-10-04T12:00:00.000Z'), // 3 days ago
        makeReading('r2', 2700, '2026-10-05T12:00:00.000Z'), // -300
        makeReading('r3', 2400, '2026-10-06T12:00:00.000Z'), // -300
        makeReading('r4', 2100, '2026-10-07T12:00:00.000Z'), // -300 (Total: 900g over 3 days)
      ]

      const events = detectQuantityEvents(readings, 50)
      const stats = computeConsumptionStats(events, readings, baseDate)

      expect(stats.hasEnoughDataForAvg).toBe(true)
      expect(stats.totalRecordedConsumptionGrams).toBe(900)
      expect(stats.avgDailyConsumptionGrams).toBe(300)
    })
  })

  describe('Test 9: Missing and invalid weight handling', () => {
    it('ignores readings with NaN, null, or negative weights without crashing', () => {
      const corrupted: SensorReading[] = [
        makeReading('r1', 2500, '2026-10-07T08:00:00.000Z'),
        makeReading('r_bad1', NaN, '2026-10-07T08:30:00.000Z'),
        makeReading('r_bad2', -50, '2026-10-07T08:45:00.000Z'),
        makeReading('r2', 2300, '2026-10-07T09:00:00.000Z'),
      ]

      const events = detectQuantityEvents(corrupted, 50)
      expect(events).toHaveLength(1)
      expect(events[0].amountGrams).toBe(200)
    })
  })

  describe('Time range filtering & formatting', () => {
    it('filters readings by 24h, 7d, and 30d windows', () => {
      const now = new Date('2026-10-07T12:00:00.000Z')
      const readings: SensorReading[] = [
        makeReading('r1', 2000, '2026-10-07T08:00:00.000Z'), // 4h ago (24h)
        makeReading('r2', 2200, '2026-10-05T12:00:00.000Z'), // 2d ago (7d)
        makeReading('r3', 2500, '2026-09-20T12:00:00.000Z'), // 17d ago (30d)
        makeReading('r4', 2800, '2026-08-01T12:00:00.000Z'), // > 30d ago
      ]

      expect(filterReadingsByRange(readings, '24h', now)).toHaveLength(1)
      expect(filterReadingsByRange(readings, '7d', now)).toHaveLength(2)
      expect(filterReadingsByRange(readings, '30d', now)).toHaveLength(3)
      expect(filterReadingsByRange(readings, 'all', now)).toHaveLength(4)
    })

    it('formats points for Recharts correctly', () => {
      const refNow = new Date('2026-10-07T12:00:00.000Z')
      const readings: SensorReading[] = [
        makeReading('r1', 2450.3, '2026-10-07T10:00:00.000Z'),
      ]
      const points = formatHistoryPoints(readings, '24h', refNow)
      expect(points).toHaveLength(1)
      expect(points[0].weightGrams).toBe(2450.3)
      expect(points[0].timeFormatted).toBeDefined()
    })
  })
})

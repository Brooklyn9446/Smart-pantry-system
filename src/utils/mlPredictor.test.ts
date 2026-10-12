import { describe, expect, it } from 'vitest'
import { CONTAINER_ID, TRACKING_METHOD } from '../types/inventory'
import type { SensorReading } from '../types/sensors'
import { predictDepletionClient } from './mlPredictor'

function makeReading(id: string, weight: number, hoursAgo: number): SensorReading {
  const timestamp = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString()
  return {
    id,
    deviceId: 'device-01',
    containerId: CONTAINER_ID,
    trackingMethod: TRACKING_METHOD,
    measuredWeight: weight,
    weightUnit: 'g',
    timestamp,
    sensorStatus: 'ok',
  }
}

describe('ML Depletion Prediction (Client Engine)', () => {
  it('Test 1: Linear decreasing quantity predicts reasonable depletion days', () => {
    const readings = [
      makeReading('r1', 3000, 72),
      makeReading('r2', 2800, 48),
      makeReading('r3', 2600, 24),
      makeReading('r4', 2400, 0),
    ]

    const pred = predictDepletionClient({
      containerId: CONTAINER_ID,
      currentQuantityGrams: 2400,
      readings,
    })

    expect(pred.status).toBe('success')
    expect(pred.dailyConsumptionRateGrams).toBeGreaterThan(180)
    expect(pred.dailyConsumptionRateGrams).toBeLessThan(220)
    expect(pred.estimatedRemainingDays).toBeGreaterThan(10)
    expect(pred.estimatedRemainingDays).toBeLessThan(14)
    expect(pred.estimatedDepletionDate).toBeDefined()
    expect(pred.projections.length).toBeGreaterThan(0)
  })

  it('Test 2: Refill segmentation (3000 -> 2800 -> 5000 -> 4700 -> 4400)', () => {
    const readings = [
      makeReading('r1', 3000, 96),
      makeReading('r2', 2800, 72), // -200g
      makeReading('r3', 5000, 48), // +2200g refill
      makeReading('r4', 4700, 24), // -300g
      makeReading('r5', 4400, 0),  // -300g
    ]

    const pred = predictDepletionClient({
      containerId: CONTAINER_ID,
      currentQuantityGrams: 4400,
      readings,
    })

    expect(pred.status).toBe('success')
    expect(pred.dailyConsumptionRateGrams).toBeGreaterThan(0)
    expect(pred.estimatedRemainingDays).toBeGreaterThan(5)
  })

  it('Test 3: Insufficient data (< 3 readings)', () => {
    const readings = [
      makeReading('r1', 2500, 2),
      makeReading('r2', 2400, 0),
    ]

    const pred = predictDepletionClient({
      containerId: CONTAINER_ID,
      currentQuantityGrams: 2400,
      readings,
    })

    expect(pred.status).toBe('insufficient_data')
    expect(pred.confidence).toBe('insufficient')
    expect(pred.estimatedRemainingDays).toBeNull()
  })

  it('Test 4: Zero / empty quantity container', () => {
    const readings = [
      makeReading('r1', 500, 24),
      makeReading('r2', 200, 12),
      makeReading('r3', 0, 0),
    ]

    const pred = predictDepletionClient({
      containerId: CONTAINER_ID,
      currentQuantityGrams: 0,
      readings,
    })

    expect(pred.status).toBe('empty_container')
    expect(pred.estimatedRemainingDays).toBe(0)
  })

  it('Test 5: Stable quantity (load-cell noise)', () => {
    const readings = [
      makeReading('r1', 2500, 48),
      makeReading('r2', 2498, 36),
      makeReading('r3', 2501, 24),
      makeReading('r4', 2499, 0),
    ]

    const pred = predictDepletionClient({
      containerId: CONTAINER_ID,
      currentQuantityGrams: 2499,
      readings,
    })

    expect(pred.status).toBe('stable')
    expect(pred.confidence).toBe('insufficient')
    expect(pred.dailyConsumptionRateGrams).toBe(0)
  })
})

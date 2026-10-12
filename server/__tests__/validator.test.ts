import { describe, expect, it } from 'vitest'
import {
  validateSensorPayload,
  WEIGHT_MAX_GRAMS,
  TEMP_MAX_CELSIUS,
  TEMP_MIN_CELSIUS,
} from '../validator'

describe('validateSensorPayload', () => {
  const validPayload = {
    deviceId: 'device-01',
    containerId: 'container-01',
    timestamp: new Date().toISOString(),
    weightGrams: 2450.5,
    temperatureC: 22.4,
    humidityPercent: 58.2,
    sensorStatus: 'ok',
    rawWeightGrams: 2550.5,
    firmwareVersion: 'v1.0.0-esp32',
    sequenceNumber: 42,
  }

  it('accepts a valid sensor reading payload', () => {
    const result = validateSensorPayload(validPayload)
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.data).toBeDefined()
    expect(result.data?.deviceId).toBe('device-01')
    expect(result.data?.containerId).toBe('container-01')
    expect(result.data?.weightGrams).toBe(2450.5)
    expect(result.data?.temperatureC).toBe(22.4)
    expect(result.data?.humidityPercent).toBe(58.2)
  })

  it('rejects null or non-object payloads', () => {
    expect(validateSensorPayload(null).isValid).toBe(false)
    expect(validateSensorPayload(undefined).isValid).toBe(false)
    expect(validateSensorPayload('string-payload').isValid).toBe(false)
  })

  it('rejects unknown or mismatched deviceId', () => {
    const result = validateSensorPayload({
      ...validPayload,
      deviceId: 'unknown-device-999',
    })
    expect(result.isValid).toBe(false)
    expect(result.errors.some((e) => e.includes('Unauthorized or unknown deviceId'))).toBe(true)
  })

  it('rejects invalid containerId', () => {
    const result = validateSensorPayload({
      ...validPayload,
      containerId: 'container-99',
    })
    expect(result.isValid).toBe(false)
    expect(result.errors.some((e) => e.includes('Invalid containerId'))).toBe(true)
  })

  describe('Weight validation', () => {
    it('rejects non-numeric weight strings', () => {
      const result = validateSensorPayload({
        ...validPayload,
        weightGrams: 'hello' as unknown as number,
      })
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes('weightGrams'))).toBe(true)
    })

    it('rejects NaN and Infinity weights', () => {
      expect(validateSensorPayload({ ...validPayload, weightGrams: NaN }).isValid).toBe(false)
      expect(validateSensorPayload({ ...validPayload, weightGrams: Infinity }).isValid).toBe(false)
      expect(validateSensorPayload({ ...validPayload, weightGrams: -Infinity }).isValid).toBe(false)
    })

    it('rejects weights below 0 grams', () => {
      const result = validateSensorPayload({
        ...validPayload,
        weightGrams: -5,
      })
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes('out of physical range'))).toBe(true)
    })

    it('rejects weights above max load cell rating', () => {
      const result = validateSensorPayload({
        ...validPayload,
        weightGrams: WEIGHT_MAX_GRAMS + 500,
      })
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes('out of physical range'))).toBe(true)
    })
  })

  describe('Temperature validation', () => {
    it('rejects non-numeric temperature', () => {
      const result = validateSensorPayload({
        ...validPayload,
        temperatureC: '25C' as unknown as number,
      })
      expect(result.isValid).toBe(false)
    })

    it('rejects temperatures outside DHT22 plausible limits', () => {
      expect(validateSensorPayload({ ...validPayload, temperatureC: TEMP_MIN_CELSIUS - 10 }).isValid).toBe(false)
      expect(validateSensorPayload({ ...validPayload, temperatureC: TEMP_MAX_CELSIUS + 10 }).isValid).toBe(false)
    })
  })

  describe('Humidity validation', () => {
    it('rejects humidity greater than 100%', () => {
      const result = validateSensorPayload({
        ...validPayload,
        humidityPercent: 150,
      })
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes('humidityPercent'))).toBe(true)
    })

    it('rejects humidity below 0%', () => {
      const result = validateSensorPayload({
        ...validPayload,
        humidityPercent: -10,
      })
      expect(result.isValid).toBe(false)
    })
  })

  describe('Timestamp validation', () => {
    it('rejects corrupted / invalid timestamp strings', () => {
      const result = validateSensorPayload({
        ...validPayload,
        timestamp: 'invalid-timestamp-string',
      })
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes('Invalid timestamp format'))).toBe(true)
    })

    it('rejects timestamps far in the future (> 5 min)', () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      const result = validateSensorPayload({
        ...validPayload,
        timestamp: futureDate,
      })
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes('too far in the future'))).toBe(true)
    })

    it('rejects timestamps older than 30 days', () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
      const result = validateSensorPayload({
        ...validPayload,
        timestamp: oldDate,
      })
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes('too old'))).toBe(true)
    })
  })
})

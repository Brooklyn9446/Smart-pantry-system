import type { SensorReadingPayload, ValidatedSensorData, ValidationResult } from './types'

export const ALLOWED_CONTAINERS = new Set(['container-01'])
export const ALLOWED_DEVICES = new Set(['device-01'])

export const WEIGHT_MIN_GRAMS = 0
export const WEIGHT_MAX_GRAMS = 15000 // 15kg load cell max capacity
export const TEMP_MIN_CELSIUS = -40
export const TEMP_MAX_CELSIUS = 80 // DHT22 rated upper limit
export const HUMIDITY_MIN_PERCENT = 0
export const HUMIDITY_MAX_PERCENT = 100

// Max future clock drift allowed: 5 minutes (300,000 ms)
export const MAX_FUTURE_DRIFT_MS = 5 * 60 * 1000
// Max past timestamp age allowed: 30 days
export const MAX_PAST_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function validateSensorPayload(
  payload: unknown,
  allowedDevices: Set<string> = ALLOWED_DEVICES
): ValidationResult {
  const errors: string[] = []

  if (!payload || typeof payload !== 'object') {
    return { isValid: false, errors: ['Payload must be a non-null JSON object'] }
  }

  const raw = payload as Partial<SensorReadingPayload>

  // 1. Device ID Validation
  if (typeof raw.deviceId !== 'string' || !raw.deviceId.trim()) {
    errors.push('deviceId must be a non-empty string')
  } else if (!allowedDevices.has(raw.deviceId.trim())) {
    errors.push(`Unauthorized or unknown deviceId: '${raw.deviceId}'`)
  }

  // 2. Container ID Validation
  if (typeof raw.containerId !== 'string' || !raw.containerId.trim()) {
    errors.push('containerId must be a non-empty string')
  } else if (!ALLOWED_CONTAINERS.has(raw.containerId.trim())) {
    errors.push(`Invalid containerId: '${raw.containerId}'. Only 'container-01' is supported in this phase`)
  }

  // 3. Weight Validation (Grams)
  if (raw.weightGrams === undefined || raw.weightGrams === null) {
    errors.push('weightGrams is required')
  } else if (typeof raw.weightGrams !== 'number' || Number.isNaN(raw.weightGrams) || !Number.isFinite(raw.weightGrams)) {
    errors.push('weightGrams must be a finite numeric value')
  } else if (raw.weightGrams < WEIGHT_MIN_GRAMS || raw.weightGrams > WEIGHT_MAX_GRAMS) {
    errors.push(
      `weightGrams (${raw.weightGrams}g) is out of physical range [${WEIGHT_MIN_GRAMS}g - ${WEIGHT_MAX_GRAMS}g]`
    )
  }

  // 4. Temperature Validation (°C)
  if (raw.temperatureC === undefined || raw.temperatureC === null) {
    errors.push('temperatureC is required')
  } else if (typeof raw.temperatureC !== 'number' || Number.isNaN(raw.temperatureC) || !Number.isFinite(raw.temperatureC)) {
    errors.push('temperatureC must be a finite numeric value')
  } else if (raw.temperatureC < TEMP_MIN_CELSIUS || raw.temperatureC > TEMP_MAX_CELSIUS) {
    errors.push(
      `temperatureC (${raw.temperatureC}°C) is out of plausible sensor range [${TEMP_MIN_CELSIUS}°C - ${TEMP_MAX_CELSIUS}°C]`
    )
  }

  // 5. Humidity Validation (%)
  if (raw.humidityPercent === undefined || raw.humidityPercent === null) {
    errors.push('humidityPercent is required')
  } else if (typeof raw.humidityPercent !== 'number' || Number.isNaN(raw.humidityPercent) || !Number.isFinite(raw.humidityPercent)) {
    errors.push('humidityPercent must be a finite numeric value')
  } else if (raw.humidityPercent < HUMIDITY_MIN_PERCENT || raw.humidityPercent > HUMIDITY_MAX_PERCENT) {
    errors.push(
      `humidityPercent (${raw.humidityPercent}%) must be between ${HUMIDITY_MIN_PERCENT}% and ${HUMIDITY_MAX_PERCENT}%`
    )
  }

  // 6. Timestamp Validation
  let parsedDate: Date | null = null
  if (!raw.timestamp) {
    errors.push('timestamp is required')
  } else {
    parsedDate = new Date(raw.timestamp)
    if (Number.isNaN(parsedDate.getTime())) {
      errors.push(`Invalid timestamp format: '${raw.timestamp}'`)
      parsedDate = null
    } else {
      const now = Date.now()
      const timeMs = parsedDate.getTime()
      if (timeMs > now + MAX_FUTURE_DRIFT_MS) {
        errors.push(`timestamp is too far in the future: ${parsedDate.toISOString()}`)
      } else if (timeMs < now - MAX_PAST_AGE_MS) {
        errors.push(`timestamp is too old (> 30 days): ${parsedDate.toISOString()}`)
      }
    }
  }

  // 7. Optional Raw Weight check
  if (raw.rawWeightGrams !== undefined && raw.rawWeightGrams !== null) {
    if (typeof raw.rawWeightGrams !== 'number' || Number.isNaN(raw.rawWeightGrams) || !Number.isFinite(raw.rawWeightGrams)) {
      errors.push('rawWeightGrams must be a finite numeric value when provided')
    }
  }

  if (errors.length > 0 || !parsedDate) {
    return { isValid: false, errors }
  }

  const validData: ValidatedSensorData = {
    deviceId: raw.deviceId!.trim(),
    containerId: 'container-01',
    timestamp: parsedDate.toISOString(),
    weightGrams: Math.round(raw.weightGrams! * 10) / 10,
    temperatureC: Math.round(raw.temperatureC! * 10) / 10,
    humidityPercent: Math.round(raw.humidityPercent! * 10) / 10,
    sensorStatus: raw.sensorStatus || 'ok',
    ...(raw.rawWeightGrams !== undefined ? { rawWeightGrams: Math.round(raw.rawWeightGrams * 10) / 10 } : {}),
    ...(raw.firmwareVersion ? { firmwareVersion: String(raw.firmwareVersion).slice(0, 32) } : {}),
    ...(typeof raw.sequenceNumber === 'number' ? { sequenceNumber: raw.sequenceNumber } : {}),
  }

  return { isValid: true, errors: [], data: validData }
}

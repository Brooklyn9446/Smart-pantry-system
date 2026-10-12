export interface SensorReadingPayload {
  deviceId: string
  containerId: string
  timestamp: string | number
  weightGrams: number
  temperatureC: number
  humidityPercent: number
  sensorStatus?: 'ok' | 'warning' | 'error' | 'simulated' | 'degraded'
  rawWeightGrams?: number
  firmwareVersion?: string
  sequenceNumber?: number
}

export interface ValidatedSensorData {
  deviceId: string
  containerId: 'container-01'
  timestamp: string
  weightGrams: number
  temperatureC: number
  humidityPercent: number
  sensorStatus: 'ok' | 'warning' | 'error' | 'simulated' | 'degraded'
  rawWeightGrams?: number
  firmwareVersion?: string
  sequenceNumber?: number
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  data?: ValidatedSensorData
}

export interface CurrentSensorStateDoc {
  containerId: 'container-01'
  deviceId: string
  currentWeight: number
  weightUnit: 'g'
  temperature: number
  humidity: number
  lastUpdated: string
  sensorStatus: string
  rawWeight?: number
  firmwareVersion?: string
  sequenceNumber?: number
}

export interface HistoricalSensorReadingDoc {
  id: string
  deviceId: string
  containerId: 'container-01'
  trackingMethod: 'load-cell'
  measuredWeight: number
  weightUnit: 'g'
  temperature: number
  humidity: number
  timestamp: string
  sensorStatus: string
  rawWeight?: number
}

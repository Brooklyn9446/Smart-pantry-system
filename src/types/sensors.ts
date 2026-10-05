import { CONTAINER_ID, TRACKING_METHOD } from './inventory'

/**
 * Interface representing live sensor status for a monitored pantry container.
 * Prepared for Phase 5 (ESP32 + Load Cell + DHT22).
 */
export interface CurrentSensorState {
  containerId: typeof CONTAINER_ID
  deviceId: string
  currentWeight: number
  weightUnit: 'g' | 'kg'
  temperature: number
  humidity: number
  lastUpdated: string
}

/**
 * Historical sensor reading captured by the IoT device.
 * Stored under /users/{userId}/sensorReadings/{readingId}.
 */
export interface SensorReading {
  id: string
  deviceId: string
  containerId: typeof CONTAINER_ID
  trackingMethod: typeof TRACKING_METHOD
  measuredWeight: number
  weightUnit: 'g' | 'kg'
  temperature?: number
  humidity?: number
  timestamp: string
}

/**
 * Automated pantry alert structure.
 * Stored under /users/{userId}/alerts/{alertId}.
 */
export interface FirestoreAlert {
  id: string
  containerId?: typeof CONTAINER_ID
  title: string
  description: string
  severity: 'info' | 'warning' | 'critical'
  createdAt: string
  isRead: boolean
}

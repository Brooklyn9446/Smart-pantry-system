import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore'
import { getFirebaseServices, isFirebaseConfigured } from '../lib/firebase'
import { CONTAINER_ID, TRACKING_METHOD } from '../types/inventory'
import type { CurrentSensorState, SensorReading } from '../types/sensors'

const SENSOR_CURRENT_STORAGE_KEY = 'pantry-pulse-sensor-current-v1'
const SENSOR_READINGS_STORAGE_KEY = 'pantry-pulse-sensor-readings-v1'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readLocalState(): CurrentSensorState | null {
  if (!canUseStorage()) return null
  const saved = window.localStorage.getItem(SENSOR_CURRENT_STORAGE_KEY)
  if (!saved) return null
  try {
    return JSON.parse(saved) as CurrentSensorState
  } catch {
    return null
  }
}

export function writeLocalSensorState(state: CurrentSensorState): void {
  if (canUseStorage()) {
    window.localStorage.setItem(SENSOR_CURRENT_STORAGE_KEY, JSON.stringify(state))
  }
}

function readLocalReadings(): SensorReading[] {
  if (!canUseStorage()) return []
  const saved = window.localStorage.getItem(SENSOR_READINGS_STORAGE_KEY)
  if (!saved) return []
  try {
    return JSON.parse(saved) as SensorReading[]
  } catch {
    return []
  }
}

export function writeLocalSensorReading(reading: SensorReading): void {
  if (canUseStorage()) {
    const list = readLocalReadings()
    const updated = [reading, ...list.filter((r) => r.id !== reading.id)].slice(0, 100)
    window.localStorage.setItem(SENSOR_READINGS_STORAGE_KEY, JSON.stringify(updated))
  }
}

function normalizeDate(val: unknown): string {
  if (!val) return new Date().toISOString()
  if (typeof val === 'string') return val
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString()
  }
  if (val instanceof Date) return val.toISOString()
  return new Date().toISOString()
}

function toCurrentSensorState(data: DocumentData): CurrentSensorState {
  const rawWeight =
    typeof data.currentWeight === 'number' && !Number.isNaN(data.currentWeight)
      ? data.currentWeight
      : typeof data.measuredWeight === 'number' && !Number.isNaN(data.measuredWeight)
      ? data.measuredWeight
      : typeof data.weightGrams === 'number' && !Number.isNaN(data.weightGrams)
      ? data.weightGrams
      : 0

  return {
    containerId: CONTAINER_ID,
    deviceId: typeof data.deviceId === 'string' && data.deviceId.trim() ? data.deviceId : 'device-01',
    currentWeight: Math.max(0, rawWeight),
    weightUnit: data.weightUnit === 'kg' ? 'kg' : 'g',
    temperature:
      typeof data.temperature === 'number'
        ? data.temperature
        : typeof data.temperatureC === 'number'
        ? data.temperatureC
        : 0,
    humidity:
      typeof data.humidity === 'number'
        ? data.humidity
        : typeof data.humidityPercent === 'number'
        ? data.humidityPercent
        : 0,
    lastUpdated: normalizeDate(data.lastUpdated || data.timestamp),
    sensorStatus: data.sensorStatus ?? 'ok',
    ...(typeof data.rawWeight === 'number' ? { rawWeight: data.rawWeight } : {}),
    ...(typeof data.firmwareVersion === 'string' ? { firmwareVersion: data.firmwareVersion } : {}),
    ...(typeof data.sequenceNumber === 'number' ? { sequenceNumber: data.sequenceNumber } : {}),
  }
}

function toSensorReading(id: string, data: DocumentData): SensorReading {
  const rawWeight =
    typeof data.measuredWeight === 'number' && !Number.isNaN(data.measuredWeight)
      ? data.measuredWeight
      : typeof data.currentWeight === 'number' && !Number.isNaN(data.currentWeight)
      ? data.currentWeight
      : typeof data.weightGrams === 'number' && !Number.isNaN(data.weightGrams)
      ? data.weightGrams
      : 0

  return {
    id,
    deviceId: typeof data.deviceId === 'string' && data.deviceId.trim() ? data.deviceId : 'device-01',
    containerId: CONTAINER_ID,
    trackingMethod: TRACKING_METHOD,
    measuredWeight: Math.max(0, rawWeight),
    weightUnit: data.weightUnit === 'kg' ? 'kg' : 'g',
    temperature:
      typeof data.temperature === 'number'
        ? data.temperature
        : typeof data.temperatureC === 'number'
        ? data.temperatureC
        : undefined,
    humidity:
      typeof data.humidity === 'number'
        ? data.humidity
        : typeof data.humidityPercent === 'number'
        ? data.humidityPercent
        : undefined,
    timestamp: normalizeDate(data.timestamp || data.createdAt),
    sensorStatus: data.sensorStatus ?? 'ok',
    ...(typeof data.rawWeight === 'number' ? { rawWeight: data.rawWeight } : {}),
  }
}

function mapFirestoreError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as FirestoreError).code
    if (code === 'permission-denied') {
      return new Error('Access denied: You do not have permission to access this sensor stream.')
    }
    if (code === 'unavailable') {
      return new Error('Network unavailable: Unable to reach Cloud Firestore for sensor readings.')
    }
  }
  return error instanceof Error ? error : new Error('A database error occurred on sensor readings.')
}

export const sensorRepository = {
  isRemote: isFirebaseConfigured,

  subscribeCurrentState(
    userId: string,
    containerId: string = CONTAINER_ID,
    onUpdate: (state: CurrentSensorState | null) => void,
    onError: (err: Error) => void
  ): () => void {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      onUpdate(readLocalState())
      // Check for local storage changes via interval for test environments
      const timer = setInterval(() => {
        onUpdate(readLocalState())
      }, 2000)
      return () => clearInterval(timer)
    }

    const services = getFirebaseServices()
    if (!services) {
      onUpdate(readLocalState())
      return () => {}
    }

    const stateDocRef = doc(services.db, 'users', userId, 'currentSensorState', containerId)

    const unsubscribe = onSnapshot(
      stateDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          onUpdate(toCurrentSensorState(snapshot.data()))
        } else {
          onUpdate(null)
        }
      },
      (error) => {
        if (import.meta.env.DEV) {
          console.error('[SmartPantry Sensor] Current state snapshot error:', error.code, error.message)
        }
        onError(mapFirestoreError(error))
      }
    )

    return unsubscribe
  },

  subscribeReadings(
    userId: string,
    containerId: string = CONTAINER_ID,
    onUpdate: (readings: SensorReading[]) => void,
    onError: (err: Error) => void,
    limitCount: number = 30
  ): () => void {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      onUpdate(readLocalReadings().slice(0, limitCount))
      return () => {}
    }

    const services = getFirebaseServices()
    if (!services) {
      onUpdate(readLocalReadings().slice(0, limitCount))
      return () => {}
    }

    const readingsCol = collection(services.db, 'users', userId, 'sensorReadings')
    let fallbackUnsubscribe: (() => void) | null = null
    let isCleanedUp = false

    const handleDocs = (docs: Array<{ id: string; data: () => DocumentData }>) => {
      const list = docs.map((d) => toSensorReading(d.id, d.data()))
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      onUpdate(list.slice(0, limitCount))
    }

    const q = query(
      readingsCol,
      where('containerId', '==', containerId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        handleDocs(snapshot.docs)
      },
      (error) => {
        if (isCleanedUp) return
        // If composite index is missing or building, fall back to timestamp-ordered query
        // Single field ordering by timestamp desc does NOT require a composite index in Firestore!
        if (error.code === 'failed-precondition' || error.code === 'invalid-argument') {
          const fallbackQuery = query(
            readingsCol,
            orderBy('timestamp', 'desc'),
            limit(Math.max(limitCount * 2, 60))
          )
          fallbackUnsubscribe = onSnapshot(
            fallbackQuery,
            (s) => {
              const matched = s.docs.filter((d) => {
                const data = d.data()
                return !data.containerId || data.containerId === containerId
              })
              handleDocs(matched)
            },
            (fallbackErr) => {
              if (import.meta.env.DEV) {
                console.error('[SmartPantry Sensor] Fallback snapshot error:', fallbackErr)
              }
              onError(mapFirestoreError(fallbackErr))
            }
          )
          return
        }
        if (import.meta.env.DEV) {
          console.error('[SmartPantry Sensor] Readings snapshot error:', error.code, error.message)
        }
        onError(mapFirestoreError(error))
      }
    )

    return () => {
      isCleanedUp = true
      unsubscribe()
      if (fallbackUnsubscribe) {
        fallbackUnsubscribe()
      }
    }
  },

  async getCurrentState(userId?: string, containerId: string = CONTAINER_ID): Promise<CurrentSensorState | null> {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      return readLocalState()
    }

    try {
      const services = getFirebaseServices()
      if (!services) return readLocalState()

      const stateDocRef = doc(services.db, 'users', userId, 'currentSensorState', containerId)
      const snapshot = await getDoc(stateDocRef)
      if (snapshot.exists()) {
        return toCurrentSensorState(snapshot.data())
      }
      return null
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async getRecentReadings(
    userId?: string,
    containerId: string = CONTAINER_ID,
    limitCount: number = 30
  ): Promise<SensorReading[]> {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      return readLocalReadings().slice(0, limitCount)
    }

    try {
      const services = getFirebaseServices()
      if (!services) return readLocalReadings().slice(0, limitCount)

      const readingsCol = collection(services.db, 'users', userId, 'sensorReadings')
      try {
        const snapshot = await getDocs(
          query(
            readingsCol,
            where('containerId', '==', containerId),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
          )
        )
        const readings = snapshot.docs.map((d) => toSensorReading(d.id, d.data()))
        readings.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        return readings
      } catch (err: unknown) {
        // Fallback to single-field index (timestamp desc) if composite index is absent
        const fallbackSnap = await getDocs(
          query(readingsCol, orderBy('timestamp', 'desc'), limit(Math.max(limitCount * 2, 60)))
        )
        const readings = fallbackSnap.docs
          .map((d) => toSensorReading(d.id, d.data()))
          .filter((r) => !r.containerId || r.containerId === containerId)
          .slice(0, limitCount)
        readings.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        return readings
      }
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },
}

import { randomUUID } from 'node:crypto'
import type { CurrentSensorStateDoc, HistoricalSensorReadingDoc, ValidatedSensorData } from './types'

export interface FirestoreServiceConfig {
  defaultUserId?: string
  projectId?: string
}

export class FirestoreSensorService {
  private inMemoryCurrentState: Map<string, CurrentSensorStateDoc> = new Map()
  private inMemoryHistory: HistoricalSensorReadingDoc[] = []
  private defaultUserId: string

  constructor(config?: FirestoreServiceConfig) {
    this.defaultUserId = config?.defaultUserId || process.env.PANTRY_USER_ID || 'local-user'
  }

  async saveReading(
    data: ValidatedSensorData,
    userId: string = this.defaultUserId
  ): Promise<{ readingId: string; currentState: CurrentSensorStateDoc }> {
    const readingId = `reading_${Date.now()}_${randomUUID().slice(0, 8)}`

    const currentState: CurrentSensorStateDoc = {
      containerId: data.containerId,
      deviceId: data.deviceId,
      currentWeight: data.weightGrams,
      weightUnit: 'g',
      temperature: data.temperatureC,
      humidity: data.humidityPercent,
      lastUpdated: data.timestamp,
      sensorStatus: data.sensorStatus,
      ...(data.rawWeightGrams !== undefined ? { rawWeight: data.rawWeightGrams } : {}),
      ...(data.firmwareVersion ? { firmwareVersion: data.firmwareVersion } : {}),
      ...(data.sequenceNumber !== undefined ? { sequenceNumber: data.sequenceNumber } : {}),
    }

    const historyDoc: HistoricalSensorReadingDoc = {
      id: readingId,
      deviceId: data.deviceId,
      containerId: data.containerId,
      trackingMethod: 'load-cell',
      measuredWeight: data.weightGrams,
      weightUnit: 'g',
      temperature: data.temperatureC,
      humidity: data.humidityPercent,
      timestamp: data.timestamp,
      sensorStatus: data.sensorStatus,
      ...(data.rawWeightGrams !== undefined ? { rawWeight: data.rawWeightGrams } : {}),
    }

    // Save in in-memory state
    const stateKey = `${userId}:${data.containerId}`
    this.inMemoryCurrentState.set(stateKey, currentState)
    this.inMemoryHistory.unshift(historyDoc)
    if (this.inMemoryHistory.length > 500) {
      this.inMemoryHistory.pop()
    }

    return { readingId, currentState }
  }

  getCurrentState(containerId: string = 'container-01', userId: string = this.defaultUserId): CurrentSensorStateDoc | null {
    const stateKey = `${userId}:${containerId}`
    return this.inMemoryCurrentState.get(stateKey) || null
  }

  getHistory(
    containerId: string = 'container-01',
    limit: number = 50
  ): HistoricalSensorReadingDoc[] {
    return this.inMemoryHistory
      .filter((r) => r.containerId === containerId)
      .slice(0, limit)
  }

  clear(): void {
    this.inMemoryCurrentState.clear()
    this.inMemoryHistory = []
  }
}

export const sensorFirestoreService = new FirestoreSensorService()

import { randomUUID } from 'node:crypto'
import dotenv from 'dotenv'
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import type { CurrentSensorStateDoc, HistoricalSensorReadingDoc, ValidatedSensorData } from './types'

dotenv.config({ path: '.env.local' })
dotenv.config()

export type PersistenceMode = 'firestore' | 'memory'

export interface FirestoreServiceConfig {
  mode?: PersistenceMode
  defaultUserId?: string
  projectId?: string
  db?: Firestore
  deviceUserMap?: Record<string, string>
}

export class FirestoreSensorService {
  private inMemoryCurrentState: Map<string, CurrentSensorStateDoc> = new Map()
  private inMemoryHistory: HistoricalSensorReadingDoc[] = []
  private defaultUserId: string
  private mode: PersistenceMode
  private db: Firestore | null = null
  private deviceUserMap: Record<string, string> = {}

  constructor(config?: FirestoreServiceConfig) {
    this.defaultUserId = config?.defaultUserId || process.env.PANTRY_USER_ID || 'local-user'

    // Parse device-user mapping if provided
    if (config?.deviceUserMap) {
      this.deviceUserMap = { ...config.deviceUserMap }
    } else if (process.env.DEVICE_USER_MAPPINGS) {
      try {
        this.deviceUserMap = JSON.parse(process.env.DEVICE_USER_MAPPINGS)
      } catch (err) {
        console.warn(
          '[FirestoreSensorService] Failed to parse DEVICE_USER_MAPPINGS environment variable:',
          err
        )
      }
    }

    // Determine persistence mode explicitly:
    // 1. Explicit config option
    // 2. Explicit environment flag FIRESTORE_PERSISTENCE_MODE
    // 3. Fallback to memory in unit test environments (unless explicitly set to firestore)
    // 4. Default to 'firestore' for production and regular runtime
    if (config?.mode) {
      this.mode = config.mode
    } else if (process.env.FIRESTORE_PERSISTENCE_MODE === 'memory') {
      this.mode = 'memory'
    } else if (process.env.NODE_ENV === 'test' && !process.env.FIRESTORE_PERSISTENCE_MODE) {
      this.mode = 'memory'
    } else {
      this.mode = 'firestore'
    }

    if (this.mode === 'memory') {
      console.log('[FirestoreSensorService] Operating in explicitly configured in-memory persistence mode.')
      return
    }

    // Initialize Firestore for 'firestore' mode
    if (config?.db) {
      this.db = config.db
    } else {
      this.db = this.initFirebaseAdmin(config?.projectId)
    }
  }

  private initFirebaseAdmin(configuredProjectId?: string): Firestore {
    const existingApps = getApps()
    if (existingApps.length > 0) {
      return getFirestore(existingApps[0])
    }

    const projectId =
      configuredProjectId ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID

    // Check for inline JSON service account key
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim()
        const serviceAccount = JSON.parse(
          rawKey.startsWith('{') ? rawKey : Buffer.from(rawKey, 'base64').toString('utf8')
        )
        const app = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || serviceAccount.projectId || projectId,
        })
        return getFirestore(app)
      } catch (err) {
        throw new Error(
          `[FirestoreSensorService] Invalid FIREBASE_SERVICE_ACCOUNT_KEY: ${(err as Error).message}`
        )
      }
    }

    // Check for service account file path
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const app = initializeApp({
        credential: cert(process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
        projectId,
      })
      return getFirestore(app)
    }

    // Check for Google Application Default Credentials
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const app = initializeApp({
        credential: applicationDefault(),
        projectId,
      })
      return getFirestore(app)
    }

    // Check for Firestore Emulator
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      const app = initializeApp({
        projectId: projectId || 'demo-smart-pantry',
      })
      return getFirestore(app)
    }

    // Attempt default project initialization if projectId is available
    if (projectId) {
      try {
        const app = initializeApp({
          credential: applicationDefault(),
          projectId,
        })
        return getFirestore(app)
      } catch (err) {
        throw new Error(
          `[FirestoreSensorService] Failed to initialize Firebase Admin with projectId '${projectId}': ${(err as Error).message}`
        )
      }
    }

    // Never silently fall back to in-memory mode when firestore mode is requested
    throw new Error(
      '[FirestoreSensorService] Firebase Admin initialization failed: No credentials found. ' +
        'Set FIREBASE_SERVICE_ACCOUNT_KEY, FIREBASE_SERVICE_ACCOUNT_PATH, GOOGLE_APPLICATION_CREDENTIALS, ' +
        'or set FIRESTORE_PERSISTENCE_MODE=memory for in-memory testing.'
    )
  }

  /**
   * Securely maps an incoming hardware deviceId to its authorized Firestore userId.
   * Devices cannot dictate their target user in the telemetry body.
   */
  public resolveUserId(deviceId: string): string {
    const mapped = this.deviceUserMap[deviceId]
    if (mapped && mapped.trim()) {
      return mapped.trim()
    }
    if (this.defaultUserId && this.defaultUserId.trim()) {
      return this.defaultUserId.trim()
    }
    throw new Error(
      `Security error: No authorized user mapped to device '${deviceId}'. Configure DEVICE_USER_MAPPINGS or PANTRY_USER_ID.`
    )
  }

  public getMode(): PersistenceMode {
    return this.mode
  }

  async saveReading(
    data: ValidatedSensorData,
    overrideUserId?: string
  ): Promise<{ readingId: string; currentState: CurrentSensorStateDoc }> {
    const userId = overrideUserId || this.resolveUserId(data.deviceId)
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

    if (this.mode === 'firestore') {
      if (!this.db) {
        throw new Error('[FirestoreSensorService] Firestore database connection is not available.')
      }

      // Write both currentState and sensorReadings atomically in a Firestore write batch
      const batch = this.db.batch()
      const currentStateRef = this.db.doc(
        `users/${userId}/currentSensorState/${data.containerId}`
      )
      const historyReadingRef = this.db.doc(
        `users/${userId}/sensorReadings/${readingId}`
      )

      batch.set(currentStateRef, currentState, { merge: true })
      batch.set(historyReadingRef, historyDoc)

      // If commit fails, the error will bubble up and prevent a false success response
      await batch.commit()
    }

    // Update in-memory cache for fast status checks and historical endpoint queries
    const stateKey = `${userId}:${data.containerId}`
    this.inMemoryCurrentState.set(stateKey, currentState)
    this.inMemoryHistory.unshift(historyDoc)
    if (this.inMemoryHistory.length > 500) {
      this.inMemoryHistory.pop()
    }

    return { readingId, currentState }
  }

  getCurrentState(
    containerId: string = 'container-01',
    userId: string = this.defaultUserId
  ): CurrentSensorStateDoc | null {
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

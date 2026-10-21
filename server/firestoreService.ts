import { randomUUID } from 'node:crypto'
import dotenv from 'dotenv'
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import type { CurrentSensorStateDoc, HistoricalSensorReadingDoc, ValidatedSensorData } from './types'
import type {
  ActiveAlertSnapshot,
  CompactPantryContext,
  PantryItemSnapshot,
  SensorTelemetrySnapshot,
} from './aiTypes.ts'

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

  private inMemoryItems: Map<string, PantryItemSnapshot[]> = new Map()

  setInMemoryItems(userId: string, items: PantryItemSnapshot[]) {
    this.inMemoryItems.set(userId, items)
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

  async getPantryContext(
    userId: string = this.defaultUserId,
    clientContextFallback?: Partial<CompactPantryContext>
  ): Promise<CompactPantryContext> {
    const sensorStateDoc = this.getCurrentState('container-01', userId)

    let sensorSnapshot: SensorTelemetrySnapshot | null = null
    if (sensorStateDoc) {
      const isStale = Date.now() - new Date(sensorStateDoc.lastUpdated).getTime() > 5 * 60 * 1000
      sensorSnapshot = {
        containerId: sensorStateDoc.containerId,
        currentWeight: sensorStateDoc.currentWeight,
        weightUnit: sensorStateDoc.weightUnit || 'g',
        temperature: sensorStateDoc.temperature,
        humidity: sensorStateDoc.humidity,
        lastUpdated: sensorStateDoc.lastUpdated,
        sensorStatus: sensorStateDoc.sensorStatus,
        isStale,
      }
    }

    // If firestore is available, query actual user items & alerts
    if (this.mode === 'firestore' && this.db) {
      try {
        const itemsSnap = await this.db.collection(`users/${userId}/items`).limit(50).get()
        const items: PantryItemSnapshot[] = itemsSnap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: String(data.name || 'Unnamed item'),
            category: String(data.category || 'Other'),
            quantity: typeof data.initialQuantity === 'number' ? data.initialQuantity : 0,
            unit: String(data.quantityUnit || 'g'),
            expiryDate: typeof data.expiryDate === 'string' ? data.expiryDate : undefined,
            containerId: typeof data.containerId === 'string' ? data.containerId : null,
            trackingMethod: typeof data.trackingMethod === 'string' ? data.trackingMethod : 'manual',
          }
        })

        // Also fetch current state directly from Firestore if not in memory
        if (!sensorSnapshot) {
          const stateDoc = await this.db.doc(`users/${userId}/currentSensorState/container-01`).get()
          if (stateDoc.exists) {
            const data = stateDoc.data() as CurrentSensorStateDoc
            const isStale = Date.now() - new Date(data.lastUpdated).getTime() > 5 * 60 * 1000
            sensorSnapshot = {
              containerId: data.containerId,
              currentWeight: data.currentWeight,
              weightUnit: data.weightUnit || 'g',
              temperature: data.temperature,
              humidity: data.humidity,
              lastUpdated: data.lastUpdated,
              sensorStatus: data.sensorStatus,
              isStale,
            }
          }
        }

        const alertsSnap = await this.db
          .collection(`users/${userId}/alerts`)
          .where('status', '==', 'active')
          .limit(20)
          .get()

        const activeAlerts: ActiveAlertSnapshot[] = alertsSnap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            type: String(data.type || 'alert'),
            title: String(data.title || ''),
            message: String(data.message || ''),
            severity: typeof data.severity === 'string' ? data.severity : undefined,
          }
        })

        return {
          userId,
          timestamp: new Date().toISOString(),
          items: items.length > 0 ? items : clientContextFallback?.items || [],
          sensorState: sensorSnapshot || clientContextFallback?.sensorState || null,
          activeAlerts,
        }
      } catch (err) {
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[FirestoreSensorService] Error loading context from Firestore:', (err as Error).message)
        }
      }
    }

    // Fallback to in-memory or provided fallback data
    return {
      userId,
      timestamp: new Date().toISOString(),
      items: clientContextFallback?.items || this.inMemoryItems.get(userId) || [],
      sensorState: sensorSnapshot || clientContextFallback?.sensorState || null,
      activeAlerts: clientContextFallback?.activeAlerts || [],
    }
  }

  clear(): void {
    this.inMemoryCurrentState.clear()
    this.inMemoryHistory = []
    this.inMemoryItems.clear()
  }
}

export const sensorFirestoreService = new FirestoreSensorService()

import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import request from 'supertest'
import { getApps, deleteApp } from 'firebase-admin/app'
import { createApp, safeCompareTokens } from '../app'
import { FirestoreSensorService } from '../firestoreService'

describe('Sensor Ingestion API', () => {
  let service: FirestoreSensorService
  let app: ReturnType<typeof createApp>
  const testToken = 'test-secret-token'

  beforeEach(() => {
    service = new FirestoreSensorService({ mode: 'memory', defaultUserId: 'test-user-01' })
    app = createApp({ service, deviceToken: testToken })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('GET /api/health returns healthy status and persistence mode', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('healthy')
    expect(res.body.persistenceMode).toBe('memory')
  })

  it('POST /api/sensors/reading rejects requests with missing or invalid token', async () => {
    const validBody = {
      deviceId: 'device-01',
      containerId: 'container-01',
      timestamp: new Date().toISOString(),
      weightGrams: 2450,
      temperatureC: 22.5,
      humidityPercent: 55,
    }

    // No token
    const noTokenRes = await request(app).post('/api/sensors/reading').send(validBody)
    expect(noTokenRes.status).toBe(401)
    expect(noTokenRes.body.success).toBe(false)

    // Wrong token
    const wrongTokenRes = await request(app)
      .post('/api/sensors/reading')
      .set('x-device-token', 'wrong-token')
      .send(validBody)
    expect(wrongTokenRes.status).toBe(401)
  })

  it('POST /api/sensors/reading ingests valid reading with correct x-device-token in memory mode', async () => {
    const validBody = {
      deviceId: 'device-01',
      containerId: 'container-01',
      timestamp: new Date().toISOString(),
      weightGrams: 1850.5,
      temperatureC: 24.1,
      humidityPercent: 62.0,
      sensorStatus: 'ok',
    }

    const res = await request(app)
      .post('/api/sensors/reading')
      .set('x-device-token', testToken)
      .send(validBody)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.readingId).toBeDefined()
    expect(res.body.currentState.currentWeight).toBe(1850.5)
    expect(res.body.currentState.temperature).toBe(24.1)
    expect(res.body.currentState.humidity).toBe(62)

    // Verify current state endpoint returns updated reading
    const currentRes = await request(app).get('/api/sensors/current/container-01')
    expect(currentRes.status).toBe(200)
    expect(currentRes.body.state.currentWeight).toBe(1850.5)

    // Verify history endpoint contains the reading
    const historyRes = await request(app).get('/api/sensors/history/container-01')
    expect(historyRes.status).toBe(200)
    expect(historyRes.body.count).toBe(1)
    expect(historyRes.body.history[0].measuredWeight).toBe(1850.5)
  })

  it('POST /api/sensors/reading accepts Authorization: Bearer token', async () => {
    const validBody = {
      deviceId: 'device-01',
      containerId: 'container-01',
      timestamp: new Date().toISOString(),
      weightGrams: 950,
      temperatureC: 21.0,
      humidityPercent: 50.0,
    }

    const res = await request(app)
      .post('/api/sensors/reading')
      .set('Authorization', `Bearer ${testToken}`)
      .send(validBody)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('POST /api/sensors/reading rejects invalid payload and returns 400', async () => {
    const invalidBody = {
      deviceId: 'device-01',
      containerId: 'container-01',
      timestamp: new Date().toISOString(),
      weightGrams: 'not-a-number',
      temperatureC: 150, // Out of range
      humidityPercent: 120, // > 100
    }

    const res = await request(app)
      .post('/api/sensors/reading')
      .set('x-device-token', testToken)
      .send(invalidBody)

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.errors.length).toBeGreaterThan(0)
  })

  describe('Security & Authentication Hardening', () => {
    it('safeCompareTokens handles exact match, length mismatch, and character differences safely', () => {
      expect(safeCompareTokens('secret-123', 'secret-123')).toBe(true)
      expect(safeCompareTokens('secret-123', 'secret-124')).toBe(false)
      expect(safeCompareTokens('short', 'much-longer-token')).toBe(false)
      expect(safeCompareTokens('', 'secret')).toBe(false)
      expect(safeCompareTokens('secret', '')).toBe(false)
    })

    it('createApp throws fatal error in production when DEVICE_AUTH_TOKEN is missing', () => {
      const prevEnv = process.env.NODE_ENV
      const prevToken = process.env.DEVICE_AUTH_TOKEN
      try {
        process.env.NODE_ENV = 'production'
        delete process.env.DEVICE_AUTH_TOKEN

        expect(() => createApp({ service })).toThrow(/DEVICE_AUTH_TOKEN environment variable must be set/)
      } finally {
        process.env.NODE_ENV = prevEnv
        if (prevToken !== undefined) {
          process.env.DEVICE_AUTH_TOKEN = prevToken
        }
      }
    })

    it('ignores client-supplied userId in payload and maps to configured owner', async () => {
      const mappedService = new FirestoreSensorService({
        mode: 'memory',
        deviceUserMap: { 'device-01': 'authorized-owner-42' },
        defaultUserId: 'fallback-user',
      })
      const mappedApp = createApp({ service: mappedService, deviceToken: testToken })

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const payloadWithAttackerUserId = {
        deviceId: 'device-01',
        containerId: 'container-01',
        timestamp: new Date().toISOString(),
        weightGrams: 1200,
        temperatureC: 22.0,
        humidityPercent: 48.0,
        userId: 'victim-user-to-hijack', // Untrusted input
      }

      const res = await request(mappedApp)
        .post('/api/sensors/reading')
        .set('x-device-token', testToken)
        .send(payloadWithAttackerUserId)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      // Verified stored under mapped user 'authorized-owner-42'
      const state = mappedService.getCurrentState('container-01', 'authorized-owner-42')
      expect(state).not.toBeNull()
      expect(state?.currentWeight).toBe(1200)

      // Verified NOT stored under victim-user-to-hijack
      const victimState = mappedService.getCurrentState('container-01', 'victim-user-to-hijack')
      expect(victimState).toBeNull()

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("included client-supplied 'userId'")
      )
    })
  })

  describe('Firestore Persistence & Failure Handling', () => {
    it('persists readings to Cloud Firestore using an atomic batch write', async () => {
      const mockSet = vi.fn()
      const mockCommit = vi.fn().mockResolvedValue([])
      const mockBatch = {
        set: mockSet,
        commit: mockCommit,
      }
      const mockDoc = vi.fn((path: string) => ({ path }))
      const mockDb = {
        batch: vi.fn(() => mockBatch),
        doc: mockDoc,
      } as unknown as import('firebase-admin/firestore').Firestore

      const firestoreService = new FirestoreSensorService({
        mode: 'firestore',
        db: mockDb,
        defaultUserId: 'user-pantry-99',
      })
      const firestoreApp = createApp({ service: firestoreService, deviceToken: testToken })

      const validPayload = {
        deviceId: 'device-01',
        containerId: 'container-01',
        timestamp: new Date().toISOString(),
        weightGrams: 2150.5,
        temperatureC: 23.4,
        humidityPercent: 58.2,
        sensorStatus: 'ok',
      }

      const res = await request(firestoreApp)
        .post('/api/sensors/reading')
        .set('x-device-token', testToken)
        .send(validPayload)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.readingId).toBeDefined()

      // Verify atomic batch creation and document paths
      expect(mockDb.batch).toHaveBeenCalledTimes(1)
      expect(mockDoc).toHaveBeenCalledWith('users/user-pantry-99/currentSensorState/container-01')
      expect(mockDoc).toHaveBeenCalledWith(expect.stringContaining('users/user-pantry-99/sensorReadings/'))

      // Verify batch.set calls (currentState with merge: true, and historical doc)
      expect(mockSet).toHaveBeenCalledTimes(2)
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/user-pantry-99/currentSensorState/container-01' }),
        expect.objectContaining({
          containerId: 'container-01',
          currentWeight: 2150.5,
          temperature: 23.4,
          humidity: 58.2,
        }),
        { merge: true }
      )
      expect(mockCommit).toHaveBeenCalledTimes(1)
    })

    it('returns 500 when Firestore batch commit fails and does NOT report false success', async () => {
      const mockSet = vi.fn()
      const mockCommit = vi.fn().mockRejectedValue(new Error('Cloud Firestore unavailable / quota exceeded'))
      const mockBatch = {
        set: mockSet,
        commit: mockCommit,
      }
      const mockDoc = vi.fn((path: string) => ({ path }))
      const mockDb = {
        batch: vi.fn(() => mockBatch),
        doc: mockDoc,
      } as unknown as import('firebase-admin/firestore').Firestore

      const firestoreService = new FirestoreSensorService({
        mode: 'firestore',
        db: mockDb,
        defaultUserId: 'user-pantry-99',
      })
      const firestoreApp = createApp({ service: firestoreService, deviceToken: testToken })

      const validPayload = {
        deviceId: 'device-01',
        containerId: 'container-01',
        timestamp: new Date().toISOString(),
        weightGrams: 1500,
        temperatureC: 22.0,
        humidityPercent: 50.0,
      }

      const res = await request(firestoreApp)
        .post('/api/sensors/reading')
        .set('x-device-token', testToken)
        .send(validPayload)

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toContain('Cloud Firestore unavailable')
    })

    it('fails safely with descriptive error when firestore mode is requested without credentials', async () => {
      const prevKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      const prevPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      const prevCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS
      const prevProj = process.env.FIREBASE_PROJECT_ID
      const prevViteProj = process.env.VITE_FIREBASE_PROJECT_ID
      const prevEmu = process.env.FIRESTORE_EMULATOR_HOST

      const existingApps = getApps()
      for (const a of existingApps) {
        await deleteApp(a)
      }

      try {
        delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS
        delete process.env.FIREBASE_PROJECT_ID
        delete process.env.VITE_FIREBASE_PROJECT_ID
        delete process.env.FIRESTORE_EMULATOR_HOST

        expect(
          () => new FirestoreSensorService({ mode: 'firestore', defaultUserId: 'test-user' })
        ).toThrow(/Firebase Admin initialization failed/)
      } finally {
        if (prevKey) process.env.FIREBASE_SERVICE_ACCOUNT_KEY = prevKey
        if (prevPath) process.env.FIREBASE_SERVICE_ACCOUNT_PATH = prevPath
        if (prevCreds) process.env.GOOGLE_APPLICATION_CREDENTIALS = prevCreds
        if (prevProj) process.env.FIREBASE_PROJECT_ID = prevProj
        if (prevViteProj) process.env.VITE_FIREBASE_PROJECT_ID = prevViteProj
        if (prevEmu) process.env.FIRESTORE_EMULATOR_HOST = prevEmu
      }
    })
  })
})


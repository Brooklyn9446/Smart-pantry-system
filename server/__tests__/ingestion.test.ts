import { describe, expect, it, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app'
import { FirestoreSensorService } from '../firestoreService'

describe('Sensor Ingestion API', () => {
  let service: FirestoreSensorService
  let app: ReturnType<typeof createApp>
  const testToken = 'test-secret-token'

  beforeEach(() => {
    service = new FirestoreSensorService()
    app = createApp({ service, deviceToken: testToken })
  })

  it('GET /api/health returns healthy status', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('healthy')
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

  it('POST /api/sensors/reading ingests valid reading with correct x-device-token', async () => {
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
})

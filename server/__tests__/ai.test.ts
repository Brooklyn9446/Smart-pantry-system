import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { FirestoreSensorService } from '../firestoreService.ts'
import { AICacheAndLimiterService } from '../aiCacheService.ts'
import { GeminiAssistantService } from '../geminiService.ts'

describe('Gemini AI Pantry Assistant Backend API', () => {
  let sensorService: FirestoreSensorService
  let aiCacheService: AICacheAndLimiterService
  let geminiService: GeminiAssistantService
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    sensorService = new FirestoreSensorService({ mode: 'memory', defaultUserId: 'test-user-01' })
    geminiService = new GeminiAssistantService({ mockMode: true })
    aiCacheService = new AICacheAndLimiterService(geminiService)
    aiCacheService.clearAll()

    app = createApp({
      service: sensorService,
      aiService: aiCacheService,
      deviceToken: 'test-token',
    })
  })

  describe('Cache-First Retrieval (GET /api/ai/recommendations)', () => {
    it('returns null analysis when cold without invoking Gemini', async () => {
      const res = await request(app)
        .get('/api/ai/recommendations')
        .set('x-user-id', 'test-user-01')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.cached).toBe(false)
      expect(res.body.analysis).toBeNull()
    })

    it('returns cached analysis once generated', async () => {
      // Seed an item in memory
      sensorService.setInMemoryItems('test-user-01', [
        {
          id: 'item-1',
          name: 'Basmati Rice',
          category: 'Grains & cereals',
          quantity: 2,
          unit: 'kg',
          containerId: 'container-01',
        },
      ])

      // 1. Trigger analysis
      const analyzeRes = await request(app)
        .post('/api/ai/analyze')
        .set('x-user-id', 'test-user-01')
        .send({ forceFresh: true })

      expect(analyzeRes.status).toBe(200)
      expect(analyzeRes.body.success).toBe(true)
      expect(analyzeRes.body.fromCache).toBe(false)
      expect(analyzeRes.body.analysis).toBeDefined()
      expect(analyzeRes.body.analysis.summary).toContain('Pantry tracking 1 item(s)')

      // 2. GET recommendations should return cached data without generating new
      const getRes = await request(app)
        .get('/api/ai/recommendations')
        .set('x-user-id', 'test-user-01')

      expect(getRes.status).toBe(200)
      expect(getRes.body.cached).toBe(true)
      expect(getRes.body.analysis.summary).toBe(analyzeRes.body.analysis.summary)
    })
  })

  describe('Cooldown and Rate Limiting', () => {
    it('enforces cooldown on rapid consecutive fresh analysis requests', async () => {
      // First analysis
      const first = await request(app)
        .post('/api/ai/analyze')
        .set('x-user-id', 'test-user-01')
        .send({ forceFresh: true })

      expect(first.status).toBe(200)
      expect(first.body.fromCache).toBe(false)

      // Immediate second analysis should be subject to cooldown and return cached
      const second = await request(app)
        .post('/api/ai/analyze')
        .set('x-user-id', 'test-user-01')
        .send({ forceFresh: true })

      expect(second.status).toBe(200)
      expect(second.body.fromCache).toBe(true)
      expect(second.body.cooldownNotice).toContain('Analysis is on cooldown')
    })

    it('enforces rate limit when token bucket is exhausted', async () => {
      const userId = 'rate-limited-user'

      // Exhaust the 10-token bucket
      for (let i = 0; i < 10; i++) {
        aiCacheService.checkRateLimit(userId)
      }

      // Next chat request should return 429
      const res = await request(app)
        .post('/api/ai/chat')
        .set('x-user-id', userId)
        .send({ message: 'What do I have?' })

      expect(res.status).toBe(429)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toContain('Chat rate limit reached')
    })
  })

  describe('Interactive Chat (POST /api/ai/chat)', () => {
    it('rejects empty or whitespace-only messages with 400', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('x-user-id', 'test-user-01')
        .send({ message: '   ' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toContain('"message" is required')
    })

    it('rejects messages exceeding 1000 characters with 400', async () => {
      const longMessage = 'a'.repeat(1001)
      const res = await request(app)
        .post('/api/ai/chat')
        .set('x-user-id', 'test-user-01')
        .send({ message: longMessage })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Message exceeds maximum length')
    })

    it('answers inventory questions grounded in real pantry data', async () => {
      sensorService.setInMemoryItems('test-user-01', [
        {
          id: 'item-rice',
          name: 'Jasmine Rice',
          category: 'Grains & cereals',
          quantity: 2,
          unit: 'kg',
        },
      ])

      const res = await request(app)
        .post('/api/ai/chat')
        .set('x-user-id', 'test-user-01')
        .send({ message: 'What items do I have in my pantry?' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.response).toContain('Jasmine Rice')
      expect(res.body.supporting_facts).toBeDefined()
    })

    it('answers climate and sensor questions accurately', async () => {
      // Ingest a sensor reading
      await sensorService.saveReading({
        deviceId: 'device-01',
        containerId: 'container-01',
        weightGrams: 1850,
        temperatureC: 26.5,
        humidityPercent: 68.0,
        timestamp: new Date().toISOString(),
        sensorStatus: 'ok',
      }, 'test-user-01')

      const res = await request(app)
        .post('/api/ai/chat')
        .set('x-user-id', 'test-user-01')
        .send({ message: 'Explain my latest sensor readings and climate' })

      expect(res.status).toBe(200)
      expect(res.body.response).toContain('1850')
      expect(res.body.response).toContain('26.5°C')
      expect(res.body.response).toContain('68%')
    })
  })

  describe('User Isolation & Data Separation', () => {
    it('keeps cached analysis completely isolated between different users', async () => {
      sensorService.setInMemoryItems('user-alice', [
        { id: '1', name: 'Flour', category: 'Baking', quantity: 1, unit: 'kg' },
      ])
      sensorService.setInMemoryItems('user-bob', [
        { id: '2', name: 'Olive Oil', category: 'Other', quantity: 500, unit: 'ml' },
      ])

      // Alice generates analysis
      const aliceRes = await request(app)
        .post('/api/ai/analyze')
        .set('x-user-id', 'user-alice')
        .send({ forceFresh: true })

      expect(aliceRes.body.analysis.summary).toContain('Flour')

      // Bob's cache should still be null
      const bobCache = await request(app)
        .get('/api/ai/recommendations')
        .set('x-user-id', 'user-bob')

      expect(bobCache.body.cached).toBe(false)
      expect(bobCache.body.analysis).toBeNull()
    })
  })

  describe('Sensor Pipeline Independence', () => {
    it('sensor ingestion continues to work independently of AI failures or state', async () => {
      // Ingestion works via POST /api/sensors/reading
      const res = await request(app)
        .post('/api/sensors/reading')
        .set('x-device-token', 'test-token')
        .send({
          deviceId: 'device-01',
          containerId: 'container-01',
          weightGrams: 2100,
          temperatureC: 22.0,
          humidityPercent: 50.0,
          timestamp: new Date().toISOString(),
          sensorStatus: 'ok',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.currentState.currentWeight).toBe(2100)
    })
  })
})

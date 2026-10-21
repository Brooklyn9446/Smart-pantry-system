import crypto from 'node:crypto'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { validateSensorPayload } from './validator.ts'
import { FirestoreSensorService, sensorFirestoreService } from './firestoreService.ts'
import { AICacheAndLimiterService, aiCacheService as defaultAiCacheService } from './aiCacheService.ts'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

export interface CreateAppOptions {
  service?: FirestoreSensorService
  aiService?: AICacheAndLimiterService
  deviceToken?: string
  allowedDevices?: Set<string>
}

/**
 * Constant-time string comparison to defend against timing side-channel attacks on tokens.
 */
export function safeCompareTokens(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const providedBuf = Buffer.from(provided, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')

  if (providedBuf.length !== expectedBuf.length) {
    // Constant-time dummy comparison to prevent length timing leaks
    crypto.timingSafeEqual(providedBuf, providedBuf)
    return false
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf)
}

export function createApp(options?: CreateAppOptions) {
  const app = express()
  const service = options?.service || sensorFirestoreService
  const isProduction = process.env.NODE_ENV === 'production'

  let expectedToken = options?.deviceToken || process.env.DEVICE_AUTH_TOKEN

  if (!expectedToken) {
    if (isProduction) {
      throw new Error(
        'FATAL: DEVICE_AUTH_TOKEN environment variable must be set in production mode. Refusing to start with insecure defaults.'
      )
    }
    expectedToken = 'pantry-device-token-secret-2026'
    console.warn(
      '[Security Warning] DEVICE_AUTH_TOKEN is not configured. Using insecure development default token.'
    )
  }

  app.use(cors())
  app.use(express.json({ limit: '64kb' }))

  // Device Authentication Middleware for ingestion routes
  const authenticateDevice = (req: Request, res: Response, next: NextFunction): void => {
    const headerToken = req.headers['x-device-token'] as string | undefined
    const authHeader = req.headers['authorization']
    let token = headerToken

    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim()
    }

    if (!token || !safeCompareTokens(token, expectedToken)) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing or invalid device authentication token.',
      })
      return
    }

    next()
  }

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      service: 'smart-pantry-sensor-ingestion',
      persistenceMode: service.getMode(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  })

  // Ingestion endpoint (Secured with device token)
  app.post('/api/sensors/reading', authenticateDevice, async (req: Request, res: Response) => {
    // Security check: Ignore and warn if an unauthenticated device attempts to supply a target userId in payload
    if (req.body && typeof req.body === 'object' && 'userId' in req.body) {
      console.warn(
        `[Security] Ingestion payload for device '${(req.body as { deviceId?: string }).deviceId}' included client-supplied 'userId'. Ignored in favor of server device mapping.`
      )
    }

    const validation = validateSensorPayload(req.body, options?.allowedDevices)

    if (!validation.isValid || !validation.data) {
      res.status(400).json({
        success: false,
        message: 'Sensor payload validation failed',
        errors: validation.errors,
      })
      return
    }

    try {
      const { readingId, currentState } = await service.saveReading(validation.data)
      res.status(200).json({
        success: true,
        message: 'Sensor reading ingested successfully',
        readingId,
        currentState,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to persist sensor reading'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  })

  // Get current state for container
  app.get('/api/sensors/current/:containerId', (req: Request, res: Response) => {
    const containerId = req.params.containerId
    const state = service.getCurrentState(containerId)
    if (!state) {
      res.status(404).json({
        success: false,
        message: `No sensor state found for container '${containerId}'`,
      })
      return
    }
    res.status(200).json({ success: true, state })
  })

  // Get recent sensor history
  app.get('/api/sensors/history/:containerId', (req: Request, res: Response) => {
    const containerId = req.params.containerId
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200)
    const history = service.getHistory(containerId, limit)
    res.status(200).json({ success: true, count: history.length, history })
  })

  // =========================================================================
  // Gemini-Powered AI Pantry Assistant Endpoints
  // =========================================================================
  const ai = options?.aiService || defaultAiCacheService

  // Authenticate user middleware
  const authenticateUser = (req: Request, _res: Response, next: NextFunction): void => {
    const userIdHeader = req.headers['x-user-id'] as string | undefined
    const authHeader = req.headers['authorization']
    let resolvedUser = userIdHeader?.trim()

    if (!resolvedUser && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim()
      if (token && token.length > 0 && token !== expectedToken) {
        resolvedUser = token
      }
    }

    req.userId = resolvedUser || (process.env.PANTRY_USER_ID ? process.env.PANTRY_USER_ID.trim() : 'local-user')
    next()
  }

  // 1. GET /api/ai/recommendations - Cache-first retrieval (NEVER invokes Gemini)
  app.get('/api/ai/recommendations', authenticateUser, (req: Request, res: Response) => {
    const userId = req.userId!
    const cached = ai.getCachedAnalysis(userId)

    res.status(200).json({
      success: true,
      cached: cached !== null,
      analysis: cached,
    })
  })

  // 2. POST /api/ai/analyze - On-demand analysis request
  app.post('/api/ai/analyze', authenticateUser, async (req: Request, res: Response) => {
    const userId = req.userId!
    const forceFresh = req.body?.forceFresh !== false

    try {
      const context = await service.getPantryContext(userId, req.body?.clientContextFallback)
      const { analysis, fromCache, cooldownNotice } = await ai.getOrFetchAnalysis(context, forceFresh)

      res.status(200).json({
        success: true,
        analysis,
        fromCache,
        cooldownNotice,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze pantry state'
      const status = message.toLowerCase().includes('rate limit') ? 429 : message.toLowerCase().includes('capacity') ? 503 : 500
      res.status(status).json({
        success: false,
        error: message,
      })
    }
  })

  // 3. POST /api/ai/chat - Interactive conversation with grounded pantry context
  app.post('/api/ai/chat', authenticateUser, async (req: Request, res: Response) => {
    const userId = req.userId!
    const message = req.body?.message

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({
        success: false,
        error: 'Invalid request: "message" is required and must be a non-empty string.',
      })
      return
    }

    if (message.length > 1000) {
      res.status(400).json({
        success: false,
        error: 'Message exceeds maximum length of 1000 characters.',
      })
      return
    }

    try {
      const context = await service.getPantryContext(userId, req.body?.clientContextFallback)
      const result = await ai.submitChatQuery(context, message.trim(), req.body?.history)

      res.status(200).json({
        success: true,
        response: result.response,
        supporting_facts: result.supporting_facts,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat query processing failed'
      const status = message.toLowerCase().includes('rate limit') ? 429 : 500
      res.status(status).json({
        success: false,
        error: message,
      })
    }
  })

  return app
}

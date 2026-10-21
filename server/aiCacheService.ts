import type { AIPantryAnalysis, CompactPantryContext } from './aiTypes.ts'
import { GeminiAssistantService, geminiAssistantService } from './geminiService.ts'

export interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

export interface RateLimitBucket {
  tokens: number
  lastRefill: number
  lastAnalyzeTimestamp: number
}

export class AICacheAndLimiterService {
  private analysisCache = new Map<string, CacheEntry<AIPantryAnalysis>>()
  private rateLimits = new Map<string, RateLimitBucket>()
  private inFlightAnalyses = new Map<string, Promise<AIPantryAnalysis>>()
  private inFlightChats = new Map<string, Promise<{ response: string; supporting_facts: string[] }>>()

  private geminiService: GeminiAssistantService

  // Configurable limits
  private cacheTtlMs: number = 15 * 60 * 1000 // 15 minutes default
  private cooldownMs: number = 10 * 1000 // 10 seconds between fresh analyses
  private maxRequestsPerMinute: number = 10
  private maxConcurrentCalls: number = 3
  private activeCalls: number = 0

  constructor(geminiService?: GeminiAssistantService) {
    this.geminiService = geminiService || geminiAssistantService
  }

  /**
   * Check and consume rate limit token for user.
   * Returns true if allowed, false if rate limited.
   */
  public checkRateLimit(userId: string): { allowed: boolean; remainingTokens: number; retryAfterSeconds?: number } {
    const now = Date.now()
    let bucket = this.rateLimits.get(userId)

    if (!bucket) {
      bucket = {
        tokens: this.maxRequestsPerMinute,
        lastRefill: now,
        lastAnalyzeTimestamp: 0,
      }
      this.rateLimits.set(userId, bucket)
    }

    // Refill tokens linearly
    const elapsedMinutes = (now - bucket.lastRefill) / (60 * 1000)
    if (elapsedMinutes >= 1) {
      bucket.tokens = this.maxRequestsPerMinute
      bucket.lastRefill = now
    } else {
      const tokensToAdd = Math.floor(elapsedMinutes * this.maxRequestsPerMinute)
      if (tokensToAdd > 0) {
        bucket.tokens = Math.min(this.maxRequestsPerMinute, bucket.tokens + tokensToAdd)
        bucket.lastRefill = now
      }
    }

    if (bucket.tokens <= 0) {
      const waitSeconds = Math.max(1, Math.ceil((60 * 1000 - (now - bucket.lastRefill)) / 1000))
      return { allowed: false, remainingTokens: 0, retryAfterSeconds: waitSeconds }
    }

    bucket.tokens -= 1
    return { allowed: true, remainingTokens: bucket.tokens }
  }

  /**
   * Check if user is in cooldown period for fresh analyses.
   */
  public checkCooldown(userId: string): { inCooldown: boolean; remainingSeconds: number } {
    const bucket = this.rateLimits.get(userId)
    if (!bucket || bucket.lastAnalyzeTimestamp === 0) {
      return { inCooldown: false, remainingSeconds: 0 }
    }

    const elapsed = Date.now() - bucket.lastAnalyzeTimestamp
    if (elapsed < this.cooldownMs) {
      return {
        inCooldown: true,
        remainingSeconds: Math.ceil((this.cooldownMs - elapsed) / 1000),
      }
    }

    return { inCooldown: false, remainingSeconds: 0 }
  }

  /**
   * Mark that a fresh analysis was just executed.
   */
  private recordAnalysisExecution(userId: string) {
    let bucket = this.rateLimits.get(userId)
    if (!bucket) {
      bucket = {
        tokens: this.maxRequestsPerMinute,
        lastRefill: Date.now(),
        lastAnalyzeTimestamp: Date.now(),
      }
      this.rateLimits.set(userId, bucket)
    } else {
      bucket.lastAnalyzeTimestamp = Date.now()
    }
  }

  /**
   * Get cached recommendations for user without invoking Gemini.
   */
  public getCachedAnalysis(userId: string): AIPantryAnalysis | null {
    const entry = this.analysisCache.get(userId)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.analysisCache.delete(userId)
      return null
    }

    return {
      ...entry.data,
      source: 'cache',
    }
  }

  /**
   * Save analysis to cache.
   */
  public setCachedAnalysis(userId: string, data: AIPantryAnalysis) {
    this.analysisCache.set(userId, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.cacheTtlMs,
    })
  }

  /**
   * Clear user cache (e.g. for testing or explicit invalidation).
   */
  public clearUserCache(userId: string) {
    this.analysisCache.delete(userId)
    this.rateLimits.delete(userId)
    this.inFlightAnalyses.delete(userId)
  }

  public clearAll() {
    this.analysisCache.clear()
    this.rateLimits.clear()
    this.inFlightAnalyses.clear()
    this.inFlightChats.clear()
    this.activeCalls = 0
  }

  /**
   * Request a pantry analysis.
   * - Uses existing cache if forceFresh=false or if cooldown active.
   * - Deduplicates in-flight calls for the same user.
   * - Enforces rate limits and concurrency limits.
   */
  public async getOrFetchAnalysis(
    context: CompactPantryContext,
    forceFresh: boolean = false
  ): Promise<{ analysis: AIPantryAnalysis; fromCache: boolean; cooldownNotice?: string }> {
    const userId = context.userId

    // 1. If not forcing fresh, return cached version if valid
    if (!forceFresh) {
      const cached = this.getCachedAnalysis(userId)
      if (cached) {
        return { analysis: cached, fromCache: true }
      }
    }

    // 2. Check cooldown if forcing fresh
    if (forceFresh) {
      const cooldown = this.checkCooldown(userId)
      if (cooldown.inCooldown) {
        const cached = this.getCachedAnalysis(userId)
        if (cached) {
          return {
            analysis: cached,
            fromCache: true,
            cooldownNotice: `Analysis is on cooldown. Showing recent recommendations (${cooldown.remainingSeconds}s remaining).`,
          }
        }
      }
    }

    // 3. Deduplication: Reuse in-flight request if already processing
    const inFlight = this.inFlightAnalyses.get(userId)
    if (inFlight) {
      const result = await inFlight
      return { analysis: result, fromCache: false }
    }

    // 4. Rate limit check
    const rateCheck = this.checkRateLimit(userId)
    if (!rateCheck.allowed) {
      const cached = this.getCachedAnalysis(userId)
      if (cached) {
        return {
          analysis: cached,
          fromCache: true,
          cooldownNotice: `Rate limit reached. Displaying cached analysis. Retry in ${rateCheck.retryAfterSeconds}s.`,
        }
      }
      throw new Error(`Rate limit exceeded. Please wait ${rateCheck.retryAfterSeconds} seconds before requesting a new analysis.`)
    }

    // 5. Concurrency check
    if (this.activeCalls >= this.maxConcurrentCalls) {
      const cached = this.getCachedAnalysis(userId)
      if (cached) {
        return {
          analysis: cached,
          fromCache: true,
          cooldownNotice: 'Service busy. Reusing cached analysis.',
        }
      }
      throw new Error('AI service is currently operating at maximum capacity. Please retry in a few moments.')
    }

    // 6. Execute Gemini call with deduplication
    const analysisPromise = (async () => {
      this.activeCalls++
      try {
        const analysis = await this.geminiService.generatePantryAnalysis(context)
        this.setCachedAnalysis(userId, analysis)
        this.recordAnalysisExecution(userId)
        return analysis
      } finally {
        this.activeCalls--
        this.inFlightAnalyses.delete(userId)
      }
    })()

    this.inFlightAnalyses.set(userId, analysisPromise)
    const analysis = await analysisPromise
    return { analysis, fromCache: false }
  }

  /**
   * Submit an interactive chat query with rate limiting and deduplication.
   */
  public async submitChatQuery(
    context: CompactPantryContext,
    userMessage: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ response: string; supporting_facts: string[] }> {
    const userId = context.userId

    // Rate limit check
    const rateCheck = this.checkRateLimit(userId)
    if (!rateCheck.allowed) {
      throw new Error(`Chat rate limit reached. Please wait ${rateCheck.retryAfterSeconds} seconds before sending another message.`)
    }

    // Deduplication key
    const dedupeKey = `${userId}:${userMessage.trim().toLowerCase()}`
    const inFlight = this.inFlightChats.get(dedupeKey)
    if (inFlight) {
      return inFlight
    }

    const chatPromise = (async () => {
      this.activeCalls++
      try {
        return await this.geminiService.answerChatQuestion(context, userMessage, history)
      } finally {
        this.activeCalls--
        this.inFlightChats.delete(dedupeKey)
      }
    })()

    this.inFlightChats.set(dedupeKey, chatPromise)
    return await chatPromise
  }
}

export const aiCacheService = new AICacheAndLimiterService()

import type {
  AnalyzeResponse,
  CachedRecommendationsResponse,
  ChatResponse,
} from '../types/ai'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // If a custom user ID is stored in localStorage or env, pass it
  const storedUser = localStorage.getItem('pantry_user_id')
  if (storedUser) {
    headers['x-user-id'] = storedUser
  }

  return headers
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await res.text()
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error(
        'The backend server returned an HTML page instead of JSON. Please make sure the backend server (`node server/index.ts` or `npm run server`) has been restarted with the latest AI routes running on port 3001.'
      )
    }
    throw new Error(`Unexpected non-JSON response from server (status ${res.status}): ${text.slice(0, 150)}`)
  }
  return (await res.json()) as T
}

export const aiRepository = {
  /**
   * Retrieves the current cached analysis without invoking Gemini.
   * Safe to call on page mount or background refresh.
   */
  async getCachedRecommendations(): Promise<CachedRecommendationsResponse> {
    try {
      const res = await fetch(`${API_BASE}/api/ai/recommendations`, {
        method: 'GET',
        headers: getAuthHeaders(),
      })

      if (!res.ok) {
        throw new Error(`Failed to load cached AI advice: HTTP ${res.status}`)
      }

      return await parseJsonResponse<CachedRecommendationsResponse>(res)
    } catch (err) {
      return {
        success: false,
        cached: false,
        analysis: null,
        error: err instanceof Error ? err.message : 'Network error loading cached advice',
      }
    }
  },

  /**
   * Triggers an on-demand analysis.
   * Enforces server-side cooldown (10s) and rate-limiting.
   */
  async runAnalysis(
    forceFresh: boolean = true,
    clientContextFallback?: Record<string, unknown>
  ): Promise<AnalyzeResponse> {
    try {
      const res = await fetch(`${API_BASE}/api/ai/analyze`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ forceFresh, clientContextFallback }),
      })

      const data = await parseJsonResponse<AnalyzeResponse>(res)
      if (!res.ok) {
        throw new Error(data.error || `Analysis request failed with status ${res.status}`)
      }

      return data
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Analysis request failed',
      }
    }
  },

  /**
   * Sends an interactive question to the Gemini pantry assistant.
   */
  async sendChat(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    clientContextFallback?: Record<string, unknown>
  ): Promise<ChatResponse> {
    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message, history, clientContextFallback }),
      })

      const data = await parseJsonResponse<ChatResponse>(res)
      if (!res.ok) {
        throw new Error(data.error || `Chat request failed with status ${res.status}`)
      }

      return data
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Chat query failed',
      }
    }
  },
}

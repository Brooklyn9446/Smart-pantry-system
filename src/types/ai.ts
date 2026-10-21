export interface AIRecommendationItem {
  id: string
  type: 'storage' | 'waste_reduction' | 'shopping' | 'general'
  title: string
  advice: string
  priority: 'high' | 'medium' | 'low'
  relatedItem?: string
}

export interface AIPantryAnalysis {
  summary: string
  recommendations: AIRecommendationItem[]
  warnings: string[]
  supporting_facts: string[]
  uncertainty_or_missing_data: string[]
  generated_at: string
  source: 'gemini' | 'cache' | 'mock-engine'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  supporting_facts?: string[]
}

export interface AnalyzeResponse {
  success: boolean
  analysis?: AIPantryAnalysis
  fromCache?: boolean
  cooldownNotice?: string
  error?: string
}

export interface ChatResponse {
  success: boolean
  response?: string
  supporting_facts?: string[]
  error?: string
}

export interface CachedRecommendationsResponse {
  success: boolean
  cached: boolean
  analysis: AIPantryAnalysis | null
  error?: string
}

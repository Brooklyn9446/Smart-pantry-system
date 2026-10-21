export interface PantryItemSnapshot {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
  expiryDate?: string
  containerId?: string | null
  trackingMethod?: string
}

export interface SensorTelemetrySnapshot {
  containerId: string
  currentWeight: number
  weightUnit: string
  temperature: number
  humidity: number
  lastUpdated: string
  sensorStatus: string
  isStale?: boolean
}

export interface ActiveAlertSnapshot {
  id: string
  type: string
  title: string
  message: string
  severity?: string
}

export interface CompactPantryContext {
  userId: string
  timestamp: string
  items: PantryItemSnapshot[]
  sensorState: SensorTelemetrySnapshot | null
  activeAlerts: ActiveAlertSnapshot[]
}

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

export interface ChatRequestPayload {
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

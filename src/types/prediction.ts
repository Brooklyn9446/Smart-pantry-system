import { CONTAINER_ID } from './inventory'

export type PredictionStatus = 'success' | 'insufficient_data' | 'empty_container' | 'stable' | 'error'
export type ConfidenceLevel = 'insufficient' | 'low' | 'moderate' | 'good'

export interface ProjectionPoint {
  timestamp: string
  weightGrams: number
  isProjection: boolean
}

export interface DepletionPrediction {
  status: PredictionStatus
  containerId: typeof CONTAINER_ID
  currentQuantityGrams: number
  dailyConsumptionRateGrams: number | null
  estimatedRemainingDays: number | null
  estimatedDepletionDate: string | null
  confidence: ConfidenceLevel
  r2Score: number | null
  maeGrams: number | null
  dataQualityMessage: string
  projections: ProjectionPoint[]
  lastCalculated: string
  source?: 'fastapi' | 'client-engine'
}

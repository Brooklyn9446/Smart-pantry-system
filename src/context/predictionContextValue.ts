import { createContext } from 'react'
import type { DepletionPrediction } from '../types/prediction'

export interface PredictionContextValue {
  prediction: DepletionPrediction | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export const PredictionContext = createContext<PredictionContextValue | null>(null)

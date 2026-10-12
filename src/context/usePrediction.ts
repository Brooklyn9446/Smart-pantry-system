import { useContext } from 'react'
import { PredictionContext, type PredictionContextValue } from './predictionContextValue'

export function usePrediction(): PredictionContextValue {
  const context = useContext(PredictionContext)
  if (!context) {
    throw new Error('usePrediction must be used within a PredictionProvider.')
  }
  return context
}

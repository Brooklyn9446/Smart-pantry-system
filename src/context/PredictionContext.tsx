import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { predictionRepository } from '../data/predictionRepository'
import { CONTAINER_ID } from '../types/inventory'
import type { DepletionPrediction } from '../types/prediction'
import { PredictionContext, type PredictionContextValue } from './predictionContextValue'
import { useQuantityHistory } from './useQuantityHistory'
import { useSensors } from './useSensors'

export function PredictionProvider({ children }: { children: ReactNode }) {
  const { netFoodWeightGrams, readings, isLoading: isSensorLoading } = useSensors()
  const { events, isLoading: isHistoryLoading } = useQuantityHistory()

  const [prediction, setPrediction] = useState<DepletionPrediction | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const computePrediction = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await predictionRepository.getDepletionPrediction(
        CONTAINER_ID,
        netFoodWeightGrams,
        readings,
        events
      )
      setPrediction(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to compute ML depletion prediction.'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [netFoodWeightGrams, readings, events])

  useEffect(() => {
    if (isSensorLoading || isHistoryLoading) return
    void computePrediction()
  }, [computePrediction, isSensorLoading, isHistoryLoading])

  const contextValue: PredictionContextValue = useMemo(
    () => ({
      prediction,
      isLoading: isLoading || isSensorLoading,
      error,
      refresh: computePrediction,
    }),
    [prediction, isLoading, isSensorLoading, error, computePrediction]
  )

  return (
    <PredictionContext.Provider value={contextValue}>
      {children}
    </PredictionContext.Provider>
  )
}

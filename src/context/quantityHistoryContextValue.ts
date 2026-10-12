import { createContext } from 'react'
import type { ConsumptionStats, QuantityEvent, QuantityHistoryPoint, TimeRangeFilter } from '../types/quantityHistory'

export interface QuantityHistoryContextValue {
  events: QuantityEvent[]
  historyPoints: QuantityHistoryPoint[]
  stats: ConsumptionStats
  timeRange: TimeRangeFilter
  setTimeRange: (range: TimeRangeFilter) => void
  isLoading: boolean
  error: string | null
  thresholdGrams: number
  setThresholdGrams: (threshold: number) => void
}

export const QuantityHistoryContext = createContext<QuantityHistoryContextValue | null>(null)

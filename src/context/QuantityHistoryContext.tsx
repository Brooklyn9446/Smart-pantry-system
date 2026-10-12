import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { quantityEventRepository } from '../data/quantityEventRepository'
import { CONTAINER_ID } from '../types/inventory'
import type {
  ConsumptionStats,
  QuantityEvent,
  TimeRangeFilter,
} from '../types/quantityHistory'
import {
  computeConsumptionStats,
  DEFAULT_SIGNIFICANT_CHANGE_GRAMS,
  detectQuantityEvents,
  formatHistoryPoints,
} from '../utils/consumptionTracker'
import { QuantityHistoryContext, type QuantityHistoryContextValue } from './quantityHistoryContextValue'
import { useAuth } from './useAuth'
import { useSensors } from './useSensors'

export function QuantityHistoryProvider({ children }: { children: ReactNode }) {
  const { userId, isAuthLoading } = useAuth()
  const { readings, isLoading: isSensorLoading } = useSensors()

  const [storedEvents, setStoredEvents] = useState<QuantityEvent[]>([])
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('24h')
  const [thresholdGrams, setThresholdGrams] = useState<number>(DEFAULT_SIGNIFICANT_CHANGE_GRAMS)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const activeUserId = userId ?? 'local-user'

  // 1. Subscribe to persisted Quantity Events
  useEffect(() => {
    if (isAuthLoading) {
      setIsLoading(true)
      return
    }

    setIsLoading(true)
    setError(null)

    const unsubscribe = quantityEventRepository.subscribe(
      activeUserId,
      CONTAINER_ID,
      (latestEvents) => {
        setStoredEvents(latestEvents)
        setIsLoading(false)
      },
      (err) => {
        setError(err.message)
        setIsLoading(false)
      },
      100
    )

    return () => {
      unsubscribe()
    }
  }, [activeUserId, isAuthLoading])

  // 2. Real-time event detection on incoming sensor telemetry
  useEffect(() => {
    if (!readings || readings.length < 2) return

    const detected = detectQuantityEvents(readings, thresholdGrams)
    if (detected.length > 0) {
      // Find events not yet stored
      const storedIds = new Set(storedEvents.map((e) => e.id))
      const newToSave = detected.filter((e) => !storedIds.has(e.id))

      if (newToSave.length > 0) {
        void quantityEventRepository.saveEvents(activeUserId, newToSave)
      }
    }
  }, [readings, thresholdGrams, storedEvents, activeUserId])

  // 3. Merge detected and stored events idempotently
  const allEvents = useMemo(() => {
    const detected = detectQuantityEvents(readings, thresholdGrams)
    const eventMap = new Map<string, QuantityEvent>()

    for (const event of storedEvents) {
      eventMap.set(event.id, event)
    }
    for (const event of detected) {
      eventMap.set(event.id, event)
    }

    const merged = Array.from(eventMap.values())
    // Sort newest first
    merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return merged
  }, [storedEvents, readings, thresholdGrams])

  // 4. Compute Consumption Statistics
  const stats: ConsumptionStats = useMemo(() => {
    return computeConsumptionStats(allEvents, readings)
  }, [allEvents, readings])

  // 5. Compute Chart Data Points for current time range
  const historyPoints = useMemo(() => {
    return formatHistoryPoints(readings, timeRange)
  }, [readings, timeRange])

  const contextValue: QuantityHistoryContextValue = useMemo(
    () => ({
      events: allEvents,
      historyPoints,
      stats,
      timeRange,
      setTimeRange,
      isLoading: isLoading || isSensorLoading,
      error,
      thresholdGrams,
      setThresholdGrams,
    }),
    [
      allEvents,
      historyPoints,
      stats,
      timeRange,
      isLoading,
      isSensorLoading,
      error,
      thresholdGrams,
    ]
  )

  return (
    <QuantityHistoryContext.Provider value={contextValue}>
      {children}
    </QuantityHistoryContext.Provider>
  )
}

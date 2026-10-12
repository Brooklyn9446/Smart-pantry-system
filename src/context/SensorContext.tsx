import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { sensorRepository } from '../data/sensorRepository'
import { CONTAINER_ID } from '../types/inventory'
import type { CurrentSensorState, SensorReading } from '../types/sensors'
import { calculateFoodWeight, formatRelativeTime, getDeviceStatus } from '../utils/sensorCalculations'
import { SensorContext, type SensorContextValue } from './sensorContextValue'
import { useAuth } from './useAuth'

const TARE_STORAGE_KEY = 'pantry-pulse-tare-offset-v1'

export function SensorProvider({ children }: { children: ReactNode }) {
  const { userId, isAuthLoading } = useAuth()
  const [currentState, setCurrentState] = useState<CurrentSensorState | null>(null)
  const [readings, setReadings] = useState<SensorReading[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [tareWeightGrams, setTareWeightState] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(TARE_STORAGE_KEY)
      if (saved) {
        const val = parseFloat(saved)
        if (!Number.isNaN(val) && val >= 0) return val
      }
    }
    return 0
  })

  // Periodic tick for live relative time formatting and connection status refresh
  const [, setTick] = useState<number>(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const setTareWeightGrams = useCallback((tare: number) => {
    const clamped = Math.max(0, Math.round(tare * 10) / 10)
    setTareWeightState(clamped)
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(TARE_STORAGE_KEY, String(clamped))
    }
  }, [])

  useEffect(() => {
    if (isAuthLoading) {
      setIsLoading(true)
      return
    }

    setIsLoading(true)
    setError(null)

    const activeUserId = userId ?? 'local-user'

    // 1. Subscribe to Current Sensor State
    const unsubState = sensorRepository.subscribeCurrentState(
      activeUserId,
      CONTAINER_ID,
      (latestState) => {
        setCurrentState(latestState)
        setIsLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setIsLoading(false)
      }
    )

    // 2. Subscribe to Sensor History Stream
    const unsubHistory = sensorRepository.subscribeReadings(
      activeUserId,
      CONTAINER_ID,
      (latestReadings) => {
        setReadings(latestReadings)
      },
      () => {
        // Non-blocking history error
      },
      40
    )

    return () => {
      unsubState()
      unsubHistory()
    }
  }, [userId, isAuthLoading])

  const refresh = useCallback(() => {
    const activeUserId = userId ?? 'local-user'
    void sensorRepository.getCurrentState(activeUserId, CONTAINER_ID).then(setCurrentState)
    void sensorRepository.getRecentReadings(activeUserId, CONTAINER_ID).then(setReadings)
  }, [userId])

  const deviceStatus = useMemo(() => {
    return getDeviceStatus(currentState?.lastUpdated)
  }, [currentState?.lastUpdated])

  const timeAgoFormatted = useMemo(() => {
    return formatRelativeTime(currentState?.lastUpdated)
  }, [currentState?.lastUpdated])

  const netFoodWeightGrams = useMemo(() => {
    if (!currentState) return 0
    return calculateFoodWeight(currentState.currentWeight, tareWeightGrams)
  }, [currentState, tareWeightGrams])

  const contextValue: SensorContextValue = useMemo(
    () => ({
      currentState,
      readings,
      isLoading,
      error,
      deviceStatus,
      timeAgoFormatted,
      tareWeightGrams,
      netFoodWeightGrams,
      setTareWeightGrams,
      refresh,
    }),
    [
      currentState,
      readings,
      isLoading,
      error,
      deviceStatus,
      timeAgoFormatted,
      tareWeightGrams,
      netFoodWeightGrams,
      setTareWeightGrams,
      refresh,
    ]
  )

  return <SensorContext.Provider value={contextValue}>{children}</SensorContext.Provider>
}

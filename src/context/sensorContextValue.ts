import { createContext } from 'react'
import type { CurrentSensorState, DeviceConnectionStatus, SensorReading } from '../types/sensors'

export interface SensorContextValue {
  currentState: CurrentSensorState | null
  readings: SensorReading[]
  isLoading: boolean
  error: string | null
  deviceStatus: DeviceConnectionStatus
  timeAgoFormatted: string
  tareWeightGrams: number
  netFoodWeightGrams: number
  setTareWeightGrams: (tare: number) => void
  refresh: () => void
}

export const SensorContext = createContext<SensorContextValue | null>(null)

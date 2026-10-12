import { useContext } from 'react'
import { SensorContext, type SensorContextValue } from './sensorContextValue'

export function useSensors(): SensorContextValue {
  const context = useContext(SensorContext)
  if (!context) {
    throw new Error('useSensors must be used within a SensorProvider.')
  }
  return context
}

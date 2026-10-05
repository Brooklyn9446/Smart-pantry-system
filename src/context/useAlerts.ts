import { useContext } from 'react'
import { AlertContext } from './alertContextValue'

export function useAlerts() {
  const context = useContext(AlertContext)
  if (!context) {
    throw new Error('useAlerts must be used within an AlertProvider.')
  }
  return context
}

import { createContext } from 'react'
import type { PantryAlert } from '../types/alerts'

export interface AlertContextValue {
  alerts: PantryAlert[]
  unreadCount: number
  isLoading: boolean
  error: string | null
  markAsRead: (alertId: string) => Promise<void>
}

export const AlertContext = createContext<AlertContextValue | null>(null)

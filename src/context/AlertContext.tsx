import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { alertRepository } from '../data/alertRepository'
import type { PantryAlert } from '../types/alerts'
import { AlertContext } from './alertContextValue'
import { useAuth } from './useAuth'
import { useInventory } from './useInventory'

export function AlertProvider({ children }: { children: ReactNode }) {
  const { userId, isAuthLoading } = useAuth()
  const { items } = useInventory()
  const [alerts, setAlerts] = useState<PantryAlert[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Subscribe to user alerts
  useEffect(() => {
    if (isAuthLoading) {
      setIsLoading(true)
      return
    }

    setIsLoading(true)
    setError(null)

    const unsubscribe = alertRepository.subscribe(
      userId ?? 'local-user',
      (latestAlerts) => {
        setAlerts(latestAlerts)
        setIsLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setIsLoading(false)
      }
    )

    return () => {
      unsubscribe()
    }
  }, [userId, isAuthLoading])

  // Automatically sync expiry alerts when inventory items change
  useEffect(() => {
    if (!isAuthLoading && userId) {
      void alertRepository.syncExpiryAlerts(userId, items)
    }
  }, [items, userId, isAuthLoading])

  const markAsRead = useCallback(
    async (alertId: string) => {
      try {
        await alertRepository.markAsRead(userId ?? 'local-user', alertId)
        setAlerts((current) =>
          current.map((a) => (a.id === alertId ? { ...a, status: 'read' as const } : a))
        )
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[SmartPantry] Failed to mark alert as read:', err)
        }
      }
    },
    [userId]
  )

  const unreadCount = useMemo(() => alerts.filter((a) => a.status === 'active').length, [alerts])

  const value = useMemo(
    () => ({
      alerts,
      unreadCount,
      isLoading,
      error,
      markAsRead,
    }),
    [alerts, unreadCount, isLoading, error, markAsRead]
  )

  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>
}

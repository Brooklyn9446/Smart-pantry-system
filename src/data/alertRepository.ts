import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore'
import { getFirebaseServices, isFirebaseConfigured } from '../lib/firebase'
import type { PantryAlert } from '../types/alerts'
import type { PantryItem } from '../types/inventory'
import { getExpiryStatus } from '../utils/expiry'
import { evaluateStockStatus, formatQuantityWithUnit, getLowStockAlertId } from '../utils/lowStock'

const ALERTS_STORAGE_KEY = 'pantry-pulse-alerts-v1'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readLocalAlerts(): PantryAlert[] {
  if (!canUseStorage()) return []
  const saved = window.localStorage.getItem(ALERTS_STORAGE_KEY)
  if (!saved) return []
  try {
    return JSON.parse(saved) as PantryAlert[]
  } catch {
    return []
  }
}

function writeLocalAlerts(alerts: PantryAlert[]): void {
  if (canUseStorage()) {
    window.localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts))
  }
}

function normalizeDate(val: unknown): string {
  if (!val) return new Date().toISOString()
  if (typeof val === 'string') return val
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString()
  }
  if (val instanceof Date) return val.toISOString()
  return new Date().toISOString()
}

function toAlert(id: string, data: DocumentData): PantryAlert {
  const validTypes = ['expiry', 'system', 'sensor', 'low-stock'] as const
  const type = validTypes.includes(data.type) ? data.type : 'expiry'
  const status = data.status === 'read' ? 'read' : data.status === 'resolved' ? 'resolved' : 'active'

  return {
    id,
    type,
    itemId: data.itemId,
    itemName: data.itemName,
    containerId: data.containerId ?? 'container-01',
    title: data.title ?? 'Alert',
    message: data.message ?? '',
    severity: data.severity === 'critical' || data.severity === 'warning' ? data.severity : 'info',
    status,
    createdAt: normalizeDate(data.createdAt),
    updatedAt: normalizeDate(data.updatedAt),
  }
}

function mapFirestoreError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as FirestoreError).code
    if (code === 'permission-denied') {
      return new Error('Access denied: You do not have permission to access alerts.')
    }
    if (code === 'unavailable') {
      return new Error('Network unavailable: Unable to reach Cloud Firestore for alerts.')
    }
  }
  return error instanceof Error ? error : new Error('A database error occurred on alerts.')
}

export const alertRepository = {
  isRemote: isFirebaseConfigured,

  subscribe(
    userId: string,
    onUpdate: (alerts: PantryAlert[]) => void,
    onError: (err: Error) => void
  ): () => void {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      onUpdate(readLocalAlerts())
      return () => {}
    }

    const services = getFirebaseServices()
    if (!services) {
      onUpdate(readLocalAlerts())
      return () => {}
    }

    const alertsCol = collection(services.db, 'users', userId, 'alerts')

    const unsubscribe = onSnapshot(
      alertsCol,
      (snapshot) => {
        const alerts = snapshot.docs.map((d) => toAlert(d.id, d.data()))
        // Sort newest first
        alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        onUpdate(alerts)
      },
      (error) => {
        if (import.meta.env.DEV) {
          console.error('[SmartPantry] Alerts snapshot error:', error.code, error.message)
        }
        onError(mapFirestoreError(error))
      }
    )

    return unsubscribe
  },

  async getAll(userId?: string): Promise<PantryAlert[]> {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      return readLocalAlerts()
    }

    try {
      const services = getFirebaseServices()
      if (!services) return readLocalAlerts()

      const snapshot = await getDocs(collection(services.db, 'users', userId, 'alerts'))
      const alerts = snapshot.docs.map((d) => toAlert(d.id, d.data()))
      alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      return alerts
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async markAsRead(userId: string, alertId: string): Promise<void> {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      const alerts = readLocalAlerts().map((a) =>
        a.id === alertId ? { ...a, status: 'read' as const, updatedAt: new Date().toISOString() } : a
      )
      writeLocalAlerts(alerts)
      return
    }

    try {
      const services = getFirebaseServices()
      if (!services) return

      const alertRef = doc(services.db, 'users', userId, 'alerts', alertId)
      await setDoc(alertRef, { status: 'read', updatedAt: new Date().toISOString() }, { merge: true })
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async syncExpiryAlerts(userId: string, items: PantryItem[]): Promise<void> {
    const isLocal = !isFirebaseConfigured() || !userId || userId === 'local-user'
    const services = getFirebaseServices()

    for (const item of items) {
      const expiry = getExpiryStatus(item.expiryDate)
      if (expiry.status !== 'expired' && expiry.status !== 'expiring-soon') {
        continue
      }

      const alertId = `expiry_${item.id}_${expiry.status}`
      const title =
        expiry.status === 'expired'
          ? `${item.name} has expired`
          : `${item.name} is expiring soon`

      const message =
        expiry.status === 'expired'
          ? `${item.name} expired on ${expiry.formattedDate} (${expiry.label}). Plan to remove or replace it.`
          : `${item.name} expires on ${expiry.formattedDate} (${expiry.label}). Use soon.`

      const severity = expiry.status === 'expired' ? ('critical' as const) : ('warning' as const)
      const now = new Date().toISOString()

      if (isLocal) {
        const current = readLocalAlerts()
        const existing = current.find((a) => a.id === alertId)
        if (!existing) {
          const newAlert: PantryAlert = {
            id: alertId,
            type: 'expiry',
            itemId: item.id,
            itemName: item.name,
            containerId: item.containerId,
            title,
            message,
            severity,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          }
          writeLocalAlerts([newAlert, ...current])
        }
      } else if (services) {
        try {
          const alertRef = doc(services.db, 'users', userId, 'alerts', alertId)
          const snap = await getDoc(alertRef)
          if (!snap.exists()) {
            // Create only if doesn't exist to prevent overwriting user's "read" state or duplicate entries
            await setDoc(alertRef, {
              id: alertId,
              type: 'expiry',
              itemId: item.id,
              itemName: item.name,
              containerId: item.containerId,
              title,
              message,
              severity,
              status: 'active',
              createdAt: now,
              updatedAt: now,
            })
            if (import.meta.env.DEV) {
              console.log(`[SmartPantry] Created expiry alert ${alertId} for ${item.name}`)
            }
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('[SmartPantry] Unable to sync alert document:', err)
          }
        }
      }
    }
  },

  async syncLowStockAlerts(
    userId: string,
    items: PantryItem[],
    measuredGrams?: number | null
  ): Promise<void> {
    const isLocal = !isFirebaseConfigured() || !userId || userId === 'local-user'
    const services = getFirebaseServices()
    const now = new Date().toISOString()

    for (const item of items) {
      const evaluation = evaluateStockStatus(item, measuredGrams)
      const alertId = getLowStockAlertId(item.id)

      if (evaluation.isLowStock) {
        // Condition: Quantity <= threshold
        const severity = evaluation.stockStatus === 'out-of-stock' ? ('critical' as const) : ('warning' as const)
        const title =
          evaluation.stockStatus === 'out-of-stock'
            ? `${item.name} is out of stock`
            : `${item.name} is low on stock`

        const message =
          evaluation.stockStatus === 'out-of-stock'
            ? `${item.name} container is empty (0 ${item.quantityUnit}). Restock required.`
            : `${item.name} has reached ${formatQuantityWithUnit(
                evaluation.currentQuantityGrams,
                item.quantityUnit
              )} (threshold: ${formatQuantityWithUnit(
                evaluation.thresholdGrams,
                item.quantityUnit
              )}). Plan to restock.`

        if (isLocal) {
          const current = readLocalAlerts()
          const existing = current.find((a) => a.id === alertId)

          if (!existing) {
            const newAlert: PantryAlert = {
              id: alertId,
              type: 'low-stock',
              itemId: item.id,
              itemName: item.name,
              containerId: item.containerId,
              title,
              message,
              severity,
              status: 'active',
              createdAt: now,
              updatedAt: now,
            }
            writeLocalAlerts([newAlert, ...current])
          } else if (existing.status === 'resolved') {
            // Re-activate previously resolved alert if stock dropped again
            const updated = current.map((a) =>
              a.id === alertId
                ? {
                    ...a,
                    status: 'active' as const,
                    severity,
                    title,
                    message,
                    updatedAt: now,
                  }
                : a
            )
            writeLocalAlerts(updated)
          }
          // If active or read, avoid duplicate creation (deduplicated)
        } else if (services) {
          try {
            const alertRef = doc(services.db, 'users', userId, 'alerts', alertId)
            const snap = await getDoc(alertRef)

            if (!snap.exists()) {
              await setDoc(alertRef, {
                id: alertId,
                type: 'low-stock',
                itemId: item.id,
                itemName: item.name,
                containerId: item.containerId,
                title,
                message,
                severity,
                status: 'active',
                createdAt: now,
                updatedAt: now,
              })
              if (import.meta.env.DEV) {
                console.log(`[SmartPantry] Created low-stock alert ${alertId} for ${item.name}`)
              }
            } else {
              const data = snap.data()
              if (data?.status === 'resolved') {
                // Re-activate resolved alert
                await setDoc(
                  alertRef,
                  {
                    status: 'active',
                    severity,
                    title,
                    message,
                    updatedAt: now,
                  },
                  { merge: true }
                )
              }
            }
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn('[SmartPantry] Low-stock alert sync error:', err)
            }
          }
        }
      } else {
        // Condition: Replenished! Quantity > threshold
        if (isLocal) {
          const current = readLocalAlerts()
          const existing = current.find((a) => a.id === alertId)
          if (existing && existing.status !== 'resolved') {
            const updated = current.map((a) =>
              a.id === alertId
                ? {
                    ...a,
                    status: 'resolved' as const,
                    message: `${item.name} stock replenished to ${formatQuantityWithUnit(
                      evaluation.currentQuantityGrams,
                      item.quantityUnit
                    )}.`,
                    updatedAt: now,
                  }
                : a
            )
            writeLocalAlerts(updated)
          }
        } else if (services) {
          try {
            const alertRef = doc(services.db, 'users', userId, 'alerts', alertId)
            const snap = await getDoc(alertRef)
            if (snap.exists() && snap.data()?.status !== 'resolved') {
              await setDoc(
                alertRef,
                {
                  status: 'resolved',
                  message: `${item.name} stock replenished to ${formatQuantityWithUnit(
                    evaluation.currentQuantityGrams,
                    item.quantityUnit
                  )}.`,
                  updatedAt: now,
                },
                { merge: true }
              )
              if (import.meta.env.DEV) {
                console.log(`[SmartPantry] Resolved low-stock alert ${alertId} for ${item.name} after replenishment`)
              }
            }
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn('[SmartPantry] Replenishment alert resolution error:', err)
            }
          }
        }
      }
    }
  },
}

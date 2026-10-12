import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore'
import { getFirebaseServices, isFirebaseConfigured } from '../lib/firebase'
import { CONTAINER_ID } from '../types/inventory'
import type { QuantityEvent } from '../types/quantityHistory'

const EVENTS_STORAGE_KEY = 'pantry-pulse-quantity-events-v1'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readLocalEvents(): QuantityEvent[] {
  if (!canUseStorage()) return []
  const saved = window.localStorage.getItem(EVENTS_STORAGE_KEY)
  if (!saved) return []
  try {
    return JSON.parse(saved) as QuantityEvent[]
  } catch {
    return []
  }
}

function writeLocalEvents(events: QuantityEvent[]): void {
  if (canUseStorage()) {
    window.localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events))
  }
}

function toQuantityEvent(id: string, data: DocumentData): QuantityEvent {
  return {
    id,
    containerId: CONTAINER_ID,
    type: data.type === 'refill' ? 'refill' : 'consumption',
    amountGrams: typeof data.amountGrams === 'number' ? data.amountGrams : 0,
    previousWeightGrams: typeof data.previousWeightGrams === 'number' ? data.previousWeightGrams : 0,
    newWeightGrams: typeof data.newWeightGrams === 'number' ? data.newWeightGrams : 0,
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : new Date().toISOString(),
    fromReadingId: typeof data.fromReadingId === 'string' ? data.fromReadingId : '',
    toReadingId: typeof data.toReadingId === 'string' ? data.toReadingId : '',
  }
}

function mapFirestoreError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as FirestoreError).code
    if (code === 'permission-denied') {
      return new Error('Access denied: You do not have permission to access quantity events.')
    }
  }
  return error instanceof Error ? error : new Error('A database error occurred on quantity events.')
}

export const quantityEventRepository = {
  isRemote: isFirebaseConfigured,

  subscribe(
    userId: string,
    containerId: string = CONTAINER_ID,
    onUpdate: (events: QuantityEvent[]) => void,
    onError: (err: Error) => void,
    limitCount: number = 50
  ): () => void {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      onUpdate(readLocalEvents().slice(0, limitCount))
      return () => {}
    }

    const services = getFirebaseServices()
    if (!services) {
      onUpdate(readLocalEvents().slice(0, limitCount))
      return () => {}
    }

    const eventsCol = collection(services.db, 'users', userId, 'quantityEvents')
    const q = query(
      eventsCol,
      where('containerId', '==', containerId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const events = snapshot.docs.map((d) => toQuantityEvent(d.id, d.data()))
        onUpdate(events)
      },
      (error) => {
        if (error.code === 'failed-precondition' || error.code === 'invalid-argument') {
          // Fallback if index building
          const simpleQuery = query(eventsCol, limit(limitCount))
          return onSnapshot(
            simpleQuery,
            (s) => {
              const list = s.docs.map((d) => toQuantityEvent(d.id, d.data()))
              list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              onUpdate(list)
            },
            (err) => onError(mapFirestoreError(err))
          )
        }
        onError(mapFirestoreError(error))
      }
    )

    return unsubscribe
  },

  async getAll(userId?: string, containerId: string = CONTAINER_ID): Promise<QuantityEvent[]> {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      return readLocalEvents().filter((e) => e.containerId === containerId)
    }

    try {
      const services = getFirebaseServices()
      if (!services) return readLocalEvents()

      const eventsCol = collection(services.db, 'users', userId, 'quantityEvents')
      const snapshot = await getDocs(
        query(eventsCol, where('containerId', '==', containerId), limit(100))
      )
      const events = snapshot.docs.map((d) => toQuantityEvent(d.id, d.data()))
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      return events
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async saveEvents(userId: string, newEvents: QuantityEvent[]): Promise<void> {
    if (!newEvents || newEvents.length === 0) return

    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      const current = readLocalEvents()
      const existingIds = new Set(current.map((e) => e.id))
      const toAdd = newEvents.filter((e) => !existingIds.has(e.id))
      if (toAdd.length > 0) {
        const updated = [...toAdd, ...current].slice(0, 200)
        writeLocalEvents(updated)
      }
      return
    }

    const services = getFirebaseServices()
    if (!services) return

    try {
      // Idempotently save events using deterministic IDs
      for (const event of newEvents) {
        const eventRef = doc(services.db, 'users', userId, 'quantityEvents', event.id)
        await setDoc(eventRef, event, { merge: true })
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[SmartPantry] Quantity events sync error:', err)
      }
    }
  },
}

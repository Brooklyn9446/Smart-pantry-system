import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore'
import { getFirebaseServices, isFirebaseConfigured } from '../lib/firebase'
import {
  CONTAINER_ID,
  TRACKING_METHOD,
  type PantryItem,
  type PantryItemInput,
  type QuantityUnit,
} from '../types/inventory'

const STORAGE_KEY = 'pantry-pulse-items-v1'

export const firestorePaths = {
  items: 'items',
  legacyPantryItems: 'pantryItems',
  containers: 'containers',
  currentSensorState: 'currentSensorState',
  sensorReadings: 'sensorReadings',
  alerts: 'alerts',
} as const

const seedItems: PantryItem[] = [
  {
    id: 'jasmine-rice',
    name: 'Jasmine rice',
    category: 'Grains & cereals',
    initialQuantity: 3.5,
    quantityUnit: 'kg',
    expiryDate: '2027-01-15',
    containerId: CONTAINER_ID,
    trackingMethod: TRACKING_METHOD,
    createdAt: '2026-10-04T04:30:00.000Z',
    updatedAt: '2026-10-04T04:30:00.000Z',
  },
]

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readLocal(): PantryItem[] {
  if (!canUseStorage()) return seedItems
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (!saved) {
    writeLocal(seedItems)
    return seedItems
  }
  try {
    return JSON.parse(saved) as PantryItem[]
  } catch {
    writeLocal(seedItems)
    return seedItems
  }
}

function writeLocal(items: PantryItem[]): void {
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
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

function normalizeExpiryDate(val: unknown): string | undefined {
  if (!val) return undefined
  if (typeof val === 'string') {
    return val.includes('T') ? val.split('T')[0] : val
  }
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString().split('T')[0]
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0]
  }
  return undefined
}

function toItem(id: string, data: DocumentData): PantryItem {
  const qty =
    typeof data.initialQuantity === 'number' && !Number.isNaN(data.initialQuantity)
      ? data.initialQuantity
      : typeof data.quantity === 'number' && !Number.isNaN(data.quantity)
      ? data.quantity
      : typeof data.initialQuantity === 'string'
      ? parseFloat(data.initialQuantity) || 0
      : typeof data.quantity === 'string'
      ? parseFloat(data.quantity) || 0
      : 0

  const rawUnit = data.quantityUnit ?? data.unit
  const unit: QuantityUnit = rawUnit === 'g' || rawUnit === 'kg' ? rawUnit : 'kg'
  const expiry = normalizeExpiryDate(data.expiryDate)

  return {
    id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : 'Unnamed Item',
    category: typeof data.category === 'string' && data.category.trim() ? data.category : 'Other',
    initialQuantity: qty >= 0 ? qty : 0,
    quantityUnit: unit,
    ...(expiry ? { expiryDate: expiry } : {}),
    containerId: CONTAINER_ID,
    trackingMethod: TRACKING_METHOD,
    createdAt: normalizeDate(data.createdAt),
    updatedAt: normalizeDate(data.updatedAt),
  }
}

function makeItem(
  input: PantryItemInput,
  id: string = crypto.randomUUID(),
  existing?: PantryItem
): PantryItem {
  const now = new Date().toISOString()
  return {
    ...input,
    id,
    containerId: CONTAINER_ID,
    trackingMethod: TRACKING_METHOD,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

function mapFirestoreError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as FirestoreError).code
    if (code === 'permission-denied') {
      return new Error('Access denied: You do not have permission to access this inventory.')
    }
    if (code === 'unavailable') {
      return new Error('Network unavailable: Unable to reach Cloud Firestore. Please check your connection.')
    }
    if (code === 'not-found') {
      return new Error('Requested pantry item or document was not found.')
    }
    if (code === 'failed-precondition') {
      return new Error('Database operation failed: Firestore precondition not met.')
    }
  }
  return error instanceof Error ? error : new Error('A database error occurred.')
}

export const inventoryRepository = {
  isRemote: isFirebaseConfigured,

  subscribe(
    userId: string,
    onUpdate: (items: PantryItem[]) => void,
    onError: (err: Error) => void
  ): () => void {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      onUpdate(readLocal())
      return () => {}
    }

    const services = getFirebaseServices()
    if (!services) {
      onUpdate(readLocal())
      return () => {}
    }

    const canonicalPath = `users/${userId}/${firestorePaths.items}`
    const itemsCol = collection(services.db, 'users', userId, firestorePaths.items)

    if (import.meta.env.DEV) {
      console.log(`[SmartPantry] Subscribing to real-time updates at: ${canonicalPath}`)
    }

    const unsubscribe = onSnapshot(
      itemsCol,
      async (snapshot) => {
        if (import.meta.env.DEV) {
          console.log(
            `[SmartPantry] Query snapshot from ${canonicalPath}: ${snapshot.docs.length} document(s) returned:`,
            snapshot.docs.map((d) => ({
              id: d.id,
              name: d.data().name,
              containerId: d.data().containerId,
            }))
          )
        }

        if (snapshot.docs.length > 0) {
          const items = snapshot.docs.map((d) => toItem(d.id, d.data()))
          onUpdate(items)
        } else {
          // If canonical items collection is empty, check legacy pantryItems path for existing items
          try {
            const legacyCol = collection(
              services.db,
              'users',
              userId,
              firestorePaths.legacyPantryItems
            )
            const legacySnapshot = await getDocs(legacyCol)
            if (legacySnapshot.docs.length > 0) {
              if (import.meta.env.DEV) {
                console.log(
                  `[SmartPantry] Found ${legacySnapshot.docs.length} item(s) in legacy path users/${userId}/pantryItems. Migrating to canonical path...`
                )
              }
              const legacyItems = legacySnapshot.docs.map((d) => toItem(d.id, d.data()))
              onUpdate(legacyItems)
              // Migrate legacy items to canonical items path
              for (const legacyDoc of legacySnapshot.docs) {
                const item = toItem(legacyDoc.id, legacyDoc.data())
                const targetRef = doc(
                  services.db,
                  'users',
                  userId,
                  firestorePaths.items,
                  item.id
                )
                await runTransaction(services.db, async (t) => {
                  t.set(targetRef, item)
                })
              }
              return
            }
          } catch (legacyErr) {
            if (import.meta.env.DEV) {
              console.warn('[SmartPantry] Legacy collection check error:', legacyErr)
            }
          }

          onUpdate([])
        }
      },
      (error) => {
        if (import.meta.env.DEV) {
          console.error(
            `[SmartPantry] Firestore real-time error on ${canonicalPath}:`,
            error.code,
            error.message
          )
        }
        onError(mapFirestoreError(error))
      }
    )

    return () => {
      unsubscribe()
    }
  },

  async getAll(userId?: string): Promise<PantryItem[]> {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      return readLocal()
    }

    try {
      const services = getFirebaseServices()
      if (!services) return readLocal()

      const snapshot = await getDocs(
        collection(services.db, 'users', userId, firestorePaths.items)
      )

      if (snapshot.docs.length > 0) {
        return snapshot.docs.map((item) => toItem(item.id, item.data()))
      }

      // Check legacy collection if items is empty
      const legacySnapshot = await getDocs(
        collection(services.db, 'users', userId, firestorePaths.legacyPantryItems)
      )
      if (legacySnapshot.docs.length > 0) {
        return legacySnapshot.docs.map((item) => toItem(item.id, item.data()))
      }

      return []
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async create(input: PantryItemInput, userId?: string): Promise<PantryItem> {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      const items = readLocal()
      if (items.some((item) => item.containerId === CONTAINER_ID)) {
        throw new Error('container-01 already has an active item assigned.')
      }
      const item = makeItem(input)
      writeLocal([...items, item])
      return item
    }

    try {
      const services = getFirebaseServices()
      if (!services) throw new Error('Firebase service is not initialized.')

      const item = makeItem(input)
      const itemRef = doc(services.db, 'users', userId, firestorePaths.items, item.id)
      const containerRef = doc(
        services.db,
        'users',
        userId,
        firestorePaths.containers,
        CONTAINER_ID
      )

      await runTransaction(services.db, async (transaction) => {
        const containerSnap = await transaction.get(containerRef)
        if (containerSnap.exists()) {
          const containerData = containerSnap.data()
          const activeItemId = containerData?.activeItemId
          if (activeItemId) {
            // Verify if the active item actually exists in the canonical items collection
            const activeItemRef = doc(
              services.db,
              'users',
              userId,
              firestorePaths.items,
              activeItemId
            )
            const activeItemSnap = await transaction.get(activeItemRef)
            if (activeItemSnap.exists()) {
              throw new Error('container-01 already has an active item assigned.')
            }
          }
        }

        transaction.set(itemRef, item)
        transaction.set(containerRef, {
          id: CONTAINER_ID,
          activeItemId: item.id,
          trackingMethod: TRACKING_METHOD,
          updatedAt: item.updatedAt,
        })
      })

      if (import.meta.env.DEV) {
        console.log(`[SmartPantry] Created item ${item.id} in users/${userId}/items`)
      }

      return item
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async update(id: string, input: PantryItemInput, userId?: string): Promise<PantryItem> {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      const items = readLocal()
      const existing = items.find((item) => item.id === id)
      if (!existing) throw new Error('This pantry item no longer exists.')
      const item = makeItem(input, id, existing)
      writeLocal(items.map((current) => (current.id === id ? item : current)))
      return item
    }

    try {
      const services = getFirebaseServices()
      if (!services) throw new Error('Firebase service is not initialized.')

      const itemRef = doc(services.db, 'users', userId, firestorePaths.items, id)
      let updated: PantryItem | undefined

      await runTransaction(services.db, async (transaction) => {
        const existing = await transaction.get(itemRef)
        if (!existing.exists()) {
          throw new Error('This pantry item no longer exists.')
        }
        updated = makeItem(input, id, toItem(id, existing.data()))
        transaction.set(itemRef, updated)
      })

      if (!updated) throw new Error('Unable to update this pantry item.')
      return updated
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async delete(id: string, userId?: string): Promise<void> {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      writeLocal(readLocal().filter((item) => item.id !== id))
      return
    }

    try {
      const services = getFirebaseServices()
      if (!services) throw new Error('Firebase service is not initialized.')

      const itemRef = doc(services.db, 'users', userId, firestorePaths.items, id)
      const containerRef = doc(
        services.db,
        'users',
        userId,
        firestorePaths.containers,
        CONTAINER_ID
      )

      await runTransaction(services.db, async (transaction) => {
        transaction.delete(itemRef)
        transaction.set(containerRef, {
          id: CONTAINER_ID,
          activeItemId: null,
          trackingMethod: TRACKING_METHOD,
          updatedAt: new Date().toISOString(),
        })
      })

      // Also cleanup legacy doc if present
      try {
        const legacyRef = doc(services.db, 'users', userId, firestorePaths.legacyPantryItems, id)
        const legacySnap = await getDoc(legacyRef)
        if (legacySnap.exists()) {
          await runTransaction(services.db, async (t) => {
            t.delete(legacyRef)
          })
        }
      } catch {
        // Non-fatal cleanup
      }

      if (import.meta.env.DEV) {
        console.log(`[SmartPantry] Deleted item ${id} from users/${userId}/items`)
      }
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },
}

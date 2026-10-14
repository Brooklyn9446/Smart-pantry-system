import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore'
import { getFirebaseServices, isFirebaseConfigured } from '../lib/firebase'
import type { PantryItem } from '../types/inventory'
import type { ShoppingListItem, ShoppingListItemInput } from '../types/shoppingList'
import {
  clearAllPurchased,
  createManualShoppingItem,
  removeShoppingListItem,
  syncLowStockToShoppingList,
  togglePurchasedState,
} from '../utils/shoppingList'

const SHOPPING_STORAGE_KEY = 'pantry-pulse-shopping-list-v1'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readLocalList(): ShoppingListItem[] {
  if (!canUseStorage()) return []
  const saved = window.localStorage.getItem(SHOPPING_STORAGE_KEY)
  if (!saved) return []
  try {
    return JSON.parse(saved) as ShoppingListItem[]
  } catch {
    return []
  }
}

function writeLocalList(items: ShoppingListItem[]): void {
  if (canUseStorage()) {
    window.localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(items))
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

function toShoppingListItem(id: string, data: DocumentData): ShoppingListItem {
  return {
    id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : 'Item',
    category: typeof data.category === 'string' && data.category.trim() ? data.category : 'General',
    targetQuantity: typeof data.targetQuantity === 'number' ? data.targetQuantity : undefined,
    quantityUnit: data.quantityUnit === 'g' || data.quantityUnit === 'kg' ? data.quantityUnit : 'kg',
    source: data.source === 'auto-low-stock' ? 'auto-low-stock' : 'manual',
    itemId: data.itemId,
    containerId: data.containerId,
    isPurchased: Boolean(data.isPurchased),
    purchasedAt: data.purchasedAt ? normalizeDate(data.purchasedAt) : undefined,
    createdAt: normalizeDate(data.createdAt),
    updatedAt: normalizeDate(data.updatedAt),
    notes: data.notes,
  }
}

function mapFirestoreError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as FirestoreError).code
    if (code === 'permission-denied') {
      return new Error('Access denied: You do not have permission to access shopping list.')
    }
  }
  return error instanceof Error ? error : new Error('A database error occurred on shopping list.')
}

export const shoppingListRepository = {
  isRemote: isFirebaseConfigured,

  subscribe(
    userId: string,
    onUpdate: (items: ShoppingListItem[]) => void,
    onError: (err: Error) => void
  ): () => void {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      onUpdate(readLocalList())
      return () => {}
    }

    const services = getFirebaseServices()
    if (!services) {
      onUpdate(readLocalList())
      return () => {}
    }

    const col = collection(services.db, 'users', userId, 'shoppingList')

    const unsubscribe = onSnapshot(
      col,
      (snapshot) => {
        const items = snapshot.docs.map((d) => toShoppingListItem(d.id, d.data()))
        // Sort: unpurchased first, then newest first
        items.sort((a, b) => {
          if (a.isPurchased !== b.isPurchased) {
            return a.isPurchased ? 1 : -1
          }
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        onUpdate(items)
      },
      (error) => {
        onError(mapFirestoreError(error))
      }
    )

    return unsubscribe
  },

  async getAll(userId?: string): Promise<ShoppingListItem[]> {
    if (!isFirebaseConfigured() || !userId || userId === 'local-user') {
      return readLocalList()
    }

    try {
      const services = getFirebaseServices()
      if (!services) return readLocalList()

      const snapshot = await getDocs(collection(services.db, 'users', userId, 'shoppingList'))
      const items = snapshot.docs.map((d) => toShoppingListItem(d.id, d.data()))
      items.sort((a, b) => {
        if (a.isPurchased !== b.isPurchased) {
          return a.isPurchased ? 1 : -1
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
      return items
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async addItem(userId: string, input: ShoppingListItemInput): Promise<ShoppingListItem> {
    const isLocal = !isFirebaseConfigured() || !userId || userId === 'local-user'
    const services = getFirebaseServices()
    const item = createManualShoppingItem(input)

    if (isLocal || !services) {
      const current = readLocalList()
      const updated = [item, ...current]
      writeLocalList(updated)
      return item
    }

    try {
      const ref = doc(services.db, 'users', userId, 'shoppingList', item.id)
      const dataToSave: Record<string, unknown> = {
        id: item.id,
        name: item.name,
        category: item.category,
        quantityUnit: item.quantityUnit,
        source: item.source,
        isPurchased: item.isPurchased,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
      if (item.targetQuantity !== undefined) dataToSave.targetQuantity = item.targetQuantity
      if (item.itemId) dataToSave.itemId = item.itemId
      if (item.containerId) dataToSave.containerId = item.containerId
      if (item.notes) dataToSave.notes = item.notes

      await setDoc(ref, dataToSave)
      return item
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async togglePurchased(userId: string, id: string): Promise<void> {
    const isLocal = !isFirebaseConfigured() || !userId || userId === 'local-user'
    const services = getFirebaseServices()

    if (isLocal || !services) {
      const current = readLocalList()
      const updated = togglePurchasedState(current, id)
      writeLocalList(updated)
      return
    }

    try {
      const ref = doc(services.db, 'users', userId, 'shoppingList', id)
      const currentItems = await this.getAll(userId)
      const existing = currentItems.find((i) => i.id === id)
      if (!existing) return

      const nextPurchased = !existing.isPurchased
      const now = new Date().toISOString()

      await setDoc(
        ref,
        {
          isPurchased: nextPurchased,
          purchasedAt: nextPurchased ? now : null,
          updatedAt: now,
        },
        { merge: true }
      )
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async removeItem(userId: string, id: string): Promise<void> {
    const isLocal = !isFirebaseConfigured() || !userId || userId === 'local-user'
    const services = getFirebaseServices()

    if (isLocal || !services) {
      const current = readLocalList()
      const updated = removeShoppingListItem(current, id)
      writeLocalList(updated)
      return
    }

    try {
      const ref = doc(services.db, 'users', userId, 'shoppingList', id)
      await deleteDoc(ref)
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async clearPurchased(userId: string): Promise<void> {
    const isLocal = !isFirebaseConfigured() || !userId || userId === 'local-user'
    const services = getFirebaseServices()

    if (isLocal || !services) {
      const current = readLocalList()
      const updated = clearAllPurchased(current)
      writeLocalList(updated)
      return
    }

    try {
      const items = await this.getAll(userId)
      const purchased = items.filter((i) => i.isPurchased)
      for (const item of purchased) {
        const ref = doc(services.db, 'users', userId, 'shoppingList', item.id)
        await deleteDoc(ref)
      }
    } catch (err) {
      throw mapFirestoreError(err)
    }
  },

  async syncLowStockItems(
    userId: string,
    pantryItems: PantryItem[],
    measuredGrams?: number | null
  ): Promise<void> {
    const isLocal = !isFirebaseConfigured() || !userId || userId === 'local-user'
    const services = getFirebaseServices()

    if (isLocal || !services) {
      const current = readLocalList()
      const { nextList, addedCount } = syncLowStockToShoppingList(current, pantryItems, measuredGrams)
      if (addedCount > 0) {
        writeLocalList(nextList)
      }
      return
    }

    try {
      const current = await this.getAll(userId)
      const { nextList, addedCount } = syncLowStockToShoppingList(current, pantryItems, measuredGrams)
      if (addedCount > 0) {
        // Save added or updated auto items to Firestore
        const autoItems = nextList.filter((item) => item.source === 'auto-low-stock')
        for (const item of autoItems) {
          const ref = doc(services.db, 'users', userId, 'shoppingList', item.id)
          const dataToSave: Record<string, unknown> = {
            id: item.id,
            name: item.name,
            category: item.category,
            quantityUnit: item.quantityUnit,
            source: item.source,
            isPurchased: item.isPurchased,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          }
          if (item.targetQuantity !== undefined) dataToSave.targetQuantity = item.targetQuantity
          if (item.itemId) dataToSave.itemId = item.itemId
          if (item.containerId) dataToSave.containerId = item.containerId
          if (item.notes) dataToSave.notes = item.notes

          await setDoc(ref, dataToSave, { merge: true })
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[SmartPantry] Shopping list low-stock sync error:', err)
      }
    }
  },
}

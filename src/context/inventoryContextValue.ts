import { createContext } from 'react'
import type { PantryItem, PantryItemInput } from '../types/inventory'

export type InventoryContextValue = {
  items: PantryItem[]
  isLoading: boolean
  error: string | null
  successMessage: string | null
  source: 'firestore' | 'local'
  addItem: (input: PantryItemInput) => Promise<PantryItem>
  updateItem: (id: string, input: PantryItemInput) => Promise<PantryItem>
  deleteItem: (id: string) => Promise<void>
}

export const InventoryContext = createContext<InventoryContextValue | null>(null)

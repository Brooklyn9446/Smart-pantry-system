import { createContext } from 'react'
import type { ShoppingListItem, ShoppingListItemInput } from '../types/shoppingList'

export interface ShoppingListContextValue {
  items: ShoppingListItem[]
  activeItems: ShoppingListItem[]
  purchasedItems: ShoppingListItem[]
  toBuyCount: number
  isLoading: boolean
  error: string | null
  addItem: (input: ShoppingListItemInput) => Promise<ShoppingListItem>
  togglePurchased: (id: string) => Promise<void>
  removeItem: (id: string) => Promise<void>
  clearPurchased: () => Promise<void>
  syncLowStock: () => Promise<void>
}

export const ShoppingListContext = createContext<ShoppingListContextValue | null>(null)

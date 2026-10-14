import type { QuantityUnit } from './inventory'

export type ShoppingListSource = 'auto-low-stock' | 'manual'

export interface ShoppingListItem {
  id: string
  name: string
  category: string
  targetQuantity?: number
  quantityUnit?: QuantityUnit
  source: ShoppingListSource
  itemId?: string
  containerId?: string
  isPurchased: boolean
  purchasedAt?: string
  createdAt: string
  updatedAt: string
  notes?: string
}

export interface ShoppingListItemInput {
  name: string
  category?: string
  targetQuantity?: number
  quantityUnit?: QuantityUnit
  source?: ShoppingListSource
  itemId?: string
  containerId?: string
  notes?: string
}

export type ShoppingListFilter = 'all' | 'to-buy' | 'purchased'

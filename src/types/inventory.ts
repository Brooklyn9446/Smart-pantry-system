export const CONTAINER_ID = 'container-01' as const
export const TRACKING_METHOD = 'load-cell' as const

export type QuantityUnit = 'g' | 'kg'
export type TrackingMethod = 'load-cell' | 'manual'

export interface PantryItem {
  id: string
  name: string
  category: string
  initialQuantity: number
  quantityUnit: QuantityUnit
  expiryDate?: string
  minStockThreshold?: number
  containerId?: string | null
  trackingMethod?: TrackingMethod
  createdAt: string
  updatedAt: string
}

export interface PantryItemInput {
  name: string
  category: string
  initialQuantity: number
  quantityUnit: QuantityUnit
  expiryDate?: string
  minStockThreshold?: number
  containerId?: string | null
  trackingMethod?: TrackingMethod
}

export type PantryItemFormErrors = Partial<Record<keyof PantryItemInput, string>>


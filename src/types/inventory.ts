export const CONTAINER_ID = 'container-01' as const
export const TRACKING_METHOD = 'load-cell' as const

export type QuantityUnit = 'g' | 'kg'
export type TrackingMethod = typeof TRACKING_METHOD

export interface PantryItem {
  id: string
  name: string
  category: string
  initialQuantity: number
  quantityUnit: QuantityUnit
  expiryDate?: string
  containerId: typeof CONTAINER_ID
  trackingMethod: TrackingMethod
  createdAt: string
  updatedAt: string
}

export interface PantryItemInput {
  name: string
  category: string
  initialQuantity: number
  quantityUnit: QuantityUnit
  expiryDate?: string
}

export type PantryItemFormErrors = Partial<Record<keyof PantryItemInput, string>>

import type { PantryItem, QuantityUnit } from '../types/inventory'

export const DEFAULT_MIN_STOCK_THRESHOLD_KG = 0.5
export const DEFAULT_MIN_STOCK_THRESHOLD_G = 500

export interface StockEvaluation {
  isLowStock: boolean
  currentQuantityGrams: number
  thresholdGrams: number
  percentageRemaining: number
  stockStatus: 'normal' | 'low-stock' | 'out-of-stock'
}

/**
 * Returns the effective threshold in grams for an item.
 * Preserves backward compatibility by falling back to 0.5kg / 500g if unset.
 */
export function getItemMinThresholdGrams(item: Pick<PantryItem, 'minStockThreshold' | 'quantityUnit'>): number {
  if (
    typeof item.minStockThreshold === 'number' &&
    !Number.isNaN(item.minStockThreshold) &&
    item.minStockThreshold >= 0
  ) {
    return item.quantityUnit === 'kg'
      ? Math.round(item.minStockThreshold * 1000 * 10) / 10
      : Math.round(item.minStockThreshold * 10) / 10
  }

  return item.quantityUnit === 'kg'
    ? DEFAULT_MIN_STOCK_THRESHOLD_KG * 1000
    : DEFAULT_MIN_STOCK_THRESHOLD_G
}

/**
 * Resolves current food quantity in grams.
 * Uses authoritative live sensor weight if available, falling back to manual baseline quantity.
 */
export function getItemCurrentQuantityGrams(
  item: Pick<PantryItem, 'initialQuantity' | 'quantityUnit'>,
  measuredGrams?: number | null
): number {
  if (typeof measuredGrams === 'number' && !Number.isNaN(measuredGrams) && measuredGrams >= 0) {
    return Math.round(measuredGrams * 10) / 10
  }

  const baseline = Math.max(0, item.initialQuantity || 0)
  return item.quantityUnit === 'kg'
    ? Math.round(baseline * 1000 * 10) / 10
    : Math.round(baseline * 10) / 10
}

/**
 * Evaluates whether an item has breached its low-stock threshold.
 */
export function evaluateStockStatus(
  item: PantryItem,
  measuredGrams?: number | null
): StockEvaluation {
  const currentQuantityGrams = getItemCurrentQuantityGrams(item, measuredGrams)
  const thresholdGrams = getItemMinThresholdGrams(item)

  const isLowStock = currentQuantityGrams <= thresholdGrams
  const percentageRemaining =
    thresholdGrams > 0
      ? Math.min(100, Math.round((currentQuantityGrams / thresholdGrams) * 100))
      : currentQuantityGrams > 0
      ? 100
      : 0

  let stockStatus: 'normal' | 'low-stock' | 'out-of-stock' = 'normal'
  if (currentQuantityGrams <= 0) {
    stockStatus = 'out-of-stock'
  } else if (isLowStock) {
    stockStatus = 'low-stock'
  }

  return {
    isLowStock,
    currentQuantityGrams,
    thresholdGrams,
    percentageRemaining,
    stockStatus,
  }
}

/**
 * Deterministic low-stock alert identifier to guarantee deduplication.
 */
export function getLowStockAlertId(itemId: string): string {
  return `low_stock_${itemId}`
}

/**
 * Formats grams into the item's preferred display unit.
 */
export function formatQuantityWithUnit(grams: number, unit: QuantityUnit = 'kg'): string {
  if (grams < 0 || Number.isNaN(grams)) return `0 ${unit}`
  if (unit === 'kg') {
    const kg = grams / 1000
    return `${kg.toFixed(2)} kg`
  }
  return `${Math.round(grams)} g`
}

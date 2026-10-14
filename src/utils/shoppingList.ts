import type { PantryItem } from '../types/inventory'
import type { ShoppingListItem, ShoppingListItemInput } from '../types/shoppingList'
import { evaluateStockStatus, formatQuantityWithUnit } from './lowStock'

/**
 * Creates a new manual shopping list item.
 */
export function createManualShoppingItem(
  input: ShoppingListItemInput,
  id: string = crypto.randomUUID()
): ShoppingListItem {
  const now = new Date().toISOString()
  return {
    id,
    name: input.name.trim(),
    category: input.category?.trim() || 'General',
    targetQuantity: input.targetQuantity,
    quantityUnit: input.quantityUnit || 'kg',
    source: input.source || 'manual',
    itemId: input.itemId,
    containerId: input.containerId,
    isPurchased: false,
    createdAt: now,
    updatedAt: now,
    notes: input.notes?.trim() || undefined,
  }
}

/**
 * Creates an automatic shopping item representing a depleted or low-stock pantry item.
 */
export function createAutoLowStockShoppingItem(
  item: PantryItem,
  currentQuantityGrams: number,
  thresholdGrams: number
): ShoppingListItem {
  const now = new Date().toISOString()
  const deficitGrams = Math.max(100, thresholdGrams * 2 - currentQuantityGrams)
  const targetQuantity =
    item.quantityUnit === 'kg'
      ? Math.round((deficitGrams / 1000) * 10) / 10
      : Math.round(deficitGrams)

  return {
    id: `auto_${item.id}`,
    name: item.name,
    category: item.category,
    targetQuantity,
    quantityUnit: item.quantityUnit,
    source: 'auto-low-stock',
    itemId: item.id,
    containerId: item.containerId,
    isPurchased: false,
    createdAt: now,
    updatedAt: now,
    notes: `Auto-added: Low stock (${formatQuantityWithUnit(currentQuantityGrams, item.quantityUnit)} / ${formatQuantityWithUnit(thresholdGrams, item.quantityUnit)} min)`,
  }
}

/**
 * Synchronizes low-stock pantry items into the shopping list.
 * Deduplicates: avoids adding items that are already active on the list.
 */
export function syncLowStockToShoppingList(
  currentList: ShoppingListItem[],
  pantryItems: PantryItem[],
  measuredGrams?: number | null
): { nextList: ShoppingListItem[]; addedCount: number } {
  const nextList = [...currentList]
  let addedCount = 0

  for (const item of pantryItems) {
    const evaluation = evaluateStockStatus(item, measuredGrams)
    if (!evaluation.isLowStock) continue

    // Check if item is already in active shopping list
    const existingActive = nextList.find(
      (entry) =>
        (entry.itemId === item.id || entry.id === `auto_${item.id}`) &&
        !entry.isPurchased
    )

    if (!existingActive) {
      // Check if there was a purchased entry with this ID; if so, replace or add new
      const autoItem = createAutoLowStockShoppingItem(
        item,
        evaluation.currentQuantityGrams,
        evaluation.thresholdGrams
      )

      const existingIndex = nextList.findIndex((entry) => entry.id === autoItem.id)
      if (existingIndex >= 0) {
        // Reset to active unpurchased
        nextList[existingIndex] = {
          ...nextList[existingIndex],
          isPurchased: false,
          purchasedAt: undefined,
          updatedAt: new Date().toISOString(),
          notes: autoItem.notes,
        }
      } else {
        nextList.unshift(autoItem)
      }
      addedCount++
    }
  }

  return { nextList, addedCount }
}

/**
 * Toggles purchased state of an item.
 */
export function togglePurchasedState(
  list: ShoppingListItem[],
  id: string
): ShoppingListItem[] {
  const now = new Date().toISOString()
  return list.map((item) => {
    if (item.id !== id) return item
    const nextPurchased = !item.isPurchased
    return {
      ...item,
      isPurchased: nextPurchased,
      purchasedAt: nextPurchased ? now : undefined,
      updatedAt: now,
    }
  })
}

/**
 * Removes an item by ID from the shopping list.
 */
export function removeShoppingListItem(
  list: ShoppingListItem[],
  id: string
): ShoppingListItem[] {
  return list.filter((item) => item.id !== id)
}

/**
 * Clears all purchased items from the list.
 */
export function clearAllPurchased(list: ShoppingListItem[]): ShoppingListItem[] {
  return list.filter((item) => !item.isPurchased)
}

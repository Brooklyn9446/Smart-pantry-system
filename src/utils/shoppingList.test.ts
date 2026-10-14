import { describe, expect, it } from 'vitest'
import { CONTAINER_ID, TRACKING_METHOD, type PantryItem } from '../types/inventory'
import type { ShoppingListItem } from '../types/shoppingList'
import {
  clearAllPurchased,
  createAutoLowStockShoppingItem,
  createManualShoppingItem,
  removeShoppingListItem,
  syncLowStockToShoppingList,
  togglePurchasedState,
} from './shoppingList'

function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'item-rice',
    name: 'Jasmine Rice',
    category: 'Grains & cereals',
    initialQuantity: 3.5,
    quantityUnit: 'kg',
    minStockThreshold: 1.0, // 1kg = 1000g threshold
    containerId: CONTAINER_ID,
    trackingMethod: TRACKING_METHOD,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
    ...overrides,
  }
}

describe('Phase 8: Shopping List Operations', () => {
  it('creates a manual shopping list item with defaults', () => {
    const item = createManualShoppingItem({
      name: 'Olive Oil',
      category: 'Oils & Condiments',
      targetQuantity: 1,
      quantityUnit: 'kg',
    })

    expect(item.name).toBe('Olive Oil')
    expect(item.category).toBe('Oils & Condiments')
    expect(item.source).toBe('manual')
    expect(item.isPurchased).toBe(false)
    expect(item.id).toBeDefined()
  })

  it('creates an auto-low-stock item with item association', () => {
    const pantryItem = makeItem()
    const autoItem = createAutoLowStockShoppingItem(pantryItem, 400, 1000)

    expect(autoItem.id).toBe('auto_item-rice')
    expect(autoItem.name).toBe('Jasmine Rice')
    expect(autoItem.source).toBe('auto-low-stock')
    expect(autoItem.itemId).toBe('item-rice')
    expect(autoItem.isPurchased).toBe(false)
    expect(autoItem.notes).toContain('Low stock')
  })

  it('automatically adds low-stock items and deduplicates active entries', () => {
    const pantryItem = makeItem({ minStockThreshold: 1.0 }) // 1000g
    const currentList: ShoppingListItem[] = []

    // 1st sync: weight is 300g (below 1000g) -> should add
    const firstSync = syncLowStockToShoppingList(currentList, [pantryItem], 300)
    expect(firstSync.addedCount).toBe(1)
    expect(firstSync.nextList).toHaveLength(1)
    expect(firstSync.nextList[0].name).toBe('Jasmine Rice')

    // 2nd sync with same low weight -> deduplication prevents adding second entry
    const secondSync = syncLowStockToShoppingList(firstSync.nextList, [pantryItem], 280)
    expect(secondSync.addedCount).toBe(0)
    expect(secondSync.nextList).toHaveLength(1)
  })

  it('does not add normal stock items to the shopping list', () => {
    const pantryItem = makeItem({ minStockThreshold: 0.5 }) // 500g
    const sync = syncLowStockToShoppingList([], [pantryItem], 2500)
    expect(sync.addedCount).toBe(0)
    expect(sync.nextList).toHaveLength(0)
  })

  it('toggles purchased state back and forth', () => {
    const item = createManualShoppingItem({ name: 'Milk' }, 'test-1')
    const list = [item]

    const purchased = togglePurchasedState(list, 'test-1')
    expect(purchased[0].isPurchased).toBe(true)
    expect(purchased[0].purchasedAt).toBeDefined()

    const unpurchased = togglePurchasedState(purchased, 'test-1')
    expect(unpurchased[0].isPurchased).toBe(false)
    expect(unpurchased[0].purchasedAt).toBeUndefined()
  })

  it('removes an item by id', () => {
    const item1 = createManualShoppingItem({ name: 'Apples' }, 'id-1')
    const item2 = createManualShoppingItem({ name: 'Bananas' }, 'id-2')
    const list = [item1, item2]

    const remaining = removeShoppingListItem(list, 'id-1')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('id-2')
  })

  it('clears all purchased items from active list', () => {
    const item1 = { ...createManualShoppingItem({ name: 'Flour' }, 'id-1'), isPurchased: true }
    const item2 = { ...createManualShoppingItem({ name: 'Sugar' }, 'id-2'), isPurchased: false }
    const item3 = { ...createManualShoppingItem({ name: 'Yeast' }, 'id-3'), isPurchased: true }
    const list = [item1, item2, item3]

    const cleared = clearAllPurchased(list)
    expect(cleared).toHaveLength(1)
    expect(cleared[0].id).toBe('id-2')
  })
})

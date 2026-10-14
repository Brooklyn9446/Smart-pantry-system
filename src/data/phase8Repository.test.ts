import { beforeEach, describe, expect, it } from 'vitest'
import { CONTAINER_ID, TRACKING_METHOD, type PantryItem } from '../types/inventory'
import { alertRepository } from './alertRepository'
import { inventoryRepository } from './inventoryRepository'
import { shoppingListRepository } from './shoppingListRepository'

// Provide lightweight window.localStorage shim for Node test runner
const storageMap = new Map<string, string>()
const mockStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => {
    storageMap.set(key, String(val))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  clear: () => {
    storageMap.clear()
  },
}

// @ts-expect-error Mocking window in Node test environment
globalThis.window = { localStorage: mockStorage }

describe('Phase 8: Repository & State Persistence', () => {
  beforeEach(() => {
    storageMap.clear()
  })

  describe('Inventory Repository threshold persistence', () => {
    it('creates and saves an item with configured minimum stock threshold after clearing container', async () => {
      // Clear container-01 of default seed item
      const initial = await inventoryRepository.getAll()
      for (const item of initial) {
        await inventoryRepository.delete(item.id)
      }

      const item = await inventoryRepository.create({
        name: 'Organic Rolled Oats',
        category: 'Grains & cereals',
        initialQuantity: 2.0,
        quantityUnit: 'kg',
        minStockThreshold: 0.75,
      })

      expect(item.minStockThreshold).toBe(0.75)
      const all = await inventoryRepository.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].minStockThreshold).toBe(0.75)
    })

    it('updates item threshold and allows clearing threshold', async () => {
      const initial = await inventoryRepository.getAll()
      const existing = initial[0]

      const updated = await inventoryRepository.update(existing.id, {
        name: existing.name,
        category: existing.category,
        initialQuantity: existing.initialQuantity,
        quantityUnit: existing.quantityUnit,
        minStockThreshold: 0.5,
      })
      expect(updated.minStockThreshold).toBe(0.5)

      // Clear threshold back to default undefined
      const cleared = await inventoryRepository.update(existing.id, {
        name: existing.name,
        category: existing.category,
        initialQuantity: existing.initialQuantity,
        quantityUnit: existing.quantityUnit,
        minStockThreshold: undefined,
      })
      expect(cleared.minStockThreshold).toBeUndefined()
    })
  })

  describe('Alert Repository low-stock alerts & resolution', () => {
    const testItem: PantryItem = {
      id: 'rice-item',
      name: 'Basmati Rice',
      category: 'Grains & cereals',
      initialQuantity: 2.0,
      quantityUnit: 'kg',
      minStockThreshold: 0.8, // 800g threshold
      containerId: CONTAINER_ID,
      trackingMethod: TRACKING_METHOD,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    it('generates a low-stock alert when item weight is <= threshold', async () => {
      await alertRepository.syncLowStockAlerts('local-user', [testItem], 500) // 500g <= 800g
      const alerts = await alertRepository.getAll('local-user')

      expect(alerts).toHaveLength(1)
      expect(alerts[0].id).toBe('low_stock_rice-item')
      expect(alerts[0].type).toBe('low-stock')
      expect(alerts[0].status).toBe('active')
      expect(alerts[0].severity).toBe('warning')
      expect(alerts[0].title).toContain('low on stock')
    })

    it('deduplicates alerts when evaluated repeatedly under low-stock condition', async () => {
      await alertRepository.syncLowStockAlerts('local-user', [testItem], 450)
      await alertRepository.syncLowStockAlerts('local-user', [testItem], 400)
      await alertRepository.syncLowStockAlerts('local-user', [testItem], 350)

      const alerts = await alertRepository.getAll('local-user')
      expect(alerts.filter((a) => a.id === 'low_stock_rice-item')).toHaveLength(1)
    })

    it('automatically resolves low-stock alert when item is restocked above threshold', async () => {
      // 1. Enter low-stock condition
      await alertRepository.syncLowStockAlerts('local-user', [testItem], 400)
      let alerts = await alertRepository.getAll('local-user')
      expect(alerts[0].status).toBe('active')

      // 2. Refill to 2500g (> 800g)
      await alertRepository.syncLowStockAlerts('local-user', [testItem], 2500)
      alerts = await alertRepository.getAll('local-user')

      expect(alerts).toHaveLength(1)
      expect(alerts[0].status).toBe('resolved')
      expect(alerts[0].message).toContain('replenished')
    })

    it('re-activates a previously resolved alert if stock drops below threshold again', async () => {
      // Low stock -> Resolved -> Low stock again
      await alertRepository.syncLowStockAlerts('local-user', [testItem], 400)
      await alertRepository.syncLowStockAlerts('local-user', [testItem], 2000)
      let alerts = await alertRepository.getAll('local-user')
      expect(alerts[0].status).toBe('resolved')

      await alertRepository.syncLowStockAlerts('local-user', [testItem], 300)
      alerts = await alertRepository.getAll('local-user')
      expect(alerts[0].status).toBe('active')
    })
  })

  describe('Shopping List Repository operations', () => {
    it('supports adding manual shopping items', async () => {
      const item = await shoppingListRepository.addItem('local-user', {
        name: 'Whole Wheat Flour',
        category: 'Baking',
        targetQuantity: 2,
        quantityUnit: 'kg',
      })

      expect(item.name).toBe('Whole Wheat Flour')
      expect(item.isPurchased).toBe(false)
      const all = await shoppingListRepository.getAll('local-user')
      expect(all).toHaveLength(1)
    })

    it('syncs low-stock items automatically and deduplicates', async () => {
      const pantryItem: PantryItem = {
        id: 'sugar-item',
        name: 'Cane Sugar',
        category: 'Baking',
        initialQuantity: 1.5,
        quantityUnit: 'kg',
        minStockThreshold: 0.5,
        containerId: CONTAINER_ID,
        trackingMethod: TRACKING_METHOD,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await shoppingListRepository.syncLowStockItems('local-user', [pantryItem], 200) // below 500g
      let list = await shoppingListRepository.getAll('local-user')
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe('Cane Sugar')
      expect(list[0].source).toBe('auto-low-stock')

      // Sync again -> no duplicates
      await shoppingListRepository.syncLowStockItems('local-user', [pantryItem], 180)
      list = await shoppingListRepository.getAll('local-user')
      expect(list).toHaveLength(1)
    })

    it('marks items as purchased and clears purchased items', async () => {
      const item = await shoppingListRepository.addItem('local-user', {
        name: 'Coffee Beans',
        category: 'Beverages',
      })

      await shoppingListRepository.togglePurchased('local-user', item.id)
      let list = await shoppingListRepository.getAll('local-user')
      expect(list[0].isPurchased).toBe(true)

      await shoppingListRepository.clearPurchased('local-user')
      list = await shoppingListRepository.getAll('local-user')
      expect(list).toHaveLength(0)
    })

    it('removes an item by id', async () => {
      const item1 = await shoppingListRepository.addItem('local-user', { name: 'Item 1' })
      const item2 = await shoppingListRepository.addItem('local-user', { name: 'Item 2' })

      await shoppingListRepository.removeItem('local-user', item1.id)
      const remaining = await shoppingListRepository.getAll('local-user')
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe(item2.id)
    })
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { CONTAINER_ID, type PantryItem } from '../types/inventory'
import { alertRepository } from './alertRepository'
import { inventoryRepository } from './inventoryRepository'

// LocalStorage shim for Node test environment
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

describe('Phase 9, Task 2: Multiple Pantry Items & Container Assignment', () => {
  beforeEach(() => {
    storageMap.clear()
  })

  describe('Item existence independent of containers', () => {
    it('allows creating multiple unassigned items without physical containers', async () => {
      // Clear any default seed items
      const initial = await inventoryRepository.getAll()
      for (const item of initial) {
        await inventoryRepository.delete(item.id)
      }

      const item1 = await inventoryRepository.create({
        name: 'Whole Wheat Flour',
        category: 'Baking',
        initialQuantity: 1.5,
        quantityUnit: 'kg',
        containerId: null,
      })

      const item2 = await inventoryRepository.create({
        name: 'Olive Oil',
        category: 'Other',
        initialQuantity: 750,
        quantityUnit: 'g',
        containerId: null,
      })

      const item3 = await inventoryRepository.create({
        name: 'Canned Tomatoes',
        category: 'Canned goods',
        initialQuantity: 400,
        quantityUnit: 'g',
      })

      expect(item1.containerId).toBeNull()
      expect(item1.trackingMethod).toBe('manual')
      expect(item2.containerId).toBeNull()
      expect(item3.containerId).toBeNull()

      const all = await inventoryRepository.getAll()
      expect(all).toHaveLength(3)
      expect(all.map((i) => i.name).sort()).toEqual(['Canned Tomatoes', 'Olive Oil', 'Whole Wheat Flour'])
    })

    it('keeps inventory item IDs distinct from physical container IDs', async () => {
      const initial = await inventoryRepository.getAll()
      for (const item of initial) {
        await inventoryRepository.delete(item.id)
      }

      const assigned = await inventoryRepository.create({
        name: 'Jasmine Rice',
        category: 'Grains & cereals',
        initialQuantity: 2.0,
        quantityUnit: 'kg',
        containerId: CONTAINER_ID,
      })

      expect(assigned.containerId).toBe(CONTAINER_ID)
      expect(assigned.id).not.toBe(CONTAINER_ID)
      expect(typeof assigned.id).toBe('string')
      expect(assigned.id.length).toBeGreaterThan(8)
    })
  })

  describe('Exclusive container assignment and conflict prevention', () => {
    it('prevents two items from holding active assignment to the same container', async () => {
      const initial = await inventoryRepository.getAll()
      for (const item of initial) {
        await inventoryRepository.delete(item.id)
      }

      // Assign first item to container-01
      const item1 = await inventoryRepository.create({
        name: 'Basmati Rice',
        category: 'Grains & cereals',
        initialQuantity: 2.0,
        quantityUnit: 'kg',
        containerId: CONTAINER_ID,
      })
      expect(item1.containerId).toBe(CONTAINER_ID)

      // Attempting to create a second item directly targeting container-01 must fail
      await expect(
        inventoryRepository.create({
          name: 'Brown Rice',
          category: 'Grains & cereals',
          initialQuantity: 1.0,
          quantityUnit: 'kg',
          containerId: CONTAINER_ID,
        })
      ).rejects.toThrow('container-01 already has an active item assigned')

      // Create a second item unassigned
      const item2 = await inventoryRepository.create({
        name: 'Brown Rice',
        category: 'Grains & cereals',
        initialQuantity: 1.0,
        quantityUnit: 'kg',
        containerId: null,
      })
      expect(item2.containerId).toBeNull()

      // Attempting to assign item2 to container-01 via update must also be rejected
      await expect(
        inventoryRepository.update(item2.id, {
          name: item2.name,
          category: item2.category,
          initialQuantity: item2.initialQuantity,
          quantityUnit: item2.quantityUnit,
          containerId: CONTAINER_ID,
        })
      ).rejects.toThrow('container-01 already has an active item assigned')

      // Attempting to assign item2 via assignItem must also fail
      await expect(
        inventoryRepository.assignItem(item2.id, CONTAINER_ID)
      ).rejects.toThrow('container-01 already has an active item assigned')
    })

    it('allows container reassignment after unassigning the previous item', async () => {
      const initial = await inventoryRepository.getAll()
      for (const item of initial) {
        await inventoryRepository.delete(item.id)
      }

      const item1 = await inventoryRepository.create({
        name: 'Oatmeal',
        category: 'Grains & cereals',
        initialQuantity: 1.0,
        quantityUnit: 'kg',
        containerId: CONTAINER_ID,
      })

      const item2 = await inventoryRepository.create({
        name: 'Quinoa',
        category: 'Grains & cereals',
        initialQuantity: 0.8,
        quantityUnit: 'kg',
        containerId: null,
      })

      // Unassign item1 from container-01
      const unassigned1 = await inventoryRepository.assignItem(item1.id, null)
      expect(unassigned1.containerId).toBeNull()
      expect(unassigned1.trackingMethod).toBe('manual')

      // Now item2 can claim container-01
      const assigned2 = await inventoryRepository.assignItem(item2.id, CONTAINER_ID)
      expect(assigned2.containerId).toBe(CONTAINER_ID)
      expect(assigned2.trackingMethod).toBe('load-cell')

      const all = await inventoryRepository.getAll()
      const refreshedItem1 = all.find((i) => i.id === item1.id)
      const refreshedItem2 = all.find((i) => i.id === item2.id)

      expect(refreshedItem1?.containerId).toBeNull()
      expect(refreshedItem2?.containerId).toBe(CONTAINER_ID)
    })
  })

  describe('CRUD operations and deletion independence', () => {
    it('deleting an assigned item frees the container for subsequent items', async () => {
      const initial = await inventoryRepository.getAll()
      for (const item of initial) {
        await inventoryRepository.delete(item.id)
      }

      const item1 = await inventoryRepository.create({
        name: 'Sugar',
        category: 'Baking',
        initialQuantity: 1.0,
        quantityUnit: 'kg',
        containerId: CONTAINER_ID,
      })

      const item2 = await inventoryRepository.create({
        name: 'Flour',
        category: 'Baking',
        initialQuantity: 2.0,
        quantityUnit: 'kg',
        containerId: null,
      })

      // Delete assigned item1
      await inventoryRepository.delete(item1.id)

      // item2 can now be assigned to container-01
      const updatedItem2 = await inventoryRepository.assignItem(item2.id, CONTAINER_ID)
      expect(updatedItem2.containerId).toBe(CONTAINER_ID)

      const remaining = await inventoryRepository.getAll()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe(item2.id)
    })

    it('deleting an unassigned item leaves the container assignment undisturbed', async () => {
      const initial = await inventoryRepository.getAll()
      for (const item of initial) {
        await inventoryRepository.delete(item.id)
      }

      const assigned = await inventoryRepository.create({
        name: 'Coffee Beans',
        category: 'Other',
        initialQuantity: 1.0,
        quantityUnit: 'kg',
        containerId: CONTAINER_ID,
      })

      const unassigned = await inventoryRepository.create({
        name: 'Tea Bags',
        category: 'Other',
        initialQuantity: 200,
        quantityUnit: 'g',
        containerId: null,
      })

      // Delete unassigned item
      await inventoryRepository.delete(unassigned.id)

      const all = await inventoryRepository.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe(assigned.id)
      expect(all[0].containerId).toBe(CONTAINER_ID)

      // Container should still be claimed by assigned item
      await expect(
        inventoryRepository.create({
          name: 'Green Tea',
          category: 'Other',
          initialQuantity: 100,
          quantityUnit: 'g',
          containerId: CONTAINER_ID,
        })
      ).rejects.toThrow('container-01 already has an active item assigned')
    })
  })

  describe('Sensor Telemetry & Low Stock Alert Isolation', () => {
    it('evaluates sensor measuredGrams only for the item assigned to container-01', async () => {
      const assignedItem: PantryItem = {
        id: 'item-assigned-rice',
        name: 'Basmati Rice',
        category: 'Grains & cereals',
        initialQuantity: 2.0,
        quantityUnit: 'kg',
        minStockThreshold: 1.0, // 1000g threshold
        containerId: CONTAINER_ID,
        trackingMethod: 'load-cell',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const unassignedItem: PantryItem = {
        id: 'item-unassigned-flour',
        name: 'Whole Wheat Flour',
        category: 'Baking',
        initialQuantity: 2.0, // 2000g manual baseline
        quantityUnit: 'kg',
        minStockThreshold: 1.0, // 1000g threshold
        containerId: null,
        trackingMethod: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Sensor reading for container-01 is 400g (below 1000g threshold)
      await alertRepository.syncLowStockAlerts('local-user', [assignedItem, unassignedItem], 400)

      const alerts = await alertRepository.getAll('local-user')

      // Only the item assigned to container-01 should trigger low stock!
      // The unassigned item has initialQuantity=2.0kg which is > 1.0kg threshold, so no false alert.
      expect(alerts).toHaveLength(1)
      expect(alerts[0].itemId).toBe('item-assigned-rice')
      expect(alerts[0].containerId).toBe(CONTAINER_ID)
      expect(alerts[0].status).toBe('active')
      expect(alerts[0].title).toBe('Basmati Rice is low on stock')
    })
  })
})

import { describe, expect, it } from 'vitest'
import { CONTAINER_ID, TRACKING_METHOD, type PantryItem } from '../types/inventory'
import {
  evaluateStockStatus,
  formatQuantityWithUnit,
  getItemCurrentQuantityGrams,
  getItemMinThresholdGrams,
  getLowStockAlertId,
} from './lowStock'

function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'item-01',
    name: 'Basmati Rice',
    category: 'Grains & cereals',
    initialQuantity: 2.0,
    quantityUnit: 'kg',
    containerId: CONTAINER_ID,
    trackingMethod: TRACKING_METHOD,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
    ...overrides,
  }
}

describe('Phase 8: Low-Stock Threshold & Alert Evaluation', () => {
  describe('getItemMinThresholdGrams', () => {
    it('uses explicit threshold configured in kg', () => {
      const item = makeItem({ minStockThreshold: 1.2, quantityUnit: 'kg' })
      expect(getItemMinThresholdGrams(item)).toBe(1200)
    })

    it('uses explicit threshold configured in grams', () => {
      const item = makeItem({ minStockThreshold: 350, quantityUnit: 'g' })
      expect(getItemMinThresholdGrams(item)).toBe(350)
    })

    it('falls back to 500g default when minStockThreshold is undefined (backward compatibility)', () => {
      const legacyKgItem = makeItem({ minStockThreshold: undefined, quantityUnit: 'kg' })
      expect(getItemMinThresholdGrams(legacyKgItem)).toBe(500)

      const legacyGItem = makeItem({ minStockThreshold: undefined, quantityUnit: 'g' })
      expect(getItemMinThresholdGrams(legacyGItem)).toBe(500)
    })

    it('handles negative or NaN thresholds by falling back to safe default', () => {
      const invalidItem = makeItem({ minStockThreshold: -5, quantityUnit: 'kg' })
      expect(getItemMinThresholdGrams(invalidItem)).toBe(500)
    })
  })

  describe('getItemCurrentQuantityGrams', () => {
    it('prefers authoritative live sensor weight when present', () => {
      const item = makeItem({ initialQuantity: 3.0, quantityUnit: 'kg' })
      expect(getItemCurrentQuantityGrams(item, 850.5)).toBe(850.5)
      expect(getItemCurrentQuantityGrams(item, 0)).toBe(0)
    })

    it('falls back to baseline manual quantity when sensor data is absent', () => {
      const itemKg = makeItem({ initialQuantity: 2.5, quantityUnit: 'kg' })
      expect(getItemCurrentQuantityGrams(itemKg, null)).toBe(2500)
      expect(getItemCurrentQuantityGrams(itemKg, undefined)).toBe(2500)

      const itemG = makeItem({ initialQuantity: 400, quantityUnit: 'g' })
      expect(getItemCurrentQuantityGrams(itemG, null)).toBe(400)
    })
  })

  describe('evaluateStockStatus & Boundary Conditions', () => {
    it('detects normal stock when measured weight is strictly greater than threshold', () => {
      const item = makeItem({ minStockThreshold: 0.5, quantityUnit: 'kg' }) // 500g threshold
      const status = evaluateStockStatus(item, 600)
      expect(status.isLowStock).toBe(false)
      expect(status.stockStatus).toBe('normal')
      expect(status.currentQuantityGrams).toBe(600)
      expect(status.thresholdGrams).toBe(500)
    })

    it('detects low stock at the exact boundary condition (weight == threshold)', () => {
      const item = makeItem({ minStockThreshold: 0.5, quantityUnit: 'kg' }) // 500g threshold
      const status = evaluateStockStatus(item, 500)
      expect(status.isLowStock).toBe(true)
      expect(status.stockStatus).toBe('low-stock')
    })

    it('detects low stock when quantity drops below threshold', () => {
      const item = makeItem({ minStockThreshold: 0.5, quantityUnit: 'kg' }) // 500g threshold
      const status = evaluateStockStatus(item, 320)
      expect(status.isLowStock).toBe(true)
      expect(status.stockStatus).toBe('low-stock')
      expect(status.percentageRemaining).toBe(64)
    })

    it('detects out-of-stock when container weight is 0g', () => {
      const item = makeItem({ minStockThreshold: 0.5, quantityUnit: 'kg' })
      const status = evaluateStockStatus(item, 0)
      expect(status.isLowStock).toBe(true)
      expect(status.stockStatus).toBe('out-of-stock')
      expect(status.percentageRemaining).toBe(0)
    })

    it('detects replenishment transition when refilled above threshold', () => {
      const item = makeItem({ minStockThreshold: 0.5, quantityUnit: 'kg' }) // 500g threshold
      const low = evaluateStockStatus(item, 200)
      expect(low.isLowStock).toBe(true)

      // Refill to 2500g
      const replenished = evaluateStockStatus(item, 2500)
      expect(replenished.isLowStock).toBe(false)
      expect(replenished.stockStatus).toBe('normal')
    })
  })

  describe('Alert Deduplication', () => {
    it('produces deterministic and item-specific alert IDs', () => {
      expect(getLowStockAlertId('item-01')).toBe('low_stock_item-01')
      expect(getLowStockAlertId('jasmine-rice')).toBe('low_stock_jasmine-rice')
    })
  })

  describe('formatQuantityWithUnit', () => {
    it('formats kg and g correctly', () => {
      expect(formatQuantityWithUnit(1500, 'kg')).toBe('1.50 kg')
      expect(formatQuantityWithUnit(350, 'g')).toBe('350 g')
      expect(formatQuantityWithUnit(-10, 'kg')).toBe('0 kg')
    })
  })
})

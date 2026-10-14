import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { shoppingListRepository } from '../data/shoppingListRepository'
import type { ShoppingListItem, ShoppingListItemInput } from '../types/shoppingList'
import { ShoppingListContext, type ShoppingListContextValue } from './shoppingListContextValue'
import { useAuth } from './useAuth'
import { useInventory } from './useInventory'
import { useSensors } from './useSensors'

export function ShoppingListProvider({ children }: { children: ReactNode }) {
  const { userId, isAuthLoading } = useAuth()
  const { items: pantryItems } = useInventory()
  const { netFoodWeightGrams, currentState } = useSensors()

  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const activeUserId = userId ?? 'local-user'

  // Subscribe to real-time shopping list
  useEffect(() => {
    if (isAuthLoading) {
      setIsLoading(true)
      return
    }

    setIsLoading(true)
    setError(null)

    const unsubscribe = shoppingListRepository.subscribe(
      activeUserId,
      (latestItems) => {
        setItems(latestItems)
        setIsLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setIsLoading(false)
      }
    )

    return () => {
      unsubscribe()
    }
  }, [activeUserId, isAuthLoading])

  // Automatically sync low-stock pantry items into the shopping list
  useEffect(() => {
    if (!isAuthLoading) {
      const targetUserId = userId ?? 'local-user'
      const syncShopping = async () => {
        await shoppingListRepository.syncLowStockItems(
          targetUserId,
          pantryItems,
          currentState ? netFoodWeightGrams : null
        )
        if (!shoppingListRepository.isRemote() || targetUserId === 'local-user') {
          setItems(await shoppingListRepository.getAll(targetUserId))
        }
      }
      void syncShopping()
    }
  }, [pantryItems, userId, isAuthLoading, netFoodWeightGrams, currentState])

  const addItem = useCallback(
    async (input: ShoppingListItemInput) => {
      setError(null)
      try {
        const item = await shoppingListRepository.addItem(activeUserId, input)
        // If local mode, re-fetch
        if (!shoppingListRepository.isRemote() || activeUserId === 'local-user') {
          setItems(await shoppingListRepository.getAll(activeUserId))
        }
        return item
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to add item to shopping list.'
        setError(msg)
        throw err
      }
    },
    [activeUserId]
  )

  const togglePurchased = useCallback(
    async (id: string) => {
      setError(null)
      try {
        await shoppingListRepository.togglePurchased(activeUserId, id)
        if (!shoppingListRepository.isRemote() || activeUserId === 'local-user') {
          setItems(await shoppingListRepository.getAll(activeUserId))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to update item status.'
        setError(msg)
        throw err
      }
    },
    [activeUserId]
  )

  const removeItem = useCallback(
    async (id: string) => {
      setError(null)
      try {
        await shoppingListRepository.removeItem(activeUserId, id)
        if (!shoppingListRepository.isRemote() || activeUserId === 'local-user') {
          setItems(await shoppingListRepository.getAll(activeUserId))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to remove item.'
        setError(msg)
        throw err
      }
    },
    [activeUserId]
  )

  const clearPurchased = useCallback(async () => {
    setError(null)
    try {
      await shoppingListRepository.clearPurchased(activeUserId)
      if (!shoppingListRepository.isRemote() || activeUserId === 'local-user') {
        setItems(await shoppingListRepository.getAll(activeUserId))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to clear purchased items.'
      setError(msg)
      throw err
    }
  }, [activeUserId])

  const syncLowStock = useCallback(async () => {
    await shoppingListRepository.syncLowStockItems(
      activeUserId,
      pantryItems,
      currentState ? netFoodWeightGrams : null
    )
    if (!shoppingListRepository.isRemote() || activeUserId === 'local-user') {
      setItems(await shoppingListRepository.getAll(activeUserId))
    }
  }, [activeUserId, pantryItems, currentState, netFoodWeightGrams])

  const activeItems = useMemo(() => items.filter((i) => !i.isPurchased), [items])
  const purchasedItems = useMemo(() => items.filter((i) => i.isPurchased), [items])
  const toBuyCount = useMemo(() => activeItems.length, [activeItems])

  const value: ShoppingListContextValue = useMemo(
    () => ({
      items,
      activeItems,
      purchasedItems,
      toBuyCount,
      isLoading,
      error,
      addItem,
      togglePurchased,
      removeItem,
      clearPurchased,
      syncLowStock,
    }),
    [
      items,
      activeItems,
      purchasedItems,
      toBuyCount,
      isLoading,
      error,
      addItem,
      togglePurchased,
      removeItem,
      clearPurchased,
      syncLowStock,
    ]
  )

  return <ShoppingListContext.Provider value={value}>{children}</ShoppingListContext.Provider>
}

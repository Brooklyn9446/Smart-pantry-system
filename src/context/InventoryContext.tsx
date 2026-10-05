import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { inventoryRepository } from '../data/inventoryRepository'
import type { PantryItem, PantryItemInput } from '../types/inventory'
import { InventoryContext } from './inventoryContextValue'
import { useAuth } from './useAuth'

export function InventoryProvider({ children }: { children: ReactNode }) {
  const { userId, isAuthLoading, isFirebaseActive } = useAuth()
  const [items, setItems] = useState<PantryItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const source: 'firestore' | 'local' =
    isFirebaseActive && userId && userId !== 'local-user' ? 'firestore' : 'local'

  useEffect(() => {
    if (isAuthLoading) {
      setIsLoading(true)
      return
    }

    setIsLoading(true)
    setError(null)

    const unsubscribe = inventoryRepository.subscribe(
      userId ?? 'local-user',
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
  }, [userId, isAuthLoading])

  const clearFeedback = useCallback(() => {
    setError(null)
    setSuccessMessage(null)
  }, [])

  const addItem = useCallback(
    async (input: PantryItemInput) => {
      setError(null)
      setSuccessMessage(null)
      try {
        const item = await inventoryRepository.create(input, userId ?? undefined)
        // If in local mode without snapshot stream, update state immediately
        if (source === 'local') {
          setItems(await inventoryRepository.getAll(userId ?? undefined))
        }
        setSuccessMessage(`${item.name} was added to container-01.`)
        return item
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'Unable to add item.'
        setError(message)
        throw reason
      }
    },
    [userId, source]
  )

  const updateItem = useCallback(
    async (id: string, input: PantryItemInput) => {
      setError(null)
      setSuccessMessage(null)
      try {
        const item = await inventoryRepository.update(id, input, userId ?? undefined)
        if (source === 'local') {
          setItems(await inventoryRepository.getAll(userId ?? undefined))
        }
        setSuccessMessage(`${item.name} was updated.`)
        return item
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'Unable to update item.'
        setError(message)
        throw reason
      }
    },
    [userId, source]
  )

  const deleteItem = useCallback(
    async (id: string) => {
      setError(null)
      setSuccessMessage(null)
      try {
        await inventoryRepository.delete(id, userId ?? undefined)
        if (source === 'local') {
          setItems(await inventoryRepository.getAll(userId ?? undefined))
        }
        setSuccessMessage('Item was removed from container-01.')
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'Unable to remove item.'
        setError(message)
        throw reason
      }
    },
    [userId, source]
  )

  const value = useMemo(
    () => ({
      items,
      isLoading,
      error,
      successMessage,
      source,
      addItem,
      updateItem,
      deleteItem,
      clearFeedback,
    }),
    [items, isLoading, error, successMessage, source, addItem, updateItem, deleteItem, clearFeedback]
  )

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}

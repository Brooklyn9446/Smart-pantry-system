import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { inventoryRepository } from '../data/inventoryRepository'
import type { PantryItem, PantryItemInput } from '../types/inventory'
import { InventoryContext } from './inventoryContextValue'

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PantryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const source = inventoryRepository.isRemote() ? 'firestore' as const : 'local' as const
  const load = useCallback(async () => { setIsLoading(true); setError(null); try { setItems(await inventoryRepository.getAll()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load inventory.') } finally { setIsLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  const addItem = useCallback(async (input: PantryItemInput) => { setError(null); try { const item = await inventoryRepository.create(input); setItems(await inventoryRepository.getAll()); setSuccessMessage(`${item.name} was added.`); return item } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add item.'); throw reason } }, [])
  const updateItem = useCallback(async (id: string, input: PantryItemInput) => { setError(null); try { const item = await inventoryRepository.update(id, input); setItems(await inventoryRepository.getAll()); setSuccessMessage(`${item.name} was updated.`); return item } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update item.'); throw reason } }, [])
  const deleteItem = useCallback(async (id: string) => { setError(null); try { await inventoryRepository.delete(id); setItems(await inventoryRepository.getAll()); setSuccessMessage('Item was removed from container-01.') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to remove item.'); throw reason } }, [])
  const value = useMemo(() => ({ items, isLoading, error, successMessage, source, addItem, updateItem, deleteItem }), [items, isLoading, error, successMessage, source, addItem, updateItem, deleteItem])
  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}


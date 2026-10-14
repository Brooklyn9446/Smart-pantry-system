import { useContext } from 'react'
import { ShoppingListContext, type ShoppingListContextValue } from './shoppingListContextValue'

export function useShoppingList(): ShoppingListContextValue {
  const context = useContext(ShoppingListContext)
  if (!context) {
    throw new Error('useShoppingList must be used within a ShoppingListProvider')
  }
  return context
}

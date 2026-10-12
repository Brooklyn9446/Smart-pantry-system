import { useContext } from 'react'
import { QuantityHistoryContext, type QuantityHistoryContextValue } from './quantityHistoryContextValue'

export function useQuantityHistory(): QuantityHistoryContextValue {
  const context = useContext(QuantityHistoryContext)
  if (!context) {
    throw new Error('useQuantityHistory must be used within a QuantityHistoryProvider.')
  }
  return context
}

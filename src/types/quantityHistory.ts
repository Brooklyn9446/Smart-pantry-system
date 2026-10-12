import { CONTAINER_ID } from './inventory'

export type QuantityEventType = 'consumption' | 'refill'

export interface QuantityEvent {
  id: string
  containerId: typeof CONTAINER_ID
  type: QuantityEventType
  amountGrams: number
  previousWeightGrams: number
  newWeightGrams: number
  timestamp: string // ISO string
  fromReadingId: string
  toReadingId: string
}

export interface ConsumptionStats {
  todayConsumptionGrams: number
  last7DaysConsumptionGrams: number
  avgDailyConsumptionGrams: number | null
  hasEnoughDataForAvg: boolean
  totalRecordedConsumptionGrams: number
  totalRefillGrams: number
  eventsCount: number
}

export type TimeRangeFilter = '24h' | '7d' | '30d' | 'all'

export interface QuantityHistoryPoint {
  timestamp: string
  timeFormatted: string
  weightGrams: number
  rawWeightGrams?: number
  temperature?: number
  humidity?: number
}

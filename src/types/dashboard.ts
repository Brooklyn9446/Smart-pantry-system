export type InventoryStatus = 'good' | 'low' | 'critical'
export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface ClimateHistoryPoint {
  time: string
  temperature: number
  humidity: number
}

export interface ExpiringItem {
  id: string
  name: string
  category: string
  expiresOn: string
  daysRemaining: number
  quantity: string
  status: InventoryStatus
}

export interface PantryAlert {
  id: string
  title: string
  description: string
  timestamp: string
  severity: AlertSeverity
}

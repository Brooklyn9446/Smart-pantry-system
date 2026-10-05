export type AlertType = 'expiry' | 'system' | 'sensor'
export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertStatus = 'active' | 'read'

export interface PantryAlert {
  id: string
  type: AlertType
  itemId?: string
  itemName?: string
  containerId?: string
  title: string
  message: string
  severity: AlertSeverity
  status: AlertStatus
  createdAt: string
  updatedAt: string
}

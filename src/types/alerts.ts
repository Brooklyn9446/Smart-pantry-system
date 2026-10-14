export type AlertType = 'expiry' | 'system' | 'sensor' | 'low-stock'
export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertStatus = 'active' | 'read' | 'resolved'

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

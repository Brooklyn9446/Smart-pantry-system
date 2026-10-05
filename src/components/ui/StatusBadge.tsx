import type { AlertSeverity, InventoryStatus } from '../../types/dashboard'
import type { ExpiryStatus } from '../../utils/expiry'

export type Status = InventoryStatus | AlertSeverity | ExpiryStatus

const labels: Record<Status, string> = {
  good: 'On track',
  normal: 'Normal',
  low: 'Use soon',
  'expiring-soon': 'Expiring Soon',
  critical: 'Urgent',
  expired: 'Expired',
  info: 'All clear',
  warning: 'Attention',
  'no-expiry': 'No expiry date',
}

export function StatusBadge({ status }: { status: Status }) {
  const toneClass =
    status === 'expired' || status === 'critical'
      ? 'status-critical'
      : status === 'expiring-soon' || status === 'low' || status === 'warning'
      ? 'status-low'
      : status === 'normal' || status === 'good' || status === 'info'
      ? 'status-good'
      : 'status-info'

  return <span className={`status-badge ${toneClass}`}>{labels[status]}</span>
}

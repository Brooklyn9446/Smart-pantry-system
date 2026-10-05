import type { AlertSeverity, InventoryStatus } from '../../types/dashboard'

type Status = InventoryStatus | AlertSeverity

const labels: Record<Status, string> = {
  good: 'On track', low: 'Use soon', critical: 'Urgent', info: 'All clear', warning: 'Attention',
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>
}

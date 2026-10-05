import { useAlerts } from '../../context/useAlerts'
import { useInventory } from '../../context/useInventory'
import { getExpiryStatus } from '../../utils/expiry'
import { PanelState } from '../ui/PanelState'
import { StatusBadge } from '../ui/StatusBadge'

function formatAlertTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin} min ago`
    const diffHours = Math.round(diffMin / 60)
    if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
  } catch {
    return iso
  }
}

export function ExpiryList() {
  const { items, isLoading } = useInventory()

  if (isLoading) {
    return (
      <section className="list-card" aria-labelledby="expiry-title">
        <div className="card-heading">
          <div>
            <h2 id="expiry-title">Upcoming expiry</h2>
            <p>Loading real-time status…</p>
          </div>
        </div>
        <PanelState kind="loading" message="expiry tracking data" />
      </section>
    )
  }

  // Calculate and sort real items
  const itemsWithExpiry = items
    .map((item) => ({
      item,
      expiry: getExpiryStatus(item.expiryDate),
    }))
    .sort((a, b) => {
      // Prioritize: expired (0) -> expiring-soon (1) -> normal (2) -> no-expiry (3)
      const priorityMap = { expired: 0, 'expiring-soon': 1, normal: 2, 'no-expiry': 3 }
      const pDiff = priorityMap[a.expiry.status] - priorityMap[b.expiry.status]
      if (pDiff !== 0) return pDiff

      // If both have daysRemaining, sort soonest first
      if (a.expiry.daysRemaining !== null && b.expiry.daysRemaining !== null) {
        return a.expiry.daysRemaining - b.expiry.daysRemaining
      }
      return 0
    })

  const hasItems = itemsWithExpiry.length > 0

  return (
    <section className="list-card" aria-labelledby="expiry-title">
      <div className="card-heading">
        <div>
          <h2 id="expiry-title">Upcoming expiry</h2>
          <p>Real-time pantry freshness status</p>
        </div>
        <a className="text-button" href="#expiry-tracker">
          See all <span aria-hidden="true">→</span>
        </a>
      </div>

      {hasItems ? (
        <ul className="expiry-list">
          {itemsWithExpiry.map(({ item, expiry }) => (
            <li key={item.id}>
              <div className="food-avatar" aria-hidden="true">
                {item.name.charAt(0).toUpperCase()}
              </div>
              <div className="list-main">
                <strong>{item.name}</strong>
                <span>
                  {item.category} · {item.initialQuantity} {item.quantityUnit} ({item.containerId})
                </span>
              </div>
              <div className="expiry-meta">
                <StatusBadge status={expiry.status} />
                <span>
                  {expiry.formattedDate} · {expiry.label}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <PanelState
          kind="empty"
          message="No items assigned to your pantry yet. Add an item in Inventory to track its expiry."
        />
      )}
    </section>
  )
}

export function AlertList() {
  const { alerts, isLoading } = useAlerts()

  if (isLoading) {
    return (
      <section className="list-card" aria-labelledby="alerts-title">
        <div className="card-heading">
          <div>
            <h2 id="alerts-title">Recent alerts</h2>
            <p>Loading notifications…</p>
          </div>
        </div>
        <PanelState kind="loading" message="alerts" />
      </section>
    )
  }

  const recentAlerts = alerts.slice(0, 4)

  return (
    <section className="list-card" aria-labelledby="alerts-title">
      <div className="card-heading">
        <div>
          <h2 id="alerts-title">Recent alerts</h2>
          <p>Freshness & container activity</p>
        </div>
        <a className="text-button" href="#alerts">
          Manage <span aria-hidden="true">→</span>
        </a>
      </div>

      {recentAlerts.length ? (
        <ul className="alerts-list">
          {recentAlerts.map((alert) => (
            <li key={alert.id}>
              <span
                className={`alert-symbol ${alert.severity}`}
                aria-hidden="true"
              >
                {alert.severity === 'critical' ? '!' : alert.severity === 'warning' ? '↓' : '✓'}
              </span>
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.message}</p>
                <time>{formatAlertTimestamp(alert.createdAt)}</time>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <PanelState kind="empty" message="You have no active alerts. All items are in good standing." />
      )}
    </section>
  )
}

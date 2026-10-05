import { useState } from 'react'
import { useAlerts } from '../../context/useAlerts'
import { PanelState } from '../ui/PanelState'
import { StatusBadge } from '../ui/StatusBadge'

type Tab = 'all' | 'active' | 'read'

function formatAlertDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d)
  } catch {
    return iso
  }
}

export function AlertsPage() {
  const { alerts, unreadCount, isLoading, error, markAsRead } = useAlerts()
  const [tab, setTab] = useState<Tab>('all')

  const filteredAlerts = alerts.filter((alert) => {
    if (tab === 'all') return true
    return alert.status === tab
  })

  return (
    <main id="alerts" className="main-content inventory-page">
      <header className="inventory-header">
        <div>
          <p className="eyebrow">System & freshness notifications</p>
          <h1>Pantry Alerts</h1>
          <p className="subtitle">
            Automated alerts for expiring foods, system conditions, and pantry activity.
          </p>
        </div>
      </header>

      {error && (
        <p className="inventory-feedback error" role="alert">
          {error}
        </p>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={tab === 'all' ? 'primary-button' : 'secondary-button'}
          type="button"
          onClick={() => setTab('all')}
        >
          All alerts ({alerts.length})
        </button>
        <button
          className={tab === 'active' ? 'primary-button' : 'secondary-button'}
          type="button"
          onClick={() => setTab('active')}
        >
          Active / Unread ({unreadCount})
        </button>
        <button
          className={tab === 'read' ? 'primary-button' : 'secondary-button'}
          type="button"
          onClick={() => setTab('read')}
        >
          Read ({alerts.length - unreadCount})
        </button>
      </div>

      {isLoading ? (
        <section className="inventory-empty" style={{ borderRadius: '14px' }}>
          <PanelState kind="loading" message="alerts from Cloud Firestore" />
        </section>
      ) : filteredAlerts.length > 0 ? (
        <div style={{ display: 'grid', gap: '12px' }}>
          {filteredAlerts.map((alert) => (
            <article
              key={alert.id}
              className="metric-card"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '16px',
                padding: '20px',
                minHeight: 'auto',
                borderLeft:
                  alert.severity === 'critical'
                    ? '4px solid #c54545'
                    : alert.severity === 'warning'
                    ? '4px solid #a86411'
                    : '4px solid #278261',
                opacity: alert.status === 'read' ? 0.75 : 1,
              }}
            >
              <div
                className={`alert-symbol ${alert.severity}`}
                style={{ width: '36px', height: '36px', fontSize: '16px', flexShrink: 0 }}
                aria-hidden="true"
              >
                {alert.severity === 'critical' ? '!' : alert.severity === 'warning' ? '↓' : '✓'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '15px', margin: 0 }}>{alert.title}</strong>
                  <StatusBadge status={alert.severity} />
                  {alert.containerId && (
                    <span className="assignment-pill" style={{ marginLeft: 0 }}>
                      {alert.containerId}
                    </span>
                  )}
                  {alert.status === 'read' && (
                    <span style={{ fontSize: '11px', color: '#718078', fontWeight: 500 }}>
                      (Read)
                    </span>
                  )}
                </div>

                <p style={{ margin: '4px 0 8px', color: '#42554e', fontSize: '13px', lineHeight: 1.4 }}>
                  {alert.message}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#7a8981' }}>
                  <time>{formatAlertDate(alert.createdAt)}</time>
                  <span>·</span>
                  <span>Type: {alert.type}</span>
                </div>
              </div>

              {alert.status === 'active' && (
                <button
                  className="secondary-button"
                  type="button"
                  style={{ fontSize: '12px', padding: '0 10px', minHeight: '32px', flexShrink: 0 }}
                  onClick={() => void markAsRead(alert.id)}
                >
                  Mark as read
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="inventory-empty" style={{ borderRadius: '14px' }}>
          <span aria-hidden="true">◉</span>
          <h2>
            {tab === 'active'
              ? 'No active alerts'
              : tab === 'read'
              ? 'No read alerts'
              : 'No alerts recorded'}
          </h2>
          <p>
            {tab === 'active'
              ? 'All items are currently within safe freshness thresholds.'
              : 'Pantry alerts will appear automatically when items approach their expiry date or require attention.'}
          </p>
        </section>
      )}
    </main>
  )
}

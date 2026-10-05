import { expiringItems, recentAlerts } from '../../data/dashboardMockData'
import { StatusBadge } from '../ui/StatusBadge'
import { PanelState } from '../ui/PanelState'

export function ExpiryList() {
  return <section className="list-card" aria-labelledby="expiry-title"><div className="card-heading"><div><h2 id="expiry-title">Upcoming expiry</h2><p>Items to use first</p></div><button className="text-button" type="button">See all <span aria-hidden="true">→</span></button></div>
    {expiringItems.length ? <ul className="expiry-list">{expiringItems.map((item) => <li key={item.id}><div className="food-avatar" aria-hidden="true">{item.name.charAt(0)}</div><div className="list-main"><strong>{item.name}</strong><span>{item.category} · {item.quantity}</span></div><div className="expiry-meta"><StatusBadge status={item.status} /><span>{item.expiresOn} · {item.daysRemaining}d left</span></div></li>)}</ul> : <PanelState kind="empty" message="Nothing is expiring soon." />}
  </section>
}

export function AlertList() {
  return <section className="list-card" aria-labelledby="alerts-title"><div className="card-heading"><div><h2 id="alerts-title">Recent alerts</h2><p>Latest pantry activity</p></div><button className="text-button" type="button">Manage <span aria-hidden="true">→</span></button></div>
    {recentAlerts.length ? <ul className="alerts-list">{recentAlerts.map((alert) => <li key={alert.id}><span className={`alert-symbol ${alert.severity}`} aria-hidden="true">{alert.severity === 'critical' ? '!' : alert.severity === 'warning' ? '↓' : '✓'}</span><div><strong>{alert.title}</strong><p>{alert.description}</p><time>{alert.timestamp}</time></div></li>)}</ul> : <PanelState kind="empty" message="You have no recent alerts." />}
  </section>
}

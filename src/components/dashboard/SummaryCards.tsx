import { useInventory } from '../../context/useInventory'
import { getExpiryStatus } from '../../utils/expiry'

export function SummaryCards() {
  const { items } = useInventory()

  const expiringOrExpired = items.filter((item) => {
    const { status } = getExpiryStatus(item.expiryDate)
    return status === 'expiring-soon' || status === 'expired'
  })

  const expiredCount = items.filter((item) => getExpiryStatus(item.expiryDate).status === 'expired').length
  const expiringSoonCount = items.filter(
    (item) => getExpiryStatus(item.expiryDate).status === 'expiring-soon'
  ).length

  let expiryDetail = 'All items on track'
  if (expiredCount > 0 && expiringSoonCount > 0) {
    expiryDetail = `${expiredCount} expired · ${expiringSoonCount} soon`
  } else if (expiredCount > 0) {
    expiryDetail = `${expiredCount} item expired`
  } else if (expiringSoonCount > 0) {
    expiryDetail = `${expiringSoonCount} expiring within 7 days`
  }

  const metrics = [
    {
      label: 'Tracked items',
      value: String(items.length),
      detail: items.length
        ? `${items[0].name} in container-01`
        : 'container-01 empty',
      tone: 'teal' as const,
    },
    {
      label: 'Expiring soon / Expired',
      value: String(expiringOrExpired.length),
      detail: expiryDetail,
      tone: expiredCount > 0 ? ('rose' as const) : expiringSoonCount > 0 ? ('amber' as const) : ('teal' as const),
    },
    {
      label: 'Low stock',
      value: '—',
      detail: 'Hardware sensor pending (Phase 5)',
      tone: 'rose' as const,
    },
    {
      label: 'Pantry climate',
      value: '22.4°C',
      detail: '58% RH · DHT22 simulated',
      tone: 'sky' as const,
    },
  ]

  return (
    <section className="summary-grid" aria-label="Pantry summary">
      {metrics.map((metric) => (
        <article className="metric-card" key={metric.label}>
          <div className="metric-header">
            <span>{metric.label}</span>
            <span className={`metric-icon ${metric.tone}`} aria-hidden="true">
              {metric.tone === 'teal' ? '▦' : metric.tone === 'amber' ? '◷' : metric.tone === 'rose' ? '!' : '⌁'}
            </span>
          </div>
          <strong>{metric.value}</strong>
          <p className="trend">{metric.detail}</p>
        </article>
      ))}
    </section>
  )
}

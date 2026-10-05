import { useInventory } from '../../context/useInventory'

function isExpiringSoon(expiryDate?: string) {
  if (!expiryDate) return false
  const days = (new Date(`${expiryDate}T00:00:00`).getTime() - new Date('2026-10-04T00:00:00').getTime()) / 86_400_000
  return days >= 0 && days <= 7
}

export function SummaryCards() {
  const { items } = useInventory()
  const metrics = [
    { label: 'Tracked items', value: String(items.length), detail: items.length ? 'Assigned to container-01' : 'No item assigned', tone: 'teal' as const },
    { label: 'Expiring soon', value: String(items.filter((item) => isExpiringSoon(item.expiryDate)).length), detail: 'Within 7 days', tone: 'amber' as const },
    { label: 'Low stock', value: '—', detail: 'Sensor data unavailable', tone: 'rose' as const },
    { label: 'Pantry climate', value: '22.4°C', detail: '58% humidity · Ideal', tone: 'sky' as const },
  ]
  return <section className="summary-grid" aria-label="Pantry summary">
    {metrics.map((metric) => (
      <article className="metric-card" key={metric.label}>
        <div className="metric-header"><span>{metric.label}</span><span className={`metric-icon ${metric.tone}`} aria-hidden="true">{metric.tone === 'teal' ? '▦' : metric.tone === 'amber' ? '◷' : metric.tone === 'rose' ? '↓' : '⌁'}</span></div>
        <strong>{metric.value}</strong>
        <p className="trend">{metric.detail}</p>
      </article>
    ))}
  </section>
}

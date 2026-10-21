import { useInventory } from '../../context/useInventory'
import { useSensors } from '../../context/useSensors'
import { useShoppingList } from '../../context/useShoppingList'
import { getExpiryStatus } from '../../utils/expiry'
import { evaluateStockStatus } from '../../utils/lowStock'
import {
  formatHumidity,
  formatTemperature,
  formatWeightDisplay,
} from '../../utils/sensorCalculations'

export function SummaryCards() {
  const { items } = useInventory()
  const { currentState, netFoodWeightGrams, deviceStatus } = useSensors()
  const { toBuyCount } = useShoppingList()

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

  const hasSensor = currentState !== null
  const activeItem = items.find((i) => i.containerId === 'container-01')
  const stockEval = activeItem
    ? evaluateStockStatus(activeItem, hasSensor ? netFoodWeightGrams : null)
    : null

  const metrics = [
    {
      label: 'Tracked items',
      value: String(items.length),
      detail: items.length
        ? `${items.length} total · ${activeItem ? activeItem.name + ' in container-01' : '0 assigned'} · ${toBuyCount} to buy`
        : '0 items tracked',
      tone: stockEval?.isLowStock ? ('amber' as const) : ('teal' as const),
    },
    {
      label: 'Expiring soon / Expired',
      value: String(expiringOrExpired.length),
      detail: expiryDetail,
      tone: expiredCount > 0 ? ('rose' as const) : expiringSoonCount > 0 ? ('amber' as const) : ('teal' as const),
    },
    {
      label: 'Live stock weight',
      value: activeItem && hasSensor ? formatWeightDisplay(netFoodWeightGrams, 'kg') : '—',
      detail: activeItem
        ? hasSensor
          ? `${activeItem.name} · ${
              stockEval?.isLowStock ? 'Low stock alert' : `HX711 load cell (${deviceStatus})`
            }`
          : 'Waiting for sensor data'
        : hasSensor
        ? 'No item assigned to container'
        : 'Waiting for sensor data',
      tone: activeItem && stockEval?.isLowStock ? ('amber' as const) : ('teal' as const),
    },
    {
      label: 'Pantry climate',
      value: hasSensor ? formatTemperature(currentState.temperature) : '—',
      detail: hasSensor
        ? `${formatHumidity(currentState.humidity)} RH · DHT22 live`
        : 'Waiting for sensor data',
      tone: hasSensor ? ('sky' as const) : ('sky' as const),
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

import { useQuantityHistory } from '../../context/useQuantityHistory'
import { formatRelativeTime } from '../../utils/sensorCalculations'
import { PanelState } from '../ui/PanelState'

export function QuantityEventList() {
  const { events, isLoading } = useQuantityHistory()

  return (
    <section className="list-card" aria-labelledby="events-heading">
      <div className="card-heading">
        <div>
          <h2 id="events-heading">Consumption & Refill Events</h2>
          <p>Derived quantity transitions for container-01 (filtered for noise &gt; 50g)</p>
        </div>
        <span className="live-label">
          <i /> {events.length} Event{events.length === 1 ? '' : 's'}
        </span>
      </div>

      {isLoading ? (
        <PanelState kind="loading" message="quantity events" />
      ) : events.length === 0 ? (
        <PanelState
          kind="empty"
          message="No consumption or refill events detected yet. Meaningful weight transitions (>50g) will appear here automatically."
        />
      ) : (
        <ul className="alerts-list" style={{ listStyle: 'none', padding: 0, margin: '14px 0 0' }}>
          {events.map((event) => {
            const isConsumption = event.type === 'consumption'
            const timeAgo = formatRelativeTime(event.timestamp)
            const dateFormatted = new Date(event.timestamp).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })

            return (
              <li
                key={event.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 0',
                  borderTop: '1px solid #edf1ee',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '15px',
                    fontWeight: 800,
                    background: isConsumption ? '#fff1d8' : '#e1f2f8',
                    color: isConsumption ? '#a86411' : '#277ea0',
                  }}
                  aria-hidden="true"
                >
                  {isConsumption ? '↓' : '↑'}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '14px' }}>
                      {isConsumption ? 'Food Consumption' : 'Pantry Refill'}
                    </strong>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '999px',
                        fontWeight: 600,
                        background: isConsumption ? '#fff3dd' : '#e1f2f8',
                        color: isConsumption ? '#a75e0c' : '#277ea0',
                      }}
                    >
                      {isConsumption ? `-${event.amountGrams} g` : `+${event.amountGrams} g`}
                    </span>
                  </div>

                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#718078' }}>
                    Transition: {event.previousWeightGrams} g → {event.newWeightGrams} g in{' '}
                    <code>{event.containerId}</code>
                  </p>
                </div>

                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#718078' }}>{timeAgo}</span>
                  <small style={{ color: '#98a39d', fontSize: '10px' }}>{dateFormatted}</small>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

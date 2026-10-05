import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { climateHistory } from '../../data/dashboardMockData'
import { useInventory } from '../../context/useInventory'
import { PanelState } from '../ui/PanelState'

const tooltipStyle = {
  background: '#17231f',
  border: 'none',
  borderRadius: 10,
  color: '#fff',
  fontSize: 12,
}

export function QuantityChart() {
  const { items, isLoading } = useInventory()

  if (isLoading) {
    return (
      <section className="chart-card" aria-labelledby="quantity-title">
        <div className="card-heading">
          <div>
            <h2 id="quantity-title">Quantity history</h2>
            <p>Loading real-time data…</p>
          </div>
        </div>
        <PanelState kind="loading" message="inventory state" />
      </section>
    )
  }

  const activeItem = items[0]

  return (
    <section className="chart-card" aria-labelledby="quantity-title">
      <div className="card-heading">
        <div>
          <h2 id="quantity-title">Quantity history</h2>
          <p>
            {activeItem
              ? `${activeItem.name} · Load cell pending (Phase 5)`
              : 'Assign an item to begin'}
          </p>
        </div>
      </div>
      <PanelState
        kind="empty"
        message={
          activeItem
            ? `Initial quantity: ${activeItem.initialQuantity} ${activeItem.quantityUnit} (manual record from Firestore). Continuous weight history will stream when the ESP32 and HX711 are connected.`
            : 'No item is assigned to container-01 yet.'
        }
      />
    </section>
  )
}

export function ClimateChart() {
  if (!climateHistory.length) {
    return <PanelState kind="empty" message="No climate readings yet." />
  }

  return (
    <section className="chart-card" aria-labelledby="climate-title">
      <div className="card-heading">
        <div>
          <h2 id="climate-title">Pantry conditions</h2>
          <p>Simulated DHT22 readings · Phase 5 hardware pending</p>
        </div>
        <span className="live-label">
          <i /> Demo
        </span>
      </div>
      <div
        className="chart-wrap"
        role="img"
        aria-label="Line chart showing simulated pantry temperature and humidity readings"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={climateHistory} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#e8eee9" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6b7c73', fontSize: 12 }}
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6b7c73', fontSize: 12 }}
              domain={[20, 26]}
              unit="°"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6b7c73', fontSize: 12 }}
              domain={[45, 65]}
              unit="%"
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="temperature"
              name="Temperature (°C)"
              stroke="#e77c48"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="humidity"
              name="Humidity (%)"
              stroke="#3f93b1"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

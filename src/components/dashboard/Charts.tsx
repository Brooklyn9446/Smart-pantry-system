import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useInventory } from '../../context/useInventory'
import { useQuantityHistory } from '../../context/useQuantityHistory'
import { useSensors } from '../../context/useSensors'
import { formatWeightDisplay } from '../../utils/sensorCalculations'
import { PanelState } from '../ui/PanelState'
import { StatusBadge } from '../ui/StatusBadge'

const tooltipStyle = {
  background: '#17231f',
  border: 'none',
  borderRadius: 10,
  color: '#fff',
  fontSize: 12,
}

export function QuantityChart() {
  const { items, isLoading: isInventoryLoading } = useInventory()
  const {
    currentState,
    netFoodWeightGrams,
    deviceStatus,
    timeAgoFormatted,
  } = useSensors()
  const { historyPoints, stats, timeRange, setTimeRange, isLoading: isHistoryLoading } = useQuantityHistory()

  if (isInventoryLoading || isHistoryLoading) {
    return (
      <section className="chart-card" aria-labelledby="quantity-title">
        <div className="card-heading">
          <div>
            <h2 id="quantity-title">Quantity history & consumption</h2>
            <p>Loading real-time telemetry…</p>
          </div>
        </div>
        <PanelState kind="loading" message="sensor and quantity history" />
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
              ? `${activeItem.name} in container-01 · Current: ${
                  currentState ? formatWeightDisplay(netFoodWeightGrams, 'kg') : 'Waiting for sensor data'
                }`
              : 'Assign an item in Inventory to track stock'}
          </p>
        </div>

        {/* Range selectors */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {(['24h', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={timeRange === r ? 'primary-button' : 'secondary-button'}
              style={{
                minHeight: '26px',
                padding: '0 8px',
                fontSize: '11px',
                borderRadius: '6px',
              }}
              onClick={() => setTimeRange(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {currentState && activeItem ? (
        <div style={{ marginTop: '14px', display: 'grid', gap: '12px' }}>
          {/* Top metric row */}
          <div
            style={{
              padding: '12px 14px',
              background: '#f8faf9',
              borderRadius: '8px',
              border: '1px solid #e8eee9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', color: '#718078', fontWeight: 600, textTransform: 'uppercase' }}>
                Current Quantity
              </span>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#13745c', letterSpacing: '-0.5px' }}>
                {formatWeightDisplay(netFoodWeightGrams, 'kg')}
              </div>
              <span style={{ fontSize: '11px', color: '#718078' }}>
                Today’s consumption: <strong>{stats.todayConsumptionGrams} g</strong> · Last 7D:{' '}
                <strong>{stats.last7DaysConsumptionGrams} g</strong>
              </span>
            </div>
            <div style={{ textAlign: 'right', display: 'grid', gap: '4px' }}>
              <StatusBadge status={deviceStatus === 'online' ? 'good' : 'warning'} />
              <span style={{ fontSize: '10px', color: '#718078' }}>{timeAgoFormatted}</span>
            </div>
          </div>

          {/* Chart Section */}
          {historyPoints.length > 0 ? (
            <div
              className="chart-wrap"
              role="img"
              aria-label="Line chart showing physical container quantity history over time"
              style={{ height: '170px', marginTop: '6px' }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyPoints} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#e8eee9" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="timeFormatted"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#6b7c73', fontSize: 10 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#6b7c73', fontSize: 10 }}
                    domain={['dataMin - 50', 'dataMax + 50']}
                    unit="g"
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(val: number) => [`${val} g`, 'Weight']}
                  />
                  <Line
                    type="monotone"
                    dataKey="weightGrams"
                    name="Weight (g)"
                    stroke="#13745c"
                    strokeWidth={2.5}
                    dot={{ r: 2, fill: '#13745c' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <PanelState
              kind="empty"
              message="Gathering historical readings for the selected range."
            />
          )}
        </div>
      ) : activeItem ? (
        <PanelState
          kind="empty"
          message={`Initial recorded quantity: ${activeItem.initialQuantity} ${activeItem.quantityUnit}. Waiting for sensor telemetry stream from ESP32 on container-01.`}
        />
      ) : (
        <PanelState kind="empty" message="No item is currently assigned to container-01." />
      )}
    </section>
  )
}

export function ClimateChart() {
  const { currentState, readings, isLoading } = useSensors()

  // Transform readings into chronological chart points
  const chartData = useMemo(() => {
    if (readings.length > 0) {
      const sorted = [...readings]
        .filter((r) => r.temperature !== undefined && r.humidity !== undefined)
        .reverse()
        .slice(-12)

      return sorted.map((r) => {
        const timeStr = new Date(r.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
        return {
          time: timeStr,
          temperature: r.temperature,
          humidity: r.humidity,
        }
      })
    }

    if (currentState) {
      const timeStr = new Date(currentState.lastUpdated).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      return [
        {
          time: timeStr,
          temperature: currentState.temperature,
          humidity: currentState.humidity,
        },
      ]
    }

    return []
  }, [readings, currentState])

  if (isLoading) {
    return (
      <section className="chart-card" aria-labelledby="climate-title">
        <div className="card-heading">
          <div>
            <h2 id="climate-title">Pantry conditions</h2>
            <p>Loading DHT22 climate readings…</p>
          </div>
        </div>
        <PanelState kind="loading" message="climate telemetry" />
      </section>
    )
  }

  if (chartData.length === 0) {
    return (
      <section className="chart-card" aria-labelledby="climate-title">
        <div className="card-heading">
          <div>
            <h2 id="climate-title">Pantry conditions</h2>
            <p>DHT22 temperature & humidity telemetry</p>
          </div>
        </div>
        <PanelState
          kind="empty"
          message="Waiting for DHT22 sensor data. Continuous climate telemetry will graph here once the ESP32 is powered on or simulated."
        />
      </section>
    )
  }

  return (
    <section className="chart-card" aria-labelledby="climate-title">
      <div className="card-heading">
        <div>
          <h2 id="climate-title">Pantry conditions</h2>
          <p>Real-time DHT22 temperature & humidity telemetry</p>
        </div>
        <span className="live-label">
          <i /> Live Stream ({chartData.length} pts)
        </span>
      </div>
      <div
        className="chart-wrap"
        role="img"
        aria-label="Line chart showing real pantry temperature and humidity readings"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
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
              domain={['dataMin - 2', 'dataMax + 2']}
              unit="°"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6b7c73', fontSize: 12 }}
              domain={[0, 100]}
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
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="humidity"
              name="Humidity (%)"
              stroke="#3f93b1"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

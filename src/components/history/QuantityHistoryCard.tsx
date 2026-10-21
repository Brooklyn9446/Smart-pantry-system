import {
  CartesianGrid,
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
import type { TimeRangeFilter } from '../../types/quantityHistory'
import { formatWeightDisplay } from '../../utils/sensorCalculations'
import { PanelState } from '../ui/PanelState'

const tooltipStyle = {
  background: '#17231f',
  border: 'none',
  borderRadius: 10,
  color: '#fff',
  fontSize: 12,
}

export function QuantityHistoryCard() {
  const { items } = useInventory()
  const { currentState, netFoodWeightGrams, timeAgoFormatted } = useSensors()
  const { historyPoints, stats, timeRange, setTimeRange, isLoading } = useQuantityHistory()

  const activeItem = items.find((i) => i.containerId === 'container-01')
  const ranges: { label: string; value: TimeRangeFilter }[] = [
    { label: '24H', value: '24h' },
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' },
    { label: 'All', value: 'all' },
  ]

  return (
    <section className="chart-card" aria-labelledby="quantity-history-title">
      <div className="card-heading">
        <div>
          <h2 id="quantity-history-title">Quantity History & Trend</h2>
          <p>
            {activeItem
              ? `${activeItem.name} in container-01 · Current: ${
                  currentState ? formatWeightDisplay(netFoodWeightGrams, 'kg') : 'Waiting for data'
                }`
              : 'Container container-01 weight stream'}
          </p>
        </div>

        {/* Time Range Selector Buttons */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {ranges.map((r) => (
            <button
              key={r.value}
              type="button"
              className={timeRange === r.value ? 'primary-button' : 'secondary-button'}
              style={{
                minHeight: '28px',
                padding: '0 9px',
                fontSize: '11px',
                borderRadius: '6px',
              }}
              onClick={() => setTimeRange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Consumption Statistics Summary Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '10px',
          marginTop: '16px',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            padding: '10px 12px',
            background: '#f8faf9',
            borderRadius: '8px',
            border: '1px solid #e8eee9',
          }}
        >
          <span style={{ fontSize: '11px', color: '#718078', fontWeight: 600, display: 'block' }}>
            Today’s Consumption
          </span>
          <strong style={{ fontSize: '16px', color: '#13745c', marginTop: '4px', display: 'block' }}>
            {stats.todayConsumptionGrams > 0
              ? `${stats.todayConsumptionGrams.toLocaleString()} g`
              : '0 g'}
          </strong>
        </div>

        <div
          style={{
            padding: '10px 12px',
            background: '#f8faf9',
            borderRadius: '8px',
            border: '1px solid #e8eee9',
          }}
        >
          <span style={{ fontSize: '11px', color: '#718078', fontWeight: 600, display: 'block' }}>
            Last 7 Days
          </span>
          <strong style={{ fontSize: '16px', color: '#13745c', marginTop: '4px', display: 'block' }}>
            {stats.last7DaysConsumptionGrams > 0
              ? `${stats.last7DaysConsumptionGrams.toLocaleString()} g`
              : '0 g'}
          </strong>
        </div>

        <div
          style={{
            padding: '10px 12px',
            background: '#f8faf9',
            borderRadius: '8px',
            border: '1px solid #e8eee9',
          }}
        >
          <span style={{ fontSize: '11px', color: '#718078', fontWeight: 600, display: 'block' }}>
            Daily Average
          </span>
          <strong
            style={{
              fontSize: stats.hasEnoughDataForAvg ? '16px' : '12px',
              color: stats.hasEnoughDataForAvg ? '#13745c' : '#718078',
              marginTop: '4px',
              display: 'block',
            }}
          >
            {stats.hasEnoughDataForAvg && stats.avgDailyConsumptionGrams !== null
              ? `${stats.avgDailyConsumptionGrams} g/day`
              : 'Not enough data yet'}
          </strong>
        </div>

        <div
          style={{
            padding: '10px 12px',
            background: '#f8faf9',
            borderRadius: '8px',
            border: '1px solid #e8eee9',
          }}
        >
          <span style={{ fontSize: '11px', color: '#718078', fontWeight: 600, display: 'block' }}>
            Total Refills
          </span>
          <strong style={{ fontSize: '16px', color: '#277ea0', marginTop: '4px', display: 'block' }}>
            {stats.totalRefillGrams > 0
              ? `${stats.totalRefillGrams.toLocaleString()} g`
              : '0 g'}
          </strong>
        </div>
      </div>

      {/* Chart Section */}
      {isLoading ? (
        <PanelState kind="loading" message="quantity telemetry history" />
      ) : historyPoints.length === 0 ? (
        <PanelState
          kind="empty"
          message={
            currentState
              ? 'Collecting history points... Telemetry is streaming live.'
              : 'Waiting for sensor readings to generate quantity trend chart.'
          }
        />
      ) : (
        <div
          className="chart-wrap"
          role="img"
          aria-label="Line chart showing physical container quantity history over time"
          style={{ height: '240px' }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyPoints} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="#e8eee9" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="timeFormatted"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#6b7c73', fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#6b7c73', fontSize: 11 }}
                domain={['dataMin - 100', 'dataMax + 100']}
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
                dot={{ r: 3, fill: '#13745c' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <span style={{ fontSize: '11px', color: '#718078' }}>
          Noise suppression threshold: 50 g · Refill-aware baseline tracking
        </span>
        <span style={{ fontSize: '11px', color: '#718078' }}>
          {currentState ? `Last update: ${timeAgoFormatted}` : ''}
        </span>
      </div>
    </section>
  )
}

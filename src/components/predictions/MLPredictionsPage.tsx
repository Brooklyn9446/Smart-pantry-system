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
import { usePrediction } from '../../context/usePrediction'
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

export function MLPredictionsPage() {
  const { items } = useInventory()
  const { currentState, netFoodWeightGrams } = useSensors()
  const { prediction, isLoading, error, refresh } = usePrediction()

  const activeItem = items.find((i) => i.containerId === 'container-01')

  // Prepare combined historical + projected chart data
  const chartData = useMemo(() => {
    if (!prediction) return []

    const points: {
      time: string
      actualWeight?: number
      projectedWeight?: number
    }[] = []

    // Historical projection points
    if (prediction.projections && prediction.projections.length > 0) {
      // First point is current
      prediction.projections.forEach((p, idx) => {
        const d = new Date(p.timestamp)
        const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`

        if (idx === 0) {
          points.push({
            time: timeStr,
            actualWeight: p.weightGrams,
            projectedWeight: p.weightGrams,
          })
        } else {
          points.push({
            time: timeStr,
            projectedWeight: p.weightGrams,
          })
        }
      })
    }

    return points
  }, [prediction])

  const formattedDepletionDate = useMemo(() => {
    if (!prediction?.estimatedDepletionDate) return '—'
    try {
      const d = new Date(prediction.estimatedDepletionDate)
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(d)
    } catch {
      return '—'
    }
  }, [prediction?.estimatedDepletionDate])

  const confidenceBadge = useMemo(() => {
    if (!prediction) return null
    switch (prediction.confidence) {
      case 'good':
        return <StatusBadge status="good" />
      case 'moderate':
        return <StatusBadge status="warning" />
      case 'low':
        return <StatusBadge status="info" />
      default:
        return <span className="status-badge status-critical">Insufficient Data</span>
    }
  }, [prediction])

  return (
    <main id="ml-predictions" className="main-content">
      <header className="topbar">
        <div>
          <p className="eyebrow">Machine Learning Shelf-Life Intelligence</p>
          <h1>ML Depletion Prediction</h1>
          <p className="subtitle">
            Refill-aware Linear Regression estimating consumption rate and remaining days for{' '}
            <code>container-01</code>.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>⟳</span>
            <span>{isLoading ? 'Computing…' : 'Recompute Model'}</span>
          </button>
        </div>
      </header>

      {error && (
        <p className="inventory-feedback error" role="alert">
          {error}
        </p>
      )}

      {/* Item Monitored Identity Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '14px 18px',
          background: '#fff',
          border: '1px solid #e6ece8',
          borderRadius: '12px',
          marginBottom: '20px',
        }}
      >
        <div className="item-monogram" style={{ width: '42px', height: '42px', fontSize: '16px' }}>
          {activeItem ? activeItem.name.charAt(0).toUpperCase() : '?'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong style={{ fontSize: '16px' }}>
              {activeItem ? activeItem.name : 'No Item Assigned'}
            </strong>
            <span className="assignment-pill">container-01</span>
          </div>
          <span style={{ fontSize: '12px', color: '#718078' }}>
            {activeItem
              ? `${activeItem.category} · Initial record: ${activeItem.initialQuantity} ${activeItem.quantityUnit}`
              : 'Assign an item in Inventory to predict depletion'}
          </span>
        </div>
        {prediction?.source && (
          <span className="live-label" style={{ fontSize: '11px' }}>
            <i /> {prediction.source === 'fastapi' ? 'FastAPI Python ML' : 'Embedded ML Engine'}
          </span>
        )}
      </div>

      {/* 4 Summary Cards */}
      <section className="summary-grid" aria-label="Depletion prediction metrics">
        {/* Card 1: Current Quantity */}
        <article className="metric-card">
          <div className="metric-header">
            <span>Current Quantity</span>
            <span className="metric-icon teal" aria-hidden="true">
              ▦
            </span>
          </div>
          <strong>
            {currentState ? formatWeightDisplay(netFoodWeightGrams, 'kg') : '—'}
          </strong>
          <p className="trend">
            {currentState ? `${Math.round(netFoodWeightGrams)} g on load cell` : 'Waiting for sensor'}
          </p>
        </article>

        {/* Card 2: Estimated Daily Consumption */}
        <article className="metric-card">
          <div className="metric-header">
            <span>Estimated Consumption</span>
            <span className="metric-icon sky" aria-hidden="true">
              ✦
            </span>
          </div>
          <strong>
            {prediction?.dailyConsumptionRateGrams !== null &&
            prediction?.dailyConsumptionRateGrams !== undefined &&
            prediction.dailyConsumptionRateGrams > 0
              ? `${prediction.dailyConsumptionRateGrams} g/day`
              : '—'}
          </strong>
          <p className="trend">Linear consumption slope</p>
        </article>

        {/* Card 3: Estimated Remaining Days */}
        <article className="metric-card">
          <div className="metric-header">
            <span>Expected Remaining Days</span>
            <span
              className={`metric-icon ${
                prediction?.estimatedRemainingDays !== null &&
                prediction?.estimatedRemainingDays !== undefined &&
                prediction.estimatedRemainingDays < 3
                  ? 'rose'
                  : 'amber'
              }`}
              aria-hidden="true"
            >
              ◷
            </span>
          </div>
          <strong>
            {prediction?.estimatedRemainingDays !== null &&
            prediction?.estimatedRemainingDays !== undefined
              ? `~${Math.round(prediction.estimatedRemainingDays)} days`
              : '—'}
          </strong>
          <p className="trend">
            {prediction?.estimatedRemainingDays !== null &&
            prediction?.estimatedRemainingDays !== undefined
              ? `${prediction.estimatedRemainingDays.toFixed(1)} days remaining`
              : 'Insufficient data'}
          </p>
        </article>

        {/* Card 4: Estimated Depletion Date */}
        <article className="metric-card">
          <div className="metric-header">
            <span>Predicted Depletion Date</span>
            <span className="metric-icon amber" aria-hidden="true">
              ♧
            </span>
          </div>
          <strong style={{ fontSize: '20px', margin: '18px 0 6px' }}>
            {formattedDepletionDate}
          </strong>
          <p className="trend">Projected empty date</p>
        </article>
      </section>

      {/* Insufficient Data State Banner */}
      {prediction?.status === 'insufficient_data' && (
        <section
          style={{
            background: '#fff9ed',
            border: '1px solid #fce3b8',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '22px',
          }}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '24px', color: '#b96e2e' }}>✦</span>
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: '17px', color: '#874c10' }}>
                Not enough consumption data yet
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#664014', lineHeight: 1.5 }}>
                {prediction.dataQualityMessage}
              </p>
              <div style={{ marginTop: '12px', fontSize: '12px', color: '#874c10' }}>
                <strong>Requirements for prediction:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                  <li>Minimum 3 distinct sensor weight observations</li>
                  <li>Sufficient elapsed time window to observe real pantry usage</li>
                  <li>Refill operations are automatically detected and segmented</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Depletion Projection Section */}
      <section className="chart-grid" style={{ marginBottom: '22px' }}>
        {/* Left: Depletion Trajectory Chart */}
        <div className="chart-card">
          <div className="card-heading">
            <div>
              <h2>Projected Depletion Trajectory</h2>
              <p>Linear regression extrapolation towards 0 grams</p>
            </div>
            {confidenceBadge}
          </div>

          {isLoading ? (
            <PanelState kind="loading" message="ML prediction model" />
          ) : prediction?.status === 'empty_container' ? (
            <PanelState kind="empty" message="The container is already empty (0 g)." />
          ) : chartData.length === 0 || prediction?.status === 'insufficient_data' ? (
            <PanelState
              kind="empty"
              message="Keep monitoring the item to generate a reliable depletion prediction."
            />
          ) : (
            <div
              className="chart-wrap"
              role="img"
              aria-label="Line chart showing projected pantry item depletion path over time"
              style={{ height: '260px' }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 12, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke="#e8eee9" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#6b7c73', fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#6b7c73', fontSize: 11 }}
                    domain={[0, 'dataMax + 100']}
                    unit="g"
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(val: number) => [`${val} g`, 'Weight']}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="actualWeight"
                    name="Current Weight (g)"
                    stroke="#13745c"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#13745c' }}
                  />
                  <Line
                    type="linear"
                    dataKey="projectedWeight"
                    name="Projected Trajectory (g)"
                    stroke="#e77c48"
                    strokeWidth={2.5}
                    strokeDasharray="5 5"
                    dot={{ r: 3, fill: '#e77c48' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#718078' }}>
            Note: Projections assume current consumption rate continues linearly. Refills reset the projection baseline.
          </div>
        </div>

        {/* Right: Model Diagnostics & Evaluation Metrics */}
        <div className="chart-card">
          <div className="card-heading">
            <div>
              <h2>Model Evaluation & Diagnostics</h2>
              <p>Statistical validation metrics for current regression fit</p>
            </div>
          </div>

          <dl className="details-grid" style={{ marginTop: '14px' }}>
            <div>
              <dt>Regression Model</dt>
              <dd>
                Linear Regression
                <small>Ordinary Least Squares through origin</small>
              </dd>
            </div>
            <div>
              <dt>Refill Segmentation</dt>
              <dd>
                Active
                <small>Refills $\ge 50$g reset baseline</small>
              </dd>
            </div>
            <div>
              <dt>Goodness of Fit ($R^2$ Score)</dt>
              <dd>
                {prediction?.r2Score !== null && prediction?.r2Score !== undefined
                  ? `${prediction.r2Score}`
                  : '—'}
                <small>Coefficient of determination</small>
              </dd>
            </div>
            <div>
              <dt>Mean Absolute Error (MAE)</dt>
              <dd>
                {prediction?.maeGrams !== null && prediction?.maeGrams !== undefined
                  ? `${prediction.maeGrams} g`
                  : '—'}
                <small>Average deviation from trend</small>
              </dd>
            </div>
          </dl>

          <div className="assignment-note" style={{ marginTop: '14px' }}>
            <span>✦</span>
            <div>
              <strong>Data Quality Assessment</strong>
              <p>{prediction?.dataQualityMessage || 'Awaiting telemetry data.'}</p>
              <small>
                Confidence rating:{' '}
                <strong style={{ textTransform: 'capitalize' }}>
                  {prediction?.confidence || 'Insufficient'}
                </strong>
              </small>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

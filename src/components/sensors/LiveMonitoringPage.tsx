import { useState } from 'react'
import { useInventory } from '../../context/useInventory'
import { useSensors } from '../../context/useSensors'
import {
  formatHumidity,
  formatTemperature,
  formatWeightDisplay,
} from '../../utils/sensorCalculations'
import { QuantityEventList } from '../history/QuantityEventList'
import { QuantityHistoryCard } from '../history/QuantityHistoryCard'
import { PanelState } from '../ui/PanelState'
import { StatusBadge } from '../ui/StatusBadge'

export function LiveMonitoringPage() {
  const { items } = useInventory()
  const {
    currentState,
    readings,
    isLoading,
    error,
    deviceStatus,
    timeAgoFormatted,
    tareWeightGrams,
    netFoodWeightGrams,
    setTareWeightGrams,
  } = useSensors()

  const [tareInput, setTareInput] = useState<string>(String(tareWeightGrams))
  const [tareSavedMessage, setTareSavedMessage] = useState<string | null>(null)

  const activeItem = items[0]

  const handleSaveTare = (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(tareInput)
    if (!Number.isNaN(val) && val >= 0) {
      setTareWeightGrams(val)
      setTareSavedMessage(`Container tare set to ${val} g`)
      setTimeout(() => setTareSavedMessage(null), 3000)
    }
  }

  const handleTareCurrent = () => {
    if (currentState && currentState.currentWeight > 0) {
      setTareInput(String(currentState.currentWeight))
      setTareWeightGrams(currentState.currentWeight)
      setTareSavedMessage(`Tared container to current weight: ${currentState.currentWeight} g`)
      setTimeout(() => setTareSavedMessage(null), 3000)
    }
  }

  const isTempHigh = currentState && currentState.temperature > 25
  const isTempLow = currentState && currentState.temperature < 15
  const isHumidityHigh = currentState && currentState.humidity > 65
  const isHumidityLow = currentState && currentState.humidity < 35

  const statusColorClass =
    deviceStatus === 'online'
      ? 'status-good'
      : deviceStatus === 'stale'
      ? 'status-low'
      : deviceStatus === 'offline'
      ? 'status-critical'
      : 'status-info'

  const statusLabel =
    deviceStatus === 'online'
      ? 'Online'
      : deviceStatus === 'stale'
      ? 'Stale'
      : deviceStatus === 'offline'
      ? 'Offline'
      : 'Waiting for sensor data'

  return (
    <main id="live-monitoring" className="main-content">
      <header className="topbar">
        <div>
          <p className="eyebrow">Physical Container Telemetry</p>
          <h1>Live Sensor Monitoring</h1>
          <p className="subtitle">
            Real-time weight, climate telemetry, and quantity tracking for <code>container-01</code>.
          </p>
        </div>
        <div className="topbar-actions">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              background: '#fff',
              border: '1px solid #dfe7e1',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background:
                  deviceStatus === 'online'
                    ? '#36a574'
                    : deviceStatus === 'stale'
                    ? '#d9822b'
                    : deviceStatus === 'offline'
                    ? '#c84c43'
                    : '#94a3b8',
                boxShadow:
                  deviceStatus === 'online'
                    ? '0 0 0 3px rgba(54, 165, 116, 0.2)'
                    : 'none',
              }}
            />
            <span>Device: device-01</span>
            <span className={`status-badge ${statusColorClass}`} style={{ fontSize: '11px' }}>
              {statusLabel}
            </span>
          </div>
        </div>
      </header>

      {error && (
        <p className="inventory-feedback error" role="alert">
          {error}
        </p>
      )}

      {/* Metrics Summary Grid */}
      <section className="summary-grid" aria-label="Live sensor metrics">
        {/* Metric 1: Food Quantity */}
        <article className="metric-card">
          <div className="metric-header">
            <span>Authoritative food quantity</span>
            <span className="metric-icon teal" aria-hidden="true">
              ▦
            </span>
          </div>
          <strong>
            {currentState ? formatWeightDisplay(netFoodWeightGrams, 'kg') : '—'}
          </strong>
          <p className="trend">
            {currentState
              ? `Gross: ${currentState.currentWeight} g · Tare: ${tareWeightGrams} g`
              : 'Waiting for sensor data'}
          </p>
        </article>

        {/* Metric 2: Ambient Temperature */}
        <article className="metric-card">
          <div className="metric-header">
            <span>Ambient temperature</span>
            <span
              className={`metric-icon ${
                isTempHigh || isTempLow ? 'amber' : 'sky'
              }`}
              aria-hidden="true"
            >
              °C
            </span>
          </div>
          <strong>
            {currentState ? formatTemperature(currentState.temperature) : '—'}
          </strong>
          <p className={`trend ${isTempHigh || isTempLow ? 'caution' : ''}`}>
            {currentState
              ? isTempHigh
                ? 'Above pantry target (>25°C)'
                : isTempLow
                ? 'Below pantry target (<15°C)'
                : 'Optimal pantry range (15–25°C)'
              : 'Waiting for sensor data'}
          </p>
        </article>

        {/* Metric 3: Relative Humidity */}
        <article className="metric-card">
          <div className="metric-header">
            <span>Relative humidity</span>
            <span
              className={`metric-icon ${
                isHumidityHigh || isHumidityLow ? 'amber' : 'sky'
              }`}
              aria-hidden="true"
            >
              %
            </span>
          </div>
          <strong>
            {currentState ? formatHumidity(currentState.humidity) : '—'}
          </strong>
          <p
            className={`trend ${
              isHumidityHigh || isHumidityLow ? 'caution' : ''
            }`}
          >
            {currentState
              ? isHumidityHigh
                ? 'High humidity (>65% RH)'
                : isHumidityLow
                ? 'Dry humidity (<35% RH)'
                : 'Ideal freshness range (40–60%)'
              : 'Waiting for sensor data'}
          </p>
        </article>

        {/* Metric 4: Hardware Status */}
        <article className="metric-card">
          <div className="metric-header">
            <span>Telemetry freshness</span>
            <span
              className={`metric-icon ${
                deviceStatus === 'online'
                  ? 'teal'
                  : deviceStatus === 'stale'
                  ? 'amber'
                  : 'rose'
              }`}
              aria-hidden="true"
            >
              ⌁
            </span>
          </div>
          <strong style={{ fontSize: '20px', margin: '18px 0 6px' }}>
            {timeAgoFormatted}
          </strong>
          <p className="trend">
            {currentState
              ? `Container: ${currentState.containerId} · ${statusLabel}`
              : 'No sensor stream detected'}
          </p>
        </article>
      </section>

      {/* Phase 6: Quantity History Chart and Consumption/Refill Events Section */}
      <section className="chart-grid" style={{ marginBottom: '22px' }}>
        <QuantityHistoryCard />
        <QuantityEventList />
      </section>

      {/* Main Content Details Grid */}
      <section className="chart-grid" style={{ marginBottom: '22px' }}>
        {/* Card A: Active Container Assignment & Tare */}
        <div className="chart-card">
          <div className="card-heading">
            <div>
              <h2>Container & Tare Offset Configuration</h2>
              <p>Accounting for empty container weight in food quantity measurement</p>
            </div>
            <span className="assignment-pill">container-01</span>
          </div>

          <div style={{ marginTop: '16px', display: 'grid', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                background: '#f8faf9',
                borderRadius: '8px',
                border: '1px solid #e8eee9',
              }}
            >
              <div className="item-monogram" style={{ width: '38px', height: '38px', fontSize: '15px' }}>
                {activeItem ? activeItem.name.charAt(0).toUpperCase() : '?'}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '14px', display: 'block' }}>
                  {activeItem ? activeItem.name : 'No item assigned to container-01'}
                </strong>
                <span style={{ fontSize: '12px', color: '#718078' }}>
                  {activeItem
                    ? `${activeItem.category} · Initial record: ${activeItem.initialQuantity} ${activeItem.quantityUnit}`
                    : 'Assign an item in Inventory to track stock'}
                </span>
              </div>
              {activeItem && (
                <span className="live-label" style={{ fontSize: '11px' }}>
                  <i /> Live Monitored
                </span>
              )}
            </div>

            <form onSubmit={handleSaveTare} style={{ display: 'grid', gap: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#36554a' }}>
                Empty Container Tare Weight (grams)
                <span style={{ display: 'block', fontSize: '11px', color: '#7a8981', fontWeight: 400 }}>
                  Weight subtracted from load cell to compute net food quantity
                </span>
              </label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="0.1"
                  value={tareInput}
                  onChange={(e) => setTareInput(e.target.value)}
                  style={{
                    flex: 1,
                    minHeight: '38px',
                    border: '1px solid #d5e0d9',
                    borderRadius: '8px',
                    padding: '0 12px',
                    fontSize: '14px',
                  }}
                  placeholder="e.g. 350"
                />
                <button className="secondary-button" type="submit">
                  Save Tare
                </button>
                {currentState && currentState.currentWeight > 0 && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleTareCurrent}
                    title="Tare using current gross weight"
                  >
                    Zero / Tare Now
                  </button>
                )}
              </div>
              {tareSavedMessage && (
                <p className="inventory-feedback success" style={{ margin: '4px 0 0', fontSize: '12px' }}>
                  {tareSavedMessage}
                </p>
              )}
            </form>

            <div className="assignment-note" style={{ marginTop: '6px' }}>
              <span>ℹ</span>
              <div>
                <strong>Authoritative Weight Pipeline</strong>
                <p>
                  <code>Net Food Weight = Math.max(0, Measured Load Cell - Container Tare)</code>
                </p>
                <small>
                  Raw sensor fluctuations below zero are clamped to prevent negative values.
                </small>
              </div>
            </div>
          </div>
        </div>

        {/* Card B: Sensor Hardware Status & Diagnostics */}
        <div className="chart-card">
          <div className="card-heading">
            <div>
              <h2>Hardware Specifications & Pinout</h2>
              <p>Monitored physical devices and sensor integration</p>
            </div>
          </div>

          <dl className="details-grid" style={{ marginTop: '12px' }}>
            <div>
              <dt>Microcontroller</dt>
              <dd>
                ESP32 (NodeMCU / DevKit)
                <small>Firmware v1.0.0 · Wi-Fi Ingestion</small>
              </dd>
            </div>
            <div>
              <dt>Weight Sensor</dt>
              <dd>
                Load Cell + HX711 Amplifier
                <small>DT: GPIO 4 · SCK: GPIO 5 (3.3V)</small>
              </dd>
            </div>
            <div>
              <dt>Climate Sensor</dt>
              <dd>
                DHT22 (Temperature & Humidity)
                <small>DATA: GPIO 15 (3.3V with pull-up)</small>
              </dd>
            </div>
            <div>
              <dt>Ingestion Protocol</dt>
              <dd>
                HTTPS POST /api/sensors/reading
                <small>Token Auth · Sampling: 15–30s</small>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Historical Telemetry Log */}
      <section className="list-card" style={{ padding: '22px' }}>
        <div className="card-heading" style={{ marginBottom: '16px' }}>
          <div>
            <h2>Recent Sensor Telemetry Readings</h2>
            <p>Raw incoming readings from ESP32 trusted ingestion pipeline</p>
          </div>
          <span className="live-label">
            <i /> Stream: {readings.length} reading{readings.length === 1 ? '' : 's'}
          </span>
        </div>

        {isLoading ? (
          <PanelState kind="loading" message="sensor telemetry stream" />
        ) : readings.length === 0 ? (
          <PanelState
            kind="empty"
            message={
              currentState
                ? 'No previous historical readings recorded. Current state is active.'
                : 'Waiting for sensor data. Power on the ESP32 or run the sensor simulator (npm run simulate:sensor).'
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #edf1ee', color: '#718078' }}>
                  <th style={{ padding: '10px 12px' }}>Timestamp</th>
                  <th style={{ padding: '10px 12px' }}>Measured Weight</th>
                  <th style={{ padding: '10px 12px' }}>Net Food Weight</th>
                  <th style={{ padding: '10px 12px' }}>Temperature</th>
                  <th style={{ padding: '10px 12px' }}>Humidity</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((reading) => {
                  const netWeight = Math.max(0, reading.measuredWeight - tareWeightGrams)
                  const dateFormatted = new Date(reading.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                  return (
                    <tr key={reading.id} style={{ borderBottom: '1px solid #edf1ee' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '12px' }}>
                        {dateFormatted}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        {reading.measuredWeight} g
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#13745c' }}>
                        {formatWeightDisplay(netWeight, 'kg')}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {reading.temperature !== undefined ? `${reading.temperature.toFixed(1)}°C` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {reading.humidity !== undefined ? `${Math.round(reading.humidity)}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <StatusBadge
                          status={reading.sensorStatus === 'simulated' ? 'info' : 'good'}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

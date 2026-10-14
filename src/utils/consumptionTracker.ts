import { CONTAINER_ID } from '../types/inventory'
import type { QuantityEvent, ConsumptionStats, QuantityHistoryPoint, TimeRangeFilter } from '../types/quantityHistory'
import type { SensorReading } from '../types/sensors'

/**
 * Minimum change threshold (in grams) to distinguish real consumption/refill from load-cell noise.
 * Default: 50 grams.
 */
export const DEFAULT_SIGNIFICANT_CHANGE_GRAMS = 50

/**
 * Minimum data time span (in hours) required before calculating average daily consumption.
 */
export const MIN_SPAN_HOURS_FOR_AVG = 24

/**
 * Detects consumption and refill events from a stream of sensor readings.
 * 
 * Rules:
 * 1. Filters invalid/corrupted readings (null, NaN, negative weight).
 * 2. Sorts readings chronologically by timestamp (handles out-of-order data).
 * 3. Identifies transitions exceeding significant change threshold.
 * 4. Generates deterministic, idempotent event IDs based on reading pair IDs.
 * 5. Refill-aware: resets baseline on refill without treating refills as negative consumption.
 */
export function detectQuantityEvents(
  readings: SensorReading[],
  thresholdGrams: number = DEFAULT_SIGNIFICANT_CHANGE_GRAMS
): QuantityEvent[] {
  if (!readings || readings.length < 2) {
    return []
  }

  // 1. Sanitize & filter valid readings
  const validReadings = readings.filter((r) => {
    return (
      r &&
      typeof r.measuredWeight === 'number' &&
      !Number.isNaN(r.measuredWeight) &&
      Number.isFinite(r.measuredWeight) &&
      r.measuredWeight >= 0 &&
      r.timestamp &&
      !Number.isNaN(new Date(r.timestamp).getTime())
    )
  })

  if (validReadings.length < 2) {
    return []
  }

  // 2. Sort chronologically (oldest to newest)
  const sorted = [...validReadings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const events: QuantityEvent[] = []
  let baselineWeight = sorted[0].measuredWeight
  let baselineReadingId = sorted[0].id || `reading_0`

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const delta = current.measuredWeight - baselineWeight

    // Check if delta exceeds threshold
    if (Math.abs(delta) >= thresholdGrams) {
      const currentReadingId = current.id || `reading_${i}`
      const isConsumption = delta < 0
      const amountGrams = Math.round(Math.abs(delta) * 10) / 10

      const event: QuantityEvent = {
        id: `qevent_${baselineReadingId}_${currentReadingId}`,
        containerId: CONTAINER_ID,
        type: isConsumption ? 'consumption' : 'refill',
        amountGrams,
        previousWeightGrams: Math.round(baselineWeight * 10) / 10,
        newWeightGrams: Math.round(current.measuredWeight * 10) / 10,
        timestamp: current.timestamp,
        fromReadingId: baselineReadingId,
        toReadingId: currentReadingId,
      }

      events.push(event)

      // Update baseline to new stable level
      baselineWeight = current.measuredWeight
      baselineReadingId = currentReadingId
    }
  }

  return events
}

/**
 * Computes refill-aware pantry consumption statistics.
 */
export function computeConsumptionStats(
  events: QuantityEvent[],
  readings: SensorReading[] = [],
  now: Date = new Date()
): ConsumptionStats {
  const validEvents = (events || []).filter(
    (e) => e && typeof e.amountGrams === 'number' && !Number.isNaN(e.amountGrams)
  )

  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000

  let todayConsumptionGrams = 0
  let last7DaysConsumptionGrams = 0
  let totalRecordedConsumptionGrams = 0
  let totalRefillGrams = 0

  for (const event of validEvents) {
    const eventTimeMs = new Date(event.timestamp).getTime()

    if (event.type === 'consumption') {
      totalRecordedConsumptionGrams += event.amountGrams

      if (eventTimeMs >= todayStartMs) {
        todayConsumptionGrams += event.amountGrams
      }
      if (eventTimeMs >= sevenDaysAgoMs) {
        last7DaysConsumptionGrams += event.amountGrams
      }
    } else if (event.type === 'refill') {
      totalRefillGrams += event.amountGrams
    }
  }

  // Calculate Average Daily Consumption only when sufficient time span exists
  let avgDailyConsumptionGrams: number | null = null
  let hasEnoughDataForAvg = false

  const validTimestamps = [
    ...readings.map((r) => new Date(r.timestamp).getTime()),
    ...validEvents.map((e) => new Date(e.timestamp).getTime()),
  ].filter((t) => !Number.isNaN(t))

  if (validTimestamps.length >= 2) {
    const minTime = Math.min(...validTimestamps)
    const maxTime = Math.max(...validTimestamps)
    const spanHours = (maxTime - minTime) / (1000 * 60 * 60)

    if (spanHours >= MIN_SPAN_HOURS_FOR_AVG && totalRecordedConsumptionGrams > 0) {
      const spanDays = Math.max(1, spanHours / 24)
      avgDailyConsumptionGrams = Math.round((totalRecordedConsumptionGrams / spanDays) * 10) / 10
      hasEnoughDataForAvg = true
    }
  }

  return {
    todayConsumptionGrams: Math.round(todayConsumptionGrams * 10) / 10,
    last7DaysConsumptionGrams: Math.round(last7DaysConsumptionGrams * 10) / 10,
    avgDailyConsumptionGrams,
    hasEnoughDataForAvg,
    totalRecordedConsumptionGrams: Math.round(totalRecordedConsumptionGrams * 10) / 10,
    totalRefillGrams: Math.round(totalRefillGrams * 10) / 10,
    eventsCount: validEvents.length,
  }
}

/**
 * Filters sensor readings based on selected time range window.
 */
export function filterReadingsByRange(
  readings: SensorReading[],
  range: TimeRangeFilter,
  now: Date = new Date()
): SensorReading[] {
  if (!readings || range === 'all') return readings || []

  const nowMs = now.getTime()
  let windowMs = 24 * 60 * 60 * 1000

  if (range === '7d') {
    windowMs = 7 * 24 * 60 * 60 * 1000
  } else if (range === '30d') {
    windowMs = 30 * 24 * 60 * 60 * 1000
  }

  const cutoffMs = nowMs - windowMs
  return readings.filter((r) => {
    const t = new Date(r.timestamp).getTime()
    return !Number.isNaN(t) && t >= cutoffMs
  })
}

/**
 * Transforms sensor readings into chronological chart points for Recharts.
 */
export function formatHistoryPoints(
  readings: SensorReading[],
  range: TimeRangeFilter = '24h',
  now: Date = new Date()
): QuantityHistoryPoint[] {
  if (!readings || readings.length === 0) return []

  const filtered = filterReadingsByRange(readings, range, now)
  const valid = filtered.filter(
    (r) => r && typeof r.measuredWeight === 'number' && !Number.isNaN(r.measuredWeight)
  )

  // Sort chronologically (oldest to newest)
  valid.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return valid.map((r) => {
    const d = new Date(r.timestamp)
    let timeFormatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (range === '7d' || range === '30d') {
      timeFormatted = `${d.getMonth() + 1}/${d.getDate()} ${timeFormatted}`
    }

    return {
      timestamp: r.timestamp,
      timeFormatted,
      weightGrams: Math.round(r.measuredWeight * 10) / 10,
      ...(r.rawWeight !== undefined ? { rawWeightGrams: r.rawWeight } : {}),
      ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
      ...(r.humidity !== undefined ? { humidity: r.humidity } : {}),
    }
  })
}

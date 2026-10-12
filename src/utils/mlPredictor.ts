import { CONTAINER_ID } from '../types/inventory'
import type { ConfidenceLevel, DepletionPrediction, ProjectionPoint } from '../types/prediction'
import type { SensorReading } from '../types/sensors'

const REFILL_THRESHOLD_GRAMS = 50.0
const MIN_READINGS_COUNT = 3
const MIN_SPAN_HOURS = 0.5

export interface PredictorInput {
  containerId?: typeof CONTAINER_ID
  currentQuantityGrams: number
  readings: SensorReading[]
}

/**
 * Client-side Refill-Aware Linear Regression Depletion Predictor.
 * Matches the Python FastAPI / Scikit-Learn logic.
 */
export function predictDepletionClient(input: PredictorInput): DepletionPrediction {
  const containerId = input.containerId || CONTAINER_ID
  const now = new Date()
  const nowIso = now.toISOString()
  const nowEpoch = now.getTime() / 1000

  // 1. Empty container check
  if (input.currentQuantityGrams <= 0) {
    return {
      status: 'empty_container',
      containerId,
      currentQuantityGrams: 0,
      dailyConsumptionRateGrams: 0,
      estimatedRemainingDays: 0,
      estimatedDepletionDate: nowIso,
      confidence: 'insufficient',
      r2Score: null,
      maeGrams: null,
      dataQualityMessage: 'Pantry container is currently empty (0 g).',
      projections: [],
      lastCalculated: nowIso,
      source: 'client-engine',
    }
  }

  // 2. Filter & sort readings
  const validReadings: { timeSec: number; weight: number }[] = []
  for (const r of input.readings || []) {
    if (
      r &&
      typeof r.measuredWeight === 'number' &&
      !Number.isNaN(r.measuredWeight) &&
      r.measuredWeight >= 0 &&
      r.timestamp &&
      !Number.isNaN(new Date(r.timestamp).getTime())
    ) {
      validReadings.push({
        timeSec: new Date(r.timestamp).getTime() / 1000,
        weight: r.measuredWeight,
      })
    }
  }

  validReadings.sort((a, b) => a.timeSec - b.timeSec)

  // 3. Minimum observation count check
  if (validReadings.length < MIN_READINGS_COUNT) {
    return {
      status: 'insufficient_data',
      containerId,
      currentQuantityGrams: Math.round(input.currentQuantityGrams * 10) / 10,
      dailyConsumptionRateGrams: null,
      estimatedRemainingDays: null,
      estimatedDepletionDate: null,
      confidence: 'insufficient',
      r2Score: null,
      maeGrams: null,
      dataQualityMessage: `Not enough consumption data yet (${validReadings.length}/${MIN_READINGS_COUNT} readings). Keep monitoring to generate a reliable depletion prediction.`,
      projections: [],
      lastCalculated: nowIso,
      source: 'client-engine',
    }
  }

  // 4. Check time span
  const minTime = validReadings[0].timeSec
  const maxTime = validReadings[validReadings.length - 1].timeSec
  const spanHours = (maxTime - minTime) / 3600

  if (spanHours < MIN_SPAN_HOURS) {
    return {
      status: 'insufficient_data',
      containerId,
      currentQuantityGrams: Math.round(input.currentQuantityGrams * 10) / 10,
      dailyConsumptionRateGrams: null,
      estimatedRemainingDays: null,
      estimatedDepletionDate: null,
      confidence: 'insufficient',
      r2Score: null,
      maeGrams: null,
      dataQualityMessage: 'Observation window is too short. Please allow more time for consumption patterns to register.',
      projections: [],
      lastCalculated: nowIso,
      source: 'client-engine',
    }
  }

  // 5. Refill-aware segmentation
  const segments: { timeSec: number; weight: number }[][] = []
  let currentSegment = [validReadings[0]]

  for (let i = 1; i < validReadings.length; i++) {
    const prev = validReadings[i - 1]
    const curr = validReadings[i]

    if (curr.weight - prev.weight >= REFILL_THRESHOLD_GRAMS) {
      if (currentSegment.length > 0) segments.push(currentSegment)
      currentSegment = [curr]
    } else {
      currentSegment.push(curr)
    }
  }
  if (currentSegment.length > 0) segments.push(currentSegment)

  // 6. Cumulative consumption series
  const xDays: number[] = []
  const yConsumed: number[] = []
  let cumulativeConsumed = 0
  let cumulativeTimeSec = 0

  for (const seg of segments) {
    if (seg.length < 2) continue
    const segStartT = seg[0].timeSec
    const segStartW = seg[0].weight

    for (const point of seg) {
      const dt = point.timeSec - segStartT
      const dw = Math.max(0, segStartW - point.weight)
      xDays.push((cumulativeTimeSec + dt) / 86400)
      yConsumed.push(cumulativeConsumed + dw)
    }

    cumulativeTimeSec += seg[seg.length - 1].timeSec - segStartT
    cumulativeConsumed += Math.max(0, segStartW - seg[seg.length - 1].weight)
  }

  if (xDays.length < 2 || cumulativeConsumed < 10.0) {
    return {
      status: 'stable',
      containerId,
      currentQuantityGrams: Math.round(input.currentQuantityGrams * 10) / 10,
      dailyConsumptionRateGrams: 0,
      estimatedRemainingDays: null,
      estimatedDepletionDate: null,
      confidence: 'insufficient',
      r2Score: null,
      maeGrams: null,
      dataQualityMessage: 'Stable quantity: No measurable food consumption detected across the monitored period.',
      projections: [],
      lastCalculated: nowIso,
      source: 'client-engine',
    }
  }

  // 7. Linear Regression fit (Slope through origin: sum(x*y) / sum(x*x))
  let sumXY = 0
  let sumXX = 0
  for (let i = 0; i < xDays.length; i++) {
    sumXY += xDays[i] * yConsumed[i]
    sumXX += xDays[i] * xDays[i]
  }

  const slopeDailyGrams = sumXX > 0 ? sumXY / sumXX : 0

  if (slopeDailyGrams <= 0.1) {
    return {
      status: 'stable',
      containerId,
      currentQuantityGrams: Math.round(input.currentQuantityGrams * 10) / 10,
      dailyConsumptionRateGrams: 0,
      estimatedRemainingDays: null,
      estimatedDepletionDate: null,
      confidence: 'insufficient',
      r2Score: null,
      maeGrams: null,
      dataQualityMessage: 'Consumption rate is negligible or stable.',
      projections: [],
      lastCalculated: nowIso,
      source: 'client-engine',
    }
  }

  // Calculate R2 and MAE
  let ssTot = 0
  let ssRes = 0
  let sumAbsErr = 0
  const yMean = yConsumed.reduce((a, b) => a + b, 0) / yConsumed.length

  for (let i = 0; i < xDays.length; i++) {
    const yPred = slopeDailyGrams * xDays[i]
    ssTot += Math.pow(yConsumed[i] - yMean, 2)
    ssRes += Math.pow(yConsumed[i] - yPred, 2)
    sumAbsErr += Math.abs(yConsumed[i] - yPred)
  }

  const r2 = ssTot > 0 ? Math.max(-1, Math.min(1, 1 - ssRes / ssTot)) : null
  const mae = xDays.length > 0 ? sumAbsErr / xDays.length : null

  // 8. Remaining Days & Depletion Date
  const remainingDays = input.currentQuantityGrams / slopeDailyGrams
  const depletionEpoch = nowEpoch + remainingDays * 86400
  const depletionIso = new Date(depletionEpoch * 1000).toISOString()

  // 9. Confidence Level
  let confidence: ConfidenceLevel = 'low'
  let qualityMsg = 'Preliminary estimate with limited observation span. Accuracy will improve with further data.'

  if (spanHours >= 48 && validReadings.length >= 6 && r2 !== null && r2 >= 0.7) {
    confidence = 'good'
    qualityMsg = 'High confidence: Multi-day linear depletion trend with strong statistical fit.'
  } else if (spanHours >= 12 && validReadings.length >= 4 && (r2 === null || r2 >= 0.4)) {
    confidence = 'moderate'
    qualityMsg = 'Moderate confidence: Stable consumption rate observed across multiple hours.'
  }

  // 10. Projections
  const projections: ProjectionPoint[] = []
  const steps = 5
  for (let s = 0; s <= steps; s++) {
    const fraction = s / steps
    const projEpoch = nowEpoch + fraction * (remainingDays * 86400)
    const projW = Math.max(0, Math.round(input.currentQuantityGrams * (1 - fraction) * 10) / 10)
    projections.push({
      timestamp: new Date(projEpoch * 1000).toISOString(),
      weightGrams: projW,
      isProjection: true,
    })
  }

  return {
    status: 'success',
    containerId,
    currentQuantityGrams: Math.round(input.currentQuantityGrams * 10) / 10,
    dailyConsumptionRateGrams: Math.round(slopeDailyGrams * 10) / 10,
    estimatedRemainingDays: Math.round(remainingDays * 10) / 10,
    estimatedDepletionDate: depletionIso,
    confidence,
    r2Score: r2 !== null ? Math.round(r2 * 1000) / 1000 : null,
    maeGrams: mae !== null ? Math.round(mae * 10) / 10 : null,
    dataQualityMessage: qualityMsg,
    projections,
    lastCalculated: nowIso,
    source: 'client-engine',
  }
}

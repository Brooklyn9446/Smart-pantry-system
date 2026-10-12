import { CONTAINER_ID } from '../types/inventory'
import type { DepletionPrediction } from '../types/prediction'
import type { QuantityEvent } from '../types/quantityHistory'
import type { SensorReading } from '../types/sensors'
import { predictDepletionClient } from '../utils/mlPredictor'

const ML_SERVICE_URL =
  import.meta.env.VITE_ML_SERVICE_URL || 'http://localhost:8000/predict/depletion'

export const predictionRepository = {
  async getDepletionPrediction(
    containerId: typeof CONTAINER_ID = CONTAINER_ID,
    currentQuantityGrams: number,
    readings: SensorReading[],
    events: QuantityEvent[] = []
  ): Promise<DepletionPrediction> {
    const formattedReadings = (readings || []).map((r) => ({
      timestamp: r.timestamp,
      weightGrams: r.measuredWeight,
    }))

    const formattedEvents = (events || []).map((e) => ({
      id: e.id,
      type: e.type,
      amountGrams: e.amountGrams,
      previousWeightGrams: e.previousWeightGrams,
      newWeightGrams: e.newWeightGrams,
      timestamp: e.timestamp,
    }))

    const payload = {
      containerId,
      currentQuantityGrams,
      readings: formattedReadings,
      events: formattedEvents,
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2500)

      const response = await fetch(ML_SERVICE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = (await response.json()) as DepletionPrediction
        return {
          ...data,
          source: 'fastapi',
        }
      }
    } catch {
      // Non-fatal: Fall back seamlessly to client regression engine
    }

    return predictDepletionClient({
      containerId,
      currentQuantityGrams,
      readings,
    })
  },
}

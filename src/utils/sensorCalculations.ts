import type { DeviceConnectionStatus } from '../types/sensors'

// Online threshold: 60 seconds (covers 2x to 4x the 15-30s sampling interval)
export const ONLINE_THRESHOLD_MS = 60 * 1000
// Stale threshold: 5 minutes (300 seconds)
export const STALE_THRESHOLD_MS = 5 * 60 * 1000

/**
 * Determines device connectivity status from latest sensor timestamp.
 */
export function getDeviceStatus(
  lastUpdated: string | null | undefined,
  now: Date = new Date()
): DeviceConnectionStatus {
  if (!lastUpdated) return 'waiting'

  const updateTime = new Date(lastUpdated).getTime()
  if (Number.isNaN(updateTime)) return 'waiting'

  const elapsedMs = now.getTime() - updateTime

  if (elapsedMs <= ONLINE_THRESHOLD_MS) {
    return 'online'
  }
  if (elapsedMs <= STALE_THRESHOLD_MS) {
    return 'stale'
  }
  return 'offline'
}

/**
 * Returns human-readable relative time string.
 */
export function formatRelativeTime(
  isoString: string | null | undefined,
  now: Date = new Date()
): string {
  if (!isoString) return 'Waiting for data'

  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return 'Invalid timestamp'

  const elapsedMs = now.getTime() - date.getTime()
  if (elapsedMs < 0) return 'Just now'

  const seconds = Math.floor(elapsedMs / 1000)
  if (seconds < 5) return 'Just now'
  if (seconds < 60) return `${seconds} seconds ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) return '1 minute ago'
  if (minutes < 60) return `${minutes} minutes ago`

  const hours = Math.floor(minutes / 60)
  if (hours === 1) return '1 hour ago'
  if (hours < 24) return `${hours} hours ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

/**
 * Computes net food weight given total measured weight on load cell and container tare offset.
 * Clamps sensor noise below zero to 0.
 */
export function calculateFoodWeight(
  measuredWeightGrams: number,
  containerTareGrams: number = 0
): number {
  if (typeof measuredWeightGrams !== 'number' || Number.isNaN(measuredWeightGrams)) {
    return 0
  }
  const net = measuredWeightGrams - (containerTareGrams || 0)
  return Math.max(0, Math.round(net * 10) / 10)
}

/**
 * Formats weight with unit for UI presentation.
 */
export function formatWeightDisplay(
  grams: number | null | undefined,
  preferUnit: 'g' | 'kg' = 'kg'
): string {
  if (grams === null || grams === undefined || Number.isNaN(grams)) {
    return '—'
  }

  if (preferUnit === 'kg' || grams >= 1000) {
    const kg = grams / 1000
    // If exact integer or clean decimal
    return `${kg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
  }

  return `${Math.round(grams)} g`
}

/**
 * Formats temperature for UI.
 */
export function formatTemperature(tempC: number | null | undefined): string {
  if (tempC === null || tempC === undefined || Number.isNaN(tempC)) {
    return '—'
  }
  return `${tempC.toFixed(1)}°C`
}

/**
 * Formats relative humidity for UI.
 */
export function formatHumidity(humidity: number | null | undefined): string {
  if (humidity === null || humidity === undefined || Number.isNaN(humidity)) {
    return '—'
  }
  return `${Math.round(humidity)}%`
}

export type ExpiryStatus = 'normal' | 'expiring-soon' | 'expired' | 'no-expiry'

export interface ExpiryCalculation {
  status: ExpiryStatus
  daysRemaining: number | null
  formattedDate: string
  label: string
}

/**
 * Parses any date string/ISO format and normalizes to local calendar midnight (00:00:00).
 */
function parseDateToMidnight(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null
  const trimmed = dateStr.trim()
  if (!trimmed) return null

  // Extract YYYY, MM, DD components
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10) - 1
    const day = parseInt(isoMatch[3], 10)
    const d = new Date(year, month, day, 0, 0, 0, 0)
    if (!isNaN(d.getTime())) return d
  }

  const fallback = new Date(trimmed)
  if (isNaN(fallback.getTime())) return null
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 0, 0, 0, 0)
}

/**
 * Calculates calendar days remaining until expiry from today.
 * @param expiryDate Expiry date string (YYYY-MM-DD or ISO)
 * @param referenceDate Optional reference date (defaults to today midnight)
 */
export function getDaysUntilExpiry(
  expiryDate?: string,
  referenceDate: Date = new Date()
): number | null {
  if (!expiryDate) return null
  const target = parseDateToMidnight(expiryDate)
  if (!target) return null

  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0,
    0,
    0,
    0
  )

  const diffMs = target.getTime() - today.getTime()
  return Math.round(diffMs / 86_400_000)
}

/**
 * Computes full expiry status and human-readable formatting.
 */
export function getExpiryStatus(
  expiryDate?: string,
  referenceDate: Date = new Date()
): ExpiryCalculation {
  if (!expiryDate) {
    return {
      status: 'no-expiry',
      daysRemaining: null,
      formattedDate: 'Not set',
      label: 'No expiry date',
    }
  }

  const target = parseDateToMidnight(expiryDate)
  if (!target) {
    return {
      status: 'no-expiry',
      daysRemaining: null,
      formattedDate: expiryDate,
      label: 'Invalid date',
    }
  }

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(target)

  const days = getDaysUntilExpiry(expiryDate, referenceDate)
  if (days === null) {
    return {
      status: 'no-expiry',
      daysRemaining: null,
      formattedDate,
      label: 'No expiry date',
    }
  }

  if (days < 0) {
    const overdue = Math.abs(days)
    return {
      status: 'expired',
      daysRemaining: days,
      formattedDate,
      label: overdue === 1 ? 'Expired yesterday' : `Expired ${overdue} days ago`,
    }
  }

  if (days <= 7) {
    let label = `${days} days remaining`
    if (days === 0) label = 'Expires today'
    else if (days === 1) label = 'Expires tomorrow (1 day remaining)'

    return {
      status: 'expiring-soon',
      daysRemaining: days,
      formattedDate,
      label,
    }
  }

  return {
    status: 'normal',
    daysRemaining: days,
    formattedDate,
    label: `${days} days remaining`,
  }
}

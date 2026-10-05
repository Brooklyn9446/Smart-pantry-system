import { getDaysUntilExpiry, getExpiryStatus } from './expiry'

export function runExpiryTests(): boolean {
  const refDate = new Date(2026, 9, 10, 12, 0, 0) // Oct 10, 2026

  let passed = true
  function assert(condition: boolean, testName: string) {
    if (!condition) {
      console.error(`❌ Test failed: ${testName}`)
      passed = false
    } else {
      console.log(`✓ Passed: ${testName}`)
    }
  }

  // Direct getDaysUntilExpiry test
  assert(getDaysUntilExpiry('2026-10-20', refDate) === 10, 'getDaysUntilExpiry calculates 10 days')
  assert(getDaysUntilExpiry('2026-10-10', refDate) === 0, 'getDaysUntilExpiry calculates 0 days for today')
  assert(getDaysUntilExpiry(undefined, refDate) === null, 'getDaysUntilExpiry returns null for undefined')

  // Case 1: 10 days away (Oct 20, 2026) -> Normal
  const case1 = getExpiryStatus('2026-10-20', refDate)
  assert(case1.status === 'normal', 'Case 1 status is normal')
  assert(case1.daysRemaining === 10, 'Case 1 days remaining is 10')

  // Case 2: 7 days away (Oct 17, 2026) -> Expiring Soon
  const case2 = getExpiryStatus('2026-10-17', refDate)
  assert(case2.status === 'expiring-soon', 'Case 2 status is expiring-soon')
  assert(case2.daysRemaining === 7, 'Case 2 days remaining is 7')

  // Case 3: 1 day away (Oct 11, 2026) -> Expiring Soon
  const case3 = getExpiryStatus('2026-10-11', refDate)
  assert(case3.status === 'expiring-soon', 'Case 3 status is expiring-soon')
  assert(case3.daysRemaining === 1, 'Case 3 days remaining is 1')

  // Case 4: Today (Oct 10, 2026) -> Expiring Soon
  const case4 = getExpiryStatus('2026-10-10', refDate)
  assert(case4.status === 'expiring-soon', 'Case 4 status is expiring-soon')
  assert(case4.daysRemaining === 0, 'Case 4 days remaining is 0')
  assert(case4.label === 'Expires today', 'Case 4 label is Expires today')

  // Case 5: Yesterday (Oct 09, 2026) -> Expired
  const case5 = getExpiryStatus('2026-10-09', refDate)
  assert(case5.status === 'expired', 'Case 5 status is expired')
  assert(case5.daysRemaining === -1, 'Case 5 days remaining is -1')
  assert(case5.label === 'Expired yesterday', 'Case 5 label is Expired yesterday')

  // Case 5b: 5 days ago (Oct 05, 2026) -> Expired
  const case5b = getExpiryStatus('2026-10-05', refDate)
  assert(case5b.status === 'expired', 'Case 5b status is expired')
  assert(case5b.daysRemaining === -5, 'Case 5b days remaining is -5')
  assert(case5b.label === 'Expired 5 days ago', 'Case 5b label is Expired 5 days ago')

  // Case 6: Missing expiry date -> No expiry date
  const case6 = getExpiryStatus(undefined, refDate)
  assert(case6.status === 'no-expiry', 'Case 6 status is no-expiry')
  assert(case6.daysRemaining === null, 'Case 6 days remaining is null')
  assert(case6.label === 'No expiry date', 'Case 6 label is No expiry date')

  // Case 7: Invalid expiry date -> Safe handling without crashing
  const case7 = getExpiryStatus('not-a-date', refDate)
  assert(case7.status === 'no-expiry', 'Case 7 status is no-expiry')
  assert(case7.daysRemaining === null, 'Case 7 days remaining is null')
  assert(case7.label === 'Invalid date', 'Case 7 label is Invalid date')

  return passed
}

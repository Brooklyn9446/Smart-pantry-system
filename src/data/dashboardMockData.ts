import type { ClimateHistoryPoint, ExpiringItem, PantryAlert } from '../types/dashboard'

export const climateHistory: ClimateHistoryPoint[] = [
  { time: '6 AM', temperature: 21.8, humidity: 61 }, { time: '9 AM', temperature: 22.1, humidity: 59 },
  { time: '12 PM', temperature: 23.4, humidity: 57 }, { time: '3 PM', temperature: 24.1, humidity: 55 },
  { time: '6 PM', temperature: 23.2, humidity: 58 }, { time: 'Now', temperature: 22.4, humidity: 58 },
]

export const expiringItems: ExpiringItem[] = [
  { id: 'eggs', name: 'Free-range eggs', category: 'Dairy & eggs', expiresOn: 'Oct 06', daysRemaining: 2, quantity: '6 eggs', status: 'critical' },
  { id: 'yogurt', name: 'Greek yogurt', category: 'Dairy & eggs', expiresOn: 'Oct 08', daysRemaining: 4, quantity: '2 tubs', status: 'low' },
  { id: 'tortillas', name: 'Whole wheat tortillas', category: 'Bakery', expiresOn: 'Oct 10', daysRemaining: 6, quantity: '1 pack', status: 'good' },
]

export const recentAlerts: PantryAlert[] = [
  { id: 'rice-low', title: 'Rice is running low', description: 'Jasmine rice has about 2.9 kg remaining.', timestamp: '12 min ago', severity: 'warning' },
  { id: 'eggs-expiry', title: 'Eggs expire in 2 days', description: 'Plan a meal or add them to your shopping list.', timestamp: '1 hr ago', severity: 'critical' },
  { id: 'climate-normal', title: 'Storage conditions stable', description: 'Temperature and humidity are within your target range.', timestamp: '3 hrs ago', severity: 'info' },
]

import { useEffect, useState } from 'react'
import { AlertsPage } from './components/alerts/AlertsPage'
import { AlertList, ExpiryList } from './components/dashboard/ActivityLists'
import { ClimateChart, QuantityChart } from './components/dashboard/Charts'
import { SummaryCards } from './components/dashboard/SummaryCards'
import { ExpiryTrackerPage } from './components/expiry/ExpiryTrackerPage'
import { InventoryPage } from './components/inventory/InventoryPage'
import { Sidebar } from './components/layout/Sidebar'
import { AlertProvider } from './context/AlertContext'
import { AuthProvider } from './context/AuthContext'
import { InventoryProvider } from './context/InventoryContext'
import { useAlerts } from './context/useAlerts'

type PageSlug = 'overview' | 'inventory' | 'expiry-tracker' | 'alerts'

function getPage(): PageSlug {
  const hash = window.location.hash.replace('#', '')
  if (hash === 'inventory' || hash === 'expiry-tracker' || hash === 'alerts') {
    return hash
  }
  return 'overview'
}

export default function App() {
  const [page, setPage] = useState<PageSlug>(getPage)

  useEffect(() => {
    const updatePage = () => setPage(getPage())
    window.addEventListener('hashchange', updatePage)
    return () => window.removeEventListener('hashchange', updatePage)
  }, [])

  return (
    <AuthProvider>
      <InventoryProvider>
        <AlertProvider>
          <div className="app-shell">
            <Sidebar activePage={page} />
            {page === 'inventory' ? (
              <InventoryPage />
            ) : page === 'expiry-tracker' ? (
              <ExpiryTrackerPage />
            ) : page === 'alerts' ? (
              <AlertsPage />
            ) : (
              <Dashboard />
            )}
          </div>
        </AlertProvider>
      </InventoryProvider>
    </AuthProvider>
  )
}

function Dashboard() {
  const { unreadCount } = useAlerts()
  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  return (
    <main id="overview" className="main-content">
      <header className="topbar">
        <div>
          <p className="eyebrow">{todayFormatted}</p>
          <h1>
            Good morning, Niran <span aria-hidden="true">👋</span>
          </h1>
          <p className="subtitle">Here’s what’s happening in your pantry.</p>
        </div>
        <div className="topbar-actions">
          <a
            className="icon-button"
            href="#alerts"
            aria-label={`View alerts (${unreadCount} unread)`}
            style={{ textDecoration: 'none', display: 'grid', placeItems: 'center' }}
          >
            ◉{unreadCount > 0 && <span className="notification-dot" />}
          </a>
          <button className="profile-button" type="button" aria-label="Open profile menu">
            <span>NI</span>
            <i aria-hidden="true">⌄</i>
          </button>
        </div>
      </header>
      <SummaryCards />
      <section className="chart-grid">
        <QuantityChart />
        <ClimateChart />
      </section>
      <section className="list-grid">
        <ExpiryList />
        <AlertList />
      </section>
    </main>
  )
}

import { useEffect, useState } from 'react'
import { AlertList, ExpiryList } from './components/dashboard/ActivityLists'
import { ClimateChart, QuantityChart } from './components/dashboard/Charts'
import { SummaryCards } from './components/dashboard/SummaryCards'
import { InventoryPage } from './components/inventory/InventoryPage'
import { Sidebar } from './components/layout/Sidebar'
import { InventoryProvider } from './context/InventoryContext'

function getPage() { return window.location.hash === '#inventory' ? 'inventory' : 'overview' }

export default function App() {
  const [page, setPage] = useState<'overview' | 'inventory'>(getPage)
  useEffect(() => { const updatePage = () => setPage(getPage()); window.addEventListener('hashchange', updatePage); return () => window.removeEventListener('hashchange', updatePage) }, [])
  return <InventoryProvider><div className="app-shell"><Sidebar activePage={page} />{page === 'inventory' ? <InventoryPage /> : <Dashboard />}</div></InventoryProvider>
}

function Dashboard() {
  return <main id="overview" className="main-content">
    <header className="topbar"><div><p className="eyebrow">Sunday, October 4</p><h1>Good morning, Niran <span aria-hidden="true">👋</span></h1><p className="subtitle">Here’s what’s happening in your pantry.</p></div><div className="topbar-actions"><button className="icon-button" type="button" aria-label="View notifications">◉<span className="notification-dot" /></button><button className="profile-button" type="button" aria-label="Open profile menu"><span>NI</span><i aria-hidden="true">⌄</i></button></div></header>
    <SummaryCards />
    <section className="chart-grid"><QuantityChart /><ClimateChart /></section>
    <section className="list-grid"><ExpiryList /><AlertList /></section>
  </main>
}

const navigationItems = [
  ['Overview', '⌂'], ['Inventory', '▦'], ['Live Monitoring', '⌁'], ['Expiry Tracker', '◷'],
  ['ML Predictions', '✦'], ['Storage Conditions', '♧'], ['Alerts', '◉'], ['Settings', '⚙'],
]

export function Sidebar({ activePage }: { activePage: 'overview' | 'inventory' }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#overview" aria-label="Pantry Pulse overview">
        <span className="brand-mark" aria-hidden="true">⌁</span><span>Pantry<span>Pulse</span></span>
      </a>
      <nav aria-label="Main navigation">
        {navigationItems.map(([label, icon]) => (
          <a key={label} href={label === 'Overview' ? '#overview' : `#${label.toLowerCase().replaceAll(' ', '-')}`} className={(label.toLowerCase() === activePage) ? 'nav-link active' : 'nav-link'}>
            <span aria-hidden="true">{icon}</span>{label}
          </a>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="device-dot" aria-hidden="true" /><div><strong>Pantry sensor</strong><span>Connected</span></div>
      </div>
    </aside>
  )
}

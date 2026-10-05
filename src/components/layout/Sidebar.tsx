import { useAlerts } from '../../context/useAlerts'

const navigationItems = [
  ['Overview', '⌂', 'overview'],
  ['Inventory', '▦', 'inventory'],
  ['Live Monitoring', '⌁', 'live-monitoring'],
  ['Expiry Tracker', '◷', 'expiry-tracker'],
  ['ML Predictions', '✦', 'ml-predictions'],
  ['Storage Conditions', '♧', 'storage-conditions'],
  ['Alerts', '◉', 'alerts'],
  ['Settings', '⚙', 'settings'],
] as const

export function Sidebar({ activePage }: { activePage: string }) {
  const { unreadCount } = useAlerts()

  return (
    <aside className="sidebar">
      <a className="brand" href="#overview" aria-label="Pantry Pulse overview">
        <span className="brand-mark" aria-hidden="true">
          ⌁
        </span>
        <span>
          Pantry<span>Pulse</span>
        </span>
      </a>

      <nav aria-label="Main navigation">
        {navigationItems.map(([label, icon, slug]) => {
          const isActive = activePage === slug
          return (
            <a
              key={label}
              href={`#${slug}`}
              className={isActive ? 'nav-link active' : 'nav-link'}
              style={{ justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
                <span aria-hidden="true">{icon}</span>
                {label}
              </div>
              {slug === 'alerts' && unreadCount > 0 && (
                <span
                  style={{
                    background: '#df604e',
                    color: '#fff',
                    borderRadius: '999px',
                    padding: '1px 6px',
                    fontSize: '10px',
                    fontWeight: 700,
                    width: 'auto',
                    minWidth: '18px',
                    lineHeight: '16px',
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </a>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="device-dot" aria-hidden="true" />
        <div>
          <strong>Pantry sensor</strong>
          <span>Connected</span>
        </div>
      </div>
    </aside>
  )
}

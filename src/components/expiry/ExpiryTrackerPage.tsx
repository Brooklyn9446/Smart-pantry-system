import { useState } from 'react'
import { useInventory } from '../../context/useInventory'
import { getExpiryStatus, type ExpiryStatus } from '../../utils/expiry'
import { PanelState } from '../ui/PanelState'
import { StatusBadge } from '../ui/StatusBadge'

type Filter = 'all' | 'expiring-soon' | 'expired' | 'normal'

export function ExpiryTrackerPage() {
  const { items, isLoading, error } = useInventory()
  const [filter, setFilter] = useState<Filter>('all')

  const itemsWithExpiry = items.map((item) => ({
    item,
    expiry: getExpiryStatus(item.expiryDate),
  }))

  const filteredItems = itemsWithExpiry.filter(({ expiry }) => {
    if (filter === 'all') return true
    return expiry.status === filter
  })

  // Count summaries
  const totalCount = items.length
  const expiringSoonCount = itemsWithExpiry.filter((i) => i.expiry.status === 'expiring-soon').length
  const expiredCount = itemsWithExpiry.filter((i) => i.expiry.status === 'expired').length
  const normalCount = itemsWithExpiry.filter((i) => i.expiry.status === 'normal').length

  return (
    <main id="expiry-tracker" className="main-content inventory-page">
      <header className="inventory-header">
        <div>
          <p className="eyebrow">Pantry freshness monitoring</p>
          <h1>Expiry Tracker</h1>
          <p className="subtitle">
            Track shelf-life and avoid food waste for your monitored containers.
          </p>
        </div>
      </header>

      {error && (
        <p className="inventory-feedback error" role="alert">
          {error}
        </p>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={filter === 'all' ? 'primary-button' : 'secondary-button'}
          type="button"
          onClick={() => setFilter('all')}
        >
          All items ({totalCount})
        </button>
        <button
          className={filter === 'expiring-soon' ? 'primary-button' : 'secondary-button'}
          type="button"
          onClick={() => setFilter('expiring-soon')}
        >
          Expiring Soon ({expiringSoonCount})
        </button>
        <button
          className={filter === 'expired' ? 'primary-button' : 'secondary-button'}
          type="button"
          onClick={() => setFilter('expired')}
        >
          Expired ({expiredCount})
        </button>
        <button
          className={filter === 'normal' ? 'primary-button' : 'secondary-button'}
          type="button"
          onClick={() => setFilter('normal')}
        >
          Normal ({normalCount})
        </button>
      </div>

      {isLoading ? (
        <section className="inventory-empty" style={{ borderRadius: '14px' }}>
          <PanelState kind="loading" message="expiry tracking records" />
        </section>
      ) : filteredItems.length > 0 ? (
        <div style={{ display: 'grid', gap: '14px' }}>
          {filteredItems.map(({ item, expiry }) => (
            <section
              key={item.id}
              className="inventory-item-card"
              style={{ borderRadius: '14px', borderTop: '1px solid #e6ece8' }}
            >
              <div className="item-monogram">{item.name.charAt(0).toUpperCase()}</div>
              <div className="inventory-item-main">
                <strong>{item.name}</strong>
                <span>
                  {item.category} · {item.initialQuantity} {item.quantityUnit} · <code>{item.containerId}</code>
                </span>
              </div>
              <div className="inventory-quantity" style={{ minWidth: '200px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                  <strong style={{ fontSize: '13px' }}>{expiry.formattedDate}</strong>
                  <StatusBadge status={expiry.status as ExpiryStatus} />
                </div>
                <span style={{ fontSize: '12px' }}>{expiry.label}</span>
              </div>
              <a className="secondary-button" href="#inventory" style={{ textDecoration: 'none', display: 'grid', placeItems: 'center' }}>
                Manage item
              </a>
            </section>
          ))}
        </div>
      ) : (
        <section className="inventory-empty" style={{ borderRadius: '14px' }}>
          <span aria-hidden="true">◷</span>
          <h2>
            {filter === 'all'
              ? 'No items in your pantry yet'
              : filter === 'expiring-soon'
              ? 'No items are expiring soon'
              : filter === 'expired'
              ? 'No expired items'
              : 'No items in normal status'}
          </h2>
          <p>
            {filter === 'all'
              ? 'Assign an item to container-01 in the Inventory tab to start tracking expiry dates.'
              : `There are currently 0 items matching the "${filter}" filter.`}
          </p>
          <a className="primary-button" href="#inventory" style={{ textDecoration: 'none', display: 'inline-grid', placeItems: 'center', width: 'fit-content', margin: '0 auto' }}>
            Go to Inventory
          </a>
        </section>
      )}
    </main>
  )
}

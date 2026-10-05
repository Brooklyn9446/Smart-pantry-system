import { useState, type ReactNode } from 'react'
import { useAuth } from '../../context/useAuth'
import { useInventory } from '../../context/useInventory'
import type { PantryItem, PantryItemInput } from '../../types/inventory'
import { getExpiryStatus } from '../../utils/expiry'
import { PanelState } from '../ui/PanelState'
import { StatusBadge } from '../ui/StatusBadge'
import { InventoryForm } from './InventoryForm'

type View = 'list' | 'form' | 'details' | 'confirm-delete'

export function InventoryPage() {
  const {
    items,
    isLoading,
    error,
    successMessage,
    source,
    addItem,
    updateItem,
    deleteItem,
    clearFeedback,
  } = useInventory()
  const { userId, isAuthLoading, authError } = useAuth()

  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<PantryItem | undefined>()

  const openDetails = (item: PantryItem) => {
    clearFeedback()
    setSelected(item)
    setView('details')
  }

  const save = async (input: PantryItemInput) => {
    try {
      if (selected) {
        await updateItem(selected.id, input)
      } else {
        await addItem(input)
      }
      setSelected(undefined)
      setView('list')
    } catch {
      // Handled via InventoryFeedback
    }
  }

  const add = () => {
    clearFeedback()
    setSelected(undefined)
    setView('form')
  }

  const activeError = error || authError

  if (view === 'form') {
    return (
      <InventoryWorkspace
        title={selected ? 'Edit pantry item' : 'Add pantry item'}
        description="Record the food item currently assigned to your physical pantry container."
      >
        <InventoryFeedback
          error={activeError}
          successMessage={successMessage}
          source={source}
          userId={userId}
        />
        <InventoryForm
          item={selected}
          onSave={save}
          onCancel={() => {
            clearFeedback()
            setView(selected ? 'details' : 'list')
          }}
        />
      </InventoryWorkspace>
    )
  }

  if (view === 'confirm-delete' && selected) {
    return (
      <InventoryWorkspace
        title="Remove pantry item"
        description="This action removes the item assignment from container-01."
      >
        <InventoryFeedback
          error={activeError}
          successMessage={successMessage}
          source={source}
          userId={userId}
        />
        <section className="confirm-card" role="alertdialog" aria-labelledby="delete-heading">
          <span className="delete-icon" aria-hidden="true">!</span>
          <h2 id="delete-heading">Remove {selected.name}?</h2>
          <p>
            The item will be removed from Cloud Firestore. Container <code>container-01</code> will become available to assign a new item.
          </p>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                clearFeedback()
                setView('details')
              }}
            >
              Keep item
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={() => {
                void deleteItem(selected.id)
                  .then(() => {
                    setSelected(undefined)
                    setView('list')
                  })
                  .catch(() => undefined)
              }}
            >
              Remove item
            </button>
          </div>
        </section>
      </InventoryWorkspace>
    )
  }

  if (view === 'details' && selected) {
    const expiry = getExpiryStatus(selected.expiryDate)

    return (
      <InventoryWorkspace
        title="Item details"
        description="Current container assignment and food specifications."
      >
        <InventoryFeedback
          error={activeError}
          successMessage={successMessage}
          source={source}
          userId={userId}
        />
        <section className="details-card">
          <div className="details-heading">
            <div className="item-monogram">{selected.name.charAt(0).toUpperCase()}</div>
            <div>
              <h2>{selected.name}</h2>
              <p>{selected.category}</p>
            </div>
            <span className="assignment-pill">{selected.containerId}</span>
          </div>

          <dl className="details-grid">
            <div>
              <dt>Initial quantity</dt>
              <dd>
                {selected.initialQuantity} {selected.quantityUnit}
                <small>Manual record ({source === 'firestore' ? 'Cloud Firestore' : 'Local Storage'})</small>
              </dd>
            </div>
            <div>
              <dt>Sensor quantity</dt>
              <dd>
                Not available
                <small>HX711 load cell pending (Phase 5)</small>
              </dd>
            </div>
            <div>
              <dt>Expiry date & status</dt>
              <dd>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span>{expiry.formattedDate}</span>
                  <StatusBadge status={expiry.status} />
                </div>
                <small>{expiry.label}</small>
              </dd>
            </div>
            <div>
              <dt>Tracking method</dt>
              <dd>
                Load cell
                <small>Single container mode</small>
              </dd>
            </div>
          </dl>

          <div className="form-actions details-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                clearFeedback()
                setView('list')
              }}
            >
              Back to inventory
            </button>
            <span />
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                clearFeedback()
                setView('form')
              }}
            >
              Edit item
            </button>
            <button
              className="danger-outline-button"
              type="button"
              onClick={() => {
                clearFeedback()
                setView('confirm-delete')
              }}
            >
              Remove
            </button>
          </div>
        </section>
      </InventoryWorkspace>
    )
  }

  const activeItem = items[0]
  const activeExpiry = activeItem ? getExpiryStatus(activeItem.expiryDate) : null

  return (
    <InventoryWorkspace
      title="Inventory"
      description="Manage the single item assigned to your smart pantry container."
    >
      <InventoryFeedback
        error={activeError}
        successMessage={successMessage}
        source={source}
        userId={userId}
      />

      {/* State 1: Loading */}
      {isLoading || isAuthLoading ? (
        <section className="inventory-empty">
          <PanelState kind="loading" message="pantry inventory from Cloud Firestore" />
        </section>
      ) : activeError && items.length === 0 ? (
        /* State 2: Error (Permission denied, network failure, Firestore error) */
        <section className="inventory-empty" role="alert">
          <span className="delete-icon" aria-hidden="true">!</span>
          <h2>Unable to load inventory</h2>
          <p>{activeError}</p>
        </section>
      ) : items.length > 0 && activeItem && activeExpiry ? (
        /* State 3: Existing item */
        <>
          <div className="inventory-toolbar">
            <div>
              <strong>1 active container</strong>
              <span>{activeItem.containerId} · load-cell</span>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={true}
              title="Only 1 container is supported in the current hardware scope"
            >
              Container in use
            </button>
          </div>

          <section className="inventory-item-card">
            <div className="item-monogram">{activeItem.name.charAt(0).toUpperCase()}</div>
            <div className="inventory-item-main">
              <strong>{activeItem.name}</strong>
              <span>
                {activeItem.category} · {activeItem.containerId} · {activeItem.initialQuantity} {activeItem.quantityUnit}
              </span>
            </div>
            <div className="inventory-quantity" style={{ minWidth: '180px' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', alignItems: 'center' }}>
                <strong style={{ fontSize: '13px' }}>{activeExpiry.formattedDate}</strong>
                <StatusBadge status={activeExpiry.status} />
              </div>
              <span style={{ fontSize: '11px' }}>{activeExpiry.label}</span>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => openDetails(activeItem)}
            >
              View details
            </button>
          </section>
        </>
      ) : (
        /* State 4: Genuine Empty inventory */
        <>
          <div className="inventory-toolbar">
            <div>
              <strong>0 active containers</strong>
              <span>container-01 · load-cell</span>
            </div>
            <button className="primary-button" type="button" onClick={add}>
              + Add item
            </button>
          </div>

          <section className="inventory-empty">
            <span aria-hidden="true">▦</span>
            <h2>No items in your pantry yet</h2>
            <p>
              Assign an item to <code>container-01</code> to start building your pantry inventory and tracking expiry status.
            </p>
            <button className="primary-button" type="button" onClick={add}>
              + Add item
            </button>
          </section>
        </>
      )}
    </InventoryWorkspace>
  )
}

function InventoryFeedback({
  error,
  successMessage,
  source,
  userId,
}: {
  error: string | null
  successMessage: string | null
  source: 'firestore' | 'local'
  userId: string | null
}) {
  return (
    <>
      {error && (
        <p className="inventory-feedback error" role="alert">
          {error}
        </p>
      )}
      {successMessage && (
        <p className="inventory-feedback success" role="status">
          {successMessage}
        </p>
      )}
      <p className="data-source">
        {source === 'firestore'
          ? `Connected to Cloud Firestore (Real-time sync · User: ${userId ? userId.slice(0, 8) + '…' : 'Authenticated'})`
          : 'Local storage fallback — set up Firebase credentials in .env.local to enable cloud persistence.'}
      </p>
    </>
  )
}

function InventoryWorkspace({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main id="inventory" className="main-content inventory-page">
      <header className="inventory-header">
        <div>
          <p className="eyebrow">Single-container inventory</p>
          <h1>{title}</h1>
          <p className="subtitle">{description}</p>
        </div>
      </header>
      {children}
    </main>
  )
}

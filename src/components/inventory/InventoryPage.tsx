import { useState, type ReactNode } from 'react'
import { useAuth } from '../../context/useAuth'
import { useInventory } from '../../context/useInventory'
import { useSensors } from '../../context/useSensors'
import type { PantryItem, PantryItemInput } from '../../types/inventory'
import { getExpiryStatus } from '../../utils/expiry'
import { evaluateStockStatus, formatQuantityWithUnit } from '../../utils/lowStock'
import { formatWeightDisplay } from '../../utils/sensorCalculations'
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
    assignItem,
    deleteItem,
    clearFeedback,
  } = useInventory()
  const { userId, isAuthLoading, authError } = useAuth()
  const { currentState, netFoodWeightGrams, deviceStatus, timeAgoFormatted } = useSensors()

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
        description="Record pantry inventory items and optionally assign them to physical sensor containers."
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
        description="This action removes the item from your pantry inventory."
      >
        <InventoryFeedback
          error={activeError}
          successMessage={successMessage}
          source={source}
          userId={userId}
        />
        <section className="confirm-card" role="alertdialog" aria-labelledby="delete-heading">
          <span className="delete-icon" aria-hidden="true">
            !
          </span>
          <h2 id="delete-heading">Remove {selected.name}?</h2>
          <p>
            The item will be removed from Cloud Firestore. {selected.containerId ? <>Container <code>{selected.containerId}</code> will become available to assign a new item.</> : 'This unassigned item will be deleted.'}
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
    const isAssigned = selected.containerId === 'container-01'
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
            <span
              className="assignment-pill"
              style={{
                backgroundColor: isAssigned ? '#ecfdf5' : '#f1f5f9',
                color: isAssigned ? '#065f46' : '#475569',
              }}
            >
              {isAssigned ? 'container-01 (IoT load-cell)' : 'Unassigned (Manual)'}
            </span>
          </div>

          <dl className="details-grid">
            <div>
              <dt>Initial / manual quantity</dt>
              <dd>
                {selected.initialQuantity} {selected.quantityUnit}
                <small>
                  Manual baseline record ({source === 'firestore' ? 'Cloud Firestore' : 'Local Storage'})
                </small>
              </dd>
            </div>
            <div>
              <dt>Sensor measured quantity</dt>
              <dd>
                {isAssigned ? (
                  currentState ? (
                    <>
                      <span style={{ color: '#13745c', fontWeight: 700 }}>
                        {formatWeightDisplay(netFoodWeightGrams, 'kg')}
                      </span>
                      <small>
                        Authoritative · HX711 Load Cell ({deviceStatus} · {timeAgoFormatted})
                      </small>
                    </>
                  ) : (
                    <>
                      Waiting for sensor data
                      <small>HX711 load cell on container-01</small>
                    </>
                  )
                ) : (
                  <>
                    <span style={{ color: '#64748b' }}>No physical sensor attached</span>
                    <small>Item is tracked manually using baseline quantity</small>
                  </>
                )}
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
              <dt>Restock threshold</dt>
              <dd>
                {selected.minStockThreshold !== undefined ? (
                  <>
                    <strong>
                      {selected.minStockThreshold} {selected.quantityUnit}
                    </strong>
                    <small>Custom threshold configured for this item</small>
                  </>
                ) : (
                  <>
                    <span>
                      {selected.quantityUnit === 'kg' ? '0.50 kg' : '500 g'}
                    </span>
                    <small>Default threshold (0.5 kg / 500 g fallback)</small>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Tracking method</dt>
              <dd>
                {isAssigned ? 'Load cell (HX711) · container-01' : 'Manual tracking'}
                <small>{isAssigned ? 'Hardware container assigned' : 'No container assigned'}</small>
              </dd>
            </div>
            <div>
              <dt>Container Assignment</dt>
              <dd>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span>{isAssigned ? 'container-01' : 'None'}</span>
                  {isAssigned ? (
                    <button
                      className="secondary-button"
                      type="button"
                      style={{ fontSize: '12px', padding: '2px 8px' }}
                      onClick={async () => {
                        try {
                          const updated = await assignItem(selected.id, null)
                          setSelected(updated)
                        } catch {
                          // Feedback handled in context
                        }
                      }}
                    >
                      Unassign container
                    </button>
                  ) : (
                    <button
                      className="secondary-button"
                      type="button"
                      style={{ fontSize: '12px', padding: '2px 8px' }}
                      onClick={async () => {
                        try {
                          const updated = await assignItem(selected.id, 'container-01')
                          setSelected(updated)
                        } catch {
                          // Feedback handled in context
                        }
                      }}
                    >
                      Assign to container-01
                    </button>
                  )}
                </div>
                <small>Physical containers require exclusive item assignment</small>
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

  const assignedItem = items.find((i) => i.containerId === 'container-01')

  return (
    <InventoryWorkspace
      title="Inventory"
      description="Manage items in your smart pantry, track stock levels, and assign IoT containers."
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
        /* State 2: Error */
        <section className="inventory-empty" role="alert">
          <span className="delete-icon" aria-hidden="true">
            !
          </span>
          <h2>Unable to load inventory</h2>
          <p>{activeError}</p>
        </section>
      ) : items.length > 0 ? (
        /* State 3: Existing items list */
        <>
          <div className="inventory-toolbar">
            <div>
              <strong>{items.length} {items.length === 1 ? 'item' : 'items'} in pantry</strong>
              <span>
                {assignedItem
                  ? `container-01: ${assignedItem.name} (IoT load-cell)`
                  : 'container-01: Available for assignment'}
              </span>
            </div>
            <button className="primary-button" type="button" onClick={add}>
              + Add item
            </button>
          </div>

          <div className="inventory-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map((item) => {
              const isAssigned = item.containerId === 'container-01'
              const itemExpiry = getExpiryStatus(item.expiryDate)
              const stockEval = evaluateStockStatus(
                item,
                isAssigned && currentState ? netFoodWeightGrams : null
              )

              return (
                <section key={item.id} className="inventory-item-card">
                  <div className="item-monogram">{item.name.charAt(0).toUpperCase()}</div>
                  <div className="inventory-item-main">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong>{item.name}</strong>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: isAssigned ? '#ecfdf5' : '#f1f5f9',
                          color: isAssigned ? '#065f46' : '#475569',
                          fontWeight: 600,
                        }}
                      >
                        {isAssigned ? 'container-01 (IoT load-cell)' : 'Unassigned (Manual)'}
                      </span>
                    </div>
                    <span>
                      {item.category} · Baseline: {item.initialQuantity} {item.quantityUnit}
                      {isAssigned && currentState
                        ? ` · Live: ${formatWeightDisplay(netFoodWeightGrams, 'kg')}`
                        : ''}
                      {` · Min: ${formatQuantityWithUnit(stockEval.thresholdGrams, item.quantityUnit)}`}
                      {stockEval.isLowStock && (
                        <span
                          style={{
                            marginLeft: '6px',
                            color: stockEval.stockStatus === 'out-of-stock' ? '#c54545' : '#b45309',
                            fontWeight: 700,
                          }}
                        >
                          · {stockEval.stockStatus === 'out-of-stock' ? 'Out of stock' : 'Low stock'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="inventory-quantity" style={{ minWidth: '180px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', alignItems: 'center' }}>
                      <strong style={{ fontSize: '13px' }}>{itemExpiry.formattedDate}</strong>
                      <StatusBadge status={itemExpiry.status} />
                    </div>
                    <span style={{ fontSize: '11px' }}>{itemExpiry.label}</span>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => openDetails(item)}
                  >
                    View details
                  </button>
                </section>
              )
            })}
          </div>
        </>
      ) : (
        /* State 4: Genuine Empty inventory */
        <>
          <div className="inventory-toolbar">
            <div>
              <strong>0 items in pantry</strong>
              <span>container-01 · Available for assignment</span>
            </div>
            <button className="primary-button" type="button" onClick={add}>
              + Add item
            </button>
          </div>

          <section className="inventory-empty">
            <span aria-hidden="true">▦</span>
            <h2>No items in your pantry yet</h2>
            <p>
              Add pantry items to track food stock, expiry dates, or assign an item to <code>container-01</code> for live sensor monitoring.
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
          ? `Connected to Cloud Firestore (Real-time sync · User: ${
              userId ? userId.slice(0, 8) + '…' : 'Authenticated'
            })`
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
          <p className="eyebrow">Pantry inventory</p>
          <h1>{title}</h1>
          <p className="subtitle">{description}</p>
        </div>
      </header>
      {children}
    </main>
  )
}

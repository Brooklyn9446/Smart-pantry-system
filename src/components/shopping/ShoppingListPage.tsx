import { useState, type FormEvent } from 'react'
import { usePrediction } from '../../context/usePrediction'
import { useShoppingList } from '../../context/useShoppingList'
import type { QuantityUnit } from '../../types/inventory'
import type { ShoppingListFilter, ShoppingListItemInput } from '../../types/shoppingList'
import { PanelState } from '../ui/PanelState'

const categories = ['Grains & cereals', 'Baking', 'Snacks', 'Canned goods', 'Spices', 'Produce', 'Dairy', 'Other']

export function ShoppingListPage() {
  const {
    items,
    purchasedItems,
    toBuyCount,
    isLoading,
    error,
    addItem,
    togglePurchased,
    removeItem,
    clearPurchased,
  } = useShoppingList()
  const { prediction } = usePrediction()

  const [filter, setFilter] = useState<ShoppingListFilter>('to-buy')
  const [showAddForm, setShowAddForm] = useState(false)
  const [formValues, setFormValues] = useState<ShoppingListItemInput>({
    name: '',
    category: 'Grains & cereals',
    targetQuantity: 1,
    quantityUnit: 'kg',
    notes: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true
    if (filter === 'to-buy') return !item.isPurchased
    if (filter === 'purchased') return item.isPurchased
    return true
  })

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!formValues.name?.trim()) return

    setIsSubmitting(true)
    try {
      await addItem({
        name: formValues.name.trim(),
        category: formValues.category,
        targetQuantity: formValues.targetQuantity,
        quantityUnit: formValues.quantityUnit,
        notes: formValues.notes?.trim() || undefined,
        source: 'manual',
      })
      setFormValues({
        name: '',
        category: 'Grains & cereals',
        targetQuantity: 1,
        quantityUnit: 'kg',
        notes: '',
      })
      setShowAddForm(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main id="shopping-list" className="main-content inventory-page">
      <header className="inventory-header">
        <div>
          <p className="eyebrow">Restock & Grocery Planning</p>
          <h1>Shopping List</h1>
          <p className="subtitle">
            Automated restock items for low-stock pantry containers, plus manual grocery planning.
          </p>
        </div>
      </header>

      {error && (
        <p className="inventory-feedback error" role="alert">
          {error}
        </p>
      )}

      {/* Action Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={filter === 'to-buy' ? 'primary-button' : 'secondary-button'}
            type="button"
            onClick={() => setFilter('to-buy')}
          >
            To Buy ({toBuyCount})
          </button>
          <button
            className={filter === 'all' ? 'primary-button' : 'secondary-button'}
            type="button"
            onClick={() => setFilter('all')}
          >
            All Items ({items.length})
          </button>
          <button
            className={filter === 'purchased' ? 'primary-button' : 'secondary-button'}
            type="button"
            onClick={() => setFilter('purchased')}
          >
            Purchased ({purchasedItems.length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {purchasedItems.length > 0 && (
            <button
              className="secondary-button"
              type="button"
              style={{ fontSize: '13px' }}
              onClick={() => void clearPurchased()}
            >
              Clear Purchased
            </button>
          )}
          <button
            className="primary-button"
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            {showAddForm ? '✕ Close Form' : '+ Add Item'}
          </button>
        </div>
      </div>

      {/* Manual Add Form */}
      {showAddForm && (
        <section
          className="metric-card"
          style={{ marginBottom: '24px', padding: '20px', background: '#f8faf9', border: '1px solid #d2dfd8' }}
        >
          <h2 style={{ fontSize: '16px', margin: '0 0 14px' }}>Add Grocery / Restock Item</h2>
          <form className="inventory-form" noValidate onSubmit={handleCreate}>
            <div className="form-grid">
              <label>
                Item name
                <input
                  value={formValues.name}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Rolled oats, Milk, Olive oil"
                  required
                  autoFocus
                />
              </label>

              <label>
                Category
                <select
                  value={formValues.category}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, category: e.target.value }))}
                >
                  {categories.map((cat) => (
                    <option key={cat}>{cat}</option>
                  ))}
                </select>
              </label>

              <label>
                Target quantity
                <div className="quantity-control">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formValues.targetQuantity ?? ''}
                    onChange={(e) =>
                      setFormValues((prev) => ({
                        ...prev,
                        targetQuantity: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                  <select
                    value={formValues.quantityUnit}
                    onChange={(e) =>
                      setFormValues((prev) => ({
                        ...prev,
                        quantityUnit: e.target.value as QuantityUnit,
                      }))
                    }
                    aria-label="Target quantity unit"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                  </select>
                </div>
              </label>

              <label>
                Notes <span className="label-hint">Optional</span>
                <input
                  value={formValues.notes ?? ''}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Brand preference, store name..."
                />
              </label>
            </div>

            <div className="form-actions" style={{ marginTop: '14px' }}>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowAddForm(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={isSubmitting || !formValues.name?.trim()}
              >
                {isSubmitting ? 'Adding…' : 'Add to Shopping List'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Items List */}
      {isLoading ? (
        <section className="inventory-empty">
          <PanelState kind="loading" message="shopping list from Cloud Firestore" />
        </section>
      ) : filteredItems.length > 0 ? (
        <div style={{ display: 'grid', gap: '12px' }}>
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="metric-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 20px',
                minHeight: 'auto',
                opacity: item.isPurchased ? 0.65 : 1,
                borderLeft: item.isPurchased
                  ? '4px solid #10b981'
                  : item.source === 'auto-low-stock'
                  ? '4px solid #f59e0b'
                  : '4px solid #3b82f6',
              }}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={item.isPurchased}
                onChange={() => void togglePurchased(item.id)}
                aria-label={`Mark ${item.name} as purchased`}
                style={{
                  width: '20px',
                  height: '20px',
                  accentColor: '#13745c',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />

              {/* Main Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <strong
                    style={{
                      fontSize: '15px',
                      textDecoration: item.isPurchased ? 'line-through' : 'none',
                      color: item.isPurchased ? '#64748b' : '#1e293b',
                    }}
                  >
                    {item.name}
                  </strong>

                  {item.source === 'auto-low-stock' ? (
                    <span className="status-badge status-low">Auto: Low Stock</span>
                  ) : (
                    <span
                      style={{
                        background: '#f1f5f9',
                        color: '#475569',
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 600,
                      }}
                    >
                      Manual
                    </span>
                  )}

                  {item.containerId && (
                    <span className="assignment-pill" style={{ marginLeft: 0 }}>
                      {item.containerId}
                    </span>
                  )}

                  {item.targetQuantity !== undefined && (
                    <span style={{ fontSize: '12px', color: '#13745c', fontWeight: 600 }}>
                      Target: {item.targetQuantity} {item.quantityUnit}
                    </span>
                  )}
                </div>

                {item.notes && (
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                    {item.notes}
                  </p>
                )}

                {/* Reuse ML prediction forecast data if item is linked to container */}
                {!item.isPurchased &&
                  item.source === 'auto-low-stock' &&
                  prediction &&
                  prediction.status === 'success' &&
                  prediction.estimatedRemainingDays !== null && (
                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '12px',
                        color: '#0d9488',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span aria-hidden="true">✦</span>
                      <span>
                        ML Forecast: ~{prediction.estimatedRemainingDays} day{prediction.estimatedRemainingDays === 1 ? '' : 's'} remaining
                        {prediction.dailyConsumptionRateGrams
                          ? ` (Burn rate: ${prediction.dailyConsumptionRateGrams} g/day)`
                          : ''}
                      </span>
                    </div>
                  )}
              </div>

              {/* Delete Button */}
              <button
                className="secondary-button"
                type="button"
                onClick={() => void removeItem(item.id)}
                aria-label={`Remove ${item.name} from list`}
                style={{
                  fontSize: '12px',
                  padding: '4px 10px',
                  minHeight: '32px',
                  color: '#991b1b',
                  flexShrink: 0,
                }}
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      ) : (
        <section className="inventory-empty">
          <span aria-hidden="true" style={{ fontSize: '28px' }}>
            🛒
          </span>
          <h2>
            {filter === 'purchased'
              ? 'No purchased items'
              : filter === 'to-buy' && items.length > 0
              ? 'All items purchased!'
              : 'Your shopping list is empty'}
          </h2>
          <p>
            {filter === 'to-buy' && items.length > 0
              ? 'Great job! You have purchased everything on your active shopping list.'
              : 'Pantry items reaching low-stock thresholds are added automatically. You can also add custom items manually.'}
          </p>
          {items.length === 0 && (
            <button
              className="primary-button"
              type="button"
              onClick={() => setShowAddForm(true)}
            >
              + Add Item Manually
            </button>
          )}
        </section>
      )}
    </main>
  )
}

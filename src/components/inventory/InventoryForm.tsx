import { useState, type FormEvent } from 'react'
import type { PantryItem, PantryItemFormErrors, PantryItemInput, QuantityUnit } from '../../types/inventory'

type Props = { item?: PantryItem; onSave: (input: PantryItemInput) => Promise<void>; onCancel: () => void }
const categories = ['Grains & cereals', 'Baking', 'Snacks', 'Canned goods', 'Spices', 'Other']

function validate(input: PantryItemInput): PantryItemFormErrors {
  const errors: PantryItemFormErrors = {}
  if (!input.name.trim()) errors.name = 'Enter an item name.'
  if (!input.category) errors.category = 'Choose a category.'
  if (!Number.isFinite(input.initialQuantity) || input.initialQuantity < 0) errors.initialQuantity = 'Enter a quantity of zero or more.'
  if (input.minStockThreshold !== undefined && (!Number.isFinite(input.minStockThreshold) || input.minStockThreshold < 0)) {
    errors.minStockThreshold = 'Enter a threshold of zero or more.'
  }
  return errors
}

export function InventoryForm({ item, onSave, onCancel }: Props) {
  const [values, setValues] = useState<PantryItemInput>({
    name: item?.name ?? '',
    category: item?.category ?? '',
    initialQuantity: item?.initialQuantity ?? 0,
    quantityUnit: item?.quantityUnit ?? 'kg',
    expiryDate: item?.expiryDate ?? '',
    minStockThreshold: item?.minStockThreshold,
    containerId: item?.containerId ?? null,
    trackingMethod: item?.trackingMethod ?? (item?.containerId ? 'load-cell' : 'manual'),
  })
  const [errors, setErrors] = useState<PantryItemFormErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const update = <K extends keyof PantryItemInput>(key: K, value: PantryItemInput[K]) => setValues((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (!Object.keys(nextErrors).length) {
      setIsSaving(true)
      try {
        const assignedContainer = values.containerId && values.containerId.trim() ? values.containerId.trim() : null
        await onSave({
          ...values,
          name: values.name.trim(),
          containerId: assignedContainer,
          trackingMethod: assignedContainer === 'container-01' ? 'load-cell' : 'manual',
          expiryDate: values.expiryDate || undefined,
          minStockThreshold:
            typeof values.minStockThreshold === 'number' && !Number.isNaN(values.minStockThreshold) && values.minStockThreshold >= 0
              ? values.minStockThreshold
              : undefined,
        })
      } finally {
        setIsSaving(false)
      }
    }
  }
  return (
    <form className="inventory-form" noValidate onSubmit={submit}>
      <div className="form-grid">
        <label>
          Item name
          <input
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
            autoFocus
          />
          {errors.name && <span id="name-error" className="field-error">{errors.name}</span>}
        </label>
        <label>
          Category
          <select
            value={values.category}
            onChange={(event) => update('category', event.target.value)}
            aria-invalid={Boolean(errors.category)}
            aria-describedby={errors.category ? 'category-error' : undefined}
          >
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          {errors.category && <span id="category-error" className="field-error">{errors.category}</span>}
        </label>
        <label>
          Initial quantity <span className="label-hint">Manual entry</span>
          <div className="quantity-control">
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.initialQuantity}
              onChange={(event) => update('initialQuantity', Number(event.target.value))}
              aria-invalid={Boolean(errors.initialQuantity)}
              aria-describedby={errors.initialQuantity ? 'quantity-error' : undefined}
            />
            <select
              value={values.quantityUnit}
              onChange={(event) => update('quantityUnit', event.target.value as QuantityUnit)}
              aria-label="Quantity unit"
            >
              <option value="g">g</option>
              <option value="kg">kg</option>
            </select>
          </div>
          {errors.initialQuantity && <span id="quantity-error" className="field-error">{errors.initialQuantity}</span>}
        </label>
        <label>
          Min stock threshold <span className="label-hint">Optional (default 0.5 kg / 500 g)</span>
          <div className="quantity-control">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder={values.quantityUnit === 'kg' ? '0.5' : '500'}
              value={values.minStockThreshold !== undefined ? values.minStockThreshold : ''}
              onChange={(event) => {
                const val = event.target.value === '' ? undefined : Number(event.target.value)
                update('minStockThreshold', val)
              }}
              aria-invalid={Boolean(errors.minStockThreshold)}
              aria-describedby={errors.minStockThreshold ? 'threshold-error' : undefined}
            />
            <span style={{ padding: '0 10px', fontSize: '13px', alignSelf: 'center', color: '#64748b' }}>
              {values.quantityUnit}
            </span>
          </div>
          {errors.minStockThreshold && <span id="threshold-error" className="field-error">{errors.minStockThreshold}</span>}
        </label>
        <label>
          Expiry date <span className="label-hint">Optional</span>
          <input
            type="date"
            value={values.expiryDate}
            onChange={(event) => update('expiryDate', event.target.value)}
          />
        </label>
      </div>
      <div className="form-grid" style={{ marginTop: '0.75rem' }}>
        <label>
          Container assignment
          <select
            value={values.containerId ?? ''}
            onChange={(event) => {
              const val = event.target.value
              update('containerId', val || null)
              update('trackingMethod', val === 'container-01' ? 'load-cell' : 'manual')
            }}
          >
            <option value="">Unassigned (Manual tracking)</option>
            <option value="container-01">container-01 (IoT load-cell)</option>
          </select>
          <span className="label-hint">
            {values.containerId === 'container-01'
              ? 'Connected to IoT load-cell for automated weight telemetry.'
              : 'Tracked manually with baseline quantity. Can be assigned to a container at any time.'}
          </span>
        </label>
      </div>
      <div className="form-actions">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={isSaving}>Cancel</button>
        <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : item ? 'Save changes' : 'Add item'}</button>
      </div>
    </form>
  )
}

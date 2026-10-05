import { signInAnonymously } from 'firebase/auth'
import { collection, doc, getDocs, runTransaction, type DocumentData } from 'firebase/firestore'
import { getFirebaseServices, isFirebaseConfigured } from '../lib/firebase'
import { CONTAINER_ID, TRACKING_METHOD, type PantryItem, type PantryItemInput } from '../types/inventory'

const STORAGE_KEY = 'pantry-pulse-items-v1'
export const firestorePaths = { containers: 'containers', currentSensorState: 'currentSensorState', sensorReadings: 'sensorReadings', alerts: 'alerts', pantryItems: 'pantryItems' } as const
const seedItems: PantryItem[] = [{ id: 'jasmine-rice', name: 'Jasmine rice', category: 'Grains & cereals', initialQuantity: 3.5, quantityUnit: 'kg', expiryDate: '2027-01-15', containerId: CONTAINER_ID, trackingMethod: TRACKING_METHOD, createdAt: '2026-10-04T04:30:00.000Z', updatedAt: '2026-10-04T04:30:00.000Z' }]

function canUseStorage() { return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined' }
function readLocal(): PantryItem[] { if (!canUseStorage()) return seedItems; const saved = window.localStorage.getItem(STORAGE_KEY); if (!saved) { writeLocal(seedItems); return seedItems }; try { return JSON.parse(saved) as PantryItem[] } catch { writeLocal(seedItems); return seedItems } }
function writeLocal(items: PantryItem[]) { if (canUseStorage()) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) }
function toItem(id: string, data: DocumentData): PantryItem { return { id, name: data.name, category: data.category, initialQuantity: data.initialQuantity, quantityUnit: data.quantityUnit, ...(data.expiryDate ? { expiryDate: data.expiryDate } : {}), containerId: CONTAINER_ID, trackingMethod: TRACKING_METHOD, createdAt: data.createdAt, updatedAt: data.updatedAt } }
async function userScope() { const services = getFirebaseServices(); if (!services) throw new Error('Firebase is not configured.'); const user = services.auth.currentUser ?? (await signInAnonymously(services.auth)).user; return { db: services.db, uid: user.uid } }
function makeItem(input: PantryItemInput, id: string = crypto.randomUUID(), existing?: PantryItem): PantryItem { const now = new Date().toISOString(); return { ...input, id, containerId: CONTAINER_ID, trackingMethod: TRACKING_METHOD, createdAt: existing?.createdAt ?? now, updatedAt: now } }

export const inventoryRepository = {
  isRemote: isFirebaseConfigured,
  async getAll(): Promise<PantryItem[]> {
    if (!isFirebaseConfigured()) return readLocal()
    const { db, uid } = await userScope(); const snapshot = await getDocs(collection(db, 'users', uid, firestorePaths.pantryItems))
    return snapshot.docs.map((item) => toItem(item.id, item.data()))
  },
  async create(input: PantryItemInput): Promise<PantryItem> {
    if (!isFirebaseConfigured()) { const items = readLocal(); if (items.some((item) => item.containerId === CONTAINER_ID)) throw new Error('container-01 already has an active item.'); const item = makeItem(input); writeLocal([...items, item]); return item }
    const { db, uid } = await userScope(); const item = makeItem(input); const itemRef = doc(db, 'users', uid, firestorePaths.pantryItems, item.id); const containerRef = doc(db, 'users', uid, firestorePaths.containers, CONTAINER_ID)
    await runTransaction(db, async (transaction) => { const container = await transaction.get(containerRef); if (container.exists() && container.data().activeItemId) throw new Error('container-01 already has an active item.'); transaction.set(itemRef, item); transaction.set(containerRef, { id: CONTAINER_ID, activeItemId: item.id, trackingMethod: TRACKING_METHOD, updatedAt: item.updatedAt }) })
    return item
  },
  async update(id: string, input: PantryItemInput): Promise<PantryItem> {
    if (!isFirebaseConfigured()) { const items = readLocal(); const existing = items.find((item) => item.id === id); if (!existing) throw new Error('This pantry item no longer exists.'); const item = makeItem(input, id, existing); writeLocal(items.map((current) => current.id === id ? item : current)); return item }
    const { db, uid } = await userScope(); const itemRef = doc(db, 'users', uid, firestorePaths.pantryItems, id); let updated: PantryItem | undefined
    await runTransaction(db, async (transaction) => { const existing = await transaction.get(itemRef); if (!existing.exists()) throw new Error('This pantry item no longer exists.'); updated = makeItem(input, id, toItem(id, existing.data())); transaction.set(itemRef, updated) })
    if (!updated) throw new Error('Unable to update this pantry item.'); return updated
  },
  async delete(id: string): Promise<void> {
    if (!isFirebaseConfigured()) { writeLocal(readLocal().filter((item) => item.id !== id)); return }
    const { db, uid } = await userScope(); const itemRef = doc(db, 'users', uid, firestorePaths.pantryItems, id); const containerRef = doc(db, 'users', uid, firestorePaths.containers, CONTAINER_ID)
    await runTransaction(db, async (transaction) => { transaction.delete(itemRef); transaction.set(containerRef, { id: CONTAINER_ID, activeItemId: null, trackingMethod: TRACKING_METHOD, updatedAt: new Date().toISOString() }) })
  },
}

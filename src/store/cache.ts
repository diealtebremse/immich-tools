/**
 * Lokaler Speicher. Merkmale sind an die Asset-ID gebunden und ueber Laeufe hinweg
 * gueltig; der Fortschritt wird nach jeder Entscheidung geschrieben, damit 75
 * Entscheidungen keinen Reload kosten.
 */
import type { Slot } from '../domain/types'

const DB = 'album-kurator'
const MERKMALE = 'merkmale'
const FORTSCHRITT = 'fortschritt'

export type Merkmal = { hash: string; schaerfe: number }

const oeffne = (): Promise<IDBDatabase> =>
  new Promise((ja, nein) => {
    const anfrage = indexedDB.open(DB, 1)
    anfrage.onupgradeneeded = () => {
      const db = anfrage.result
      if (!db.objectStoreNames.contains(MERKMALE)) db.createObjectStore(MERKMALE)
      if (!db.objectStoreNames.contains(FORTSCHRITT)) db.createObjectStore(FORTSCHRITT)
    }
    anfrage.onsuccess = () => ja(anfrage.result)
    anfrage.onerror = () => nein(anfrage.error)
  })

const lauf = <T>(store: string, modus: IDBTransactionMode, arbeit: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  oeffne().then(
    (db) =>
      new Promise<T>((ja, nein) => {
        const t = db.transaction(store, modus)
        const anfrage = arbeit(t.objectStore(store))
        anfrage.onsuccess = () => ja(anfrage.result)
        anfrage.onerror = () => nein(anfrage.error)
      }),
  )

export const ladeMerkmale = async (): Promise<Map<string, Merkmal>> => {
  const db = await oeffne()
  return new Promise((ja, nein) => {
    const t = db.transaction(MERKMALE, 'readonly').objectStore(MERKMALE)
    const karte = new Map<string, Merkmal>()
    const cursor = t.openCursor()
    cursor.onsuccess = () => {
      const c = cursor.result
      if (!c) return ja(karte)
      karte.set(String(c.key), c.value as Merkmal)
      c.continue()
    }
    cursor.onerror = () => nein(cursor.error)
  })
}

export const speichereMerkmale = async (neue: Map<string, Merkmal>): Promise<void> => {
  if (neue.size === 0) return
  const db = await oeffne()
  await new Promise<void>((ja, nein) => {
    const t = db.transaction(MERKMALE, 'readwrite')
    const store = t.objectStore(MERKMALE)
    for (const [id, m] of neue) store.put(m, id)
    t.oncomplete = () => ja()
    t.onerror = () => nein(t.error)
  })
}

export const leereMerkmale = (): Promise<unknown> =>
  lauf(MERKMALE, 'readwrite', (s) => s.clear())

export const ladeFortschritt = (schluessel: string): Promise<Slot[] | undefined> =>
  lauf<Slot[] | undefined>(FORTSCHRITT, 'readonly', (s) => s.get(schluessel))

export const speichereFortschritt = (schluessel: string, slots: Slot[]): Promise<unknown> =>
  lauf(FORTSCHRITT, 'readwrite', (s) => s.put(slots, schluessel))

export const verwirfFortschritt = (schluessel: string): Promise<unknown> =>
  lauf(FORTSCHRITT, 'readwrite', (s) => s.delete(schluessel))

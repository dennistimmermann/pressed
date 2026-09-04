/**
 * The one opener of IndexedDB `pressed`. Two openers on different versions deadlock each other,
 * so every store the app has is created here, in one `onupgradeneeded`.
 *
 * ~30 lines of native API is cheaper than a wrapper library.
 */
const NAME = 'pressed'
const VERSION = 2

export type Store = 'templates' | 'icons'

let db: Promise<IDBDatabase> | null = null

export function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION)
    req.onupgradeneeded = () => {
      // v1 → v2 only *adds* `icons`: an existing database keeps its templates.
      const names = req.result.objectStoreNames
      if (!names.contains('templates')) req.result.createObjectStore('templates', { keyPath: 'id' })
      if (!names.contains('icons')) req.result.createObjectStore('icons', { keyPath: 'name' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return db
}

export async function tx<T>(store: Store, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const object = (await open()).transaction(store, mode).objectStore(store)
  return new Promise((resolve, reject) => {
    const req = run(object)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

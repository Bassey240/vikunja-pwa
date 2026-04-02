const DB_NAME = 'vikunja-pwa-offline'
const DB_VERSION = 1

let dbInstance: IDBDatabase | null = null

export async function openOfflineDB(): Promise<IDBDatabase> {
	if (dbInstance) {
		return dbInstance
	}

	if (typeof indexedDB === 'undefined') {
		throw new Error('IndexedDB is not available in this environment.')
	}

	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)

		request.onupgradeneeded = event => {
			const db = (event.target as IDBOpenDBRequest).result

			if (!db.objectStoreNames.contains('mutations')) {
				const store = db.createObjectStore('mutations', {keyPath: 'id'})
				store.createIndex('status', 'status', {unique: false})
				store.createIndex('createdAt', 'createdAt', {unique: false})
			}

			if (!db.objectStoreNames.contains('snapshot')) {
				db.createObjectStore('snapshot', {keyPath: 'key'})
			}
		}

		request.onsuccess = () => {
			dbInstance = request.result
			dbInstance.onversionchange = () => {
				dbInstance?.close()
				dbInstance = null
			}
			resolve(dbInstance)
		}

		request.onerror = () => reject(request.error)
	})
}

export function closeOfflineDB(): void {
	if (!dbInstance) {
		return
	}

	dbInstance.close()
	dbInstance = null
}

export async function idbPut<T>(storeName: string, value: T): Promise<void> {
	const db = await openOfflineDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite')
		tx.objectStore(storeName).put(value)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
		tx.onabort = () => reject(tx.error)
	})
}

export async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
	const db = await openOfflineDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly')
		const request = tx.objectStore(storeName).get(key)
		request.onsuccess = () => resolve(request.result as T | undefined)
		request.onerror = () => reject(request.error)
	})
}

export async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
	const db = await openOfflineDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite')
		tx.objectStore(storeName).delete(key)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
		tx.onabort = () => reject(tx.error)
	})
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
	const db = await openOfflineDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly')
		const request = tx.objectStore(storeName).getAll()
		request.onsuccess = () => resolve(request.result as T[])
		request.onerror = () => reject(request.error)
	})
}

export async function idbGetAllByIndex<T>(
	storeName: string,
	indexName: string,
	value: IDBValidKey,
): Promise<T[]> {
	const db = await openOfflineDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly')
		const request = tx.objectStore(storeName).index(indexName).getAll(value)
		request.onsuccess = () => resolve(request.result as T[])
		request.onerror = () => reject(request.error)
	})
}

export async function idbCount(
	storeName: string,
	indexName?: string,
	value?: IDBValidKey,
): Promise<number> {
	const db = await openOfflineDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly')
		const target = indexName
			? tx.objectStore(storeName).index(indexName)
			: tx.objectStore(storeName)
		const request = value === undefined ? target.count() : target.count(value)
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

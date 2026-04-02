export async function getOfflineSnapshot(page) {
	return page.evaluate(async () => {
		if (typeof indexedDB === 'undefined') {
			return null
		}

		const db = await new Promise((resolve, reject) => {
			const request = indexedDB.open('vikunja-pwa-offline', 1)
			request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'))
			request.onsuccess = () => resolve(request.result)
		})
		try {
			if (!db.objectStoreNames.contains('snapshot')) {
				return null
			}

			const record = await new Promise((resolve, reject) => {
				const tx = db.transaction('snapshot', 'readonly')
				const request = tx.objectStore('snapshot').get('current')
				request.onerror = () => reject(request.error || new Error('Failed to read snapshot.'))
				request.onsuccess = () => resolve(request.result)
				tx.onabort = () => reject(tx.error || new Error('Failed to read snapshot.'))
			})
			return record?.data || null
		} finally {
			db.close()
		}
	})
}

export async function getOfflineMutations(page) {
	return page.evaluate(async () => {
		if (typeof indexedDB === 'undefined') {
			return []
		}

		const db = await new Promise((resolve, reject) => {
			const request = indexedDB.open('vikunja-pwa-offline', 1)
			request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'))
			request.onsuccess = () => resolve(request.result)
		})
		try {
			if (!db.objectStoreNames.contains('mutations')) {
				return []
			}

			const records = await new Promise((resolve, reject) => {
				const tx = db.transaction('mutations', 'readonly')
				const request = tx.objectStore('mutations').getAll()
				request.onerror = () => reject(request.error || new Error('Failed to read offline mutations.'))
				request.onsuccess = () => resolve(request.result)
				tx.onabort = () => reject(tx.error || new Error('Failed to read offline mutations.'))
			})
			return Array.isArray(records)
				? records.sort((left, right) => `${left.createdAt || ''}`.localeCompare(`${right.createdAt || ''}`))
				: []
		} finally {
			db.close()
		}
	})
}

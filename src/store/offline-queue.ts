import {idbCount, idbDelete, idbGet, idbGetAll, idbGetAllByIndex, idbPut} from './offline-db'

export type OfflineMutationMethod = 'POST' | 'PUT' | 'DELETE' | 'PATCH'
export type OfflineMutationEntityType = 'task' | 'project' | 'label' | 'comment' | 'relation' | 'assignee'
export type OfflineMutationStatus = 'pending' | 'syncing' | 'failed' | 'succeeded'

export interface OfflineMutationEntry {
	id: string
	createdAt: string
	type: string
	endpoint: string
	method: OfflineMutationMethod
	body: unknown
	metadata: {
		entityType: OfflineMutationEntityType
		entityId: number | null
		parentEntityId?: number
		description: string
	}
	status: OfflineMutationStatus
	retries: number
	lastError?: string
}

const STORE = 'mutations'

let tempIdCounter = -1

export async function enqueueMutation(
	entry: Omit<OfflineMutationEntry, 'id' | 'createdAt' | 'status' | 'retries'>,
): Promise<string> {
	const id = crypto.randomUUID()
	const fullEntry: OfflineMutationEntry = {
		...entry,
		id,
		createdAt: new Date().toISOString(),
		status: 'pending',
		retries: 0,
	}
	await idbPut(STORE, fullEntry)
	return id
}

export async function getAllMutations(): Promise<OfflineMutationEntry[]> {
	const all = await idbGetAll<OfflineMutationEntry>(STORE)
	return all.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function getPendingMutations(): Promise<OfflineMutationEntry[]> {
	const entries = await idbGetAllByIndex<OfflineMutationEntry>(STORE, 'status', 'pending')
	return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function getPendingCount(): Promise<number> {
	return idbCount(STORE, 'status', 'pending')
}

export async function getFailedCount(): Promise<number> {
	return idbCount(STORE, 'status', 'failed')
}

export async function markSyncing(id: string): Promise<void> {
	const entry = await idbGet<OfflineMutationEntry>(STORE, id)
	if (!entry) {
		return
	}

	entry.status = 'syncing'
	await idbPut(STORE, entry)
}

export async function markSucceeded(id: string): Promise<void> {
	await idbDelete(STORE, id)
}

export async function markFailed(id: string, error: string): Promise<void> {
	const entry = await idbGet<OfflineMutationEntry>(STORE, id)
	if (!entry) {
		return
	}

	entry.status = 'failed'
	entry.retries += 1
	entry.lastError = error
	await idbPut(STORE, entry)
}

export async function retryMutation(id: string): Promise<void> {
	const entry = await idbGet<OfflineMutationEntry>(STORE, id)
	if (!entry) {
		return
	}

	entry.status = 'pending'
	await idbPut(STORE, entry)
}

export async function removeMutation(id: string): Promise<void> {
	await idbDelete(STORE, id)
}

export async function clearSucceeded(): Promise<void> {
	const succeeded = await idbGetAllByIndex<OfflineMutationEntry>(STORE, 'status', 'succeeded')
	for (const entry of succeeded) {
		await idbDelete(STORE, entry.id)
	}
}

export async function remapTempId(tempId: number, realId: number): Promise<void> {
	const all = await getAllMutations()
	for (const entry of all) {
		if (entry.status !== 'pending' && entry.status !== 'failed') {
			continue
		}

		let changed = false

		if (entry.metadata.entityId === tempId) {
			entry.metadata.entityId = realId
			changed = true
		}

		if (entry.metadata.parentEntityId === tempId) {
			entry.metadata.parentEntityId = realId
			changed = true
		}

		if (entry.endpoint.includes(`/${tempId}`)) {
			entry.endpoint = entry.endpoint.replaceAll(`/${tempId}`, `/${realId}`)
			changed = true
		}

		if (entry.body !== null && entry.body !== undefined) {
			const bodyString = JSON.stringify(entry.body)
			if (bodyString.includes(`${tempId}`)) {
				entry.body = JSON.parse(
					bodyString.replace(new RegExp(`\\b${tempId}\\b`, 'g'), `${realId}`),
				) as unknown
				changed = true
			}
		}

		if (changed) {
			await idbPut(STORE, entry)
		}
	}
}

export function getNextTempId(): number {
	return tempIdCounter--
}

export function isTempId(id: number): boolean {
	return id < 0
}

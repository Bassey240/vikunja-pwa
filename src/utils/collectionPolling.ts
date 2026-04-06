export interface CollectionPollingConfig {
	taskIntervalMs: number
	projectIntervalMs: number
	mutationDebounceMs: number
}

const DEFAULT_COLLECTION_POLLING_CONFIG: CollectionPollingConfig = {
	taskIntervalMs: 30_000,
	projectIntervalMs: 60_000,
	mutationDebounceMs: 5_000,
}

let lastCollectionMutationAt = 0

export function markCollectionMutationActivity(at = Date.now()) {
	lastCollectionMutationAt = Math.max(lastCollectionMutationAt, at)
}

export function getLastCollectionMutationAt() {
	return lastCollectionMutationAt
}

export function getCollectionPollingConfig(): CollectionPollingConfig {
	if (typeof window === 'undefined') {
		return DEFAULT_COLLECTION_POLLING_CONFIG
	}

	const overrides = (window as Window & {
		__VIKUNJA_POLLING__?: Partial<CollectionPollingConfig>
	}).__VIKUNJA_POLLING__

	return {
		taskIntervalMs: normalizePositivePollingValue(
			overrides?.taskIntervalMs,
			DEFAULT_COLLECTION_POLLING_CONFIG.taskIntervalMs,
		),
		projectIntervalMs: normalizePositivePollingValue(
			overrides?.projectIntervalMs,
			DEFAULT_COLLECTION_POLLING_CONFIG.projectIntervalMs,
		),
		mutationDebounceMs: normalizeNonNegativePollingValue(
			overrides?.mutationDebounceMs,
			DEFAULT_COLLECTION_POLLING_CONFIG.mutationDebounceMs,
		),
	}
}

function normalizePositivePollingValue(value: unknown, fallback: number) {
	const numeric = Number(value)
	return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

function normalizeNonNegativePollingValue(value: unknown, fallback: number) {
	const numeric = Number(value)
	return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback
}

// Kept free of '@/' imports so the node test runner can load it directly.
export interface LoadBackoffState {
	failures: number
	retryAt: number
}

const BASE_DELAY_MS = 5_000
const MAX_DELAY_MS = 300_000

export const initialLoadBackoff: LoadBackoffState = Object.freeze({
	failures: 0,
	retryAt: 0,
})

export function canAttemptLoad(state: LoadBackoffState, now = Date.now()): boolean {
	return now >= state.retryAt
}

export function recordLoadFailure(
	state: LoadBackoffState,
	statusCode: number | null | undefined,
	now = Date.now(),
): LoadBackoffState {
	const failures = state.failures + 1
	if (statusCode === 401) {
		return {failures, retryAt: Number.POSITIVE_INFINITY}
	}

	const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (failures - 1))
	return {failures, retryAt: now + delay}
}

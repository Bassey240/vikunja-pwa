/* Replay error policy, kept pure so node can unit-test it directly.
 *
 * Vikunja 2.4's atomic position upserts (unique project/index constraint) can
 * answer a replayed write with a transient 409 that succeeds on a retry, so
 * 409 must NOT be treated like the other 4xx statuses, which mean the
 * mutation can never apply (permissions, validation, gone entities). */

export const REPLAY_MAX_RETRIES = 3
export const REPLAY_RETRY_DELAY_MS = 300

export function isRetriableReplayStatus(statusCode: number | null | undefined) {
	return statusCode === 409
}

/* A failure surfaces in the conflict list when the user has to resolve it:
 * every non-retriable 4xx immediately, a 409 only once its entry has burned
 * all replay passes. retriesAfterFailure is the entry's retry count AFTER the
 * current failure is recorded. */
export function shouldSurfaceReplayConflict(
	statusCode: number | null | undefined,
	retriesAfterFailure: number,
	maxRetries: number = REPLAY_MAX_RETRIES,
) {
	if (!statusCode || statusCode < 400 || statusCode >= 500) {
		return false
	}
	if (isRetriableReplayStatus(statusCode)) {
		return retriesAfterFailure >= maxRetries
	}
	return true
}

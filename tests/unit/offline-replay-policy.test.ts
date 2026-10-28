import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
	REPLAY_MAX_RETRIES,
	isRetriableReplayStatus,
	shouldSurfaceReplayConflict,
} from '../../src/store/offline-replay-policy.ts'

test('only 409 is a retriable replay status', () => {
	assert.equal(isRetriableReplayStatus(409), true)
	for (const status of [400, 401, 403, 404, 422, 500, 502, null]) {
		assert.equal(isRetriableReplayStatus(status), false, `status ${status}`)
	}
})

test('non-retriable 4xx surfaces as a conflict immediately', () => {
	assert.equal(shouldSurfaceReplayConflict(403, 1), true)
	assert.equal(shouldSurfaceReplayConflict(422, 1), true)
})

test('409 stays queued until retries are exhausted', () => {
	assert.equal(shouldSurfaceReplayConflict(409, 1), false)
	assert.equal(shouldSurfaceReplayConflict(409, REPLAY_MAX_RETRIES - 1), false)
	assert.equal(shouldSurfaceReplayConflict(409, REPLAY_MAX_RETRIES), true)
})

test('5xx and network errors never surface as conflicts', () => {
	assert.equal(shouldSurfaceReplayConflict(500, REPLAY_MAX_RETRIES), false)
	assert.equal(shouldSurfaceReplayConflict(null, REPLAY_MAX_RETRIES), false)
})

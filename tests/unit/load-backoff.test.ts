import assert from 'node:assert/strict'
import test from 'node:test'
import {canAttemptLoad, initialLoadBackoff, recordLoadFailure} from '../../src/store/load-backoff.ts'

test('fresh state allows an attempt', () => {
	assert.equal(canAttemptLoad(initialLoadBackoff, 0), true)
})

test('a 401 blocks every later attempt', () => {
	const blocked = recordLoadFailure(initialLoadBackoff, 401, 1_000)
	assert.equal(blocked.retryAt, Number.POSITIVE_INFINITY)
	assert.equal(canAttemptLoad(blocked, 1_001), false)
	assert.equal(canAttemptLoad(blocked, Number.MAX_SAFE_INTEGER), false)
})

test('transient failures back off exponentially and cap at five minutes', () => {
	let state = initialLoadBackoff
	const now = 10_000
	const expectedDelays = [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]
	for (const expected of expectedDelays) {
		state = recordLoadFailure(state, 500, now)
		assert.equal(state.retryAt, now + expected)
	}
})

test('a network error (no status code) backs off like a transient failure', () => {
	const state = recordLoadFailure(initialLoadBackoff, null, 2_000)
	assert.equal(state.retryAt, 7_000)
	assert.equal(canAttemptLoad(state, 6_999), false)
	assert.equal(canAttemptLoad(state, 7_000), true)
})

// Regression for the /api/teams storm: an effect that re-fires on every
// loading-flag flip must be capped by the gate instead of looping.
test('an effect-style retry loop makes exactly one request after a 401', () => {
	let state = initialLoadBackoff
	let requests = 0
	const now = 50_000

	for (let renderPass = 0; renderPass < 10_000; renderPass++) {
		if (!canAttemptLoad(state, now + renderPass)) {
			continue
		}
		requests += 1
		state = recordLoadFailure(state, 401, now + renderPass)
	}

	assert.equal(requests, 1)
})

test('an effect-style retry loop stays bounded under persistent server errors', () => {
	let state = initialLoadBackoff
	let requests = 0
	const start = 0
	const tenMinutes = 600_000

	for (let elapsed = 0; elapsed < tenMinutes; elapsed += 5) {
		if (!canAttemptLoad(state, start + elapsed)) {
			continue
		}
		requests += 1
		state = recordLoadFailure(state, 500, start + elapsed)
	}

	// 5s, 10s, 20s, 40s, 80s, 160s, then 300s steps over ten minutes.
	assert.ok(requests <= 8, `expected at most 8 requests in 10 minutes, saw ${requests}`)
})

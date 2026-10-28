import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
	clearLoadError,
	resetLoadErrorOwnership,
	setLoadError,
} from '../../src/store/slices/load-error.ts'

function createStore() {
	const state = {error: null as string | null}
	return {
		state,
		set: (partial: {error: string | null}) => Object.assign(state, partial),
		get: () => state,
	}
}

test('a silent poll failure never paints the banner', () => {
	resetLoadErrorOwnership()
	const store = createStore()

	setLoadError(store.set, 'tasks:today', 'expired token', true)

	assert.equal(store.state.error, null)
})

test('a non-silent failure paints the banner', () => {
	resetLoadErrorOwnership()
	const store = createStore()

	setLoadError(store.set, 'tasks:today', 'expired token', false)

	assert.equal(store.state.error, 'expired token')
})

test('a later success on the same load path clears the banner', () => {
	resetLoadErrorOwnership()
	const store = createStore()

	setLoadError(store.set, 'tasks:today', 'expired token', false)
	clearLoadError(store.set, store.get, 'tasks:today')

	assert.equal(store.state.error, null)
})

test('a success on a different load path leaves the banner alone', () => {
	resetLoadErrorOwnership()
	const store = createStore()

	setLoadError(store.set, 'tasks:today', 'expired token', false)
	clearLoadError(store.set, store.get, 'projects:list')

	assert.equal(store.state.error, 'expired token')
})

test('a success does not clear an error another writer set afterwards', () => {
	resetLoadErrorOwnership()
	const store = createStore()

	setLoadError(store.set, 'tasks:today', 'expired token', false)
	// A mutation failure, e.g. from task-detail.ts, overwrites the banner.
	store.set({error: 'Could not save the task.'})
	clearLoadError(store.set, store.get, 'tasks:today')

	assert.equal(store.state.error, 'Could not save the task.')
})

test('a silent failure does not claim ownership, so it cannot clear a real error', () => {
	resetLoadErrorOwnership()
	const store = createStore()

	store.set({error: 'Could not save the task.'})
	setLoadError(store.set, 'tasks:today', 'expired token', true)
	clearLoadError(store.set, store.get, 'tasks:today')

	assert.equal(store.state.error, 'Could not save the task.')
})

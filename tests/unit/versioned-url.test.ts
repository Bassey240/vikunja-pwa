import assert from 'node:assert/strict'
import {test} from 'node:test'
import {resolveVersionedUrl} from '../../server/vikunja-client.mjs'

test('a v1-pinned base URL resolves both versions', () => {
	const base = 'https://vikunja.example.test/api/v1'
	assert.equal(resolveVersionedUrl(base, 'tasks/all').toString(), 'https://vikunja.example.test/api/v1/tasks/all')
	assert.equal(
		resolveVersionedUrl(base, 'tasks/all', 'v2').toString(),
		'https://vikunja.example.test/api/v2/tasks/all',
	)
})

test('v1 is the default version', () => {
	assert.equal(
		resolveVersionedUrl('https://x.test/api/v1', 'info').toString(),
		'https://x.test/api/v1/info',
	)
})

test('a base URL stored without the version suffix still resolves', () => {
	assert.equal(
		resolveVersionedUrl('https://x.test', 'info', 'v2').toString(),
		'https://x.test/api/v2/info',
	)
})

test('instances served under a path prefix keep the prefix', () => {
	assert.equal(
		resolveVersionedUrl('https://x.test/vikunja/api/v1', 'tasks/1', 'v2').toString(),
		'https://x.test/vikunja/api/v2/tasks/1',
	)
})

test('trailing slashes and leading route slashes are tolerated', () => {
	assert.equal(
		resolveVersionedUrl('https://x.test/api/v1/', '/tasks/1').toString(),
		'https://x.test/api/v1/tasks/1',
	)
})

test('a base URL already pinned to v2 can still address v1', () => {
	assert.equal(
		resolveVersionedUrl('https://x.test/api/v2', 'info', 'v1').toString(),
		'https://x.test/api/v1/info',
	)
})

test('nested routes resolve relative to the version root, not the last segment', () => {
	// A bare `new URL(route, base)` without the trailing slash would drop
	// the version segment here.
	assert.equal(
		resolveVersionedUrl('https://x.test/api/v1', 'projects/2/views/7/buckets').toString(),
		'https://x.test/api/v1/projects/2/views/7/buckets',
	)
})

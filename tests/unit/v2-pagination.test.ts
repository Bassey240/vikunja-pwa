import assert from 'node:assert/strict'
import {test} from 'node:test'
import {collectV2Pages, stripSchemaField} from '../../server/vikunja-client.mjs'

function envelopePager(pages: Array<Record<string, unknown>>) {
	const seen: Array<{page: number; perPage: number}> = []
	return {
		seen,
		fetchPage: async ({page, perPage}: {page: number; perPage: number}) => {
			seen.push({page, perPage})
			return pages[page - 1]
		},
	}
}

test('a single-page envelope yields its items', async () => {
	const pager = envelopePager([
		{items: [{id: 1}, {id: 2}], page: 1, per_page: 100, total: 2, total_pages: 1},
	])

	assert.deepEqual(await collectV2Pages(pager.fetchPage), [{id: 1}, {id: 2}])
	assert.equal(pager.seen.length, 1)
})

test('total_pages drives the walk across pages', async () => {
	const pager = envelopePager([
		{items: [{id: 1}], page: 1, per_page: 1, total: 3, total_pages: 3},
		{items: [{id: 2}], page: 2, per_page: 1, total: 3, total_pages: 3},
		{items: [{id: 3}], page: 3, per_page: 1, total: 3, total_pages: 3},
	])

	assert.deepEqual(await collectV2Pages(pager.fetchPage), [{id: 1}, {id: 2}, {id: 3}])
	assert.deepEqual(pager.seen.map(entry => entry.page), [1, 2, 3])
})

test('an empty collection yields an empty array, not the envelope', async () => {
	const pager = envelopePager([
		{items: null, page: 1, per_page: 100, total: 0, total_pages: 0},
	])

	assert.deepEqual(await collectV2Pages(pager.fetchPage), [])
})

test('a short page ends the walk when the server omits total_pages', async () => {
	const pager = envelopePager([
		{items: [{id: 1}], page: 1, per_page: 100},
	])

	assert.deepEqual(await collectV2Pages(pager.fetchPage), [{id: 1}])
	assert.equal(pager.seen.length, 1)
})

test('a server that never reports the last page is bounded by maxPages', async () => {
	let calls = 0
	const items = await collectV2Pages(async () => {
		calls += 1
		return {items: [{id: calls}], per_page: 1}
	}, {perPage: 1, maxPages: 4})

	assert.equal(calls, 4)
	assert.equal(items.length, 4)
})

test('the Huma $schema field is stripped from every item', async () => {
	const pager = envelopePager([
		{
			$schema: '/api/v2/schemas/PaginatedTimeEntry.json',
			items: [{$schema: '/api/v2/schemas/TimeEntry.json', id: 7, task_id: 3}],
			page: 1,
			per_page: 100,
			total: 1,
			total_pages: 1,
		},
	])

	assert.deepEqual(await collectV2Pages(pager.fetchPage), [{id: 7, task_id: 3}])
})

test('stripSchemaField leaves non-objects alone', () => {
	assert.equal(stripSchemaField(null), null)
	assert.equal(stripSchemaField('text'), 'text')
	assert.deepEqual(stripSchemaField([{$schema: 'x'}]), [{$schema: 'x'}])
	assert.deepEqual(stripSchemaField({$schema: 'x', id: 1}), {id: 1})
})

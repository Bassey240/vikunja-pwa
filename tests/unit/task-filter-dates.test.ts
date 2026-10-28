import assert from 'node:assert/strict'
import {test} from 'node:test'
import {taskFiltersToVikunjaFilter} from '../../src/store/task-filter-query.ts'
import {getFilterTimezone} from '../../src/utils/date-helpers.ts'
import {
	DUE_FILTER_EXPRESSIONS,
	getDueFilterExpressionPattern,
	getDueFilterRangesBySpecificity,
	getLegacyDueFilterPatterns,
} from '../../src/utils/due-filter-expressions.ts'
import type {TaskFilters} from '../../src/hooks/useFilters.ts'

process.env.TZ = 'Europe/Amsterdam'

function filters(due: TaskFilters['due']): TaskFilters {
	return {
		status: 'all',
		projectId: 0,
		labelId: 0,
		priority: 'any',
		due,
		title: '',
		description: '',
		sortBy: 'position',
		sortOrder: 'asc',
	}
}

/* Vikunja resolves date math server-side in the timezone we send with
 * filter_timezone (docs: "now", "now/d" = start of today, "now/d+1d"). The
 * client must express ranges that way instead of computing calendar dates
 * itself — a client-computed date is already stale if the request crosses
 * midnight, and it duplicates logic the server owns. */

test('due=today asks the server for its own start-of-day range', () => {
	assert.equal(taskFiltersToVikunjaFilter(filters('today')), 'due_date >= now/d && due_date < now/d+1d')
})

test('due=tomorrow shifts the same range by a day', () => {
	assert.equal(taskFiltersToVikunjaFilter(filters('tomorrow')), 'due_date >= now/d+1d && due_date < now/d+2d')
})

test('due=overdue is anything before the start of today, excluding undated tasks', () => {
	assert.equal(taskFiltersToVikunjaFilter(filters('overdue')), 'due_date < now/d && due_date != 0')
})

test('due=next7 spans today through seven days out', () => {
	assert.equal(taskFiltersToVikunjaFilter(filters('next7')), 'due_date >= now/d && due_date < now/d+7d')
})

test('due=none still matches the unset sentinel', () => {
	assert.equal(taskFiltersToVikunjaFilter(filters('none')), 'due_date = 0')
})

test('no client-computed calendar dates leak into any due filter', () => {
	for (const due of ['today', 'tomorrow', 'overdue', 'next7', 'none'] as const) {
		assert.doesNotMatch(
			taskFiltersToVikunjaFilter(filters(due)),
			/\d{4}-\d{2}-\d{2}/,
			`${due} must not embed a literal date`,
		)
	}
})

test('every emitted due filter is recognised by its own read-back pattern', () => {
	// Builder and saved-filter parser share one table, so a change to an
	// expression can never silently break the round trip.
	for (const due of getDueFilterRangesBySpecificity()) {
		const emitted = taskFiltersToVikunjaFilter(filters(due))
		assert.equal(emitted, DUE_FILTER_EXPRESSIONS[due])
		assert.match(emitted, getDueFilterExpressionPattern(due))
	}
})

test('the read-back order tries specific ranges before broader ones', () => {
	const ordered = getDueFilterRangesBySpecificity()
	// "due_date = 0" must not be stripped out of "due_date != 0" first.
	assert.equal(ordered[ordered.length - 1], 'none')
})

test('getFilterTimezone reports the zone the server resolves the math in', () => {
	assert.equal(getFilterTimezone('America/New_York'), 'America/New_York')
	assert.equal(getFilterTimezone(''), 'Europe/Amsterdam')
	assert.equal(getFilterTimezone(null), 'Europe/Amsterdam')
})

test('filters saved by earlier versions still map to their due range', () => {
	// Literal-date filters written before the switch to date math.
	const day = (offset: number) => {
		const date = new Date()
		date.setDate(date.getDate() + offset)
		const month = `${date.getMonth() + 1}`.padStart(2, '0')
		const dayOfMonth = `${date.getDate()}`.padStart(2, '0')
		return `${date.getFullYear()}-${month}-${dayOfMonth}`
	}

	const legacy: Array<[TaskFilters['due'], string]> = [
		['today', `due_date = "${day(0)}"`],
		['tomorrow', `due_date = "${day(1)}"`],
		['overdue', `due_date < "${day(0)}" && due_date != 0`],
		['next7', `due_date >= "${day(0)}" && due_date <= "${day(7)}"`],
	]

	for (const [due, query] of legacy) {
		const matched = getLegacyDueFilterPatterns().find(entry => entry.pattern.test(query))
		assert.equal(matched?.due, due, `legacy ${due} filter must still be recognised`)
	}
})

test('legacy overdue is not mistaken for the plain today filter', () => {
	const today = new Date()
	const month = `${today.getMonth() + 1}`.padStart(2, '0')
	const dayOfMonth = `${today.getDate()}`.padStart(2, '0')
	const iso = `${today.getFullYear()}-${month}-${dayOfMonth}`
	const overdue = `due_date < "${iso}" && due_date != 0`
	assert.equal(getLegacyDueFilterPatterns().find(entry => entry.pattern.test(overdue))?.due, 'overdue')
})

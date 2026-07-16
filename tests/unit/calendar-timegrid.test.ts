import assert from 'node:assert/strict'
import test from 'node:test'
import {buildTimeGridDays} from '../../src/utils/calendar-timegrid.ts'
import {localDayKey} from '../../src/utils/calendar-window.ts'
import type {Task} from '../../src/types.ts'

function task(fields: {id: number; due_date?: string; start_date?: string; end_date?: string}): Task {
	return fields as Task
}

// A local day cell, the shape MonthGrid/TimeGrid feed in from enumerateDays.
function dayOf(year: number, month: number, date: number): {ms: number; dayKey: string} {
	const ms = new Date(year, month - 1, date).getTime()
	return {ms, dayKey: localDayKey(ms)}
}

// A local wall-clock time as the UTC ISO string Vikunja stores. Using the local
// offset keeps these assertions stable regardless of the machine's timezone.
function localIso(year: number, month: number, date: number, hour: number, minute = 0): string {
	return new Date(year, month - 1, date, hour, minute).toISOString()
}

test('buildTimeGridDays: undated tasks are dropped', () => {
	const [day] = buildTimeGridDays([task({id: 1})], [dayOf(2026, 6, 15)])
	assert.equal(day.allDay.length, 0)
	assert.equal(day.timed.length, 0)
})

test('buildTimeGridDays: UTC-midnight task lands in the all-day band', () => {
	const days = buildTimeGridDays(
		[task({id: 1, due_date: '2026-06-15T00:00:00.000Z'})],
		[dayOf(2026, 6, 15)],
	)
	assert.equal(days[0].allDay.length, 1)
	assert.equal(days[0].timed.length, 0)
})

test('buildTimeGridDays: a timed task sits on its start hour with default height', () => {
	const days = buildTimeGridDays(
		[task({id: 1, due_date: localIso(2026, 6, 15, 9)})],
		[dayOf(2026, 6, 15)],
	)
	const [block] = days[0].timed
	assert.equal(days[0].allDay.length, 0)
	assert.equal(block.task.id, 1)
	// 09:00 of 24h → 0.375; default 1h block → 1/24 of the day.
	assert.ok(Math.abs(block.top - 9 / 24) < 1e-9)
	assert.ok(Math.abs(block.height - 1 / 24) < 1e-9)
	assert.equal(block.left, 0)
	assert.equal(block.width, 1)
})

test('buildTimeGridDays: a span sets height from its duration', () => {
	const days = buildTimeGridDays(
		[task({id: 1, start_date: localIso(2026, 6, 15, 9), end_date: localIso(2026, 6, 15, 12)})],
		[dayOf(2026, 6, 15)],
	)
	const [block] = days[0].timed
	assert.ok(Math.abs(block.top - 9 / 24) < 1e-9)
	assert.ok(Math.abs(block.height - 3 / 24) < 1e-9)
})

test('buildTimeGridDays: a span past midnight is clipped to the day bottom', () => {
	const days = buildTimeGridDays(
		[task({id: 1, start_date: localIso(2026, 6, 15, 22), end_date: localIso(2026, 6, 16, 2)})],
		[dayOf(2026, 6, 15)],
	)
	const [block] = days[0].timed
	assert.ok(Math.abs(block.top - 22 / 24) < 1e-9)
	// 22:00 → clipped to 24:00, so height fills the remaining 2/24.
	assert.ok(Math.abs(block.height - 2 / 24) < 1e-9)
})

test('buildTimeGridDays: overlapping tasks split into side-by-side columns', () => {
	const days = buildTimeGridDays(
		[
			task({id: 1, start_date: localIso(2026, 6, 15, 9), end_date: localIso(2026, 6, 15, 11)}),
			task({id: 2, start_date: localIso(2026, 6, 15, 10), end_date: localIso(2026, 6, 15, 12)}),
		],
		[dayOf(2026, 6, 15)],
	)
	const blocks = days[0].timed
	assert.equal(blocks.length, 2)
	for (const block of blocks) {
		assert.ok(Math.abs(block.width - 0.5) < 1e-9)
	}
	const lefts = blocks.map(block => block.left).sort()
	assert.ok(Math.abs(lefts[0] - 0) < 1e-9)
	assert.ok(Math.abs(lefts[1] - 0.5) < 1e-9)
})

test('buildTimeGridDays: every overlapping task stays visible in its own column', () => {
	const days = buildTimeGridDays(
		Array.from({length: 5}, (_, index) => task({
			id: index + 1,
			start_date: localIso(2026, 6, 15, 9),
			end_date: localIso(2026, 6, 15, 11),
		})),
		[dayOf(2026, 6, 15)],
	)
	// Five identical-time tasks → five flush 1/5-wide columns, nothing hidden.
	assert.equal(days[0].timed.length, 5)
	for (const block of days[0].timed) {
		assert.ok(Math.abs(block.width - 1 / 5) < 1e-9)
	}
	const lefts = days[0].timed.map(block => block.left).sort((a, b) => a - b)
	lefts.forEach((left, index) => assert.ok(Math.abs(left - index / 5) < 1e-9))
})

test('buildTimeGridDays: a card expands rightward into free columns', () => {
	const days = buildTimeGridDays(
		[
			task({id: 1, start_date: localIso(2026, 6, 15, 9), end_date: localIso(2026, 6, 15, 9, 30)}),
			task({id: 2, start_date: localIso(2026, 6, 15, 9), end_date: localIso(2026, 6, 15, 9, 30)}),
			task({id: 3, start_date: localIso(2026, 6, 15, 9), end_date: localIso(2026, 6, 15, 11)}),
			task({id: 4, start_date: localIso(2026, 6, 15, 10), end_date: localIso(2026, 6, 15, 10, 30)}),
		],
		[dayOf(2026, 6, 15)],
	)
	const blocks = new Map(days[0].timed.map(block => [block.task.id, block]))
	// Peak overlap at 09:00 is three tasks (1, 2, 3) → three columns; task 3 is the
	// long one and takes the third column.
	const three = blocks.get(3)!
	assert.ok(Math.abs(three.left - 2 / 3) < 1e-9)
	// Task 4 reuses column 0 at 10:00 and expands across columns 0 and 1 (2 of 3),
	// stopping before column 2 where task 3 still runs.
	const four = blocks.get(4)!
	assert.equal(four.left, 0)
	assert.ok(Math.abs(four.width - 2 / 3) < 1e-9)
})

test('buildTimeGridDays: non-overlapping tasks each keep full width', () => {
	const days = buildTimeGridDays(
		[
			task({id: 1, start_date: localIso(2026, 6, 15, 9), end_date: localIso(2026, 6, 15, 10)}),
			task({id: 2, start_date: localIso(2026, 6, 15, 11), end_date: localIso(2026, 6, 15, 12)}),
		],
		[dayOf(2026, 6, 15)],
	)
	for (const block of days[0].timed) {
		assert.equal(block.width, 1)
		assert.equal(block.left, 0)
	}
})

test('buildTimeGridDays: a multi-day all-day span appears on every day it covers', () => {
	const days = buildTimeGridDays(
		[task({id: 1, start_date: '2026-06-15T00:00:00.000Z', end_date: '2026-06-17T00:00:00.000Z'})],
		[dayOf(2026, 6, 15), dayOf(2026, 6, 16), dayOf(2026, 6, 17)],
	)
	for (const day of days) {
		assert.equal(day.allDay.length, 1)
		assert.equal(day.timed.length, 0)
	}
})

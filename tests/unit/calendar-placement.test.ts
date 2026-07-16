import assert from 'node:assert/strict'
import test from 'node:test'
import {
	dayKeyOf,
	placeTask,
	placementDayKeys,
	placementInRange,
	type CalendarPlacement,
} from '../../src/utils/calendar-placement.ts'
import {
	allDayDueIso,
	buildCalendarRangeFilter,
	dayRange,
	enumerateDays,
	localDayKey,
	monthGridRange,
	prefetchRange,
	rangeForZoom,
	shiftAnchor,
	weekRange,
} from '../../src/utils/calendar-window.ts'
import type {Task} from '../../src/types.ts'

// Minimal Task factory — placement only reads the three date fields and id.
function task(fields: {id?: number; due_date?: string; start_date?: string; end_date?: string}): Task {
	return {id: 1, ...fields} as Task
}

const MS_PER_DAY = 86_400_000

test('placeTask: undated task is excluded', () => {
	assert.equal(placeTask(task({})), null)
})

test('placeTask: the year-1 sentinel counts as no date', () => {
	assert.equal(placeTask(task({due_date: '0001-01-01T00:00:00Z'})), null)
	assert.equal(
		placeTask(task({start_date: '0001-01-01T00:00:00Z', end_date: '0001-01-01T00:00:00Z'})),
		null,
	)
})

test('placeTask: due-only at UTC midnight is all-day, keyed to its UTC date', () => {
	const placement = placeTask(task({due_date: '2026-06-15T00:00:00Z'}))
	assert.ok(placement)
	assert.equal(placement.source, 'due')
	assert.equal(placement.allDay, true)
	assert.equal(placement.startDayKey, '2026-06-15')
	assert.equal(placement.endDayKey, '2026-06-15')
})

test('placeTask: a non-midnight due time is timed, keyed to the device-local date', () => {
	const iso = '2026-06-15T13:30:00Z'
	const placement = placeTask(task({due_date: iso}))
	assert.ok(placement)
	assert.equal(placement.source, 'due')
	assert.equal(placement.allDay, false)
	// Local date depends on the runner's timezone — compute it the same way.
	const local = new Date(iso)
	const expected = `${local.getFullYear()}-${`${local.getMonth() + 1}`.padStart(2, '0')}-${`${local.getDate()}`.padStart(2, '0')}`
	assert.equal(placement.startDayKey, expected)
})

test('placeTask: start+end is a span, ordered start<=end', () => {
	const placement = placeTask(task({
		start_date: '2026-06-10T00:00:00Z',
		end_date: '2026-06-13T00:00:00Z',
	}))
	assert.ok(placement)
	assert.equal(placement.source, 'span')
	assert.equal(placement.startDayKey, '2026-06-10')
	assert.equal(placement.endDayKey, '2026-06-13')
	assert.ok(placement.startMs < placement.endMs)
})

test('placeTask: a reversed span is normalised to start<=end', () => {
	const placement = placeTask(task({
		start_date: '2026-06-13T00:00:00Z',
		end_date: '2026-06-10T00:00:00Z',
	}))
	assert.ok(placement)
	assert.ok(placement.startMs < placement.endMs)
	assert.equal(placement.startDayKey, '2026-06-10')
	assert.equal(placement.endDayKey, '2026-06-13')
})

test('placeTask: anchor priority is span > due > start', () => {
	const span = placeTask(task({
		due_date: '2026-06-20T00:00:00Z',
		start_date: '2026-06-10T00:00:00Z',
		end_date: '2026-06-12T00:00:00Z',
	}))
	assert.equal(span?.source, 'span')

	const due = placeTask(task({
		due_date: '2026-06-20T00:00:00Z',
		start_date: '2026-06-10T00:00:00Z',
	}))
	assert.equal(due?.source, 'due')

	const start = placeTask(task({start_date: '2026-06-10T00:00:00Z'}))
	assert.equal(start?.source, 'start')
})

test('dayKeyOf: all-day uses the UTC date, timed uses the local date', () => {
	// A UTC midnight that is the previous evening in a negative-offset zone:
	// as all-day it stays on the UTC date; as timed it would shift locally.
	const ms = Date.parse('2026-06-15T00:00:00Z')
	assert.equal(dayKeyOf(ms, true), '2026-06-15')
})

test('placementInRange: half-open window, inclusive at the start edge', () => {
	const base = (startMs: number, endMs: number): CalendarPlacement => ({
		taskId: 1,
		source: 'span',
		allDay: true,
		startMs,
		endMs,
		startDayKey: '',
		endDayKey: '',
	})
	const rangeStart = Date.parse('2026-06-10T00:00:00Z')
	const rangeEnd = rangeStart + 7 * MS_PER_DAY

	// Wholly inside.
	assert.equal(placementInRange(base(rangeStart + MS_PER_DAY, rangeStart + 2 * MS_PER_DAY), rangeStart, rangeEnd), true)
	// Ends exactly at range start → still in (endMs >= rangeStart).
	assert.equal(placementInRange(base(rangeStart - MS_PER_DAY, rangeStart), rangeStart, rangeEnd), true)
	// Starts exactly at range end → excluded (startMs < rangeEnd is false).
	assert.equal(placementInRange(base(rangeEnd, rangeEnd + MS_PER_DAY), rangeStart, rangeEnd), false)
	// Fully before.
	assert.equal(placementInRange(base(rangeStart - 3 * MS_PER_DAY, rangeStart - 2 * MS_PER_DAY), rangeStart, rangeEnd), false)
})

test('monthGridRange: always a 42-day, 6×7 grid', () => {
	const anchor = Date.parse('2026-06-15T12:00:00Z')
	const range = monthGridRange(anchor, 1)
	assert.equal(Math.round((range.endMs - range.startMs) / MS_PER_DAY), 42)
})

test('weekRange spans 7 days, dayRange spans 1 day', () => {
	const anchor = Date.parse('2026-06-15T12:00:00Z')
	assert.equal(Math.round((weekRange(anchor, 1).endMs - weekRange(anchor, 1).startMs) / MS_PER_DAY), 7)
	assert.equal(Math.round((dayRange(anchor).endMs - dayRange(anchor).startMs) / MS_PER_DAY), 1)
})

test('rangeForZoom routes to the matching window', () => {
	const anchor = Date.parse('2026-06-15T12:00:00Z')
	assert.deepEqual(rangeForZoom('month', anchor, 1), monthGridRange(anchor, 1))
	assert.deepEqual(rangeForZoom('week', anchor, 1), weekRange(anchor, 1))
	assert.deepEqual(rangeForZoom('day', anchor, 1), dayRange(anchor))
})

test('prefetchRange pads by one window-length each side', () => {
	const range = {startMs: 1000, endMs: 4000}
	const padded = prefetchRange(range)
	assert.equal(padded.startMs, 1000 - 3000)
	assert.equal(padded.endMs, 4000 + 3000)
})

test('placementDayKeys: a single-day task yields exactly its key', () => {
	const placement = placeTask(task({due_date: '2026-06-15T00:00:00Z'}))
	assert.ok(placement)
	assert.deepEqual(placementDayKeys(placement), ['2026-06-15'])
})

test('placementDayKeys: an all-day span enumerates each UTC day inclusive', () => {
	const placement = placeTask(task({
		start_date: '2026-06-10T00:00:00Z',
		end_date: '2026-06-13T00:00:00Z',
	}))
	assert.ok(placement)
	assert.deepEqual(placementDayKeys(placement), ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13'])
})

test('enumerateDays: a month grid produces 42 unique day cells', () => {
	const range = monthGridRange(Date.parse('2026-06-15T12:00:00Z'), 1)
	const days = enumerateDays(range)
	assert.equal(days.length, 42)
	assert.equal(new Set(days.map(day => day.dayKey)).size, 42)
	// Each cell key is the local date of its own ms.
	for (const day of days) {
		assert.equal(day.dayKey, localDayKey(day.ms))
	}
})

test('shiftAnchor: month/week/day step by the right unit', () => {
	const anchor = Date.parse('2026-06-15T12:00:00Z')
	assert.equal(new Date(shiftAnchor('month', anchor, 1)).getMonth(), new Date(anchor).getMonth() === 11 ? 0 : new Date(anchor).getMonth() + 1)
	assert.equal(Math.round((shiftAnchor('week', anchor, 1) - anchor) / 86_400_000), 7)
	assert.equal(Math.round((shiftAnchor('day', anchor, -1) - anchor) / 86_400_000), -1)
})

test('allDayDueIso: a day key becomes UTC midnight, which placeTask reads as all-day', () => {
	const iso = allDayDueIso('2026-06-20')
	assert.equal(iso, '2026-06-20T00:00:00.000Z')
	const placement = placeTask(task({due_date: iso}))
	assert.ok(placement)
	assert.equal(placement.allDay, true)
	assert.equal(placement.startDayKey, '2026-06-20')
})

test('buildCalendarRangeFilter captures span overlap, not just due_date', () => {
	const range = {startMs: Date.parse('2026-06-01T00:00:00Z'), endMs: Date.parse('2026-07-01T00:00:00Z')}
	const filter = buildCalendarRangeFilter(range)
	const start = new Date(range.startMs).toISOString()
	const end = new Date(range.endMs).toISOString()
	assert.ok(filter.includes(`due_date >= ${start}`))
	assert.ok(filter.includes(`due_date < ${end}`))
	// The span-overlap clause is what catches multi-day bars straddling the window.
	assert.ok(filter.includes(`start_date < ${end} && end_date >= ${start}`))
	assert.ok(filter.includes('||'))
})

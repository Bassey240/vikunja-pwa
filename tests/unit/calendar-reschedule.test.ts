import assert from 'node:assert/strict'
import test from 'node:test'
import {buildMoveToDayPatch, buildReschedulePatch, dayKeyDelta, snapToSlot, SNAP_MS} from '../../src/utils/calendar-reschedule.ts'
import type {Task} from '../../src/types.ts'

function task(fields: {id?: number; due_date?: string; start_date?: string; end_date?: string}): Task {
	return {id: 1, ...fields} as Task
}

const HOUR_MS = 60 * 60 * 1000

test('snapToSlot: rounds to the nearest quarter-hour', () => {
	const base = Date.UTC(2026, 5, 15, 9, 0, 0)
	assert.equal(snapToSlot(base + 7 * 60 * 1000), base) // 9:07 → 9:00
	assert.equal(snapToSlot(base + 8 * 60 * 1000), base + SNAP_MS) // 9:08 → 9:15
	assert.equal(snapToSlot(base + 22 * 60 * 1000), base + SNAP_MS) // 9:22 → 9:15
	assert.equal(snapToSlot(base + 23 * 60 * 1000), base + 2 * SNAP_MS) // 9:23 → 9:30
})

test('buildReschedulePatch: undated task yields no patch', () => {
	assert.equal(buildReschedulePatch(task({}), 'move', Date.now(), Date.now()), null)
})

test('buildReschedulePatch: span move rewrites both edges, preserving length', () => {
	const original = task({start_date: '2026-06-15T09:00:00.000Z', end_date: '2026-06-15T11:00:00.000Z'})
	const newStart = Date.UTC(2026, 5, 16, 13, 0, 0)
	const newEnd = newStart + 2 * HOUR_MS
	const patch = buildReschedulePatch(original, 'move', newStart, newEnd)
	assert.deepEqual(patch, {
		start_date: '2026-06-16T13:00:00.000Z',
		end_date: '2026-06-16T15:00:00.000Z',
	})
})

test('buildReschedulePatch: span resize-start touches only start_date', () => {
	const original = task({start_date: '2026-06-15T09:00:00.000Z', end_date: '2026-06-15T11:00:00.000Z'})
	const newStart = Date.UTC(2026, 5, 15, 8, 0, 0)
	const patch = buildReschedulePatch(original, 'resize-start', newStart, Date.UTC(2026, 5, 15, 11, 0, 0))
	assert.deepEqual(patch, {start_date: '2026-06-15T08:00:00.000Z'})
})

test('buildReschedulePatch: span resize-end touches only end_date', () => {
	const original = task({start_date: '2026-06-15T09:00:00.000Z', end_date: '2026-06-15T11:00:00.000Z'})
	const newEnd = Date.UTC(2026, 5, 15, 12, 30, 0)
	const patch = buildReschedulePatch(original, 'resize-end', Date.UTC(2026, 5, 15, 9, 0, 0), newEnd)
	assert.deepEqual(patch, {end_date: '2026-06-15T12:30:00.000Z'})
})

test('buildReschedulePatch: due-anchored task move rewrites only due_date', () => {
	const original = task({due_date: '2026-06-15T14:00:00.000Z'})
	const newStart = Date.UTC(2026, 5, 16, 10, 15, 0)
	const patch = buildReschedulePatch(original, 'move', newStart, newStart + HOUR_MS)
	assert.deepEqual(patch, {due_date: '2026-06-16T10:15:00.000Z'})
})

test('buildReschedulePatch: start-anchored task move rewrites only start_date', () => {
	const original = task({start_date: '2026-06-15T14:00:00.000Z'})
	const newStart = Date.UTC(2026, 5, 17, 9, 0, 0)
	const patch = buildReschedulePatch(original, 'move', newStart, newStart + HOUR_MS)
	assert.deepEqual(patch, {start_date: '2026-06-17T09:00:00.000Z'})
})

test('buildReschedulePatch: an all-day move stays at UTC midnight', () => {
	const original = task({due_date: '2026-06-15T00:00:00.000Z'})
	const newStart = Date.UTC(2026, 5, 20, 0, 0, 0)
	const patch = buildReschedulePatch(original, 'move', newStart, newStart)
	assert.deepEqual(patch, {due_date: '2026-06-20T00:00:00.000Z'})
})

test('dayKeyDelta: counts whole calendar days, ignoring DST length', () => {
	assert.equal(dayKeyDelta('2026-06-15', '2026-06-18'), 3)
	assert.equal(dayKeyDelta('2026-06-18', '2026-06-15'), -3)
	assert.equal(dayKeyDelta('2026-03-28', '2026-03-30'), 2) // spans the spring DST step
})

test('buildMoveToDayPatch: undated task gets an all-day due date on the target day', () => {
	assert.deepEqual(buildMoveToDayPatch(task({}), '2026-06-18'), {due_date: '2026-06-18T00:00:00.000Z'})
})

test('buildMoveToDayPatch: same day is a no-op', () => {
	const original = task({due_date: '2026-06-15T14:00:00.000Z'})
	assert.equal(buildMoveToDayPatch(original, '2026-06-15'), null)
})

test('buildMoveToDayPatch: timed task keeps its time-of-day on the new day', () => {
	const original = task({due_date: '2026-06-15T14:00:00.000Z'})
	assert.deepEqual(buildMoveToDayPatch(original, '2026-06-18'), {due_date: '2026-06-18T14:00:00.000Z'})
})

test('buildMoveToDayPatch: all-day task stays all-day on the new day', () => {
	const original = task({due_date: '2026-06-15T00:00:00.000Z'})
	assert.deepEqual(buildMoveToDayPatch(original, '2026-06-20'), {due_date: '2026-06-20T00:00:00.000Z'})
})

test('buildMoveToDayPatch: span shifts both edges, preserving its length', () => {
	const original = task({start_date: '2026-06-15T09:00:00.000Z', end_date: '2026-06-17T09:00:00.000Z'})
	assert.deepEqual(buildMoveToDayPatch(original, '2026-06-17'), {
		start_date: '2026-06-17T09:00:00.000Z',
		end_date: '2026-06-19T09:00:00.000Z',
	})
})

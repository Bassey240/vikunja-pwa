import assert from 'node:assert/strict'
import test from 'node:test'
import {
	buildRunningTimerFilter,
	formatTimerClock,
	formatTrackedDuration,
	fromLocalDateTimeInputValue,
	getTimeEntryDurationSeconds,
	isRunningTimeEntry,
	sortTimeEntriesForDisplay,
	sumTimeEntryDurationSeconds,
	toLocalDateTimeInputValue,
	type TimeEntryLike,
} from '../../src/utils/time-tracking.ts'

function buildEntry(overrides: Partial<TimeEntryLike> = {}): TimeEntryLike {
	return {
		id: 1,
		task_id: 101,
		project_id: 0,
		user_id: 1,
		start_time: '2026-09-08T10:00:00Z',
		end_time: '2026-09-08T10:30:00Z',
		comment: '',
		...overrides,
	}
}

test('the running-timer filter names the signed-in user, because the list is project-scoped', () => {
	assert.equal(buildRunningTimerFilter(7), 'user_id = 7 && end_time = null')
})

test('a null end_time is what marks the running timer', () => {
	assert.equal(isRunningTimeEntry(buildEntry()), false)
	assert.equal(isRunningTimeEntry(buildEntry({end_time: null})), true)
	assert.equal(isRunningTimeEntry(null), false)
})

test('a completed entry measures start to end, ignoring the clock', () => {
	assert.equal(getTimeEntryDurationSeconds(buildEntry(), Date.parse('2026-09-09T00:00:00Z')), 1800)
})

test('a running entry measures start to now', () => {
	const entry = buildEntry({end_time: null})
	assert.equal(getTimeEntryDurationSeconds(entry, Date.parse('2026-09-08T10:00:45Z')), 45)
})

test('an unparseable timestamp contributes nothing rather than NaN', () => {
	assert.equal(getTimeEntryDurationSeconds(buildEntry({start_time: 'not-a-date'}), Date.now()), 0)
	assert.equal(getTimeEntryDurationSeconds(buildEntry({end_time: 'not-a-date'}), Date.now()), 0)
})

test('a clock that ran backwards clamps to zero instead of going negative', () => {
	const entry = buildEntry({start_time: '2026-09-08T10:30:00Z', end_time: '2026-09-08T10:00:00Z'})
	assert.equal(getTimeEntryDurationSeconds(entry, Date.now()), 0)
})

test('totals add the running entry to the completed ones', () => {
	const total = sumTimeEntryDurationSeconds(
		[buildEntry(), buildEntry({id: 2, start_time: '2026-09-08T11:00:00Z', end_time: null})],
		Date.parse('2026-09-08T11:10:00Z'),
	)
	assert.equal(total, 1800 + 600)
	assert.equal(sumTimeEntryDurationSeconds(null, Date.now()), 0)
})

test('the timer clock stays fixed width as it crosses minutes and hours', () => {
	assert.equal(formatTimerClock(0), '00:00:00')
	assert.equal(formatTimerClock(59), '00:00:59')
	assert.equal(formatTimerClock(3661), '01:01:01')
	assert.equal(formatTimerClock(-5), '00:00:00')
})

test('tracked totals read as durations, not clocks', () => {
	assert.equal(formatTrackedDuration(45), '45s')
	assert.equal(formatTrackedDuration(600), '10m')
	assert.equal(formatTrackedDuration(3600), '1h')
	assert.equal(formatTrackedDuration(3900), '1h 5m')
})

test('display order puts the running timer first, then the newest start', () => {
	const ordered = sortTimeEntriesForDisplay([
		buildEntry({id: 1, start_time: '2026-09-08T09:00:00Z'}),
		buildEntry({id: 2, start_time: '2026-09-08T12:00:00Z'}),
		buildEntry({id: 3, start_time: '2026-09-08T08:00:00Z', end_time: null}),
	])
	assert.deepEqual(ordered.map(entry => entry.id), [3, 2, 1])
})

test('datetime-local values round-trip through the local zone', () => {
	const iso = new Date(2026, 8, 8, 14, 30).toISOString()
	assert.equal(fromLocalDateTimeInputValue(toLocalDateTimeInputValue(iso)), iso)
	assert.equal(toLocalDateTimeInputValue('nonsense'), '')
	assert.equal(fromLocalDateTimeInputValue('nonsense'), '')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {isoWeekNumber} from '../../src/utils/calendar-window.ts'

// Local-time midnight, so the ISO-week math runs in the same frame the app uses.
function localMs(year: number, month: number, day: number): number {
	return new Date(year, month - 1, day).getTime()
}

test('isoWeekNumber: mid-year week', () => {
	// 2026-06-08 is a Monday in ISO week 24.
	assert.equal(isoWeekNumber(localMs(2026, 6, 8)), 24)
	assert.equal(isoWeekNumber(localMs(2026, 6, 14)), 24)
	assert.equal(isoWeekNumber(localMs(2026, 6, 15)), 25)
})

test('isoWeekNumber: Jan 1 belonging to the previous year is week 52/53', () => {
	// 2021-01-01 is a Friday → ISO week 53 of 2020.
	assert.equal(isoWeekNumber(localMs(2021, 1, 1)), 53)
	// 2026-01-01 is a Thursday → ISO week 1.
	assert.equal(isoWeekNumber(localMs(2026, 1, 1)), 1)
})

test('isoWeekNumber: late-December week-1 rollover', () => {
	// 2025-12-29 (Mon) starts ISO week 1 of 2026.
	assert.equal(isoWeekNumber(localMs(2025, 12, 29)), 1)
})

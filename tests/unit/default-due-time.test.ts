import assert from 'node:assert/strict'
import test from 'node:test'
import {dateOnlyDueIso, withDefaultDueTime} from '../../src/utils/date-helpers.ts'
import {parseQuickAddMagic} from '../../src/utils/quickAddMagic.ts'
import {buildMoveToDayPatch} from '../../src/utils/calendar-reschedule.ts'
import type {Task} from '../../src/types.ts'

process.env.TZ = 'Europe/Amsterdam'

test('date-only quick add uses the preference across supported date expressions', () => {
	const now = new Date(2026, 9, 8, 10, 43, 12)
	for (const expression of ['today', 'tomorrow', 'next week', 'next month', 'end of month', 'monday', 'next friday', '2026-11-02', '02/11/2026', '2.11.2026', '2 november', 'in 2 days', 'in 3 weeks', 'in 2 months']) {
		const parsed = parseQuickAddMagic(`Review ${expression}`, now, '17:45')
		assert.equal(parsed.title, 'Review', expression)
		assert.ok(parsed.date, expression)
		assert.equal(parsed.date.getHours(), 17, expression)
		assert.equal(parsed.date.getMinutes(), 45, expression)
		assert.equal(parsed.date.getSeconds(), 0, expression)
	}
	assert.equal(now.getHours(), 10)
})

test('quick add preserves explicit evening and relative-hour times', () => {
	const now = new Date(2026, 9, 8, 10, 43)
	assert.equal(parseQuickAddMagic('Review tonight', now, '17:45').date?.getHours(), 21)
	assert.equal(parseQuickAddMagic('Review in 2 hours', now, '17:45').date?.getTime(), now.getTime() + 2 * 3600_000)
	assert.equal(parseQuickAddMagic('Review tomorrow', now).date?.getHours(), 12)
	assert.equal(parseQuickAddMagic('Review in 2 days', now).date?.getHours(), now.getHours())
	assert.equal(parseQuickAddMagic('Review', now, '17:45').date, null)
})

test('preferred local due time converts correctly on each side of DST', () => {
	assert.equal(dateOnlyDueIso('2026-03-28', '09:30'), '2026-03-28T08:30:00.000Z')
	assert.equal(dateOnlyDueIso('2026-03-29', '09:30'), '2026-03-29T07:30:00.000Z')
	assert.equal(dateOnlyDueIso('2026-10-24', '09:30'), '2026-10-24T07:30:00.000Z')
	assert.equal(dateOnlyDueIso('2026-10-25', '09:30'), '2026-10-25T08:30:00.000Z')
	assert.equal(dateOnlyDueIso('2026-10-08', '00:00'), '2026-10-07T22:00:00.000Z')
	assert.equal(dateOnlyDueIso('2026-10-08', ''), '2026-10-08T00:00:00.000Z')
	assert.equal(dateOnlyDueIso('2026-10-08'), '2026-10-08T00:00:00.000Z')
})

test('Today default helper keeps noon when unset and accepts midnight', () => {
	const original = new Date(2026, 9, 8, 10, 43)
	assert.equal(withDefaultDueTime(original).getHours(), 12)
	assert.equal(withDefaultDueTime(original, '00:00').getHours(), 0)
	assert.equal(original.getHours(), 10)
})

test('move-to-day assigns preferred time only when the task has no date', () => {
	assert.deepEqual(buildMoveToDayPatch({id: 1} as Task, '2026-10-08', '17:45'), {due_date: '2026-10-08T15:45:00.000Z'})
	assert.deepEqual(buildMoveToDayPatch({id: 1, due_date: '2026-10-08T13:15:00.000Z'} as Task, '2026-10-09', '17:45'), {due_date: '2026-10-09T13:15:00.000Z'})
	assert.deepEqual(buildMoveToDayPatch({id: 1, due_date: '2026-10-08T00:00:00.000Z'} as Task, '2026-10-09', '17:45'), {due_date: '2026-10-09T00:00:00.000Z'})
})

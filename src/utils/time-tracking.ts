/* Vikunja 2.4 time entries. A running timer is an entry whose end_time is
 * null, and exactly one of task_id / project_id is ever set. Kept pure and
 * alias-free so node can unit-test it. */

export interface TimeEntryLike {
	id: number
	task_id: number
	project_id: number
	user_id: number
	start_time: string
	end_time: string | null
	comment: string
}

/* Vikunja scopes the list by accessible project, not by owner, so a query for
 * the signed-in user's running timer has to name that user explicitly. */
export function buildRunningTimerFilter(userId: number) {
	return `user_id = ${Number(userId || 0)} && end_time = null`
}

export function isRunningTimeEntry(entry: TimeEntryLike | null | undefined) {
	return Boolean(entry) && !entry?.end_time
}

export function getTimeEntryDurationSeconds(entry: TimeEntryLike | null | undefined, nowMs: number) {
	if (!entry) {
		return 0
	}

	const startMs = new Date(entry.start_time).getTime()
	if (Number.isNaN(startMs)) {
		return 0
	}

	const endMs = entry.end_time ? new Date(entry.end_time).getTime() : nowMs
	if (Number.isNaN(endMs)) {
		return 0
	}

	return Math.max(0, Math.round((endMs - startMs) / 1000))
}

export function sumTimeEntryDurationSeconds(entries: TimeEntryLike[] | null | undefined, nowMs: number) {
	if (!Array.isArray(entries)) {
		return 0
	}

	return entries.reduce((total, entry) => total + getTimeEntryDurationSeconds(entry, nowMs), 0)
}

/* Timers are read at a glance while they tick, so the clock stays fixed-width
 * rather than switching between "5m" and "1h 5m" shapes as it runs. */
export function formatTimerClock(totalSeconds: number) {
	const seconds = Math.max(0, Math.floor(totalSeconds || 0))
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const pad = (value: number) => `${value}`.padStart(2, '0')
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds % 60)}`
}

export function formatTrackedDuration(totalSeconds: number) {
	const seconds = Math.max(0, Math.floor(totalSeconds || 0))
	if (seconds < 60) {
		return `${seconds}s`
	}

	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	if (hours === 0) {
		return `${minutes}m`
	}

	return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/* Vikunja's list is ordered start_time ASC; the newest entry reads first in
 * the UI, and a running timer always sits at the top of its task's list. */
export function sortTimeEntriesForDisplay(entries: TimeEntryLike[]) {
	return [...entries].sort((left, right) => {
		if (isRunningTimeEntry(left) !== isRunningTimeEntry(right)) {
			return isRunningTimeEntry(left) ? -1 : 1
		}

		return new Date(right.start_time).getTime() - new Date(left.start_time).getTime()
	})
}

/* Datetime-local inputs have no zone; Vikunja stores RFC3339 timestamps. */
export function toLocalDateTimeInputValue(value: string | null | undefined) {
	const date = new Date(`${value || ''}`)
	if (Number.isNaN(date.getTime())) {
		return ''
	}

	const pad = (part: number) => `${part}`.padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalDateTimeInputValue(value: string) {
	const date = new Date(`${value || ''}`)
	return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

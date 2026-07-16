import type {Task} from '../types.ts'

export type CalendarPlacementSource = 'span' | 'due' | 'start'

export interface CalendarPlacement {
	taskId: number
	source: CalendarPlacementSource
	allDay: boolean
	startMs: number
	endMs: number
	startDayKey: string
	endDayKey: string
}

// Mirrors normalizeVikunjaDateValue: Vikunja serialises an unset date as the
// year-1 sentinel "0001-01-01…", which must be treated as no date.
function parseIso(value: string | null | undefined): number | null {
	if (!value) {
		return null
	}
	const raw = `${value}`.trim()
	if (!raw || raw.startsWith('0001-01-01')) {
		return null
	}
	const ms = new Date(raw).getTime()
	if (Number.isNaN(ms) || new Date(ms).getUTCFullYear() <= 1901) {
		return null
	}
	return ms
}

// Vikunja stores date-only tasks at midnight UTC. That convention — not a local
// clock — is what marks a task "all-day"; checking local time would misclassify
// across timezones.
function isUtcMidnight(ms: number): boolean {
	const date = new Date(ms)
	return (
		date.getUTCHours() === 0 &&
		date.getUTCMinutes() === 0 &&
		date.getUTCSeconds() === 0 &&
		date.getUTCMilliseconds() === 0
	)
}

function pad2(value: number): string {
	return `${value}`.padStart(2, '0')
}

// All-day tasks are anchored to their UTC calendar date so a timezone offset can
// never shift them onto a neighbouring day; timed tasks render on the local date.
export function dayKeyOf(ms: number, allDay: boolean): string {
	const date = new Date(ms)
	if (allDay) {
		return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
	}
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// Anchor priority: a start+end pair is a span; otherwise due_date; otherwise
// start_date. Tasks with none of these are undated and excluded from the grid.
export function placeTask(task: Task): CalendarPlacement | null {
	const dueMs = parseIso(task.due_date)
	const startMs = parseIso(task.start_date)
	const endMs = parseIso(task.end_date)

	let source: CalendarPlacementSource
	let placementStart: number
	let placementEnd: number

	if (startMs !== null && endMs !== null) {
		source = 'span'
		placementStart = Math.min(startMs, endMs)
		placementEnd = Math.max(startMs, endMs)
	} else if (dueMs !== null) {
		source = 'due'
		placementStart = dueMs
		placementEnd = dueMs
	} else if (startMs !== null) {
		source = 'start'
		placementStart = startMs
		placementEnd = startMs
	} else {
		return null
	}

	const allDay = isUtcMidnight(placementStart)

	return {
		taskId: task.id,
		source,
		allDay,
		startMs: placementStart,
		endMs: placementEnd,
		startDayKey: dayKeyOf(placementStart, allDay),
		endDayKey: dayKeyOf(placementEnd, allDay),
	}
}

// True when a placement intersects the half-open window [startMs, endMs).
export function placementInRange(placement: CalendarPlacement, rangeStartMs: number, rangeEndMs: number): boolean {
	return placement.startMs < rangeEndMs && placement.endMs >= rangeStartMs
}

// Every day key a placement touches, start through end inclusive — one key for a
// single-day task, the full run of days for a multi-day span. Used to bucket
// tasks into month/week cells. Steps in the same clock the keys use: UTC days for
// all-day placements, local days for timed ones, anchored at noon to dodge DST.
export function placementDayKeys(placement: CalendarPlacement): string[] {
	if (placement.startDayKey === placement.endDayKey) {
		return [placement.startDayKey]
	}
	const cursor = new Date(placement.startMs)
	if (placement.allDay) {
		cursor.setUTCHours(12, 0, 0, 0)
	} else {
		cursor.setHours(12, 0, 0, 0)
	}
	const keys: string[] = [placement.startDayKey]
	while (keys[keys.length - 1] !== placement.endDayKey && keys.length < 366) {
		if (placement.allDay) {
			cursor.setUTCDate(cursor.getUTCDate() + 1)
		} else {
			cursor.setDate(cursor.getDate() + 1)
		}
		keys.push(dayKeyOf(cursor.getTime(), placement.allDay))
	}
	return keys
}

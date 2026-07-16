import type {Task} from '../types.ts'
import {placeTask} from './calendar-placement.ts'
import {allDayDueIso, DAY_MS} from './calendar-window.ts'

// Drag snaps timed instants to the nearest quarter-hour.
export const SNAP_MS = 15 * 60 * 1000

// Never let a resize collapse a span below one slot.
export const MIN_SPAN_MS = SNAP_MS

export type RescheduleMode = 'move' | 'resize-start' | 'resize-end'

// Round a timed instant to the nearest 15-minute slot.
export function snapToSlot(ms: number): number {
	return Math.round(ms / SNAP_MS) * SNAP_MS
}

// Map a drag result onto the task's date fields, honouring its placement anchor:
// a span rewrites start/end (one edge on resize, both on move, preserving length);
// a point task (bare due_date or start_date) rewrites that single anchor on move.
// Resize is only offered on spans, so point tasks only ever reach the move branch.
// The caller supplies the already-resolved instants (UTC-midnight for all-day
// moves, snapped local instants for timed drags), so the anchor stays all-day or
// timed exactly as it began. Returns null for an undated task (never rendered).
export function buildReschedulePatch(
	task: Task,
	mode: RescheduleMode,
	newStartMs: number,
	newEndMs: number,
): Partial<Task> | null {
	const placement = placeTask(task)
	if (!placement) {
		return null
	}

	const startIso = new Date(newStartMs).toISOString()
	const endIso = new Date(newEndMs).toISOString()

	if (placement.source === 'span') {
		if (mode === 'resize-start') {
			return {start_date: startIso}
		}
		if (mode === 'resize-end') {
			return {end_date: endIso}
		}
		return {start_date: startIso, end_date: endIso}
	}

	const field = placement.source === 'due' ? 'due_date' : 'start_date'
	return {[field]: startIso}
}

// Whole calendar days between two local day keys (YYYY-MM-DD). Parsed as local
// midnights so a DST day still counts as one day.
export function dayKeyDelta(fromKey: string, toKey: string): number {
	return Math.round((Date.parse(`${toKey}T00:00:00`) - Date.parse(`${fromKey}T00:00:00`)) / DAY_MS)
}

// Shift an instant by whole days. All-day anchors stay UTC-midnight (exact day
// arithmetic); timed anchors keep their local wall-clock time across the shift
// (and across any DST boundary) via local-calendar arithmetic.
function shiftDays(ms: number, delta: number, allDay: boolean): number {
	if (allDay) {
		return ms + delta * DAY_MS
	}
	const date = new Date(ms)
	date.setDate(date.getDate() + delta)
	return date.getTime()
}

// "Move to date": rewrite a task's anchor so it lands on the target day, keeping
// time-of-day, span length, and all-day-ness. An undated task is given an
// all-day due date on that day. Returns null when nothing would change.
export function buildMoveToDayPatch(task: Task, dayKey: string): Partial<Task> | null {
	const placement = placeTask(task)
	if (!placement) {
		return {due_date: allDayDueIso(dayKey)}
	}
	const delta = dayKeyDelta(placement.startDayKey, dayKey)
	if (delta === 0) {
		return null
	}
	const newStartMs = shiftDays(placement.startMs, delta, placement.allDay)
	const newEndMs = shiftDays(placement.endMs, delta, placement.allDay)
	return buildReschedulePatch(task, 'move', newStartMs, newEndMs)
}

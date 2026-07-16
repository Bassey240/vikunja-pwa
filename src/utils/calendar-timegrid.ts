import type {Task} from '../types.ts'
import {placeTask, placementDayKeys} from './calendar-placement.ts'
import {DAY_MS, HOUR_MS} from './calendar-window.ts'

// A point-in-time task (a bare due_date, or a span whose start equals its end)
// has no real duration; render it as this tall so the block stays tappable.
const DEFAULT_TIMED_DURATION_MS = HOUR_MS

export interface TimedTaskBlock {
	task: Task
	startMs: number
	endMs: number
	// Day fractions in [0, 1]. top/height place the block vertically from local
	// midnight; left/width cascade overlapping tasks (Google-style). zIndex stacks
	// later columns on top so each card's left strip (title) stays visible.
	top: number
	height: number
	left: number
	width: number
	zIndex: number
}

export interface TimeGridDay {
	ms: number
	dayKey: string
	allDay: Task[]
	timed: TimedTaskBlock[]
}

interface DayCell {
	ms: number
	dayKey: string
}

interface PackInterval {
	startMs: number
	endMs: number
}

interface PackCluster<T> {
	// One bucket per column, packed left-to-right; columns.length is the cluster's
	// max simultaneous overlap (the minimum columns interval-colouring needs).
	columns: T[][]
}

interface PackPlacement<T> {
	column: number
	cluster: PackCluster<T>
}

function overlaps(a: PackInterval, b: PackInterval): boolean {
	return a.startMs < b.endMs && b.startMs < a.endMs
}

// Greedy interval-partitioning into clusters (connected overlap groups) and, within
// each, columns: every item drops into the first column it fits, else opens a new
// one. Returns each item's column index plus its cluster's full column layout, so
// the caller can cascade widths by expanding rightward into free columns.
function packColumns<T extends PackInterval>(items: T[]): Map<T, PackPlacement<T>> {
	const result = new Map<T, PackPlacement<T>>()
	const sorted = [...items].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)

	let columns: T[][] = []
	let clusterMaxEnd = -Infinity

	const flush = () => {
		if (columns.length === 0) {
			return
		}
		const cluster: PackCluster<T> = {columns}
		for (let col = 0; col < columns.length; col++) {
			for (const item of columns[col]) {
				result.set(item, {column: col, cluster})
			}
		}
		columns = []
		clusterMaxEnd = -Infinity
	}

	for (const item of sorted) {
		// A gap to every open column ends the cluster and frees the full width.
		if (columns.length > 0 && item.startMs >= clusterMaxEnd) {
			flush()
		}
		const reusable = columns.find(column => column[column.length - 1].endMs <= item.startMs)
		if (reusable) {
			reusable.push(item)
		} else {
			columns.push([item])
		}
		clusterMaxEnd = Math.max(clusterMaxEnd, item.endMs)
	}
	flush()
	return result
}

// Bucket placed tasks onto the given day cells: multi-day all-day spans land in
// every day they touch; timed tasks sit on their start day, cascaded for overlap
// and clipped to the day's bottom edge. Undated tasks are dropped.
export function buildTimeGridDays(tasks: Task[], days: DayCell[]): TimeGridDay[] {
	const allDayByDay = new Map<string, Task[]>()
	const timedByDay = new Map<string, {task: Task; startMs: number; endMs: number}[]>()

	for (const task of tasks) {
		const placement = placeTask(task)
		if (!placement) {
			continue
		}
		if (placement.allDay) {
			for (const dayKey of placementDayKeys(placement)) {
				const bucket = allDayByDay.get(dayKey)
				if (bucket) {
					bucket.push(task)
				} else {
					allDayByDay.set(dayKey, [task])
				}
			}
			continue
		}
		const endMs = placement.source === 'span' ? placement.endMs : placement.startMs
		const entry = {task, startMs: placement.startMs, endMs}
		const bucket = timedByDay.get(placement.startDayKey)
		if (bucket) {
			bucket.push(entry)
		} else {
			timedByDay.set(placement.startDayKey, [entry])
		}
	}

	return days.map(day => {
		const allDay = (allDayByDay.get(day.dayKey) ?? []).slice().sort((a, b) => a.id - b.id)
		const dayEndMs = day.ms + DAY_MS
		const raw = timedByDay.get(day.dayKey) ?? []
		// Pack on the effective interval (point tasks get a default length) so a
		// short task at the same hour as a long one still splits into columns.
		const packed = raw.map(entry => {
			const startMs = Math.max(entry.startMs, day.ms)
			const effectiveEndMs = Math.max(entry.endMs, startMs + DEFAULT_TIMED_DURATION_MS)
			return {entry, startMs, endMs: effectiveEndMs}
		})
		const lanes = packColumns(packed)
		const timed = packed.map(item => {
			const placement = lanes.get(item)
			const cols = placement?.cluster.columns ?? [[item]]
			const column = placement?.column ?? 0
			const count = cols.length
			// Expand rightward into every column that's free for this item's whole
			// duration; stop at the first column holding an overlapping task.
			let colSpan = 1
			for (let k = column + 1; k < count; k++) {
				if (cols[k].some(other => overlaps(item, other))) {
					break
				}
				colSpan++
			}
			const clampedEndMs = Math.min(item.endMs, dayEndMs)
			return {
				task: item.entry.task,
				startMs: item.entry.startMs,
				endMs: item.entry.endMs,
				top: (item.startMs - day.ms) / DAY_MS,
				height: (clampedEndMs - item.startMs) / DAY_MS,
				left: column / count,
				width: colSpan / count,
				zIndex: column + 1,
			}
		})
		return {ms: day.ms, dayKey: day.dayKey, allDay, timed}
	})
}

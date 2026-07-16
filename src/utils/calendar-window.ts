export type CalendarZoom = 'month' | 'week' | 'day'
export type WeekStart = 0 | 1 // Sunday | Monday

export const DAY_MS = 86_400_000
export const HOUR_MS = 60 * 60 * 1000

// Half-open local window [startMs, endMs) covering the days a view renders.
export interface CalendarRange {
	startMs: number
	endMs: number
}

function startOfLocalDay(ms: number): number {
	const date = new Date(ms)
	date.setHours(0, 0, 0, 0)
	return date.getTime()
}

function addLocalDays(ms: number, days: number): number {
	const date = new Date(ms)
	date.setDate(date.getDate() + days)
	return date.getTime()
}

function leadingOffset(date: Date, weekStartsOn: WeekStart): number {
	return (date.getDay() - weekStartsOn + 7) % 7
}

// The 6×7 grid: first of the month backed up to the week start, 42 days long.
export function monthGridRange(anchorMs: number, weekStartsOn: WeekStart = 1): CalendarRange {
	const anchor = new Date(anchorMs)
	const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
	const gridStart = addLocalDays(firstOfMonth.getTime(), -leadingOffset(firstOfMonth, weekStartsOn))
	return {startMs: gridStart, endMs: addLocalDays(gridStart, 42)}
}

export function weekRange(anchorMs: number, weekStartsOn: WeekStart = 1): CalendarRange {
	const dayStart = startOfLocalDay(anchorMs)
	const weekStart = addLocalDays(dayStart, -leadingOffset(new Date(dayStart), weekStartsOn))
	return {startMs: weekStart, endMs: addLocalDays(weekStart, 7)}
}

export function dayRange(anchorMs: number): CalendarRange {
	const dayStart = startOfLocalDay(anchorMs)
	return {startMs: dayStart, endMs: addLocalDays(dayStart, 1)}
}

function pad2(value: number): string {
	return `${value}`.padStart(2, '0')
}

// Local-date key for a grid cell — matches calendar-placement's dayKeyOf for
// timed tasks and (since cells are keyed by their local date) for all-day tasks.
export function localDayKey(ms: number): string {
	const date = new Date(ms)
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// The due_date for an all-day task on a given local day key: UTC midnight, the
// convention placeTask classifies as all-day. Feeds the composer's defaultDueDate.
export function allDayDueIso(dayKey: string): string {
	return `${dayKey}T00:00:00.000Z`
}

// ISO-8601 week number (weeks start Monday; week 1 holds the year's first
// Thursday) — matches the app's Monday-default week start.
export function isoWeekNumber(ms: number): number {
	const date = new Date(ms)
	date.setHours(0, 0, 0, 0)
	// Shift to the Thursday of this week, which decides the ISO week-year.
	date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
	const firstThursday = new Date(date.getFullYear(), 0, 4)
	firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
	return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * DAY_MS))
}

export interface CalendarDay {
	ms: number
	dayKey: string
}

// One entry per local day spanning [startMs, endMs) — the cells of a grid.
export function enumerateDays(range: CalendarRange): CalendarDay[] {
	const days: CalendarDay[] = []
	let ms = startOfLocalDay(range.startMs)
	while (ms < range.endMs && days.length < 366) {
		days.push({ms, dayKey: localDayKey(ms)})
		ms = addLocalDays(ms, 1)
	}
	return days
}

// Shift the anchor one window earlier/later for prev/next navigation.
export function shiftAnchor(zoom: CalendarZoom, anchorMs: number, direction: -1 | 1): number {
	const date = new Date(anchorMs)
	if (zoom === 'month') {
		date.setMonth(date.getMonth() + direction)
	} else if (zoom === 'week') {
		date.setDate(date.getDate() + direction * 7)
	} else {
		date.setDate(date.getDate() + direction)
	}
	return date.getTime()
}

export function rangeForZoom(zoom: CalendarZoom, anchorMs: number, weekStartsOn: WeekStart = 1): CalendarRange {
	if (zoom === 'month') {
		return monthGridRange(anchorMs, weekStartsOn)
	}
	if (zoom === 'week') {
		return weekRange(anchorMs, weekStartsOn)
	}
	return dayRange(anchorMs)
}

// Widen the fetch window by one window-length each side so navigating to the
// adjacent month/week/day is instant (the prefetch decision).
export function prefetchRange(range: CalendarRange): CalendarRange {
	const span = range.endMs - range.startMs
	return {startMs: range.startMs - span, endMs: range.endMs + span}
}

// Vikunja filter capturing any task whose dates intersect the window — due_date
// in range, OR a start–end span overlapping it, OR a bare start_date in range.
// Not just due_date, so multi-day spans that straddle the window are included.
export function buildCalendarRangeFilter(range: CalendarRange): string {
	const start = new Date(range.startMs).toISOString()
	const end = new Date(range.endMs).toISOString()
	return [
		`(due_date >= ${start} && due_date < ${end})`,
		`(start_date < ${end} && end_date >= ${start})`,
		`(start_date >= ${start} && start_date < ${end})`,
	].join(' || ')
}

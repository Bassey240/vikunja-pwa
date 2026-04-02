import type {CSSProperties} from 'react'

import type {Task} from '@/types'
import {formatShortDate, normalizePercentDone, normalizeTaskDateValue} from '@/utils/formatting'

const SHORT_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const DAY_MS = 24 * 60 * 60 * 1000
export const TODAY_START = (() => {
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	return today.getTime()
})()

export type GanttZoom = 'day' | 'week' | 'month'
export type GanttSort = 'start_date' | 'priority' | 'title' | 'percent_done'

export const MAX_TIMELINE_DAYS_BY_ZOOM: Record<GanttZoom, number> = {
	day: 120,
	week: 365 * 2,
	month: 365 * 5,
}

export interface TimelineColumn {
	key: string
	label: string
	startDate: Date
	endDate: Date
	isWeekend?: boolean
	isToday?: boolean
}

export interface DatedEntry {
	task: Task
	start: Date
	end: Date
}

export function startOfDay(value: string | number | Date | null | undefined) {
	let parsed: Date | null = null

	if (typeof value === 'string') {
		const normalized = normalizeTaskDateValue(value)
		if (!normalized) {
			return null
		}
		parsed = new Date(normalized)
	} else if (value instanceof Date) {
		parsed = new Date(value.getTime())
	} else if (typeof value === 'number') {
		parsed = new Date(value)
	}

	if (!parsed || Number.isNaN(parsed.getTime())) {
		return null
	}

	parsed.setHours(0, 0, 0, 0)
	return parsed
}

export function endOfDay(date: Date) {
	const nextDate = new Date(date.getTime())
	nextDate.setHours(23, 59, 0, 0)
	return nextDate
}

export function toDateInputValue(date: Date) {
	const year = date.getFullYear()
	const month = `${date.getMonth() + 1}`.padStart(2, '0')
	const day = `${date.getDate()}`.padStart(2, '0')
	return `${year}-${month}-${day}`
}

export function fromDateInputValue(value: string) {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null
	}

	const [year, month, day] = value.split('-').map(Number)
	const parsed = new Date(year, month - 1, day)
	if (Number.isNaN(parsed.getTime())) {
		return null
	}
	parsed.setHours(0, 0, 0, 0)
	return parsed
}

export function startOfWeek(date: Date) {
	const nextDate = new Date(date.getTime())
	const day = nextDate.getDay()
	const normalizedDay = day === 0 ? 7 : day
	nextDate.setDate(nextDate.getDate() - normalizedDay + 1)
	nextDate.setHours(0, 0, 0, 0)
	return nextDate
}

export function buildGanttPresets() {
	const today = startOfDay(new Date()) || new Date()
	const startOfThisWeek = startOfWeek(today)
	const endOfThisWeek = new Date(startOfThisWeek.getTime() + 6 * DAY_MS)
	const startOfNextWeek = new Date(startOfThisWeek.getTime() + 7 * DAY_MS)
	const endOfNextWeek = new Date(startOfNextWeek.getTime() + 6 * DAY_MS)
	const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * DAY_MS)
	const endOfLastWeek = new Date(startOfThisWeek.getTime() - DAY_MS)
	const startOfMonthDate = new Date(today.getFullYear(), today.getMonth(), 1)
	const endOfMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
	const startOfNextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
	const endOfNextMonthDate = new Date(today.getFullYear(), today.getMonth() + 2, 0)
	const startOfThisYearDate = new Date(today.getFullYear(), 0, 1)
	const endOfThisYearDate = new Date(today.getFullYear(), 11, 31)
	const startOfLastYearDate = new Date(today.getFullYear() - 1, 0, 1)
	const endOfLastYearDate = new Date(today.getFullYear() - 1, 11, 31)
	const startOfNextYearDate = new Date(today.getFullYear() + 1, 0, 1)
	const endOfNextYearDate = new Date(today.getFullYear() + 1, 11, 31)

	return [
		{label: 'Today', from: toDateInputValue(today), to: toDateInputValue(today)},
		{label: 'This week', from: toDateInputValue(startOfThisWeek), to: toDateInputValue(endOfThisWeek)},
		{label: 'Next week', from: toDateInputValue(startOfNextWeek), to: toDateInputValue(endOfNextWeek)},
		{label: 'Last week', from: toDateInputValue(startOfLastWeek), to: toDateInputValue(endOfLastWeek)},
		{label: 'This month', from: toDateInputValue(startOfMonthDate), to: toDateInputValue(endOfMonthDate)},
		{label: 'Next month', from: toDateInputValue(startOfNextMonthDate), to: toDateInputValue(endOfNextMonthDate)},
		{label: 'Last year', from: toDateInputValue(startOfLastYearDate), to: toDateInputValue(endOfLastYearDate)},
		{label: 'This year', from: toDateInputValue(startOfThisYearDate), to: toDateInputValue(endOfThisYearDate)},
		{label: 'Next year', from: toDateInputValue(startOfNextYearDate), to: toDateInputValue(endOfNextYearDate)},
	]
}

export function getTaskPercentDone(task: Task): number {
	return normalizePercentDone(task.percent_done)
}

export function getBarColorStyle(task: Task): CSSProperties {
	if (task.done) {
		return {}
	}

	const priority = Number(task.priority || 0)
	switch (priority) {
		case 1:
		case 2:
			return {background: '#3a9a5c'}
		case 3:
			return {background: '#c49a1a'}
		case 4:
			return {background: '#d97633'}
		case 5:
			return {background: '#cc4433'}
		case 6:
			return {background: '#b82525'}
		default:
			return {}
	}
}

export function buildTimeline(from: Date | null, to: Date | null, zoom: GanttZoom): TimelineColumn[] {
	if (!from || !to) {
		return []
	}

	if (zoom === 'day') {
		const columns: TimelineColumn[] = []
		for (let cursor = from.getTime(); cursor <= to.getTime(); cursor += DAY_MS) {
			const startDate = new Date(cursor)
			const endDate = new Date(cursor)
			const dayOfWeek = startDate.getDay()
			columns.push({
				key: startDate.toISOString(),
				label: formatShortDate(startDate.toISOString()),
				startDate,
				endDate,
				isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
				isToday: startDate.getTime() === TODAY_START,
			})
		}
		return columns
	}

	if (zoom === 'week') {
		const columns: TimelineColumn[] = []
		let cursor = startOfWeek(from)
		while (cursor.getTime() <= to.getTime()) {
			const startDate = new Date(cursor.getTime())
			const endDate = new Date(startDate.getTime() + 6 * DAY_MS)
			columns.push({
				key: `week-${startDate.toISOString()}`,
				label: formatShortDate(startDate.toISOString()),
				startDate,
				endDate,
				isToday: TODAY_START >= startDate.getTime() && TODAY_START <= endDate.getTime(),
			})
			cursor = new Date(startDate.getTime() + 7 * DAY_MS)
		}
		return columns
	}

	const columns: TimelineColumn[] = []
	let cursor = new Date(from.getFullYear(), from.getMonth(), 1)
	cursor.setHours(0, 0, 0, 0)
	while (cursor.getTime() <= to.getTime()) {
		const startDate = new Date(cursor.getTime())
		const endDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
		endDate.setHours(0, 0, 0, 0)
		columns.push({
			key: `month-${startDate.getFullYear()}-${startDate.getMonth()}`,
			label: `${SHORT_MONTH_LABELS[startDate.getMonth()]} ${startDate.getFullYear()}`,
			startDate,
			endDate,
			isToday: TODAY_START >= startDate.getTime() && TODAY_START <= endDate.getTime(),
		})
		cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
		cursor.setHours(0, 0, 0, 0)
	}
	return columns
}

export function getBarGridPosition(
	entry: Pick<DatedEntry, 'start' | 'end'>,
	columns: TimelineColumn[],
): {gridColumnStart: number; gridColumnEnd: number} | null {
	let startIdx = -1
	let endIdx = -1

	for (let index = 0; index < columns.length; index += 1) {
		const column = columns[index]
		if (startIdx === -1 && column.endDate.getTime() >= entry.start.getTime()) {
			startIdx = index
		}
		if (column.startDate.getTime() <= entry.end.getTime()) {
			endIdx = index
		}
	}

	if (startIdx === -1 || endIdx === -1) {
		return null
	}

	return {
		gridColumnStart: Math.max(2, startIdx + 2),
		gridColumnEnd: Math.max(startIdx + 3, endIdx + 3),
	}
}

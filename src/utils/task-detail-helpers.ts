import {formatShortWeekdayLabel, normalizeRepeatAfter} from '@/utils/formatting'

export type TaskDateField = 'due_date' | 'start_date' | 'end_date'
export type TaskDetailSection =
	| 'planning'
	| 'recurring'
	| 'reminders'
	| 'organization'
	| 'assignees'
	| 'related'
	| 'comments'
	| 'attachments'
	| 'description'
	| 'info'
export type RepeatUnit = 'hours' | 'days' | 'weeks' | 'months'

export const REMINDER_PRESETS = [
	{label: '30 min before due', relativePeriod: -1800},
	{label: '1 hour before due', relativePeriod: -3600},
	{label: '1 day before due', relativePeriod: -86400},
]

const QUICK_REMINDER_OPTIONS = [
	{label: 'Tomorrow', value: 'tomorrow'},
	{label: 'Next Monday', value: 'next-monday'},
	{label: 'This weekend', value: 'this-weekend'},
	{label: 'Later this week', value: 'later-this-week'},
	{label: 'Next week', value: 'next-week'},
] as const

export const REPEAT_PRESETS = [
	{label: 'Daily', value: 1, unit: 'days'},
	{label: 'Weekly', value: 1, unit: 'weeks'},
	{label: 'Monthly', value: 1, unit: 'months'},
] as const satisfies ReadonlyArray<{label: string; value: number; unit: RepeatUnit}>

export function pickLabelTextColor(hex: string) {
	const normalized = hex.replace('#', '')
	if (normalized.length !== 6) {
		return '#170f0d'
	}

	const red = parseInt(normalized.slice(0, 2), 16)
	const green = parseInt(normalized.slice(2, 4), 16)
	const blue = parseInt(normalized.slice(4, 6), 16)
	const brightness = (red * 299 + green * 587 + blue * 114) / 1000

	return brightness > 170 ? '#170f0d' : '#fff7f1'
}

export function buildQuickReminderOptions(referenceDate: Date) {
	return QUICK_REMINDER_OPTIONS.map(option => {
		const reminder = resolveQuickReminderDate(option.value, referenceDate)
		return {
			...option,
			reminder,
			shortLabel: formatShortWeekdayLabel(reminder),
		}
	})
}

function resolveQuickReminderDate(
	value: (typeof QUICK_REMINDER_OPTIONS)[number]['value'],
	referenceDate: Date,
) {
	switch (value) {
		case 'tomorrow':
			return addDays(atLocalNoon(referenceDate), 1)
		case 'next-monday':
			return nextWeekday(referenceDate, 1)
		case 'this-weekend':
			return nextWeekday(referenceDate, 6)
		case 'later-this-week':
			return laterThisWeek(referenceDate)
		case 'next-week':
			return nextWeekday(referenceDate, 1)
	}
}

export function atLocalNoon(value: Date) {
	const next = new Date(value)
	next.setHours(12, 0, 0, 0)
	return next
}

export function addDays(value: Date, days: number) {
	const next = new Date(value)
	next.setDate(next.getDate() + days)
	return next
}

export function nextWeekday(referenceDate: Date, targetWeekday: number) {
	const base = atLocalNoon(referenceDate)
	const currentWeekday = base.getDay()
	let offset = (targetWeekday - currentWeekday + 7) % 7
	if (offset === 0) {
		offset = 7
	}
	return addDays(base, offset)
}

export function laterThisWeek(referenceDate: Date) {
	const base = atLocalNoon(referenceDate)
	const weekday = base.getDay()
	if (weekday >= 1 && weekday < 3) {
		return nextWeekday(addDays(base, -1), 3)
	}
	if (weekday >= 3 && weekday < 5) {
		return nextWeekday(addDays(base, -1), 5)
	}

	return nextWeekday(base, 3)
}

export function getRepeatEditorState(repeatAfter: number | string | null | undefined) {
	const normalized = normalizeRepeatAfter(repeatAfter)
	if (!normalized) {
		return {
			value: '1',
			unit: 'days' as RepeatUnit,
		}
	}

	if (normalized % 2592000 === 0) {
		return {
			value: `${normalized / 2592000}`,
			unit: 'months' as RepeatUnit,
		}
	}
	if (normalized % 604800 === 0) {
		return {
			value: `${normalized / 604800}`,
			unit: 'weeks' as RepeatUnit,
		}
	}
	if (normalized % 86400 === 0) {
		return {
			value: `${normalized / 86400}`,
			unit: 'days' as RepeatUnit,
		}
	}

	return {
		value: `${Math.max(1, Math.round(normalized / 3600))}`,
		unit: 'hours' as RepeatUnit,
	}
}

export function convertRepeatValueToSeconds(value: number, unit: RepeatUnit) {
	const normalizedValue = Math.max(1, Math.round(value))
	switch (unit) {
		case 'hours':
			return normalizedValue * 3600
		case 'days':
			return normalizedValue * 86400
		case 'weeks':
			return normalizedValue * 604800
		case 'months':
			return normalizedValue * 2592000
	}
}

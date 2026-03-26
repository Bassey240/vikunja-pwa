const WEEKDAY_INDEX: Record<string, number> = {
	sun: 0,
	sunday: 0,
	mon: 1,
	monday: 1,
	tue: 2,
	tuesday: 2,
	wed: 3,
	wednesday: 3,
	thu: 4,
	thursday: 4,
	fri: 5,
	friday: 5,
	sat: 6,
	saturday: 6,
}

const MONTH_INDEX: Record<string, number> = {
	jan: 0,
	january: 0,
	feb: 1,
	february: 1,
	mar: 2,
	march: 2,
	apr: 3,
	april: 3,
	may: 4,
	jun: 5,
	june: 5,
	jul: 6,
	july: 6,
	aug: 7,
	august: 7,
	sep: 8,
	september: 8,
	oct: 9,
	october: 9,
	nov: 10,
	november: 10,
	dec: 11,
	december: 11,
}

const REPEAT_UNIT_SECONDS: Record<string, number> = {
	hour: 3600,
	hours: 3600,
	day: 86400,
	days: 86400,
	week: 604800,
	weeks: 604800,
	month: 2592000,
	months: 2592000,
	year: 31536000,
	years: 31536000,
}

type QuickAddPrefix = '*' | '+' | '@'

export interface QuickAddMagicResult {
	title: string
	date: Date | null
	dateText: string | null
	labels: string[]
	project: string | null
	priority: number | null
	assignees: string[]
	repeatAfter: number | null
	repeatText: string | null
}

export function parseQuickAddMagic(text: string, now: Date = new Date()): QuickAddMagicResult {
	let nextText = text.trim()

	const labels = extractPrefixedItems(nextText, '*')
	nextText = labels.nextText

	const project = extractSinglePrefixedItem(nextText, '+')
	nextText = project.nextText

	const priority = extractPriority(nextText)
	nextText = priority.nextText

	const assignees = extractPrefixedItems(nextText, '@')
	nextText = assignees.nextText

	const repeat = extractRepeat(nextText)
	nextText = repeat.nextText

	const date = extractDate(nextText, now)
	nextText = date.nextText

	return {
		title: collapseWhitespace(nextText),
		date: date.date,
		dateText: date.matchedText,
		labels: labels.items,
		project: project.item,
		priority: priority.value,
		assignees: assignees.items,
		repeatAfter: repeat.repeatAfter,
		repeatText: repeat.matchedText,
	}
}

function extractPrefixedItems(text: string, prefix: QuickAddPrefix) {
	const items: string[] = []
	let nextText = text
	let match = matchPrefixedItem(nextText, prefix)
	while (match) {
		items.push(match.value)
		nextText = collapseWhitespace(`${nextText.slice(0, match.start)} ${nextText.slice(match.end)}`)
		match = matchPrefixedItem(nextText, prefix)
	}
	return {
		items: dedupe(items),
		nextText,
	}
}

function extractSinglePrefixedItem(text: string, prefix: QuickAddPrefix) {
	const match = matchPrefixedItem(text, prefix)
	if (!match) {
		return {
			item: null,
			nextText: text,
		}
	}

	return {
		item: match.value,
		nextText: collapseWhitespace(`${text.slice(0, match.start)} ${text.slice(match.end)}`),
	}
}

function matchPrefixedItem(text: string, prefix: QuickAddPrefix) {
	const matcher = new RegExp(`(^|\\s)\\${prefix}(?:"([^"]+)"|'([^']+)'|([^\\s]+))`, 'i')
	const match = matcher.exec(text)
	if (!match) {
		return null
	}

	const rawValue = (match[2] || match[3] || match[4] || '').trim()
	if (!rawValue) {
		return null
	}

	const leadingWhitespace = match[1] ? match[1].length : 0
	const start = match.index + leadingWhitespace
	const end = match.index + match[0].length

	return {
		value: rawValue,
		start,
		end,
	}
}

function extractPriority(text: string) {
	const match = /(^|\s)!([1-5])(?=$|\s)/.exec(text)
	if (!match) {
		return {
			value: null,
			nextText: text,
		}
	}

	const start = match.index + (match[1] ? match[1].length : 0)
	const end = match.index + match[0].length
	return {
		value: Number(match[2]),
		nextText: collapseWhitespace(`${text.slice(0, start)} ${text.slice(end)}`),
	}
}

function extractRepeat(text: string) {
	const match = /(^|\s)((every|each)\s+((\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(hours?|days?|weeks?|months?|years?)|daily|weekly|monthly|yearly)(?=$|\s)/i.exec(text)
	if (!match) {
		return {
			repeatAfter: null,
			matchedText: null,
			nextText: text,
		}
	}

	let amount = toWordNumber(match[5] || '') || 1
	const normalizedMatch = match[2].trim().toLowerCase()
	let unit = ''
	if (normalizedMatch === 'daily') {
		unit = 'day'
	} else if (normalizedMatch === 'weekly') {
		unit = 'week'
	} else if (normalizedMatch === 'monthly') {
		unit = 'month'
	} else if (normalizedMatch === 'yearly') {
		unit = 'year'
	} else {
		unit = (match[6] || '').toLowerCase()
	}

	const repeatAfter = REPEAT_UNIT_SECONDS[unit] ? REPEAT_UNIT_SECONDS[unit] * amount : null
	const start = match.index + (match[1] ? match[1].length : 0)
	const end = match.index + match[0].length

	return {
		repeatAfter,
		matchedText: match[2].trim(),
		nextText: collapseWhitespace(`${text.slice(0, start)} ${text.slice(end)}`),
	}
}

function extractDate(text: string, now: Date) {
	const normalizedText = ` ${text.toLowerCase()} `

	const simpleMatches: Array<{needle: string; build: () => Date}> = [
		{needle: ' today ', build: () => withDefaultTime(startOfDay(now))},
		{needle: ' tonight ', build: () => withTime(startOfDay(now), 21, 0)},
		{needle: ' tomorrow ', build: () => withDefaultTime(addDays(startOfDay(now), 1))},
		{needle: ' next week ', build: () => withDefaultTime(addDays(startOfDay(now), 7))},
		{needle: ' next month ', build: () => withDefaultTime(startOfNextMonth(now))},
		{needle: ' end of month ', build: () => withDefaultTime(endOfMonth(now))},
	]
	for (const entry of simpleMatches) {
		if (normalizedText.includes(entry.needle)) {
			return removeAndApplyDate(text, entry.needle.trim(), entry.build())
		}
	}

	const inMatch = /(^|\s)(in\s+(\d+)\s+(hours?|days?|weeks?|months?))(?=$|\s)/i.exec(text)
	if (inMatch) {
		const amount = Number(inMatch[3] || 0)
		const unit = (inMatch[4] || '').toLowerCase()
		const date = new Date(now)
		if (unit.startsWith('hour')) {
			date.setHours(date.getHours() + amount)
		} else if (unit.startsWith('day')) {
			date.setDate(date.getDate() + amount)
		} else if (unit.startsWith('week')) {
			date.setDate(date.getDate() + amount * 7)
		} else if (unit.startsWith('month')) {
			date.setMonth(date.getMonth() + amount)
		}
		if (!unit.startsWith('hour')) {
			withDefaultTime(date)
		}
		return removeAndApplyDate(text, inMatch[2].trim(), date)
	}

	const weekdayMatch = /(^|\s)(next\s+)?(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)(?=$|\s)/i.exec(text)
	if (weekdayMatch) {
		const useNextWeek = Boolean(weekdayMatch[2])
		const weekday = WEEKDAY_INDEX[(weekdayMatch[3] || '').toLowerCase()]
		if (typeof weekday === 'number') {
			const date = nextWeekday(now, weekday, useNextWeek)
			return removeAndApplyDate(text, weekdayMatch[0].trim(), withDefaultTime(date))
		}
	}

	const numericMatch = /(^|\s)((\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?|(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?)(?=$|\s)/i.exec(text)
	if (numericMatch) {
		const date = parseNumericDate(numericMatch, now)
		if (date) {
			return removeAndApplyDate(text, numericMatch[2].trim(), withDefaultTime(date))
		}
	}

	const monthMatch = /(^|\s)((\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)|(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2}))(?=$|\s)/i.exec(text)
	if (monthMatch) {
		const leftDay = monthMatch[3]
		const leftMonth = monthMatch[4]
		const rightMonth = monthMatch[5]
		const rightDay = monthMatch[6]
		const day = Number(leftDay || rightDay || 0)
		const monthKey = `${leftMonth || rightMonth || ''}`.toLowerCase()
		const monthIndex = MONTH_INDEX[monthKey]
		if (day > 0 && typeof monthIndex === 'number') {
			const date = startOfDay(now)
			date.setMonth(monthIndex, day)
			if (date < now) {
				date.setFullYear(date.getFullYear() + 1)
			}
			return removeAndApplyDate(text, monthMatch[2].trim(), withDefaultTime(date))
		}
	}

	return {
		date: null,
		matchedText: null,
		nextText: text,
	}
}

function removeAndApplyDate(text: string, matchedText: string, date: Date) {
	return {
		date,
		matchedText,
		nextText: collapseWhitespace(text.replace(matchedText, ' ')),
	}
}

function parseNumericDate(match: RegExpExecArray, now: Date) {
	if (match[3] && match[4] && match[5]) {
		const date = startOfDay(now)
		date.setFullYear(Number(match[3]), Number(match[4]) - 1, Number(match[5]))
		return isValidDate(date) ? date : null
	}

	const slashDayA = Number(match[6] || 0)
	const slashDayB = Number(match[7] || 0)
	const slashYear = normalizeYear(match[8], now.getFullYear())
	if (slashDayA && slashDayB) {
		const date = buildDayMonthDate(slashDayA, slashDayB, slashYear ?? now.getFullYear())
		if (date) {
			return maybeRollForward(date, Boolean(match[8]), now)
		}
	}

	const dotDay = Number(match[9] || 0)
	const dotMonth = Number(match[10] || 0)
	const dotYear = normalizeYear(match[11], now.getFullYear())
	if (dotDay && dotMonth) {
		const date = buildDayMonthDate(dotDay, dotMonth, dotYear ?? now.getFullYear())
		if (date) {
			return maybeRollForward(date, Boolean(match[11]), now)
		}
	}

	return null
}

function buildDayMonthDate(day: number, month: number, year: number) {
	const date = new Date(year, month - 1, day)
	return isValidDate(date) && date.getDate() === day && date.getMonth() === month - 1 ? date : null
}

function maybeRollForward(date: Date, hasYear: boolean, now: Date) {
	if (!hasYear && date < startOfDay(now)) {
		date.setFullYear(date.getFullYear() + 1)
	}
	return date
}

function normalizeYear(rawYear: string | undefined, fallbackYear: number) {
	if (!rawYear) {
		return fallbackYear
	}
	const numeric = Number(rawYear)
	if (rawYear.length === 2) {
		return 2000 + numeric
	}
	return numeric
}

function nextWeekday(now: Date, weekday: number, forceNextWeek: boolean) {
	const date = startOfDay(now)
	let distance = (weekday + 7 - date.getDay()) % 7
	if (forceNextWeek || distance === 0) {
		distance += 7
	}
	date.setDate(date.getDate() + distance)
	return date
}

function startOfDay(date: Date) {
	const nextDate = new Date(date)
	nextDate.setHours(0, 0, 0, 0)
	return nextDate
}

function withDefaultTime(date: Date) {
	const nextDate = new Date(date)
	nextDate.setHours(12, 0, 0, 0)
	return nextDate
}

function withTime(date: Date, hours: number, minutes: number) {
	const nextDate = new Date(date)
	nextDate.setHours(hours, minutes, 0, 0)
	return nextDate
}

function addDays(date: Date, days: number) {
	const nextDate = new Date(date)
	nextDate.setDate(nextDate.getDate() + days)
	return nextDate
}

function startOfNextMonth(now: Date) {
	const date = startOfDay(now)
	date.setMonth(date.getMonth() + 1, 1)
	return date
}

function endOfMonth(now: Date) {
	return new Date(now.getFullYear(), now.getMonth() + 1, 0)
}

function isValidDate(date: Date) {
	return !Number.isNaN(date.getTime())
}

function toWordNumber(value: string) {
	const normalized = value.trim().toLowerCase()
	if (!normalized) {
		return 0
	}
	const words: Record<string, number> = {
		one: 1,
		two: 2,
		three: 3,
		four: 4,
		five: 5,
		six: 6,
		seven: 7,
		eight: 8,
		nine: 9,
		ten: 10,
	}
	return words[normalized] || Number(normalized) || 0
}

function dedupe(items: string[]) {
	const seen = new Set<string>()
	const nextItems: string[] = []
	for (const item of items) {
		const normalized = item.trim().toLowerCase()
		if (!normalized || seen.has(normalized)) {
			continue
		}
		seen.add(normalized)
		nextItems.push(item.trim())
	}
	return nextItems
}

function collapseWhitespace(value: string) {
	return value.replace(/\s+/g, ' ').trim()
}

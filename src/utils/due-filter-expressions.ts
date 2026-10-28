/* The single mapping between a due-range choice and its Vikunja filter
 * expression, used both to build filters and to read them back out of saved
 * filters so the two can never drift.
 *
 * These use Vikunja's own date math (`now/d` = start of today, `+1d`, ...),
 * which the server resolves in the timezone sent as filter_timezone. The
 * client must NOT compute calendar dates itself: that duplicates logic the
 * server owns and goes stale the moment a request crosses midnight. */

export type DueFilterRange = 'none' | 'overdue' | 'today' | 'tomorrow' | 'next7'

export const DUE_FILTER_EXPRESSIONS: Record<DueFilterRange, string> = {
	none: 'due_date = 0',
	overdue: 'due_date < now/d && due_date != 0',
	today: 'due_date >= now/d && due_date < now/d+1d',
	tomorrow: 'due_date >= now/d+1d && due_date < now/d+2d',
	next7: 'due_date >= now/d && due_date < now/d+7d',
}

export function buildDueFilterExpression(due: DueFilterRange | 'any') {
	return due === 'any' ? '' : DUE_FILTER_EXPRESSIONS[due] || ''
}

/* Ranges ordered so a broader expression can never swallow a narrower one
 * (`due_date = 0` is a substring of nothing here, but `now/d` prefixes the
 * longer ranges, so longest-first is the safe removal order). */
export function getDueFilterRangesBySpecificity(): DueFilterRange[] {
	return (Object.keys(DUE_FILTER_EXPRESSIONS) as DueFilterRange[])
		.sort((left, right) => DUE_FILTER_EXPRESSIONS[right].length - DUE_FILTER_EXPRESSIONS[left].length)
}

/* Tolerates the whitespace variations a hand-edited saved filter may carry. */
export function getDueFilterExpressionPattern(due: DueFilterRange) {
	const escaped = DUE_FILTER_EXPRESSIONS[due]
		.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		.replace(/\s+/g, '\\s*')
	return new RegExp(escaped, 'i')
}

/* Saved filters written by earlier app versions embed literal calendar dates
 * instead of date math. Reading those back is interpreting stored data, not
 * re-implementing server logic — the dates are compared the same way the old
 * builder produced them, so a filter still resolves to its dropdown range and
 * is rewritten as date math the next time it is saved. */
export function getLegacyDueFilterPatterns(now = new Date()): Array<{due: DueFilterRange; pattern: RegExp}> {
	const day = (offset: number) => {
		const date = new Date(now)
		date.setDate(date.getDate() + offset)
		const month = `${date.getMonth() + 1}`.padStart(2, '0')
		const dayOfMonth = `${date.getDate()}`.padStart(2, '0')
		return `${date.getFullYear()}-${month}-${dayOfMonth}`
	}
	const today = day(0)

	return [
		{due: 'overdue', pattern: new RegExp(`due_date\\s*<\\s*"${today}"\\s*&&\\s*due_date\\s*!=\\s*0`, 'i')},
		{due: 'next7', pattern: new RegExp(`due_date\\s*>=\\s*"${today}"\\s*&&\\s*due_date\\s*<=\\s*"${day(7)}"`, 'i')},
		{due: 'tomorrow', pattern: new RegExp(`due_date\\s*=\\s*"${day(1)}"`, 'i')},
		{due: 'today', pattern: new RegExp(`due_date\\s*=\\s*"${today}"`, 'i')},
	]
}

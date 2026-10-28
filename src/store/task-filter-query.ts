import type {TaskFilters} from '@/hooks/useFilters'
import {buildDueFilterExpression} from '../utils/due-filter-expressions.ts'

function escapeFilterValue(value: string) {
	return `${value || ''}`.replace(/"/g, '\\"')
}

export function taskFiltersToVikunjaFilter(filters: TaskFilters) {
	const clauses: string[] = []

	if (filters.status === 'open') {
		clauses.push('done = false')
	} else if (filters.status === 'done') {
		clauses.push('done = true')
	}

	if (filters.labelId) {
		clauses.push(`labels in ${Number(filters.labelId)}`)
	}

	if (Number(filters.projectId || 0) > 0) {
		clauses.push(`project = ${Number(filters.projectId)}`)
	}

	if (filters.priority !== 'any') {
		clauses.push(`priority = ${Number(filters.priority)}`)
	}

	// Vikunja resolves the date math itself, in the zone sent as
	// filter_timezone — the client never computes calendar dates.
	const dueExpression = buildDueFilterExpression(filters.due)
	if (dueExpression) {
		clauses.push(dueExpression)
	}

	const title = `${filters.title || ''}`.trim()
	if (title) {
		clauses.push(`title like "${escapeFilterValue(title)}"`)
	}

	const description = `${filters.description || ''}`.trim()
	if (description) {
		clauses.push(`description like "${escapeFilterValue(description)}"`)
	}

	return clauses.join(' && ')
}

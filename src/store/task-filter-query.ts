import type {TaskFilters} from '@/hooks/useFilters'

function iso(date: Date) {
	return date.toISOString().slice(0, 10)
}

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

	if (filters.due !== 'any') {
		const today = new Date()
		const todayStr = iso(today)
		if (filters.due === 'none') {
			clauses.push('due_date = 0')
		} else if (filters.due === 'overdue') {
			clauses.push(`due_date < "${todayStr}" && due_date != 0`)
		} else if (filters.due === 'today') {
			clauses.push(`due_date = "${todayStr}"`)
		} else if (filters.due === 'next7') {
			const plus7 = new Date(today)
			plus7.setDate(plus7.getDate() + 7)
			clauses.push(`due_date >= "${todayStr}" && due_date <= "${iso(plus7)}"`)
		}
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

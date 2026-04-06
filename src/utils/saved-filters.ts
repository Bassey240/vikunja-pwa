import {
	defaultProjectFilters,
	defaultTaskFilters,
	normalizeTaskFilters,
	type ProjectFilters,
	type TaskFilters,
} from '@/hooks/useFilters'
import type {Label, Project, SavedFilter, SavedFilterQuery} from '@/types'
import {taskFiltersToVikunjaFilter} from '@/store/task-filter-query'

export const defaultSavedFilterSortBy = ['done', 'id']
export const defaultSavedFilterOrderBy = ['asc', 'desc']

export function normalizeSavedFilter(raw: unknown): SavedFilter {
	const record = isRecord(raw) ? raw : {}
	const rawId = record.filterId ?? record.filter_id ?? record.id ?? 0
	const rawProjectId = record.projectId ?? record.project_id ?? 0
	const id = Number(rawId) || 0
	const explicitProjectId = Number(rawProjectId) || 0
	const projectId = explicitProjectId < 0 ? explicitProjectId : id > 0 ? getSavedFilterProjectId(id) : 0
	const filters = normalizeSavedFilterQuery(record.filters)

	return {
		id,
		projectId,
		position: Number.isFinite(Number(record.position)) ? Number(record.position) : null,
		title: `${record.title || ''}`.trim(),
		description: `${record.description || ''}`.trim(),
		isFavorite: Boolean(record.isFavorite ?? record.is_favorite),
		created: typeof record.created === 'string' ? record.created : null,
		updated: typeof record.updated === 'string' ? record.updated : null,
		filters,
	}
}

export function normalizeSavedFilterQuery(raw: unknown): SavedFilterQuery | null {
	if (!isRecord(raw)) {
		return null
	}

	return {
		filter: `${raw.filter || ''}`.trim(),
		filterIncludeNulls: Boolean(raw.filterIncludeNulls ?? raw.filter_include_nulls),
		filterTimezone: `${raw.filterTimezone || raw.filter_timezone || ''}`.trim() || null,
		sortBy: normalizeStringArray(raw.sortBy ?? raw.sort_by),
		orderBy: normalizeStringArray(raw.orderBy ?? raw.order_by),
		searchText: `${raw.searchText || raw.s || ''}`.trim(),
	}
}

export function buildSavedFilterQuery(taskFilters: TaskFilters, advancedQuery = '') {
	const baseQuery = taskFiltersToVikunjaFilter(taskFilters)
	const extraQuery = `${advancedQuery || ''}`
		.trim()
		.replace(/^&&\s*/, '')
		.replace(/\s*&&$/, '')
	return [baseQuery, extraQuery].filter(Boolean).join(' && ')
}

export function extractTaskFiltersFromSavedFilterQuery(
	filterQuery: string,
	labels: Label[],
) {
	let remaining = `${filterQuery || ''}`.trim()
	const today = new Date()
	const todayIso = today.toISOString().slice(0, 10)
	const plus7 = new Date(today)
	plus7.setDate(plus7.getDate() + 7)
	const next7Iso = plus7.toISOString().slice(0, 10)
	const nextTaskFilters = {...defaultTaskFilters}

	remaining = removeQueryPattern(remaining, /\bdone\s*=\s*false\b/i, () => {
		nextTaskFilters.status = 'open'
	})
	remaining = removeQueryPattern(remaining, /\bdone\s*=\s*true\b/i, () => {
		nextTaskFilters.status = 'done'
	})
	remaining = removeQueryPattern(remaining, new RegExp(`\\bdue_date\\s*=\\s*"${todayIso}"\\b`, 'i'), () => {
		nextTaskFilters.due = 'today'
	})
	remaining = removeQueryPattern(remaining, new RegExp(`\\bdue_date\\s*=\\s*0\\b`, 'i'), () => {
		nextTaskFilters.due = 'none'
	})
	remaining = removeQueryPattern(
		remaining,
		new RegExp(`\\bdue_date\\s*<\\s*"${todayIso}"\\s*&&\\s*due_date\\s*!=\\s*0\\b`, 'i'),
		() => {
			nextTaskFilters.due = 'overdue'
		},
	)
	remaining = removeQueryPattern(
		remaining,
		new RegExp(`\\bdue_date\\s*>=\\s*"${todayIso}"\\s*&&\\s*due_date\\s*<=\\s*"${next7Iso}"\\b`, 'i'),
		() => {
			nextTaskFilters.due = 'next7'
		},
	)
	remaining = removeQueryPattern(remaining, /\bproject\s*=\s*(\d+)\b/i, match => {
		nextTaskFilters.projectId = Number(match[1] || 0)
	})
	remaining = removeQueryPattern(remaining, /\bpriority\s*=\s*(\d+)\b/i, match => {
		const value = `${Number(match[1] || 0)}`
		if (['0', '1', '2', '3', '4', '5'].includes(value)) {
			nextTaskFilters.priority = value as TaskFilters['priority']
		}
	})
	remaining = removeQueryPattern(remaining, /\blabels\s+in\s+(\d+)\b/i, match => {
		nextTaskFilters.labelId = Number(match[1] || 0)
	})
	remaining = removeQueryPattern(remaining, /\blabel\s*=\s*"([^"]+)"\b/i, match => {
		const expectedTitle = `${match[1] || ''}`.trim().toLowerCase()
		const label = labels.find(entry => `${entry.title || ''}`.trim().toLowerCase() === expectedTitle)
		if (label) {
			nextTaskFilters.labelId = Number(label.id || 0)
		}
	})
	remaining = removeQueryPattern(remaining, /\btitle\s+like\s+"((?:\\.|[^"])*)"\b/i, match => {
		nextTaskFilters.title = unescapeSavedFilterValue(match[1] || '')
	})
	remaining = removeQueryPattern(remaining, /\bdescription\s+like\s+"((?:\\.|[^"])*)"\b/i, match => {
		nextTaskFilters.description = unescapeSavedFilterValue(match[1] || '')
	})

	return {
		taskFilters: normalizeTaskFilters(nextTaskFilters, true),
		advancedQuery: normalizeSavedFilterQueryText(remaining),
	}
}

export function normalizeSavedFilterSortSettings(
	sortByInput: unknown,
	orderByInput: unknown,
) {
	const sortBy = normalizeStringArray(sortByInput)
		.filter(value => value !== 'position')
	const orderBy = normalizeStringArray(orderByInput)
		.map(value => `${value}`.trim().toLowerCase())

	if (sortBy.length === 0) {
		return {
			sortBy: defaultSavedFilterSortBy.slice(),
			orderBy: defaultSavedFilterOrderBy.slice(),
		}
	}

	return {
		sortBy,
		orderBy: sortBy.map((_, index) => orderBy[index] === 'desc' ? 'desc' : 'asc'),
	}
}

export function buildSavedFilterProject(filter: SavedFilter): Project {
	return {
		id: filter.projectId,
		title: filter.title || 'Untitled filter',
		description: filter.description || '',
		parent_project_id: 0,
		position: Number.isFinite(Number(filter.position)) ? Number(filter.position) : Number(filter.id || 0),
		identifier: 'filter',
		is_favorite: filter.isFavorite,
		is_saved_filter: true,
		isSavedFilter: true,
		saved_filter_id: filter.id,
		savedFilterId: filter.id,
	}
}

export function isSavedFilterProject(project: Project | null | undefined) {
	return Boolean(project) && (
		project?.is_saved_filter === true ||
		project?.isSavedFilter === true ||
		Number(project?.id || 0) < 0
	)
}

export function savedFilterMatchesProjectFilters(filter: SavedFilter, filters: ProjectFilters) {
	const favorite = Boolean(filter.isFavorite)
	const titleValue = `${filter.title || ''}`.trim().toLowerCase()
	const descriptionValue = `${filter.description || ''}`.trim().toLowerCase()
	const identifierValue = 'filter'
	const titleFilter = `${filters.title || ''}`.trim().toLowerCase()
	const descriptionFilter = `${filters.description || ''}`.trim().toLowerCase()
	const identifierFilter = `${filters.identifier || ''}`.trim().toLowerCase()

	if (filters.favorite === 'only' && !favorite) {
		return false
	}

	if (filters.favorite === 'exclude' && favorite) {
		return false
	}

	if (titleFilter && !titleValue.includes(titleFilter)) {
		return false
	}

	if (descriptionFilter && !descriptionValue.includes(descriptionFilter)) {
		return false
	}

	if (identifierFilter && !identifierValue.includes(identifierFilter)) {
		return false
	}

	const hasOnlyProjectMetadataFilters =
		filters.taskStatus === defaultProjectFilters.taskStatus &&
		filters.taskLabelId === defaultProjectFilters.taskLabelId &&
		filters.taskPriority === defaultProjectFilters.taskPriority &&
		filters.taskDue === defaultProjectFilters.taskDue &&
		filters.taskTitle === defaultProjectFilters.taskTitle &&
		filters.taskDescription === defaultProjectFilters.taskDescription

	return hasOnlyProjectMetadataFilters
}

export function getSavedFilterProjectOptions(projects: Project[]) {
	return projects
		.filter(project => Number(project.id || 0) > 0)
		.map(project => ({
			...project,
			path: buildProjectPath(project, projects),
		}))
		.sort((left, right) => `${left.path || ''}`.localeCompare(`${right.path || ''}`))
}

function buildProjectPath(project: Project, projects: Project[]) {
	const seen = new Set<number>()
	const parts = [`${project.title || ''}`.trim()].filter(Boolean)
	let parentId = Number(project.parent_project_id || 0)
	while (parentId > 0 && !seen.has(parentId)) {
		seen.add(parentId)
		const parent = projects.find(entry => entry.id === parentId)
		if (!parent) {
			break
		}
		parts.unshift(`${parent.title || ''}`.trim())
		parentId = Number(parent.parent_project_id || 0)
	}
	return parts.join(' / ')
}

function getSavedFilterProjectId(filterId: number) {
	const numericFilterId = Number(filterId)
	return numericFilterId > 0 ? (numericFilterId + 1) * -1 : 0
}

function normalizeStringArray(value: unknown) {
	return Array.isArray(value)
		? value.map(entry => `${entry}`.trim()).filter(Boolean)
		: []
}

function removeQueryPattern(
	input: string,
	pattern: RegExp,
	onMatch: (match: RegExpExecArray) => void,
) {
	const match = pattern.exec(input)
	if (!match) {
		return input
	}

	onMatch(match)
	return normalizeSavedFilterQueryText(input.replace(match[0], ''))
}

function normalizeSavedFilterQueryText(value: string) {
	return `${value || ''}`
		.split(/\s*&&\s*/)
		.map(entry => entry.trim())
		.filter(Boolean)
		.join(' && ')
}

function unescapeSavedFilterValue(value: string) {
	return `${value || ''}`.replace(/\\"/g, '"')
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

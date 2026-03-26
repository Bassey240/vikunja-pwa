import type {Project, Screen, Task} from '@/types'

export type TaskSortBy =
	| 'position'
	| 'due_date'
	| 'priority'
	| 'title'
	| 'created'
	| 'updated'
	| 'percent_done'
	| 'done_at'

export type TaskSortOrder = 'asc' | 'desc'

export interface TaskFilters {
	status: 'open' | 'all' | 'done'
	projectId: number
	labelId: number
	priority: 'any' | '0' | '1' | '2' | '3' | '4' | '5'
	due: 'any' | 'none' | 'overdue' | 'today' | 'next7'
	title: string
	description: string
	sortBy: TaskSortBy
	sortOrder: TaskSortOrder
}

export interface ProjectFilters {
	favorite: 'any' | 'only' | 'exclude'
	title: string
	description: string
	identifier: string
	taskStatus: 'any' | 'open' | 'done'
	taskLabelId: number
	taskPriority: 'any' | '0' | '1' | '2' | '3' | '4' | '5'
	taskDue: 'any' | 'none' | 'overdue' | 'today' | 'next7'
	taskTitle: string
	taskDescription: string
	taskSortBy: TaskSortBy
	taskSortOrder: TaskSortOrder
}

export type TaskFilterField = keyof TaskFilters
export type ProjectFilterField = keyof ProjectFilters

export interface TaskFilterProjectOption extends Project {
	path: string
}

export type SearchResult =
	| {
		kind: 'project'
		project: Project
		rank: number
		sortTitle: string
	}
	| {
		kind: 'task'
		task: Task
		rank: number
		sortTitle: string
	}

export const taskSortFieldOptions: Array<{value: TaskSortBy; label: string}> = [
	{value: 'position', label: 'Manual'},
	{value: 'due_date', label: 'Due date'},
	{value: 'priority', label: 'Priority'},
	{value: 'title', label: 'Title'},
	{value: 'created', label: 'Created'},
	{value: 'updated', label: 'Updated'},
	{value: 'percent_done', label: 'Progress'},
	{value: 'done_at', label: 'Completed'},
]

export const taskSortOrderOptions: Array<{value: TaskSortOrder; label: string}> = [
	{value: 'asc', label: 'Ascending'},
	{value: 'desc', label: 'Descending'},
]

export const defaultTaskFilters: TaskFilters = {
	status: 'open',
	projectId: 0,
	labelId: 0,
	priority: 'any',
	due: 'any',
	title: '',
	description: '',
	sortBy: 'position',
	sortOrder: 'asc',
}

export const defaultProjectFilters: ProjectFilters = {
	favorite: 'any',
	title: '',
	description: '',
	identifier: '',
	taskStatus: 'any',
	taskLabelId: 0,
	taskPriority: 'any',
	taskDue: 'any',
	taskTitle: '',
	taskDescription: '',
	taskSortBy: 'position',
	taskSortOrder: 'asc',
}

export function getTaskFilterUiConfig(screen: Screen) {
	const allowProject = ['today', 'inbox', 'upcoming'].includes(screen)
	return {
		enabled: allowProject || screen === 'tasks',
		allowProject,
	}
}

export function normalizeTaskFilters(filters: Partial<TaskFilters>, allowProject: boolean) {
	const sortBy = taskSortFieldOptions.some(option => option.value === filters.sortBy)
		? (filters.sortBy as TaskSortBy)
		: defaultTaskFilters.sortBy
	const sortOrder = taskSortOrderOptions.some(option => option.value === filters.sortOrder)
		? (filters.sortOrder as TaskSortOrder)
		: defaultTaskFilters.sortOrder

	return {
		...defaultTaskFilters,
		...filters,
		projectId: allowProject ? Number(filters.projectId || 0) : 0,
		labelId: Number(filters.labelId || 0),
		title: `${filters.title || ''}`.trim(),
		description: `${filters.description || ''}`.trim(),
		sortBy,
		sortOrder: sortBy === 'position' ? 'asc' : sortOrder,
	}
}

export function normalizeProjectFilters(filters: Partial<ProjectFilters>) {
	const taskSortBy = taskSortFieldOptions.some(option => option.value === filters.taskSortBy)
		? (filters.taskSortBy as TaskSortBy)
		: defaultProjectFilters.taskSortBy
	const taskSortOrder = taskSortOrderOptions.some(option => option.value === filters.taskSortOrder)
		? (filters.taskSortOrder as TaskSortOrder)
		: defaultProjectFilters.taskSortOrder

	return {
		...defaultProjectFilters,
		...filters,
		taskLabelId: Number(filters.taskLabelId || 0),
		title: `${filters.title || ''}`.trim(),
		description: `${filters.description || ''}`.trim(),
		identifier: `${filters.identifier || ''}`.trim(),
		taskTitle: `${filters.taskTitle || ''}`.trim(),
		taskDescription: `${filters.taskDescription || ''}`.trim(),
		taskSortBy,
		taskSortOrder: taskSortBy === 'position' ? 'asc' : taskSortOrder,
	}
}

export function hasActiveTaskFilters(filters: TaskFilters) {
	return (
		filters.status !== defaultTaskFilters.status ||
		filters.projectId !== defaultTaskFilters.projectId ||
		filters.labelId !== defaultTaskFilters.labelId ||
		filters.priority !== defaultTaskFilters.priority ||
		filters.due !== defaultTaskFilters.due ||
		filters.title !== defaultTaskFilters.title ||
		filters.description !== defaultTaskFilters.description ||
		filters.sortBy !== defaultTaskFilters.sortBy ||
		filters.sortOrder !== defaultTaskFilters.sortOrder
	)
}

export function hasActiveProjectFilters(filters: ProjectFilters) {
	return (
		filters.favorite !== defaultProjectFilters.favorite ||
		filters.title !== defaultProjectFilters.title ||
		filters.description !== defaultProjectFilters.description ||
		filters.identifier !== defaultProjectFilters.identifier ||
		filters.taskStatus !== defaultProjectFilters.taskStatus ||
		filters.taskLabelId !== defaultProjectFilters.taskLabelId ||
		filters.taskPriority !== defaultProjectFilters.taskPriority ||
		filters.taskDue !== defaultProjectFilters.taskDue ||
		filters.taskTitle !== defaultProjectFilters.taskTitle ||
		filters.taskDescription !== defaultProjectFilters.taskDescription ||
		filters.taskSortBy !== defaultProjectFilters.taskSortBy ||
		filters.taskSortOrder !== defaultProjectFilters.taskSortOrder
	)
}

export function hasActiveProjectTaskFilters(filters: ProjectFilters) {
	return (
		filters.taskStatus !== defaultProjectFilters.taskStatus ||
		filters.taskLabelId !== defaultProjectFilters.taskLabelId ||
		filters.taskPriority !== defaultProjectFilters.taskPriority ||
		filters.taskDue !== defaultProjectFilters.taskDue ||
		filters.taskTitle !== defaultProjectFilters.taskTitle ||
		filters.taskDescription !== defaultProjectFilters.taskDescription
	)
}

export function setTaskFilterField(
	filters: TaskFilters,
	field: TaskFilterField,
	rawValue: string,
) {
	const nextFilters = {...filters}

	switch (field) {
		case 'status':
			nextFilters.status = ['open', 'all', 'done'].includes(rawValue)
				? (rawValue as TaskFilters['status'])
				: defaultTaskFilters.status
			break
		case 'projectId':
		case 'labelId':
			nextFilters[field] = Number(rawValue || 0)
			break
		case 'priority':
			nextFilters.priority = ['any', '0', '1', '2', '3', '4', '5'].includes(rawValue)
				? (rawValue as TaskFilters['priority'])
				: defaultTaskFilters.priority
			break
		case 'due':
			nextFilters.due = ['any', 'none', 'overdue', 'today', 'next7'].includes(rawValue)
				? (rawValue as TaskFilters['due'])
				: defaultTaskFilters.due
			break
		case 'title':
		case 'description':
			nextFilters[field] = `${rawValue || ''}`.trim()
			break
		case 'sortBy':
			nextFilters.sortBy = taskSortFieldOptions.some(option => option.value === rawValue)
				? (rawValue as TaskFilters['sortBy'])
				: defaultTaskFilters.sortBy
			if (nextFilters.sortBy === 'position') {
				nextFilters.sortOrder = 'asc'
			}
			break
		case 'sortOrder':
			nextFilters.sortOrder = taskSortOrderOptions.some(option => option.value === rawValue)
				? (rawValue as TaskFilters['sortOrder'])
				: defaultTaskFilters.sortOrder
			if (nextFilters.sortBy === 'position') {
				nextFilters.sortOrder = 'asc'
			}
			break
	}

	return nextFilters
}

export function getTaskSortByForScreen(screen: Screen, filters: Pick<TaskFilters, 'sortBy'>) {
	return screen === 'tasks' ? filters.sortBy : defaultTaskFilters.sortBy
}

export function setProjectFilterField(
	filters: ProjectFilters,
	field: ProjectFilterField,
	rawValue: string,
) {
	const nextFilters = {...filters}

	switch (field) {
		case 'favorite':
			nextFilters.favorite = ['any', 'only', 'exclude'].includes(rawValue)
				? (rawValue as ProjectFilters['favorite'])
				: defaultProjectFilters.favorite
			break
		case 'title':
		case 'description':
		case 'identifier':
		case 'taskTitle':
		case 'taskDescription':
			nextFilters[field] = `${rawValue || ''}`.trim()
			break
		case 'taskStatus':
			nextFilters.taskStatus = ['any', 'open', 'done'].includes(rawValue)
				? (rawValue as ProjectFilters['taskStatus'])
				: defaultProjectFilters.taskStatus
			break
		case 'taskLabelId':
			nextFilters.taskLabelId = Number(rawValue || 0)
			break
		case 'taskPriority':
			nextFilters.taskPriority = ['any', '0', '1', '2', '3', '4', '5'].includes(rawValue)
				? (rawValue as ProjectFilters['taskPriority'])
				: defaultProjectFilters.taskPriority
			break
		case 'taskDue':
			nextFilters.taskDue = ['any', 'none', 'overdue', 'today', 'next7'].includes(rawValue)
				? (rawValue as ProjectFilters['taskDue'])
				: defaultProjectFilters.taskDue
			break
		case 'taskSortBy':
			nextFilters.taskSortBy = taskSortFieldOptions.some(option => option.value === rawValue)
				? (rawValue as ProjectFilters['taskSortBy'])
				: defaultProjectFilters.taskSortBy
			if (nextFilters.taskSortBy === 'position') {
				nextFilters.taskSortOrder = 'asc'
			}
			break
		case 'taskSortOrder':
			nextFilters.taskSortOrder = taskSortOrderOptions.some(option => option.value === rawValue)
				? (rawValue as ProjectFilters['taskSortOrder'])
				: defaultProjectFilters.taskSortOrder
			if (nextFilters.taskSortBy === 'position') {
				nextFilters.taskSortOrder = 'asc'
			}
			break
	}

	return nextFilters
}

export function getUniqueFilterValues(values: string[]) {
	return [...new Set(
		values
			.map(value => `${value || ''}`.replace(/\s+/g, ' ').trim())
			.filter(Boolean),
	)]
		.sort((a, b) => a.localeCompare(b))
		.slice(0, 200)
}

export function getTaskFilterProjectOptions(
	projects: Project[],
	getProjectAncestors: (projectId: number) => Project[],
) {
	return projects
		.slice()
		.map(project => ({
			...project,
			path: getProjectAncestors(project.id).map(entry => entry.title).join(' / '),
		}))
		.sort((a, b) => a.path.localeCompare(b.path))
}

export function taskMatchesFilters(task: Task, filters: TaskFilters) {
	const dueDate = getTaskDueDate(task)
	const dueRange = getTaskDueRange()
	const taskLabels = Array.isArray(task.labels) ? task.labels : []
	const taskPriority = Number(task.priority ?? 0)
	const titleValue = `${task.title || ''}`.trim().toLowerCase()
	const descriptionValue = `${task.description || ''}`.trim().toLowerCase()
	const titleFilter = `${filters.title || ''}`.trim().toLowerCase()
	const descriptionFilter = `${filters.description || ''}`.trim().toLowerCase()

	if (filters.status === 'open' && task.done) {
		return false
	}

	if (filters.status === 'done' && !task.done) {
		return false
	}

	if (filters.projectId && Number(task.project_id || 0) !== filters.projectId) {
		return false
	}

	if (filters.labelId && !taskLabels.some(label => Number(label?.id || 0) === filters.labelId)) {
		return false
	}

	if (filters.priority !== 'any' && taskPriority !== Number(filters.priority)) {
		return false
	}

	if (titleFilter && !titleValue.includes(titleFilter)) {
		return false
	}

	if (descriptionFilter && !descriptionValue.includes(descriptionFilter)) {
		return false
	}

	if (filters.due === 'none') {
		return !dueDate
	}

	if (!dueDate) {
		return filters.due === 'any'
	}

	if (filters.due === 'overdue' && dueDate >= dueRange.todayStart) {
		return false
	}

	if (filters.due === 'today' && (dueDate < dueRange.todayStart || dueDate >= dueRange.tomorrowStart)) {
		return false
	}

	if (filters.due === 'next7' && (dueDate < dueRange.todayStart || dueDate >= dueRange.nextWeekStart)) {
		return false
	}

	return true
}

export function taskMatchesProjectFilters(task: Task, filters: ProjectFilters) {
	const dueDate = getTaskDueDate(task)
	const dueRange = getTaskDueRange()
	const taskLabels = Array.isArray(task.labels) ? task.labels : []
	const taskPriority = Number(task.priority ?? 0)
	const titleValue = `${task.title || ''}`.trim().toLowerCase()
	const descriptionValue = `${task.description || ''}`.trim().toLowerCase()
	const titleFilter = `${filters.taskTitle || ''}`.trim().toLowerCase()
	const descriptionFilter = `${filters.taskDescription || ''}`.trim().toLowerCase()

	if (filters.taskStatus === 'open' && task.done) {
		return false
	}

	if (filters.taskStatus === 'done' && !task.done) {
		return false
	}

	if (filters.taskLabelId && !taskLabels.some(label => Number(label?.id || 0) === filters.taskLabelId)) {
		return false
	}

	if (filters.taskPriority !== 'any' && taskPriority !== Number(filters.taskPriority)) {
		return false
	}

	if (titleFilter && !titleValue.includes(titleFilter)) {
		return false
	}

	if (descriptionFilter && !descriptionValue.includes(descriptionFilter)) {
		return false
	}

	if (filters.taskDue === 'none') {
		return !dueDate
	}

	if (!dueDate) {
		return filters.taskDue === 'any'
	}

	if (filters.taskDue === 'overdue' && dueDate >= dueRange.todayStart) {
		return false
	}

	if (filters.taskDue === 'today' && (dueDate < dueRange.todayStart || dueDate >= dueRange.tomorrowStart)) {
		return false
	}

	if (filters.taskDue === 'next7' && (dueDate < dueRange.todayStart || dueDate >= dueRange.nextWeekStart)) {
		return false
	}

	return true
}

export function createVisibleProjectTree(
	projects: Project[],
	filters: ProjectFilters,
	projectFilterTasks: Task[],
) {
	const projectMap = new Map(projects.map(project => [project.id, project]))
	const childIdsByParentId = new Map<number, number[]>()
	const tasksByProjectId = new Map<number, Task[]>()

	for (const project of projects) {
		const parentProjectId = Number(project.parent_project_id || 0)
		if (!parentProjectId || !projectMap.has(parentProjectId) || parentProjectId === project.id) {
			continue
		}

		const childIds = childIdsByParentId.get(parentProjectId) || []
		childIds.push(project.id)
		childIdsByParentId.set(parentProjectId, childIds)
	}

	for (const task of projectFilterTasks) {
		const projectId = Number(task.project_id || 0)
		if (!tasksByProjectId.has(projectId)) {
			tasksByProjectId.set(projectId, [])
		}
		tasksByProjectId.get(projectId)!.push(task)
	}

	const branchMatchesCache = new Map<number, boolean>()
	const visiting = new Set<number>()

	function branchMatches(projectId: number): boolean {
		if (branchMatchesCache.has(projectId)) {
			return branchMatchesCache.get(projectId)!
		}

		if (visiting.has(projectId)) {
			return false
		}

		visiting.add(projectId)
		const project = projectMap.get(projectId)
		let matches = Boolean(project) && projectMatchesFilters(project!, filters, tasksByProjectId)
		if (!matches) {
			for (const childId of childIdsByParentId.get(projectId) || []) {
				if (branchMatches(childId)) {
					matches = true
					break
				}
			}
		}

		visiting.delete(projectId)
		branchMatchesCache.set(projectId, matches)
		return matches
	}

	const rootProjects = projects
		.filter(project => {
			const parentProjectId = Number(project.parent_project_id || 0)
			return (parentProjectId === 0 || !projectMap.has(parentProjectId)) && branchMatches(project.id)
		})
		.sort(compareByPositionThenId)

	function getChildren(parentProjectId: number) {
		return (childIdsByParentId.get(parentProjectId) || [])
			.map(childId => projectMap.get(childId))
			.filter((project): project is Project => Boolean(project))
			.filter(project => branchMatches(project.id))
			.sort(compareByPositionThenId)
	}

	return {
		rootProjects,
		getChildren,
	}
}

export function getCombinedSearchResults(
	projects: Project[],
	searchTasks: Task[],
	query: string,
) {
	const normalizedQuery = `${query || ''}`.trim().toLowerCase()
	if (!normalizedQuery) {
		return [] as SearchResult[]
	}

	const projectResults: SearchResult[] = projects
		.filter(project => {
			const haystack = `${project.title || ''} ${project.description || ''}`.toLowerCase()
			return haystack.includes(normalizedQuery)
		})
		.map(project => ({
			kind: 'project',
			project,
			rank: getSearchResultRank(`${project.title || ''}`.toLowerCase(), normalizedQuery),
			sortTitle: `${project.title || ''}`.toLowerCase(),
		}))

	const taskResults: SearchResult[] = searchTasks.map(task => ({
		kind: 'task',
		task,
		rank: getSearchResultRank(`${task.title || ''}`.toLowerCase(), normalizedQuery),
		sortTitle: `${task.title || ''}`.toLowerCase(),
	}))

	return [...projectResults, ...taskResults]
		.sort((a, b) => a.rank - b.rank || a.sortTitle.localeCompare(b.sortTitle) || a.kind.localeCompare(b.kind))
		.slice(0, 24)
}

function projectMatchesFilters(
	project: Project,
	filters: ProjectFilters,
	tasksByProjectId: Map<number, Task[]>,
) {
	const titleValue = `${project.title || ''}`.trim().toLowerCase()
	const descriptionValue = `${project.description || ''}`.trim().toLowerCase()
	const identifierValue = `${project.identifier || ''}`.trim().toLowerCase()
	const titleFilter = `${filters.title || ''}`.trim().toLowerCase()
	const descriptionFilter = `${filters.description || ''}`.trim().toLowerCase()
	const identifierFilter = `${filters.identifier || ''}`.trim().toLowerCase()
	const isFavorite = Boolean(project.is_favorite)

	if (filters.favorite === 'only' && !isFavorite) {
		return false
	}

	if (filters.favorite === 'exclude' && isFavorite) {
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

	if (!hasActiveProjectTaskFilters(filters)) {
		return true
	}

	// Project visibility should not be controlled by task completion state.
	// The tree stays visible and task rows are filtered separately by taskMatcher.
	const hasOnlyTaskStatusFilter =
		filters.taskStatus !== defaultProjectFilters.taskStatus &&
		filters.taskLabelId === defaultProjectFilters.taskLabelId &&
		filters.taskPriority === defaultProjectFilters.taskPriority &&
		filters.taskTitle === defaultProjectFilters.taskTitle &&
		filters.taskDescription === defaultProjectFilters.taskDescription &&
		filters.taskDue === defaultProjectFilters.taskDue
	if (hasOnlyTaskStatusFilter) {
		return true
	}

	return (tasksByProjectId.get(project.id) || []).some(task => taskMatchesProjectFilters(task, filters))
}

function getTaskDueDate(task: Task) {
	if (!task.due_date) {
		return null
	}

	const date = new Date(task.due_date)
	return Number.isNaN(date.getTime()) ? null : date
}

function getTaskDueRange() {
	const todayStart = startOfDay(new Date())
	const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
	const nextWeekStart = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)

	return {
		todayStart,
		tomorrowStart,
		nextWeekStart,
	}
}

function startOfDay(value: Date) {
	const date = new Date(value)
	date.setHours(0, 0, 0, 0)
	return date
}

function getSearchResultRank(value: string, query: string) {
	if (!value) {
		return 3
	}
	if (value === query) {
		return 0
	}
	if (value.startsWith(query)) {
		return 1
	}
	if (value.includes(query)) {
		return 2
	}
	return 3
}

function compareByPositionThenId(
	a: {position?: number | null; id?: number | null},
	b: {position?: number | null; id?: number | null},
) {
	return Number(a.position || 0) - Number(b.position || 0) || Number(a.id || 0) - Number(b.id || 0)
}

import type {Task, TaskRelationRef} from '@/types'
import type {TaskSortBy, TaskSortOrder} from '@/hooks/useFilters'
import {cloneRelatedTasksMap} from '@/utils/taskRelations'
import {compareByPositionThenId} from './project-helpers'

interface TaskCollectionsLookup {
	tasks: Task[]
	todayTasks: Task[]
	inboxTasks: Task[]
	upcomingTasks: Task[]
	searchTasks: Task[]
	savedFilterTasks: Task[]
	projectPreviewTasksById: Record<number, Task[]>
}

export type TaskMatcher = (task: Task) => boolean

interface TaskBranchContext {
	taskMap: Map<number, Task>
	childIdsFromParents: Set<number>
	childIdsByParentId: Map<number, Set<number>>
	branchMatches: (taskId: number) => boolean
}

const defaultTaskMatcher: TaskMatcher = task => !task.done

export function isManualTaskSort(sortBy: TaskSortBy | null | undefined) {
	return (sortBy || 'position') === 'position'
}

export function normalizeTaskGraph(taskList: Task[] | null | undefined) {
	if (!Array.isArray(taskList) || taskList.length === 0) {
		return []
	}

	const normalizedTasks = taskList.map(task => ({
		...task,
		assignees: Array.isArray(task.assignees) ? task.assignees.map(assignee => ({...assignee})) : [],
		comments: Array.isArray(task.comments)
			? task.comments.map(comment => ({
				...comment,
				author: comment?.author ? {...comment.author} : {id: 0, name: '', username: '', email: ''},
			}))
			: [],
		comment_count: Number(task.comment_count || 0),
		labels: Array.isArray(task.labels) ? [...task.labels] : [],
		related_tasks: cloneRelatedTasksMap(task.related_tasks),
	}))
	const taskMap = new Map(normalizedTasks.map(task => [task.id, task]))

	for (const task of normalizedTasks) {
		for (const parentRef of task.related_tasks?.parenttask || []) {
			const parent = taskMap.get(parentRef.id)
			if (!parent) {
				continue
			}

			if (!parent.related_tasks) {
				parent.related_tasks = {}
			}

			if (!parent.related_tasks.subtask) {
				parent.related_tasks.subtask = []
			}

			if (!parent.related_tasks.subtask.some(entry => entry.id === task.id)) {
				parent.related_tasks.subtask.push(createTaskRelationRef(task))
			}
		}

		for (const childRef of task.related_tasks?.subtask || []) {
			const child = taskMap.get(childRef.id)
			if (!child) {
				continue
			}

			if (!child.related_tasks) {
				child.related_tasks = {}
			}

			if (!child.related_tasks.parenttask) {
				child.related_tasks.parenttask = []
			}

			if (!child.related_tasks.parenttask.some(entry => entry.id === task.id)) {
				child.related_tasks.parenttask.push(createTaskRelationRef(task))
			}
		}
	}

	return normalizedTasks
}

export function buildTaskCollectionPath({
	search = '',
	filter = '',
	sortBy = [],
	orderBy = [],
}: {
	search?: string
	filter?: string
	sortBy?: string[]
	orderBy?: string[]
} = {}) {
	const params = new URLSearchParams()
	const normalizedSearch = `${search || ''}`.trim()
	const normalizedFilter = `${filter || ''}`.trim()

	if (normalizedSearch) {
		params.set('s', normalizedSearch)
	}

	if (normalizedFilter) {
		params.set('filter', normalizedFilter)
		params.set('filter_timezone', 'UTC')
	}

	appendQueryArray(params, 'sort_by', sortBy)
	appendQueryArray(params, 'order_by', orderBy)
	params.append('expand', 'subtasks')
	params.append('expand', 'comment_count')

	const query = params.toString()
	return query ? `/api/tasks?${query}` : '/api/tasks'
}

export function getTaskSortQuery(sortBy: TaskSortBy = 'position', sortOrder: TaskSortOrder = 'asc') {
	const primarySortBy = sortBy || 'position'
	const primaryOrderBy = isManualTaskSort(primarySortBy) ? 'asc' : (sortOrder || 'asc')

	return {
		sortBy: [primarySortBy, 'id'],
		orderBy: [primaryOrderBy, primaryOrderBy],
	}
}

export function getTaskCollectionForTask(taskId: number, projectId: number, collections: TaskCollectionsLookup) {
	if (collections.tasks.some(task => task.id === taskId)) {
		return collections.tasks
	}

	if (collections.todayTasks.some(task => task.id === taskId)) {
		return collections.todayTasks
	}

	if (collections.inboxTasks.some(task => task.id === taskId)) {
		return collections.inboxTasks
	}

	if (collections.upcomingTasks.some(task => task.id === taskId)) {
		return collections.upcomingTasks
	}

	if (collections.searchTasks.some(task => task.id === taskId)) {
		return collections.searchTasks
	}

	if (collections.savedFilterTasks.some(task => task.id === taskId)) {
		return collections.savedFilterTasks
	}

	const previewTasks = collections.projectPreviewTasksById[projectId] || []
	if (previewTasks.some(task => task.id === taskId)) {
		return previewTasks
	}

	if (collections.todayTasks.length > 0) {
		return collections.todayTasks
	}

	if (collections.inboxTasks.length > 0) {
		return collections.inboxTasks
	}

	if (collections.upcomingTasks.length > 0) {
		return collections.upcomingTasks
	}

	if (collections.searchTasks.length > 0) {
		return collections.searchTasks
	}

	if (collections.savedFilterTasks.length > 0) {
		return collections.savedFilterTasks
	}

	return collections.tasks
}

export function findTaskInAnyContext(taskId: number, collections: TaskCollectionsLookup) {
	for (const taskList of [
		collections.tasks,
		collections.todayTasks,
		collections.inboxTasks,
		collections.upcomingTasks,
		collections.searchTasks,
		collections.savedFilterTasks,
	]) {
		const task = taskList.find(entry => entry.id === taskId)
		if (task) {
			return task
		}
	}

	for (const taskList of Object.values(collections.projectPreviewTasksById)) {
		const task = taskList.find(entry => entry.id === taskId)
		if (task) {
			return task
		}
	}

	return null
}

export function getVisibleRootTasksFor(
	taskList: Task[],
	matcher: TaskMatcher = defaultTaskMatcher,
	sortBy: TaskSortBy = 'position',
) {
	const context = buildTaskBranchContext(taskList, matcher)
	const compareTasks = getTaskDisplayComparator(taskList, sortBy)

	return taskList
		.filter(task => {
			const parentIds = (task.related_tasks?.parenttask || []).map(parent => parent.id)
			const hasParentInView = parentIds.some(parentId => context.taskMap.has(parentId))

			return !hasParentInView && !context.childIdsFromParents.has(task.id) && context.branchMatches(task.id)
		})
		.sort(compareTasks)
}

export function getSubtasksFor(
	task: Task,
	taskList: Task[],
	matcher: TaskMatcher = defaultTaskMatcher,
	sortBy: TaskSortBy = 'position',
) {
	const context = buildTaskBranchContext(taskList, matcher)
	const childIds = context.childIdsByParentId.get(task.id) || new Set<number>()
	const compareTasks = getTaskDisplayComparator(taskList, sortBy)

	return [...childIds]
		.map(childId => context.taskMap.get(childId))
		.filter((entry): entry is Task => Boolean(entry))
		.filter(entry => context.branchMatches(entry.id))
		.sort(compareTasks)
}

export function expandTaskAncestorsInCollection(taskId: number, taskList: Task[], expandedTaskIds: Set<number>) {
	const nextExpandedTaskIds = new Set(expandedTaskIds)
	let currentTask = taskList.find(task => task.id === taskId) || null

	while (currentTask) {
		const parentTask = getParentTaskInCollection(currentTask, taskList)
		if (!parentTask) {
			return nextExpandedTaskIds
		}

		nextExpandedTaskIds.add(parentTask.id)
		currentTask = parentTask
	}

	return nextExpandedTaskIds
}

export function canTaskUsePositionReorder(
	task: Task | null | undefined,
	sortBy: TaskSortBy = 'position',
) {
	return Boolean(Number(task?.id || 0)) && isManualTaskSort(sortBy)
}

export function canTaskUseStructuralDrag(task: Task | null | undefined) {
	return Boolean(Number(task?.id || 0))
}

export function getSiblingTasksForReorder(task: Task, taskList: Task[]) {
	const parentTask = getParentTaskInCollection(task, taskList)
	if (parentTask) {
		return getSubtasksForReorder(parentTask, taskList)
	}

	return getRootTasksForReorder(taskList)
}

function createTaskRelationRef(task: Task): TaskRelationRef {
	return {
		id: task.id,
		title: task.title,
		project_id: task.project_id,
		done: task.done,
		position: task.position,
	}
}

function appendQueryArray(params: URLSearchParams, key: string, values: string[]) {
	for (const value of values) {
		if (!value) {
			continue
		}

		params.append(key, value)
	}
}

function getTaskDisplayComparator(taskList: Task[], sortBy: TaskSortBy) {
	const compareDoneLast = (a: Task, b: Task) => Number(a.done) - Number(b.done)

	if (isManualTaskSort(sortBy)) {
		return (a: Task, b: Task) => compareDoneLast(a, b) || compareByPositionThenId(a, b)
	}

	const indexByTaskId = new Map(taskList.map((task, index) => [task.id, index]))
	return (a: Task, b: Task) =>
		compareDoneLast(a, b) ||
		(indexByTaskId.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
			(indexByTaskId.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
		compareByPositionThenId(a, b)
}

function buildTaskBranchContext(taskList: Task[], matcher: TaskMatcher): TaskBranchContext {
	if (!Array.isArray(taskList) || taskList.length === 0) {
		return {
			taskMap: new Map(),
			childIdsFromParents: new Set(),
			childIdsByParentId: new Map(),
			branchMatches: () => false,
		}
	}

	const taskMap = new Map(taskList.map(task => [task.id, task]))
	const childIdsFromParents = new Set<number>()
	const childIdsByParentId = new Map<number, Set<number>>()

	function addChild(parentId: number, childId: number) {
		if (!taskMap.has(parentId) || !taskMap.has(childId) || parentId === childId) {
			return
		}

		let childIds = childIdsByParentId.get(parentId)
		if (!childIds) {
			childIds = new Set()
			childIdsByParentId.set(parentId, childIds)
		}

		childIds.add(childId)
		childIdsFromParents.add(childId)
	}

	for (const task of taskList) {
		for (const child of task.related_tasks?.subtask || []) {
			addChild(task.id, child.id)
		}
	}

	for (const task of taskList) {
		for (const parent of task.related_tasks?.parenttask || []) {
			addChild(parent.id, task.id)
		}
	}

	const branchMatchesCache = new Map<number, boolean>()
	const visiting = new Set<number>()

	function branchMatches(taskId: number) {
		if (branchMatchesCache.has(taskId)) {
			return branchMatchesCache.get(taskId) || false
		}

		if (visiting.has(taskId)) {
			return false
		}

		visiting.add(taskId)

		const task = taskMap.get(taskId)
		let matches = task ? matcher(task) : false
		if (!matches) {
			for (const childId of childIdsByParentId.get(taskId) || []) {
				if (branchMatches(childId)) {
					matches = true
					break
				}
			}
		}

		visiting.delete(taskId)
		branchMatchesCache.set(taskId, matches)
		return matches
	}

	return {
		taskMap,
		childIdsFromParents,
		childIdsByParentId,
		branchMatches,
	}
}

function getRootTasksForReorder(taskList: Task[]) {
	const taskMap = new Map(taskList.map(task => [task.id, task]))
	const childIdsFromParents = new Set<number>()

	for (const task of taskList) {
		for (const child of task.related_tasks?.subtask || []) {
			if (taskMap.has(child.id)) {
				childIdsFromParents.add(child.id)
			}
		}
	}

	return taskList
		.filter(task => {
			const parentIds = (task.related_tasks?.parenttask || []).map(parent => parent.id)
			const hasParentInView = parentIds.some(parentId => taskMap.has(parentId))
			return !hasParentInView && !childIdsFromParents.has(task.id)
		})
		.sort(compareByPositionThenId)
}

function getSubtasksForReorder(task: Task, taskList: Task[]) {
	const taskMap = new Map(taskList.map(entry => [entry.id, entry]))
	const childIds = new Set((task.related_tasks?.subtask || []).map(subtask => subtask.id))

	for (const candidate of taskList) {
		const parentIds = (candidate.related_tasks?.parenttask || []).map(parent => parent.id)
		if (parentIds.includes(task.id)) {
			childIds.add(candidate.id)
		}
	}

	return [...childIds]
		.map(childId => taskMap.get(childId))
		.filter((entry): entry is Task => Boolean(entry))
		.sort(compareByPositionThenId)
}

function getParentTaskInCollection(task: Task, taskList: Task[]) {
	const parentIds = new Set((task.related_tasks?.parenttask || []).map(parent => parent.id))
	return taskList.find(candidate => parentIds.has(candidate.id)) || null
}

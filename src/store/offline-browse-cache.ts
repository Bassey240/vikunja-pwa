import type {Bucket, ProjectView, Task} from '@/types'
import type {AppStore} from './index'
import {loadOfflineSnapshot, mergeOfflineSnapshot} from './offline-snapshot'
import {compareByPositionThenId} from './project-helpers'
import {normalizeTaskGraph} from './selectors'

function normalizeOfflineTaskList(taskList: Task[] | null | undefined) {
	return normalizeTaskGraph(Array.isArray(taskList) ? taskList : []).sort(compareByPositionThenId)
}

function cloneTaskRecord(source: Record<string | number, Task[]> | null | undefined) {
	if (!source || typeof source !== 'object') {
		return {}
	}

	return Object.fromEntries(
		Object.entries(source).map(([key, tasks]) => [key, normalizeOfflineTaskList(tasks)]),
	)
}

function cloneProjectViewRecord(source: Record<string | number, ProjectView[]> | null | undefined) {
	if (!source || typeof source !== 'object') {
		return {}
	}

	return Object.fromEntries(
		Object.entries(source).map(([key, views]) => [
			key,
			Array.isArray(views) ? views.map(view => ({...view})) : [],
		]),
	)
}

function cloneBucketRecord(source: Record<string | number, Bucket[]> | null | undefined) {
	if (!source || typeof source !== 'object') {
		return {}
	}

	return Object.fromEntries(
		Object.entries(source).map(([key, buckets]) => [
			key,
			Array.isArray(buckets)
				? buckets
					.map(bucket => ({
						...bucket,
						tasks: normalizeOfflineTaskList(bucket.tasks),
					}))
					.sort(compareByPositionThenId)
				: [],
		]),
	)
}

export function buildOfflineProjectTaskIndex(taskList: Task[] | null | undefined) {
	const groupedTasksByProjectId: Record<string, Task[]> = {}

	for (const task of Array.isArray(taskList) ? taskList : []) {
		const projectId = Number(task.project_id || 0)
		if (!projectId) {
			continue
		}

		if (!groupedTasksByProjectId[String(projectId)]) {
			groupedTasksByProjectId[String(projectId)] = []
		}
		groupedTasksByProjectId[String(projectId)].push(task)
	}

	return cloneTaskRecord(groupedTasksByProjectId)
}

export function getOfflineCachedProjectTasks({
	projectId,
	tasksByProjectId,
	projectPreviewTasksById,
	projectFilterTasks,
	projectFilterTasksLoaded,
}: {
	projectId: number
	tasksByProjectId?: Record<string, Task[]> | null
	projectPreviewTasksById?: Record<string | number, Task[]> | null
	projectFilterTasks?: Task[] | null
	projectFilterTasksLoaded?: boolean
}) {
	const projectKey = String(projectId)
	const indexedTasksByProjectId =
		tasksByProjectId && typeof tasksByProjectId === 'object' ? tasksByProjectId : {}
	const indexedPreviewTasksByProjectId =
		projectPreviewTasksById && typeof projectPreviewTasksById === 'object'
			? projectPreviewTasksById
			: {}

	if (Array.isArray(indexedTasksByProjectId[projectKey])) {
		return normalizeOfflineTaskList(indexedTasksByProjectId[projectKey])
	}

	if (Array.isArray(indexedPreviewTasksByProjectId[projectKey])) {
		return normalizeOfflineTaskList(indexedPreviewTasksByProjectId[projectKey])
	}

	if (projectFilterTasksLoaded) {
		return buildOfflineProjectTaskIndex(projectFilterTasks)[projectKey] || []
	}

	return null
}

export function resolveOfflineProjectViewId({
	projectId,
	currentViewId,
	projectViewsById,
}: {
	projectId: number
	currentViewId: number | null | undefined
	projectViewsById?: Record<string | number, ProjectView[]> | null
}) {
	const projectViews =
		projectViewsById && typeof projectViewsById === 'object'
			? projectViewsById[String(projectId)] || projectViewsById[projectId] || []
			: []

	if (!Array.isArray(projectViews) || projectViews.length === 0) {
		return null
	}

	if (currentViewId && projectViews.some(view => view.id === currentViewId)) {
		return currentViewId
	}

	return (
		projectViews.find(view => view.view_kind === 'list')?.id ||
		projectViews.find(view => view.view_kind === 'kanban')?.id ||
		projectViews[0]?.id ||
		null
	)
}

export function persistOfflineBrowseSnapshot(state: AppStore) {
	const snapshot = loadOfflineSnapshot()
	const hasCurrentProjectTasks = Boolean(state.currentTasksProjectId)
	const hasGlobalProjectTaskCache = state.projectFilterTasksLoaded || (snapshot?.projectFilterTasksLoaded ?? false)
	const projectFilterTasks =
		state.projectFilterTasksLoaded || state.projectFilterTasks.length > 0
			? normalizeOfflineTaskList(state.projectFilterTasks)
			: Array.isArray(snapshot?.projectFilterTasks)
				? snapshot.projectFilterTasks
				: []
	const previewTasksByProjectId = {
		...(snapshot?.projectPreviewTasksById || {}),
		...cloneTaskRecord(state.projectPreviewTasksById),
	}
	const tasksByProjectId = {
		...(snapshot?.tasksByProjectId || {}),
		...cloneTaskRecord(state.projectPreviewTasksById),
		...(hasCurrentProjectTasks
			? {[String(state.currentTasksProjectId)]: normalizeOfflineTaskList(state.tasks)}
			: {}),
	}

	mergeOfflineSnapshot({
		currentTasksProjectId: state.currentTasksProjectId,
		currentProjectViewId: state.currentProjectViewId,
		currentInboxViewId: state.currentInboxViewId,
		currentSavedFilterViewId: state.currentSavedFilterViewId,
		selectedSavedFilterProjectId: state.selectedSavedFilterProjectId,
		tasks: normalizeOfflineTaskList(state.tasks),
		tasksByProjectId,
		projectPreviewTasksById: previewTasksByProjectId,
		todayTasks: normalizeOfflineTaskList(state.todayTasks),
		inboxTasks: normalizeOfflineTaskList(state.inboxTasks),
		upcomingTasks: normalizeOfflineTaskList(state.upcomingTasks),
		savedFilterTasks: normalizeOfflineTaskList(state.savedFilterTasks),
		projectFilterTasks,
		projectFilterTasksLoaded: hasGlobalProjectTaskCache,
		projectViewsById: {
			...(snapshot?.projectViewsById || {}),
			...cloneProjectViewRecord(state.projectViewsById),
		},
		projectBucketsByViewId: {
			...(snapshot?.projectBucketsByViewId || {}),
			...cloneBucketRecord(state.projectBucketsByViewId),
		},
	})
}

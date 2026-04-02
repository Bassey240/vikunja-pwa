import {api, type ApiError} from '@/api'
import {
	defaultTaskFilters,
	normalizeTaskFilters,
	setTaskFilterField as updateTaskFilterField,
	type TaskFilterField,
	type TaskFilters,
} from '@/hooks/useFilters'
import type {MenuAnchor, Screen, Task} from '@/types'
import {markTaskDropTrace} from '@/utils/dragPerf'
import {formatError} from '@/utils/formatting'
import {calculateTaskPosition} from '@/utils/taskPosition'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {enqueueMutation} from '../offline-queue'
import {blockNonQueueableOfflineAction, shouldQueueOffline} from '../offline-readonly'
import {
	getOfflineCachedProjectTasks,
	resolveOfflineProjectViewId,
} from '../offline-browse-cache'
import {loadOfflineSnapshot} from '../offline-snapshot'
import {
	buildTaskStatusFilter,
	buildTaskCollectionPath,
	expandTaskAncestorsInCollection,
	findTaskInAnyContext,
	isManualTaskSort,
	getTaskCollectionForTask,
	getTaskSortQuery,
	normalizeTaskGraph,
} from '../selectors'
import {
	applyOptimisticTaskMove,
	applyTaskPatchOptimisticUpdate,
	applyTaskDeletionOptimisticUpdate,
	applyTaskDoneOptimisticUpdate,
	applyTaskPositionSnapshot,
	buildProjectTaskQuery,
	buildTaskProjectMovePayload,
	captureTaskDeletionSnapshot,
	clearCompletionAnimationTimer,
	cloneTaskSnapshot,
	COMPLETION_ANIMATION_MS,
	completionAnimationTimers,
	getClonedTaskCollections,
	mergeTaskListsPreservingPrimaryOrder,
	mergeTaskListsWithStablePositions,
	getSelectiveTaskCollectionUpdate,
	getTaskCollections,
	isTaskDescendant,
	persistOfflineTaskCollections,
	resolveMovedTaskPosition,
	resolveTaskById,
	restoreTaskDeletionSnapshot,
	UNDOABLE_MUTATION_MS,
} from '../task-helpers'
import type {TaskMoveIntent} from '../types/task-move'
import {createBulkTasksSlice, type BulkTasksSlice} from './bulk-tasks'
import {createTaskComposersSlice, type TaskComposersSlice} from './task-composers'
import {createTaskDetailSlice, type TaskDetailStoreSlice} from './task-detail'

export interface TasksSlice extends BulkTasksSlice, TaskComposersSlice, TaskDetailStoreSlice {
	tasks: Task[]
	currentTasksProjectId: number | null
	todayTasks: Task[]
	inboxTasks: Task[]
	upcomingTasks: Task[]
	searchTasks: Task[]
	savedFilterTasks: Task[]
	projectFilterTasks: Task[]
	focusedTaskStack: Array<{taskId: number; projectId: number; sourceScreen: Screen}>
	focusedTaskId: number | null
	focusedTaskProjectId: number | null
	focusedTaskSourceScreen: Screen | null
	loadingTasks: boolean
	loadingToday: boolean
	loadingInbox: boolean
	loadingUpcoming: boolean
	loadingSearch: boolean
	loadingSavedFilterTasks: boolean
	loadingProjectFilterTasks: boolean
	projectFilterTasksLoaded: boolean
	searchQuery: string
	searchHasRun: boolean
	taskFilters: TaskFilters
	taskFilterDraft: TaskFilters
	expandedTaskIds: Set<number>
	togglingTaskIds: Set<number>
	recentlyCompletedTaskIds: Set<number>
	movingTaskIds: Set<number>
	loadTasks: (projectId: number | null) => Promise<void>
	loadTodayTasks: () => Promise<void>
	loadInboxTasks: () => Promise<void>
	loadUpcomingTasks: () => Promise<void>
	loadSearchTasks: (query?: string) => Promise<void>
	loadSavedFilterTasks: (projectId: number | null) => Promise<void>
	ensureProjectFilterTasksLoaded: (options?: {force?: boolean}) => Promise<void>
	refreshCurrentCollections: () => Promise<void>
	setSearchQuery: (query: string) => void
	clearSearchState: () => void
	setTaskFilterField: (field: TaskFilterField, value: string, allowProject: boolean) => void
	syncTaskFilterDraftFromActive: (allowProject: boolean) => void
	applyTaskFilterDraft: (allowProject: boolean) => Promise<void>
	resetTaskFilterDraft: () => void
	openSearchTaskResult: (taskId: number, projectId?: number) => Promise<void>
	toggleTaskExpanded: (taskId: number) => void
	toggleTaskMenu: (taskId: number, anchor: MenuAnchor) => void
	toggleTaskDone: (
		taskId: number,
		options?: {kanbanViewId?: number | null; sourceBucketId?: number | null; targetBucketId?: number | null},
	) => Promise<boolean>
	duplicateTask: (taskId: number) => Promise<boolean>
	deleteTask: (taskId: number) => Promise<boolean>
	moveTask: (intent: TaskMoveIntent) => Promise<boolean>
	openFocusedTask: (taskId: number, projectId: number, sourceScreen: Screen) => void
	closeFocusedTask: () => void
	resetTasksState: () => void
}

export const createTasksSlice: StateCreator<AppStore, [], [], TasksSlice> = (set, get) => ({
	tasks: [],
	currentTasksProjectId: null,
	todayTasks: [],
	inboxTasks: [],
	upcomingTasks: [],
	searchTasks: [],
	savedFilterTasks: [],
	projectFilterTasks: [],
	...createTaskDetailSlice(set, get),
	focusedTaskStack: [],
	focusedTaskId: null,
	focusedTaskProjectId: null,
	focusedTaskSourceScreen: null,
	...createTaskComposersSlice(set, get),
	loadingTasks: false,
	loadingToday: false,
	loadingInbox: false,
	loadingUpcoming: false,
	loadingSearch: false,
	loadingSavedFilterTasks: false,
	loadingProjectFilterTasks: false,
	projectFilterTasksLoaded: false,
	searchQuery: '',
	searchHasRun: false,
	taskFilters: defaultTaskFilters,
	taskFilterDraft: defaultTaskFilters,
	expandedTaskIds: new Set(),
	togglingTaskIds: new Set(),
	recentlyCompletedTaskIds: new Set(),
	movingTaskIds: new Set(),
	...createBulkTasksSlice(set, get),

	async loadTasks(projectId) {
		if (!projectId) {
			set({
				tasks: [],
				currentTasksProjectId: null,
				currentProjectViewId: null,
			})
			persistOfflineTaskCollections(get())
			return
		}

		if (!get().isOnline && get().offlineReadOnlyMode) {
			if (get().currentTasksProjectId === projectId) {
				return
			}
			const snapshot = await loadOfflineSnapshot()
			const cachedTasks = getOfflineCachedProjectTasks({
				projectId,
				tasksByProjectId: snapshot?.tasksByProjectId,
				projectPreviewTasksById: {
					...(snapshot?.projectPreviewTasksById || {}),
					...get().projectPreviewTasksById,
				},
				projectFilterTasks:
					get().projectFilterTasks.length > 0 ? get().projectFilterTasks : snapshot?.projectFilterTasks,
				projectFilterTasksLoaded:
					get().projectFilterTasksLoaded || snapshot?.projectFilterTasksLoaded,
			})
			if (cachedTasks !== null) {
				const offlineProjectViewId = resolveOfflineProjectViewId({
					projectId,
					currentViewId: get().currentProjectViewId ?? snapshot?.currentProjectViewId,
					projectViewsById: {
						...(snapshot?.projectViewsById || {}),
						...get().projectViewsById,
					},
				})
				set({
					tasks: cachedTasks,
					currentTasksProjectId: projectId,
					currentProjectViewId: offlineProjectViewId,
					error: null,
				})
				persistOfflineTaskCollections(get())
			}
			return
		}

		set({loadingTasks: true, error: null})

		try {
			const viewId = await resolveActiveProjectTaskViewId(get, projectId, 'project')
			const viewKind = await resolveProjectViewKind(get, projectId, viewId)
			const {sortBy, orderBy} = getTaskSortQuery(get().taskFilters.sortBy, get().taskFilters.sortOrder)
			const tasks = await loadProjectTasks(projectId, viewId, {
				sortBy,
				orderBy,
				useViewTasks: viewKind === 'list',
				previousTasks: get().tasks,
			})
			set({
				tasks,
				currentTasksProjectId: projectId,
				currentProjectViewId: viewId,
				loadingTasks: false,
			})
			persistOfflineTaskCollections(get())
		} catch (error) {
			set({error: formatError(error as Error)})
			set({loadingTasks: false})
		}
	},

	async loadTodayTasks() {
		if (!get().isOnline && get().offlineReadOnlyMode) {
			const snapshot = await loadOfflineSnapshot()
			if (
				Number(get().selectedSavedFilterProjectId || 0) === numericProjectId &&
				(get().savedFilterTasks.length > 0 || get().currentSavedFilterViewId !== null)
			) {
				return
			}
			if (Number(snapshot?.selectedSavedFilterProjectId || 0) === numericProjectId) {
				set({
					savedFilterTasks: snapshot?.savedFilterTasks || [],
					currentSavedFilterViewId: snapshot?.currentSavedFilterViewId ?? null,
					error: null,
				})
			}
			return
		}

		set({
			loadingToday: true,
			error: null,
		})

		try {
			const previousTodayTasks = get().todayTasks
			const {sortBy, orderBy} = getTaskSortQuery(get().taskFilters.sortBy, get().taskFilters.sortOrder)
			const genericSort = sanitizeTaskCollectionSort(sortBy, orderBy)
			const [freshTasks, completedTodayTasks] = await Promise.all([
				api<Task[]>('/api/tasks/today'),
				api<Task[]>(buildTaskCollectionPath({
					filter: buildTodayTaskFilter('done'),
					sortBy: genericSort.sortBy,
					orderBy: genericSort.orderBy,
				})),
			])
			const normalizedFreshTasks = normalizeTaskGraph(freshTasks)
			const normalizedCompletedTodayTasks = normalizeTaskGraph(completedTodayTasks)
			const mergedTodayTasks = isManualTaskSort(get().taskFilters.sortBy)
				? mergeTaskListsWithStablePositions(
					normalizedFreshTasks,
					normalizedCompletedTodayTasks,
					previousTodayTasks,
				)
				: mergeTaskListsPreservingPrimaryOrder(
					normalizedFreshTasks,
					normalizedCompletedTodayTasks,
				)
			const recentlyCompleted = get().recentlyCompletedTaskIds
			const keptDoneTasks = previousTodayTasks.filter(prev =>
				prev.done && recentlyCompleted.has(prev.id) && !mergedTodayTasks.some(task => task.id === prev.id),
			)
			const todayTasks = isManualTaskSort(get().taskFilters.sortBy)
				? mergeTaskListsWithStablePositions(mergedTodayTasks, keptDoneTasks, previousTodayTasks)
				: mergeTaskListsPreservingPrimaryOrder(mergedTodayTasks, keptDoneTasks)
			set({todayTasks})
			persistOfflineTaskCollections(get())
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({loadingToday: false})
		}
	},

	async loadInboxTasks() {
		const inboxProjectId = get().resolveInboxProjectId()
		set({inboxProjectId})

		if (!inboxProjectId) {
			set({
				inboxTasks: [],
				currentInboxViewId: null,
			})
			persistOfflineTaskCollections(get())
			return
		}

		if (!get().isOnline && get().offlineReadOnlyMode) {
			return
		}

		set({
			loadingInbox: true,
			error: null,
		})

		try {
			const viewId = await resolveActiveProjectTaskViewId(get, inboxProjectId, 'inbox')
			const viewKind = await resolveProjectViewKind(get, inboxProjectId, viewId)
			const {sortBy, orderBy} = getTaskSortQuery(get().taskFilters.sortBy, get().taskFilters.sortOrder)
			const freshTasks = await loadProjectTasks(inboxProjectId, viewId, {
				sortBy,
				orderBy,
				useViewTasks: viewKind === 'list',
				previousTasks: get().inboxTasks,
			})
			// Preserve recently-completed tasks that have not reached the server yet
			// so completion animations remain visible until the undo window closes.
			const recentlyCompleted = get().recentlyCompletedTaskIds
			const previousInboxTasks = get().inboxTasks
			const keptDoneTasks = previousInboxTasks.filter(prev =>
				prev.done && recentlyCompleted.has(prev.id) && !freshTasks.some(t => t.id === prev.id),
			)
			const inboxTasks = keptDoneTasks.length > 0 ? [...freshTasks, ...keptDoneTasks] : freshTasks
			set({
				inboxTasks,
				currentInboxViewId: viewId,
			})
			persistOfflineTaskCollections(get())
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({loadingInbox: false})
		}
	},

	async loadUpcomingTasks() {
		if (!get().isOnline && get().offlineReadOnlyMode) {
			return
		}

		set({
			loadingUpcoming: true,
			error: null,
		})

		try {
			const upcomingTasks = normalizeTaskGraph(await api<Task[]>(buildTaskCollectionPath({
				filter: 'due_date >= now+1d/d && due_date < now+14d/d',
				sortBy: ['due_date', 'id'],
				orderBy: ['asc', 'asc'],
			})))
			set({upcomingTasks})
			persistOfflineTaskCollections(get())
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({loadingUpcoming: false})
		}
	},

	async loadSearchTasks(query = get().searchQuery) {
		const normalizedQuery = `${query || ''}`.trim()
		set({
			searchQuery: normalizedQuery,
			searchHasRun: true,
		})

		if (!normalizedQuery) {
			set({searchTasks: []})
			return
		}

		if (!get().isOnline && get().offlineReadOnlyMode) {
			return
		}

		set({
			loadingSearch: true,
			error: null,
		})

		try {
			const searchTasks = normalizeTaskGraph(await api<Task[]>(buildTaskCollectionPath({
				search: normalizedQuery,
				sortBy: ['updated', 'id'],
				orderBy: ['desc', 'desc'],
			})))
			set({searchTasks})
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({loadingSearch: false})
		}
	},

	async loadSavedFilterTasks(projectId) {
		const numericProjectId = Number(projectId || 0)
		set({selectedSavedFilterProjectId: numericProjectId || null})

		if (!numericProjectId) {
			set({
				savedFilterTasks: [],
				currentSavedFilterViewId: null,
			})
			return
		}

		if (!get().isOnline && get().offlineReadOnlyMode) {
			return
		}

		set({
			loadingSavedFilterTasks: true,
			error: null,
		})

		try {
			const viewId = await resolveActiveProjectTaskViewId(get, numericProjectId, 'savedFilter')
			const viewKind = await resolveProjectViewKind(get, numericProjectId, viewId)
			const {sortBy, orderBy} = getTaskSortQuery(defaultTaskFilters.sortBy, defaultTaskFilters.sortOrder)
			const savedFilterTasks = await loadProjectTasks(numericProjectId, viewId, {
				sortBy,
				orderBy,
				useViewTasks: viewKind === 'list',
				previousTasks: get().savedFilterTasks,
			})
			set({
				savedFilterTasks,
				currentSavedFilterViewId: viewId,
			})
			persistOfflineTaskCollections(get())
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({loadingSavedFilterTasks: false})
		}
	},

	async ensureProjectFilterTasksLoaded({force = false} = {}) {
		if (!force && get().projectFilterTasksLoaded) {
			return
		}

		if (get().loadingProjectFilterTasks) {
			return
		}

		if (!get().isOnline && get().offlineReadOnlyMode) {
			const snapshot = await loadOfflineSnapshot()
			if (snapshot?.projectFilterTasksLoaded) {
				set({
					projectFilterTasks: snapshot.projectFilterTasks,
					projectFilterTasksLoaded: true,
					error: null,
				})
			}
			return
		}

		set({
			loadingProjectFilterTasks: true,
			error: null,
		})

		try {
			const projectFilterTasks = normalizeTaskGraph(await api<Task[]>(buildTaskCollectionPath({
				sortBy: ['updated', 'id'],
				orderBy: ['desc', 'desc'],
			})))
			set({
				projectFilterTasks,
				projectFilterTasksLoaded: true,
			})
			persistOfflineTaskCollections(get())
		} catch (error) {
			set({
				error: formatError(error as Error),
				projectFilterTasksLoaded: false,
			})
		} finally {
			set({loadingProjectFilterTasks: false})
		}
	},

	async refreshCurrentCollections() {
		if (!get().isOnline && get().offlineReadOnlyMode) {
			return
		}

		const refreshes: Promise<unknown>[] = []

		if (get().selectedProjectId) {
			refreshes.push(get().loadTasks(get().selectedProjectId))
		}

		if (get().screen === 'today' || get().todayTasks.length > 0) {
			refreshes.push(get().loadTodayTasks())
		}

		if (get().screen === 'inbox' || get().inboxTasks.length > 0) {
			refreshes.push(get().loadInboxTasks())
		}

		if (get().screen === 'upcoming' || get().upcomingTasks.length > 0) {
			refreshes.push(get().loadUpcomingTasks())
		}

		if (get().searchHasRun && get().searchQuery) {
			refreshes.push(get().loadSearchTasks(get().searchQuery))
		}

		if (get().selectedSavedFilterProjectId) {
			refreshes.push(get().loadSavedFilterTasks(get().selectedSavedFilterProjectId))
		}

		if (get().projectFilterTasksLoaded) {
			refreshes.push(get().ensureProjectFilterTasksLoaded({force: true}))
		}

		refreshes.push(get().refreshExpandedProjectPreviews({silent: true}))
		await Promise.allSettled(refreshes)
	},

	setSearchQuery(query) {
		set({searchQuery: query})
	},

	clearSearchState() {
		set({
			searchQuery: '',
			searchHasRun: false,
			searchTasks: [],
		})
	},

	setTaskFilterField(field, value, allowProject) {
		set(state => ({
			taskFilterDraft: updateTaskFilterField(
				normalizeTaskFilters(state.taskFilterDraft, allowProject),
				field,
				value,
			),
		}))
	},

	syncTaskFilterDraftFromActive(allowProject) {
		set(state => ({
			taskFilterDraft: normalizeTaskFilters(state.taskFilters, allowProject),
		}))
	},

	async applyTaskFilterDraft(allowProject) {
		set(state => ({
			taskFilters: normalizeTaskFilters(state.taskFilterDraft, allowProject),
		}))
		await get().refreshCurrentCollections()
	},

	resetTaskFilterDraft() {
		set({taskFilterDraft: defaultTaskFilters})
	},

	async openSearchTaskResult(taskId, projectId = 0) {
		const fallbackTask = findTaskInAnyContext(taskId, getTaskCollections(get()))
		const resolvedProjectId = Number(projectId || fallbackTask?.project_id || 0)

		if (resolvedProjectId) {
			await get().navigateToProject(resolvedProjectId)
			set(state => ({
				expandedTaskIds: expandTaskAncestorsInCollection(taskId, state.tasks, state.expandedTaskIds),
			}))
		}

		await get().openTaskDetail(taskId)
	},

	toggleTaskExpanded(taskId) {
		set(state => {
			const expandedTaskIds = new Set(state.expandedTaskIds)
			if (expandedTaskIds.has(taskId)) {
				expandedTaskIds.delete(taskId)
			} else {
				expandedTaskIds.add(taskId)
			}

			return {expandedTaskIds}
		})
	},

	toggleTaskMenu(taskId, anchor) {
		set(state => ({
			openMenu:
				state.openMenu?.kind === 'task' && state.openMenu.id === taskId
					? null
					: {
						kind: 'task',
						id: taskId,
						anchor,
					},
		}))
	},

	async toggleTaskDone(taskId, options = {}) {
		if (blockNonQueueableOfflineAction(get, set, 'toggleTaskDone')) {
			return false
		}

		const task = findTaskInAnyContext(taskId, getTaskCollections(get()))
		if (!task) {
			return false
		}

		const nextDone = !task.done
		const doneAt = nextDone ? new Date().toISOString() : null
		const snapshot = cloneTaskSnapshot(task)

		clearCompletionAnimationTimer(taskId)
		set(state => {
			const togglingTaskIds = new Set(state.togglingTaskIds)
			togglingTaskIds.add(taskId)
			const nextRecentlyCompletedTaskIds = new Set(state.recentlyCompletedTaskIds)
			if (nextDone) {
				nextRecentlyCompletedTaskIds.add(taskId)
			} else {
				nextRecentlyCompletedTaskIds.delete(taskId)
			}

			return {
				...applyTaskDoneOptimisticUpdate(state, taskId, nextDone, doneAt, {
					viewId: options.kanbanViewId,
					targetBucketId: options.targetBucketId,
				}),
				togglingTaskIds,
				recentlyCompletedTaskIds: nextRecentlyCompletedTaskIds,
				error: null,
				openMenu: null,
			}
		})

		if (nextDone) {
			completionAnimationTimers.set(
				taskId,
				setTimeout(() => {
					clearCompletionAnimationTimer(taskId)
					set(state => {
						if (!state.recentlyCompletedTaskIds.has(taskId)) {
							return {}
						}

						const nextRecentlyCompletedTaskIds = new Set(state.recentlyCompletedTaskIds)
						nextRecentlyCompletedTaskIds.delete(taskId)
						return {recentlyCompletedTaskIds: nextRecentlyCompletedTaskIds}
					})
				}, COMPLETION_ANIMATION_MS),
			)
		}

		const latestTask = findTaskInAnyContext(taskId, getTaskCollections(get())) || snapshot
		const togglePayload: Partial<Task> = {
			...buildTaskProjectMovePayload(latestTask, latestTask.project_id),
			done: nextDone,
			done_at: nextDone ? doneAt : null,
		}

		if (shouldQueueOffline(get, 'toggleTaskDone')) {
			await enqueueMutation({
				type: 'task-toggle-done',
				endpoint: `/api/tasks/${taskId}`,
				method: 'POST',
				body: togglePayload,
				metadata: {
					entityType: 'task',
					entityId: taskId,
					description: `${nextDone ? 'Complete' : 'Reopen'} "${task.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			set(state => {
				const nextTogglingTaskIds = new Set(state.togglingTaskIds)
				nextTogglingTaskIds.delete(taskId)
				return {togglingTaskIds: nextTogglingTaskIds}
			})
			return true
		}

		const started = await get().startUndoableMutation({
			notice: {
				id: `task-done:${taskId}:${Date.now()}`,
				kind: nextDone ? 'task-complete' : 'task-reopen',
				title: nextDone ? 'Task completed' : 'Task reopened',
				body: task.title || `#${taskId}`,
			},
			durationMs: UNDOABLE_MUTATION_MS,
			commit: async () => {
				await api(`/api/tasks/${taskId}`, {
					method: 'POST',
					body: togglePayload,
				})
			},
			rollback: () => {
				clearCompletionAnimationTimer(taskId)
				set(state => {
					const nextTogglingTaskIds = new Set(state.togglingTaskIds)
					nextTogglingTaskIds.delete(taskId)
					const nextRecentlyCompletedTaskIds = new Set(state.recentlyCompletedTaskIds)
					nextRecentlyCompletedTaskIds.delete(taskId)
					return {
						...applyTaskDoneOptimisticUpdate(state, taskId, snapshot.done, snapshot.done_at || null, {
							viewId: options.kanbanViewId,
							targetBucketId: options.sourceBucketId,
						}),
						togglingTaskIds: nextTogglingTaskIds,
						recentlyCompletedTaskIds: nextRecentlyCompletedTaskIds,
					}
				})
			},
			onCommitted: async () => {
				await refreshTaskVisibilityAfterCompletion(get, taskId)
			},
		})

		if (!started) {
			clearCompletionAnimationTimer(taskId)
			set(state => {
				const nextTogglingTaskIds = new Set(state.togglingTaskIds)
				nextTogglingTaskIds.delete(taskId)
				const nextRecentlyCompletedTaskIds = new Set(state.recentlyCompletedTaskIds)
				if (snapshot.done) {
					nextRecentlyCompletedTaskIds.add(taskId)
				} else {
					nextRecentlyCompletedTaskIds.delete(taskId)
				}
				return {
					...applyTaskDoneOptimisticUpdate(state, taskId, snapshot.done, snapshot.done_at || null, {
						viewId: options.kanbanViewId,
						targetBucketId: options.sourceBucketId,
					}),
					togglingTaskIds: nextTogglingTaskIds,
					recentlyCompletedTaskIds: nextRecentlyCompletedTaskIds,
				}
			})
			return false
		}

		set(state => {
			const nextTogglingTaskIds = new Set(state.togglingTaskIds)
			nextTogglingTaskIds.delete(taskId)
			return {togglingTaskIds: nextTogglingTaskIds}
		})

		return true
	},

	async duplicateTask(taskId) {
		if (blockNonQueueableOfflineAction(get, set, 'duplicateTask')) {
			return false
		}

		const sourceTask = findTaskInAnyContext(taskId, getTaskCollections(get()))
		if (!sourceTask) {
			return false
		}

		try {
			set({openMenu: null})
			if (shouldQueueOffline(get, 'duplicateTask')) {
				await enqueueMutation({
					type: 'task-duplicate',
					endpoint: `/api/tasks/${taskId}/duplicate`,
					method: 'POST',
					body: null,
					metadata: {
						entityType: 'task',
						entityId: taskId,
						description: `Duplicate "${sourceTask.title}"`,
					},
				})
				await get().refreshOfflineQueueCounts()
				return true
			}
			await api(`/api/tasks/${taskId}/duplicate`, {method: 'POST'})
			await get().refreshCurrentCollections()
			return true
		} catch (error) {
			if ((error as ApiError)?.statusCode === 404) {
				try {
					await cloneTaskViaCreate(sourceTask)
					await get().refreshCurrentCollections()
					set({error: null})
					return true
				} catch (fallbackError) {
					set({error: formatError(fallbackError as Error)})
					return false
				}
			}

			set({error: formatError(error as Error)})
			return false
		}
	},

	async deleteTask(taskId) {
		if (blockNonQueueableOfflineAction(get, set, 'deleteTask')) {
			return false
		}

		if (!window.confirm('Delete this task?')) {
			return false
		}

		const task = findTaskInAnyContext(taskId, getTaskCollections(get()))
		if (!task) {
			return false
		}

		const snapshot = captureTaskDeletionSnapshot(get())
		set(state => ({
			...applyTaskDeletionOptimisticUpdate(state, [taskId]),
			openMenu: null,
			error: null,
		}))

		if (shouldQueueOffline(get, 'deleteTask')) {
			await enqueueMutation({
				type: 'task-delete',
				endpoint: `/api/tasks/${taskId}`,
				method: 'DELETE',
				body: null,
				metadata: {
					entityType: 'task',
					entityId: taskId,
					description: `Delete "${task.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

		const started = await get().startUndoableMutation({
			notice: {
				id: `task-delete:${taskId}:${Date.now()}`,
				kind: 'task-delete',
				title: 'Task deleted',
				body: task.title || `#${taskId}`,
			},
			durationMs: UNDOABLE_MUTATION_MS,
			commit: async () => {
				await api(`/api/tasks/${taskId}`, {method: 'DELETE'})
			},
			rollback: () => {
				set(restoreTaskDeletionSnapshot(snapshot))
			},
			onCommitted: async () => {
				if (!get().pendingUndoMutation) {
					await get().refreshCurrentCollections()
				}
			},
		})

		if (!started) {
			set(restoreTaskDeletionSnapshot(snapshot))
		}

		return started
	},

	async moveTask(intent) {
		console.log('[moveTask] called', {taskId: intent?.taskId, bucketId: intent?.bucketId, viewId: intent?.viewId, targetProjectId: intent?.targetProjectId})
		if (blockNonQueueableOfflineAction(get, set, 'moveTask')) {
			console.log('[moveTask] BLOCKED by offline action')
			return false
		}

		const taskId = Number(intent?.taskId || 0)
		if (!taskId) {
			console.log('[moveTask] no taskId')
			return false
		}

		const collections = getTaskCollections(get())
		const task = findTaskInAnyContext(taskId, collections)
		if (!task) {
			return false
		}

		const sourceTaskList = getTaskCollectionForTask(task.id, task.project_id, collections)
		const taskList = intent.taskList === undefined ? sourceTaskList : intent.taskList
		const relationTaskList = Array.isArray(taskList) ? taskList : sourceTaskList
		const currentParentRefs = [...(task.related_tasks?.parenttask || [])]
		const currentParentId = currentParentRefs[0]?.id || null
		const nextParentTaskId = intent.parentTaskId === undefined
			? currentParentId
			: (Number(intent.parentTaskId || 0) || null)
		if (nextParentTaskId && (nextParentTaskId === taskId || isTaskDescendant(taskId, nextParentTaskId, relationTaskList))) {
			return false
		}

		const parentTask = nextParentTaskId ? findTaskInAnyContext(nextParentTaskId, collections) : null
		if (nextParentTaskId && !parentTask) {
			return false
		}

		const targetProjectId = parentTask?.project_id || Number(intent.targetProjectId || task.project_id)
		const context = resolveTaskDropViewContext(get, targetProjectId)
		const explicitViewId = Number(intent.viewId || 0) || null
		const projectViewId = explicitViewId || await resolveActiveProjectTaskViewId(get, targetProjectId, context)
		const beforeTask = resolveTaskById(intent.beforeTaskId || null, collections)
		const afterTask = resolveTaskById(intent.afterTaskId || null, collections)
		const bucketId = intent.bucketId === undefined ? undefined : (Number(intent.bucketId || 0) || null)
		const position = bucketId !== undefined
			? resolveBucketMovePosition(get(), projectViewId, bucketId, task, beforeTask, afterTask)
			: resolveMovedTaskPosition({
				task,
				parentTask,
				beforeTask,
				afterTask,
				taskList: relationTaskList,
			})

		try {
			set({openMenu: null})
			markTaskDropTrace(intent.traceToken || null, 'optimistic-set-start', {
				targetProjectId,
				nextParentTaskId,
				bucketId: bucketId ?? null,
			})
			const mutationSet = applyOptimisticTaskMove(get(), {
				task,
				sourceTaskList,
				taskList: Array.isArray(taskList) ? taskList : null,
				targetProjectId,
				parentTask,
				nextParentTaskId,
				beforeTaskId: intent.beforeTaskId || null,
				afterTaskId: intent.afterTaskId || null,
				siblingIds: intent.siblingIds || null,
				position,
				bucketId,
				viewId: projectViewId,
			})
			const partial = getSelectiveTaskCollectionUpdate(get(), mutationSet)
			const prevBuckets = get().projectBucketsByViewId[projectViewId]
			const nextBuckets = (partial as Record<string, unknown>).projectBucketsByViewId
				? ((partial as Record<string, unknown>).projectBucketsByViewId as Record<number, {id: number; tasks: {id: number}[]}[]>)[projectViewId!]
				: null
			console.log('[moveTask] pre-set bucket comparison', {
				hasBucketsInPartial: 'projectBucketsByViewId' in (partial as Record<string, unknown>),
				prevRef: prevBuckets,
				nextRef: nextBuckets,
				sameRef: prevBuckets === nextBuckets,
				prevTaskIds: prevBuckets?.find((b: {id: number}) => b.id === bucketId)?.tasks?.map((t: {id: number}) => t.id),
				nextTaskIds: nextBuckets?.find((b: {id: number}) => b.id === bucketId)?.tasks?.map((t: {id: number}) => t.id),
			})
			set(partial)
			const afterBuckets = get().projectBucketsByViewId[projectViewId]
			console.log('[moveTask] post-set verification', {
				afterTaskIds: afterBuckets?.find((b: {id: number}) => b.id === bucketId)?.tasks?.map((t: {id: number}) => t.id),
				afterSameAsPrev: afterBuckets === prevBuckets,
				afterSameAsNext: afterBuckets === nextBuckets,
			})
			markTaskDropTrace(intent.traceToken || null, 'optimistic-set-end')

			if (shouldQueueOffline(get, 'moveTask')) {
				await enqueueMutation({
					type: 'task-move',
					endpoint: `/api/tasks/${taskId}`,
					method: 'POST',
					body: {
						_moveIntent: true,
						taskId,
						targetProjectId,
						currentProjectId: task.project_id,
						nextParentTaskId,
						currentParentTaskId: currentParentId,
						bucketId: bucketId ?? null,
						viewId: projectViewId,
						position,
					},
					metadata: {
						entityType: 'task',
						entityId: taskId,
						description: `Move "${task.title}"`,
					},
				})
				await get().refreshOfflineQueueCounts()
				if (get().taskDetailOpen && get().taskDetail?.id === taskId) {
					set(state => ({
						...applyTaskPatchOptimisticUpdate(state, taskId, {
							project_id: targetProjectId,
						}),
					}))
				}
				return true
			}

			if (task.project_id !== targetProjectId) {
				markTaskDropTrace(intent.traceToken || null, 'api-project-update-start')
				await api(`/api/tasks/${taskId}`, {
					method: 'POST',
					body: buildTaskProjectMovePayload(task, targetProjectId),
				})
				markTaskDropTrace(intent.traceToken || null, 'api-project-update-end')
			}

			if (currentParentId !== nextParentTaskId) {
				for (const parentRef of currentParentRefs) {
					markTaskDropTrace(intent.traceToken || null, 'api-parent-relation-delete-start', {parentId: parentRef.id})
					await api(`/api/tasks/${parentRef.id}/relations/subtask/${taskId}`, {
						method: 'DELETE',
					})
					markTaskDropTrace(intent.traceToken || null, 'api-parent-relation-delete-end', {parentId: parentRef.id})
				}

				if (nextParentTaskId) {
					markTaskDropTrace(intent.traceToken || null, 'api-parent-relation-add-start', {parentId: nextParentTaskId})
					await api(`/api/tasks/${nextParentTaskId}/relations`, {
						method: 'PUT',
						body: {
							other_task_id: taskId,
							relation_kind: 'subtask',
						},
					})
					markTaskDropTrace(intent.traceToken || null, 'api-parent-relation-add-end', {parentId: nextParentTaskId})
				}
			}

			console.log('[moveTask] bucket check', {bucketId, projectViewId, bucketIdUndefined: bucketId === undefined})
			if (bucketId !== undefined && projectViewId && bucketId) {
				console.log('[moveTask] → bucket API call', {targetProjectId, projectViewId, bucketId, taskId})
				markTaskDropTrace(intent.traceToken || null, 'api-bucket-update-start', {projectViewId, bucketId})
				await api(`/api/projects/${targetProjectId}/views/${projectViewId}/buckets/${bucketId}/tasks`, {
					method: 'POST',
					body: {
						task_id: taskId,
						bucket_id: bucketId,
						project_view_id: projectViewId,
						project_id: targetProjectId,
					},
				})
				console.log('[moveTask] → bucket API done')
				markTaskDropTrace(intent.traceToken || null, 'api-bucket-update-end', {projectViewId, bucketId})
			}

			if (projectViewId && Number.isFinite(position)) {
				markTaskDropTrace(intent.traceToken || null, 'api-position-update-start', {projectViewId})
				const result = await api<{taskPosition?: {position?: number}}>(`/api/tasks/${taskId}/position`, {
					method: 'POST',
					body: {
						project_view_id: projectViewId,
						position,
					},
				})
				const persistedPosition = Number(result?.taskPosition?.position)
				if (Number.isFinite(persistedPosition) && persistedPosition !== position) {
					markTaskDropTrace(intent.traceToken || null, 'api-position-normalized', {persistedPosition})
					applyTaskPositionSnapshot(get(), new Map([[taskId, persistedPosition]]))
					set(getClonedTaskCollections(get()))
				}
				markTaskDropTrace(intent.traceToken || null, 'api-position-update-end', {projectViewId})
			}

			if (shouldSkipFullRefreshForVisibleTaskDrop(get().screen)) {
				markTaskDropTrace(intent.traceToken || null, 'skip-full-refresh-for-visible-task-drop', {
					screen: get().screen,
					crossProject: task.project_id !== targetProjectId,
				})
				const selectedProjectId = Number(get().selectedProjectId || 0) || null
				const currentProjectViewId = Number(get().currentProjectViewId || 0) || null
				const activeProjectViews = selectedProjectId ? get().projectViewsById[selectedProjectId] || [] : []
				const activeProjectView =
					currentProjectViewId && selectedProjectId
						? activeProjectViews.find(view => view.id === currentProjectViewId) || null
						: null
				if (selectedProjectId && currentProjectViewId && activeProjectView?.view_kind === 'kanban') {
					// Skip loadProjectBuckets here — the optimistic update already reflects the
					// correct bucket state, and the position/bucket API calls have persisted the
					// changes.  Reloading from the server would overwrite the optimistic order
					// because the tasks endpoint may not reflect view-specific positions yet.
					markTaskDropTrace(intent.traceToken || null, 'skip-kanban-bucket-reload', {
						selectedProjectId,
						currentProjectViewId,
					})
				}
				void refreshBackgroundVisibleTaskCollectionsAfterDrop(get, intent.traceToken || null)
				if (get().taskDetailOpen && get().taskDetail?.id === taskId) {
					void get().openTaskDetail(taskId)
				}
				return true
			}

			markTaskDropTrace(intent.traceToken || null, 'refresh-current-collections-start')
			await get().refreshCurrentCollections()
			markTaskDropTrace(intent.traceToken || null, 'refresh-current-collections-end')
			if (get().taskDetailOpen && get().taskDetail?.id === taskId) {
				markTaskDropTrace(intent.traceToken || null, 'task-detail-reload-start')
				await get().openTaskDetail(taskId)
				markTaskDropTrace(intent.traceToken || null, 'task-detail-reload-end')
			}
			return true
		} catch (error) {
			markTaskDropTrace(intent.traceToken || null, 'drop-failed', formatError(error as Error))
			await get().refreshCurrentCollections()
			if (get().taskDetailOpen && get().taskDetail?.id === taskId) {
				await get().openTaskDetail(taskId)
			}
			set({error: formatError(error as Error)})
			return false
		}
	},

	openFocusedTask(taskId, projectId, sourceScreen) {
		set(state => {
			const nextEntry = {taskId, projectId, sourceScreen}
			const previousEntry = state.focusedTaskStack[state.focusedTaskStack.length - 1]
			const focusedTaskStack =
				previousEntry &&
				previousEntry.taskId === taskId &&
				previousEntry.projectId === projectId &&
				previousEntry.sourceScreen === sourceScreen
					? state.focusedTaskStack
					: [...state.focusedTaskStack, nextEntry]

			return {
				focusedTaskStack,
				focusedTaskId: taskId,
				focusedTaskProjectId: projectId,
				focusedTaskSourceScreen: sourceScreen,
				projectDetailOpen: false,
				projectDetailLoading: false,
				projectDetail: null,
				rootComposerOpen: false,
				rootComposerPlacement: 'sheet',
				composerDueDate: null,
				rootSubmitting: false,
				composerParentTaskId: null,
				projectComposerOpen: false,
				projectComposerParentId: null,
				projectSubmitting: false,
				activeSubtaskParentId: null,
				activeSubtaskSource: null,
				openMenu: null,
			}
		})
	},

	closeFocusedTask() {
		set(state => ({
			focusedTaskStack: state.focusedTaskStack.length > 1 ? state.focusedTaskStack.slice(0, -1) : [],
			focusedTaskId: state.focusedTaskStack.length > 1 ? state.focusedTaskStack[state.focusedTaskStack.length - 2].taskId : null,
			focusedTaskProjectId: state.focusedTaskStack.length > 1 ? state.focusedTaskStack[state.focusedTaskStack.length - 2].projectId : null,
			focusedTaskSourceScreen: state.focusedTaskStack.length > 1 ? state.focusedTaskStack[state.focusedTaskStack.length - 2].sourceScreen : null,
			activeSubtaskParentId: state.activeSubtaskSource === 'focus' ? null : state.activeSubtaskParentId,
			activeSubtaskSource: state.activeSubtaskSource === 'focus' ? null : state.activeSubtaskSource,
		}))
	},

	resetTasksState() {
		for (const taskId of completionAnimationTimers.keys()) {
			clearCompletionAnimationTimer(taskId)
		}
		get().clearPendingMutation()
		set({
			tasks: [],
			currentTasksProjectId: null,
			todayTasks: [],
			inboxTasks: [],
			upcomingTasks: [],
			searchTasks: [],
			savedFilterTasks: [],
			projectFilterTasks: [],
			taskDetailOpen: false,
			taskDetailLoading: false,
			taskDetail: null,
			focusedTaskStack: [],
			focusedTaskId: null,
			focusedTaskProjectId: null,
			focusedTaskSourceScreen: null,
			rootComposerOpen: false,
			rootComposerPlacement: 'sheet',
			composerDueDate: null,
			rootSubmitting: false,
			composerParentTaskId: null,
			activeSubtaskParentId: null,
			activeSubtaskSource: null,
			subtaskSubmittingParentId: null,
			loadingTasks: false,
			loadingToday: false,
			loadingInbox: false,
			loadingUpcoming: false,
			loadingSearch: false,
			loadingSavedFilterTasks: false,
			loadingProjectFilterTasks: false,
			projectFilterTasksLoaded: false,
			searchQuery: '',
			searchHasRun: false,
			taskFilters: defaultTaskFilters,
			taskFilterDraft: defaultTaskFilters,
			expandedTaskIds: new Set(),
			togglingTaskIds: new Set(),
			recentlyCompletedTaskIds: new Set(),
			movingTaskIds: new Set(),
			bulkTaskEditorScope: null,
			bulkTaskAction: 'complete',
			bulkTaskTargetProjectId: null,
			bulkTaskPriority: 0,
			bulkTaskSubmitting: false,
			bulkSelectedTaskIds: new Set(),
		})
	},
})

async function loadProjectTasks(
	projectId: number,
	viewId: number | null,
	{
		sortBy = [],
		orderBy = [],
		useViewTasks = true,
		previousTasks = [],
	}: {
		sortBy?: string[]
		orderBy?: string[]
		useViewTasks?: boolean
		previousTasks?: Task[]
	} = {},
) {
	if (viewId && useViewTasks) {
		const fallbackSort = sanitizeTaskCollectionSort(sortBy, orderBy)
		const [viewTasks, completedTasks] = await Promise.all([
			api<Task[]>(`/api/projects/${projectId}/views/${viewId}/tasks${buildProjectTaskQuery(sortBy, orderBy)}`),
			api<Task[]>(
				`/api/projects/${projectId}/tasks${buildProjectTaskQuery(
					fallbackSort.sortBy,
					fallbackSort.orderBy,
					buildTaskStatusFilter('done'),
				)}`,
			),
		])

		const normalizedViewTasks = normalizeTaskGraph(viewTasks)
		const normalizedCompletedTasks = normalizeTaskGraph(completedTasks)
		return isManualTaskSort(sortBy[0])
			? mergeTaskListsWithStablePositions(
				normalizedViewTasks,
				normalizedCompletedTasks,
				previousTasks,
			)
			: mergeTaskListsPreservingPrimaryOrder(
				normalizedViewTasks,
				normalizedCompletedTasks,
			)
	}

	const normalizedSort = sanitizeTaskCollectionSort(sortBy, orderBy)
	return normalizeTaskGraph(
		await api<Task[]>(`/api/projects/${projectId}/tasks${buildProjectTaskQuery(normalizedSort.sortBy, normalizedSort.orderBy)}`),
	)
}

async function resolveActiveProjectTaskViewId(
	get: () => AppStore,
	projectId: number,
	context: 'project' | 'inbox' | 'savedFilter',
) {
	const currentViewId = getCurrentProjectTaskViewId(get(), projectId, context)
	if (currentViewId) {
		return currentViewId
	}

	return get().resolveProjectTaskViewId(projectId)
}

function getCurrentProjectTaskViewId(
	state: AppStore,
	projectId: number,
	context: 'project' | 'inbox' | 'savedFilter',
) {
	if (!projectId) {
		return null
	}

	const candidateViewId = context === 'inbox'
		? Number(state.currentInboxViewId || 0) || null
		: context === 'savedFilter'
			? Number(state.currentSavedFilterViewId || 0) || null
			: Number(state.currentProjectViewId || 0) || null
	if (!candidateViewId) {
		return null
	}

	const projectViews = state.projectViewsById[projectId] || []
	if (projectViews.length > 0 && projectViews.some(view => view.id === candidateViewId)) {
		return candidateViewId
	}

	return null
}

function resolveTaskDropViewContext(get: () => AppStore, targetProjectId: number) {
	const state = get()
	if (targetProjectId && targetProjectId === state.resolveInboxProjectId()) {
		return 'inbox' as const
	}

	if (targetProjectId && targetProjectId === Number(state.selectedSavedFilterProjectId || 0)) {
		return 'savedFilter' as const
	}

	if (targetProjectId && targetProjectId === Number(state.selectedProjectId || 0)) {
		return 'project' as const
	}

	return 'project' as const
}

function resolveBucketMovePosition(
	state: AppStore,
	viewId: number | null,
	bucketId: number | null,
	task: Task,
	beforeTask: Task | null,
	afterTask: Task | null,
) {
	if (beforeTask || afterTask) {
		return calculateTaskPosition(beforeTask?.position ?? null, afterTask?.position ?? null)
	}

	if (!viewId || !bucketId) {
		return Number(task.position || 0)
	}

	const buckets = state.projectBucketsByViewId[viewId] || []
	const targetBucket = buckets.find(bucket => bucket.id === bucketId) || null
	if (!targetBucket) {
		return Number(task.position || 0)
	}

	const siblingTasks = targetBucket.tasks
		.filter(candidate => candidate.id !== task.id)
		.sort((left, right) => Number(left.position || 0) - Number(right.position || 0) || left.id - right.id)
	const lastSiblingTask = siblingTasks[siblingTasks.length - 1] || null
	return calculateTaskPosition(lastSiblingTask?.position ?? null, null)
}

async function resolveProjectViewKind(
	get: () => AppStore,
	projectId: number,
	viewId: number | null,
) {
	if (!projectId || !viewId) {
		return 'list'
	}

	const existingViews = get().projectViewsById[projectId]
	const views = Array.isArray(existingViews) && existingViews.length > 0
		? existingViews
		: await get().loadProjectViews(projectId)
	return views.find(view => view.id === viewId)?.view_kind || 'list'
}

function sanitizeTaskCollectionSort(sortBy: string[], orderBy: string[]) {
	const pairs = sortBy.map((value, index) => ({
		sortBy: value,
		orderBy: orderBy[index] || 'asc',
	}))
	const filteredPairs = pairs.filter(pair => pair.sortBy && pair.sortBy !== 'position')

	if (filteredPairs.length === 0) {
		return {
			sortBy: ['id'],
			orderBy: ['asc'],
		}
	}

	return {
		sortBy: filteredPairs.map(pair => pair.sortBy),
		orderBy: filteredPairs.map(pair => pair.orderBy),
	}
}

function buildTodayTaskFilter(status: 'all' | 'open' | 'done' = 'all') {
	const todayStart = new Date()
	todayStart.setHours(0, 0, 0, 0)
	const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
	const conditions = [
		`due_date >= "${todayStart.toISOString()}"`,
		`due_date < "${tomorrowStart.toISOString()}"`,
	]
	const statusFilter = buildTaskStatusFilter(status)
	if (statusFilter) {
		conditions.push(statusFilter)
	}
	return conditions.join(' && ')
}

async function refreshTaskVisibilityAfterCompletion(get: () => AppStore, taskId: number) {
	if (get().pendingUndoMutation) {
		return
	}

	await get().refreshCurrentCollections()
	const selectedProjectId = Number(get().selectedProjectId || 0) || null
	const currentProjectViewId = Number(get().currentProjectViewId || 0) || null
	const activeProjectView =
		selectedProjectId && currentProjectViewId
			? (get().projectViewsById[selectedProjectId] || []).find(view => view.id === currentProjectViewId) || null
			: null
	if (selectedProjectId && currentProjectViewId && activeProjectView?.view_kind === 'kanban') {
		await get().loadProjectBuckets(selectedProjectId, currentProjectViewId, {force: true})
	}
	if (get().taskDetailOpen && get().taskDetail?.id === taskId) {
		await get().openTaskDetail(taskId)
	}
}

async function cloneTaskViaCreate(sourceTask: Task) {
	const created = await api<{task?: Task}, {title: string; parentTaskId?: number | null}>(
		`/api/projects/${sourceTask.project_id}/tasks`,
		{
			method: 'POST',
			body: {
				title: sourceTask.title,
				parentTaskId: null,
			},
		},
	)
	const createdTask = created.task
	if (!createdTask?.id) {
		throw new Error('Task duplicate fallback could not create a new task.')
	}

	await api(`/api/tasks/${createdTask.id}`, {
		method: 'POST',
		body: {
			title: sourceTask.title,
			description: sourceTask.description || '',
			done: Boolean(sourceTask.done),
			due_date: sourceTask.due_date || null,
			start_date: sourceTask.start_date || null,
			end_date: sourceTask.end_date || null,
			project_id: sourceTask.project_id,
			priority: Number(sourceTask.priority || 0),
		},
	})

	for (const label of sourceTask.labels || []) {
		if (!label?.id) {
			continue
		}

		await api(`/api/tasks/${createdTask.id}/labels`, {
			method: 'POST',
			body: {
				labelId: label.id,
			},
		})
	}

	for (const parentRef of sourceTask.related_tasks?.parenttask || []) {
		if (!parentRef?.id) {
			continue
		}

		await api(`/api/tasks/${createdTask.id}/relations`, {
			method: 'PUT',
			body: {
				other_task_id: parentRef.id,
				relation_kind: 'parenttask',
			},
		})
	}
}

async function refreshBackgroundVisibleTaskCollectionsAfterDrop(
	get: () => AppStore,
	traceToken: string | null,
) {
	try {
		markTaskDropTrace(traceToken, 'background-refresh-start')
		const state = get()
		const refreshes: Promise<unknown>[] = []

		if (state.selectedProjectId) {
			refreshes.push(get().loadTasks(state.selectedProjectId))
		}

		if (state.todayTasks.length > 0) {
			refreshes.push(get().loadTodayTasks())
		}

		if (state.inboxTasks.length > 0) {
			refreshes.push(get().loadInboxTasks())
		}

		if (state.upcomingTasks.length > 0) {
			refreshes.push(get().loadUpcomingTasks())
		}

		if (state.searchHasRun && state.searchQuery) {
			refreshes.push(get().loadSearchTasks(state.searchQuery))
		}

		if (state.selectedSavedFilterProjectId) {
			refreshes.push(get().loadSavedFilterTasks(state.selectedSavedFilterProjectId))
		}

		if (state.projectFilterTasksLoaded) {
			refreshes.push(get().ensureProjectFilterTasksLoaded({force: true}))
		}

		if (state.expandedProjectIds.size > 0) {
			refreshes.push(get().refreshExpandedProjectPreviews({silent: true}))
		}

		await Promise.allSettled(refreshes)
		markTaskDropTrace(traceToken, 'background-refresh-end', {count: refreshes.length})
	} catch (error) {
		markTaskDropTrace(traceToken, 'background-refresh-failed', formatError(error as Error))
	}
}

function shouldSkipFullRefreshForVisibleTaskDrop(screen: Screen) {
	return ['tasks', 'projects', 'today', 'inbox', 'upcoming', 'search'].includes(screen)
}

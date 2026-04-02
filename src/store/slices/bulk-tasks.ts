import {api} from '@/api'
import type {BulkTaskAction, Task} from '@/types'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {enqueueMutation} from '../offline-queue'
import {blockNonQueueableOfflineAction, shouldQueueOffline} from '../offline-readonly'
import {findTaskInAnyContext} from '../selectors'
import {
	COMPLETION_ANIMATION_MS,
	UNDOABLE_MUTATION_MS,
	applyBulkTaskOptimisticUpdate,
	applyTaskDeletionOptimisticUpdate,
	buildBulkTaskMutationNotice,
	buildBulkTaskMutationPayload,
	buildBulkTaskOptimisticPatch,
	captureTaskDeletionSnapshot,
	clearCompletionAnimationTimer,
	cloneTaskSnapshot,
	completionAnimationTimers,
	getTaskCollections,
	restoreBulkTaskSnapshots,
	restoreTaskDeletionSnapshot,
} from '../task-helpers'

export interface BulkTasksSlice {
	bulkTaskEditorScope: string | null
	bulkTaskAction: BulkTaskAction
	bulkTaskTargetProjectId: number | null
	bulkTaskPriority: number
	bulkTaskSubmitting: boolean
	bulkSelectedTaskIds: Set<number>
	openBulkTaskEditor: (scope: string, options?: {defaultProjectId?: number | null}) => void
	closeBulkTaskEditor: () => void
	toggleBulkTaskSelected: (taskId: number) => void
	clearBulkTaskSelection: () => void
	setBulkTaskAction: (action: BulkTaskAction) => void
	setBulkTaskTargetProjectId: (projectId: number | null) => void
	setBulkTaskPriority: (priority: number) => void
	applyBulkTaskAction: () => Promise<boolean>
}

export const createBulkTasksSlice: StateCreator<AppStore, [], [], BulkTasksSlice> = (set, get) => ({
	bulkTaskEditorScope: null,
	bulkTaskAction: 'complete',
	bulkTaskTargetProjectId: null,
	bulkTaskPriority: 0,
	bulkTaskSubmitting: false,
	bulkSelectedTaskIds: new Set(),

	openBulkTaskEditor(scope, options) {
		const defaultProjectId = Number(options?.defaultProjectId || 0) || null
		set({
			bulkTaskEditorScope: scope,
			bulkTaskAction: 'complete',
			bulkTaskTargetProjectId: defaultProjectId,
			bulkTaskPriority: 0,
			bulkTaskSubmitting: false,
			bulkSelectedTaskIds: new Set(),
			rootComposerOpen: false,
			projectComposerOpen: false,
			openMenu: null,
			error: null,
		})
	},

	closeBulkTaskEditor() {
		set({
			bulkTaskEditorScope: null,
			bulkTaskAction: 'complete',
			bulkTaskTargetProjectId: null,
			bulkTaskPriority: 0,
			bulkTaskSubmitting: false,
			bulkSelectedTaskIds: new Set(),
		})
	},

	toggleBulkTaskSelected(taskId) {
		const numericTaskId = Number(taskId || 0)
		if (!numericTaskId) {
			return
		}

		set(state => {
			if (!state.bulkTaskEditorScope) {
				return {}
			}

			const bulkSelectedTaskIds = new Set(state.bulkSelectedTaskIds)
			if (bulkSelectedTaskIds.has(numericTaskId)) {
				bulkSelectedTaskIds.delete(numericTaskId)
			} else {
				bulkSelectedTaskIds.add(numericTaskId)
			}
			return {bulkSelectedTaskIds}
		})
	},

	clearBulkTaskSelection() {
		set({bulkSelectedTaskIds: new Set()})
	},

	setBulkTaskAction(action) {
		set(state => ({
			bulkTaskAction: action,
			bulkTaskTargetProjectId:
				action === 'move-project' ? state.bulkTaskTargetProjectId : null,
			bulkTaskPriority:
				action === 'set-priority' ? state.bulkTaskPriority : 0,
		}))
	},

	setBulkTaskTargetProjectId(projectId) {
		set({bulkTaskTargetProjectId: Number(projectId || 0) || null})
	},

	setBulkTaskPriority(priority) {
		set({bulkTaskPriority: Number(priority || 0)})
	},

	async applyBulkTaskAction() {
		if (blockNonQueueableOfflineAction(get, set, 'applyBulkTaskAction')) {
			return false
		}

		const state = get()
		const taskIds = [...state.bulkSelectedTaskIds]
		if (!state.bulkTaskEditorScope || taskIds.length === 0 || state.bulkTaskSubmitting) {
			return false
		}

		const action = state.bulkTaskAction
		const targetProjectId = Number(state.bulkTaskTargetProjectId || 0) || null
		const priority = Number(state.bulkTaskPriority || 0)
		const optimisticSupported =
			action === 'complete' ||
			action === 'reopen' ||
			action === 'set-priority' ||
			action === 'favorite' ||
			action === 'unfavorite'
		const offlineSupported =
			action === 'complete' ||
			action === 'reopen' ||
			action === 'set-priority' ||
			action === 'delete'

		if (shouldQueueOffline(get, 'applyBulkTaskAction') && !offlineSupported) {
			set({offlineActionNotice: 'This bulk action requires a connection. Reconnect to continue.'})
			return false
		}

		if (action === 'move-project' && !targetProjectId) {
			set({error: 'Choose a target project first.'})
			return false
		}

		if (action === 'delete') {
			if (!window.confirm(`Delete ${taskIds.length} selected task${taskIds.length === 1 ? '' : 's'}?`)) {
				return false
			}

			const taskDescriptionById = new Map(
				taskIds.map(taskId => [
					taskId,
					findTaskInAnyContext(taskId, getTaskCollections(get()))?.title || `#${taskId}`,
				]),
			)
			const snapshot = captureTaskDeletionSnapshot(get())
			set(state => ({
				...applyTaskDeletionOptimisticUpdate(state, taskIds),
				bulkTaskEditorScope: null,
				bulkTaskAction: 'complete',
				bulkTaskTargetProjectId: null,
				bulkTaskPriority: 0,
				bulkSelectedTaskIds: new Set(),
				openMenu: null,
				error: null,
			}))

			if (shouldQueueOffline(get, 'applyBulkTaskAction')) {
				for (const taskId of taskIds) {
					await enqueueMutation({
						type: 'task-delete',
						endpoint: `/api/tasks/${taskId}`,
						method: 'DELETE',
						body: null,
						metadata: {
							entityType: 'task',
							entityId: taskId,
							description: `Delete "${taskDescriptionById.get(taskId) || `#${taskId}`}"`,
						},
					})
				}
				await get().refreshOfflineQueueCounts()
				return true
			}

			const notice = buildBulkTaskMutationNotice(action, taskIds.length)
			const started = await get().startUndoableMutation({
				notice: {
					id: `bulk-task:${action}:${Date.now()}`,
					kind: 'task-delete',
					title: notice.title,
					body: notice.body,
				},
				durationMs: UNDOABLE_MUTATION_MS,
				commit: async () => {
					const results = await Promise.allSettled(
						taskIds.map(taskId =>
							api(`/api/tasks/${taskId}`, {method: 'DELETE'}),
						),
					)
					const rejected = results.find(result => result.status === 'rejected')
					if (rejected?.status === 'rejected') {
						throw rejected.reason
					}
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
		}

		if (optimisticSupported) {
			const snapshots = new Map<number, Task>()
			for (const taskId of taskIds) {
				const task = findTaskInAnyContext(taskId, getTaskCollections(get()))
				if (task) {
					snapshots.set(taskId, cloneTaskSnapshot(task))
				}
			}
			if (snapshots.size === 0) {
				return false
			}

			const doneAt = action === 'complete' ? new Date().toISOString() : null
			const nextTaskIds = [...snapshots.keys()]
			for (const taskId of nextTaskIds) {
				clearCompletionAnimationTimer(taskId)
			}
			set(state => {
				const nextTogglingTaskIds = new Set(state.togglingTaskIds)
				for (const taskId of nextTaskIds) {
					nextTogglingTaskIds.add(taskId)
				}
				const nextRecentlyCompletedTaskIds = new Set(state.recentlyCompletedTaskIds)
				if (action === 'complete') {
					for (const taskId of nextTaskIds) {
						nextRecentlyCompletedTaskIds.add(taskId)
					}
				} else if (action === 'reopen') {
					for (const taskId of nextTaskIds) {
						nextRecentlyCompletedTaskIds.delete(taskId)
					}
				}

				return {
					...applyBulkTaskOptimisticUpdate(state, nextTaskIds, task =>
						buildBulkTaskOptimisticPatch(action, task, {
							targetProjectId,
							priority,
							doneAt,
						}),
					),
					togglingTaskIds: nextTogglingTaskIds,
					recentlyCompletedTaskIds: nextRecentlyCompletedTaskIds,
					bulkTaskEditorScope: null,
					bulkTaskAction: 'complete',
					bulkTaskTargetProjectId: null,
					bulkTaskPriority: 0,
					bulkSelectedTaskIds: new Set(),
					openMenu: null,
					error: null,
				}
			})

			if (action === 'complete') {
				for (const taskId of nextTaskIds) {
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
			}

			const notice = buildBulkTaskMutationNotice(action, nextTaskIds.length)
			if (shouldQueueOffline(get, 'applyBulkTaskAction')) {
				const {fields, values} = buildBulkTaskMutationPayload(action, {
					targetProjectId,
					priority,
				})
				await enqueueMutation({
					type: 'bulk-task-update',
					endpoint: '/api/tasks/bulk',
					method: 'POST',
					body: {
						taskIds: nextTaskIds,
						fields,
						values,
					},
					metadata: {
						entityType: 'task',
						entityId: null,
						description: notice.body,
					},
				})
				await get().refreshOfflineQueueCounts()
				set(state => {
					const nextTogglingTaskIds = new Set(state.togglingTaskIds)
					for (const taskId of nextTaskIds) {
						nextTogglingTaskIds.delete(taskId)
					}
					return {togglingTaskIds: nextTogglingTaskIds}
				})
				return true
			}
			const started = await get().startUndoableMutation({
				notice: {
					id: `bulk-task:${action}:${Date.now()}`,
					kind: 'bulk-task-update',
					title: notice.title,
					body: notice.body,
				},
				durationMs: UNDOABLE_MUTATION_MS,
				commit: async () => {
					const {fields, values} = buildBulkTaskMutationPayload(action, {
						targetProjectId,
						priority,
					})
					await api('/api/tasks/bulk', {
						method: 'POST',
						body: {
							taskIds: nextTaskIds,
							fields,
							values,
						},
					})
				},
				rollback: () => {
					for (const taskId of nextTaskIds) {
						clearCompletionAnimationTimer(taskId)
					}
					set(state => {
						const nextTogglingTaskIds = new Set(state.togglingTaskIds)
						const nextRecentlyCompletedTaskIds = new Set(state.recentlyCompletedTaskIds)
						for (const taskId of nextTaskIds) {
							nextTogglingTaskIds.delete(taskId)
							nextRecentlyCompletedTaskIds.delete(taskId)
						}
						return {
							...restoreBulkTaskSnapshots(state, snapshots),
							togglingTaskIds: nextTogglingTaskIds,
							recentlyCompletedTaskIds: nextRecentlyCompletedTaskIds,
						}
					})
				},
				onCommitted: async () => {
					if (!get().pendingUndoMutation) {
						void get().refreshCurrentCollections()
					}
				},
			})

			if (!started) {
				set(state => {
					const nextTogglingTaskIds = new Set(state.togglingTaskIds)
					const nextRecentlyCompletedTaskIds = new Set(state.recentlyCompletedTaskIds)
					for (const taskId of nextTaskIds) {
						nextTogglingTaskIds.delete(taskId)
						nextRecentlyCompletedTaskIds.delete(taskId)
					}
					return {
						...restoreBulkTaskSnapshots(state, snapshots),
						togglingTaskIds: nextTogglingTaskIds,
						recentlyCompletedTaskIds: nextRecentlyCompletedTaskIds,
					}
				})
				return false
			}

			set(state => {
				const nextTogglingTaskIds = new Set(state.togglingTaskIds)
				for (const taskId of nextTaskIds) {
					nextTogglingTaskIds.delete(taskId)
				}
				return {togglingTaskIds: nextTogglingTaskIds}
			})

			return true
		}

		set({
			bulkTaskSubmitting: true,
			openMenu: null,
			error: null,
		})

		try {
			{
				const {fields, values} = buildBulkTaskMutationPayload(action, {
					targetProjectId,
					priority,
				})
				await api('/api/tasks/bulk', {
					method: 'POST',
					body: {
						taskIds,
						fields,
						values,
					},
				})
			}

			const currentTaskDetail = get().taskDetail
			if (currentTaskDetail?.id && taskIds.includes(currentTaskDetail.id)) {
				set({
					taskDetailOpen: false,
					taskDetailLoading: false,
					taskDetail: null,
				})
			}
			await get().refreshCurrentCollections()
			set({
				bulkTaskEditorScope: null,
				bulkTaskAction: 'complete',
				bulkTaskTargetProjectId: null,
				bulkTaskPriority: 0,
				bulkSelectedTaskIds: new Set(),
				error: null,
			})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({bulkTaskSubmitting: false})
		}
	},
})

import {api} from '@/api'
import {Task} from '@/types'
import {formatError} from '@/utils/formatting'
import {parseQuickAddMagic} from '@/utils/quickAddMagic'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {blockOfflineReadOnlyAction} from '../offline-readonly'
import {findTaskInAnyContext} from '../selectors'
import {
	applyQuickAddAssignees,
	applyQuickAddLabels,
	getCurrentComposeParentTaskId,
	getCurrentComposeProjectId,
	getTaskCollections,
	getTodayDueDateIso,
	resolveQuickAddProjectId,
	shouldDefaultComposeToToday,
} from '../task-helpers'

export interface TaskComposersSlice {
	rootComposerOpen: boolean
	rootComposerPlacement: 'sheet' | 'center' | 'project-preview'
	composerDueDate: string | null
	rootSubmitting: boolean
	composerParentTaskId: number | null
	activeSubtaskParentId: number | null
	activeSubtaskSource: 'list' | 'detail' | 'focus' | null
	subtaskSubmittingParentId: number | null
	openRootComposer: (options?: {
		parentTaskId?: number | null
		projectId?: number | null
		placement?: 'sheet' | 'center' | 'project-preview'
		defaultDueToday?: boolean
	}) => void
	closeRootComposer: () => void
	setComposerProjectId: (projectId: number) => void
	submitRootTask: (title: string) => Promise<boolean>
	openInlineSubtaskComposer: (parentTaskId: number, source?: 'list' | 'detail' | 'focus') => void
	closeInlineSubtaskComposer: () => void
	submitSubtask: (parentTaskId: number, title: string) => Promise<boolean>
}

export const createTaskComposersSlice: StateCreator<AppStore, [], [], TaskComposersSlice> = (set, get) => ({
	rootComposerOpen: false,
	rootComposerPlacement: 'sheet',
	composerDueDate: null,
	rootSubmitting: false,
	composerParentTaskId: null,
	activeSubtaskParentId: null,
	activeSubtaskSource: null,
	subtaskSubmittingParentId: null,

	openRootComposer({parentTaskId = null, projectId = null, placement = 'sheet', defaultDueToday = false} = {}) {
		if (!get().isOnline && get().offlineReadOnlyMode) {
			set({
				error: null,
				offlineActionNotice: 'Offline mode is read-only. Reconnect to create tasks.',
			})
			return
		}

		const composerProjectId = projectId || getCurrentComposeProjectId(get())
		const nextParentTaskId = parentTaskId ?? getCurrentComposeParentTaskId(get())
		const composerDueDate =
			!nextParentTaskId && (defaultDueToday || shouldDefaultComposeToToday(get(), nextParentTaskId))
				? getTodayDueDateIso()
				: null
		set({
			rootComposerOpen: true,
			rootComposerPlacement: placement,
			projectComposerOpen: false,
			projectComposerParentId: null,
			projectSubmitting: false,
			taskDetailOpen: false,
			taskDetailLoading: false,
			taskDetail: null,
			projectDetailOpen: false,
			projectDetailLoading: false,
			projectDetail: null,
			openMenu: null,
			composerProjectId,
			composerDueDate,
			composerParentTaskId: nextParentTaskId,
			bulkTaskEditorScope: null,
			bulkTaskAction: 'complete',
			bulkTaskTargetProjectId: null,
			bulkTaskPriority: 0,
			bulkTaskSubmitting: false,
			bulkSelectedTaskIds: new Set(),
		})
	},

	closeRootComposer() {
		set({
			rootComposerOpen: false,
			rootComposerPlacement: 'sheet',
			composerDueDate: null,
			composerParentTaskId: null,
		})
	},

	setComposerProjectId(projectId) {
		set(state => ({
			composerProjectId: projectId,
			composerParentTaskId:
				state.taskDetailOpen && state.taskDetail?.project_id === projectId
					? state.taskDetail.id
					: state.selectedProjectId !== projectId
						? null
						: state.composerParentTaskId,
		}))
	},

	async submitRootTask(title) {
		const trimmedTitle = title.trim()
		const composerProjectId = get().composerProjectId
		if (!trimmedTitle || !composerProjectId || get().rootSubmitting) {
			return false
		}

		if (!get().isOnline && get().offlineReadOnlyMode) {
			set({
				error: null,
				offlineActionNotice: 'Offline mode is read-only. Reconnect to create tasks.',
			})
			return false
		}

		const parsed = parseQuickAddMagic(trimmedTitle)
		const resolvedProjectId = resolveQuickAddProjectId(get(), parsed.project) || composerProjectId
		const finalTitle = parsed.title.trim()
		const finalParentTaskId =
			resolvedProjectId === composerProjectId
				? get().composerParentTaskId || null
				: null
		const dueDate = parsed.date ? parsed.date.toISOString() : get().composerDueDate
		if (!finalTitle) {
			return false
		}

		set({
			rootSubmitting: true,
			error: null,
		})

		try {
			const result = await api<{task: Task}, {
				title: string
				parentTaskId: number | null
				due_date: string | null
				priority: number | null
				repeat_after: number | null
				repeat_from_current_date: boolean
			}>(
				`/api/projects/${resolvedProjectId}/tasks`,
				{
					method: 'POST',
					body: {
						title: finalTitle,
						due_date: dueDate,
						parentTaskId: finalParentTaskId,
						priority: parsed.priority,
						repeat_after: parsed.repeatAfter,
						repeat_from_current_date: false,
					},
				},
			)

			const createdTask = result.task
			if (createdTask?.id) {
				await applyQuickAddLabels(get, resolvedProjectId, createdTask.id, parsed.labels)
				await applyQuickAddAssignees(resolvedProjectId, createdTask.id, parsed.assignees)
			}

			await get().refreshCurrentCollections()
			const currentTaskId = get().taskDetail?.id
			if (get().taskDetailOpen && get().taskDetail?.project_id === resolvedProjectId && currentTaskId) {
				await get().openTaskDetail(currentTaskId)
			}

			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({rootSubmitting: false})
		}
	},

	openInlineSubtaskComposer(parentTaskId, source = 'list') {
		set(state => {
			const expandedTaskIds = new Set(state.expandedTaskIds)
			if (source === 'list') {
				expandedTaskIds.add(parentTaskId)
			}
			return {
				activeSubtaskParentId: parentTaskId,
				activeSubtaskSource: source,
				expandedTaskIds,
				bulkTaskEditorScope: null,
				bulkTaskAction: 'complete',
				bulkTaskTargetProjectId: null,
				bulkTaskPriority: 0,
				bulkTaskSubmitting: false,
				bulkSelectedTaskIds: new Set(),
			}
		})
	},

	closeInlineSubtaskComposer() {
		set(state => {
			const activeParentId = state.activeSubtaskParentId
			const source = state.activeSubtaskSource
			if (!activeParentId) {
				return {
					activeSubtaskParentId: null,
					activeSubtaskSource: null,
				}
			}

			const expandedTaskIds = new Set(state.expandedTaskIds)
			if (source === 'list') {
				const parentTask = findTaskInAnyContext(activeParentId, getTaskCollections(state))
				const hasSubtasks = Boolean(parentTask?.related_tasks?.subtask?.length)
				if (!hasSubtasks) {
					expandedTaskIds.delete(activeParentId)
				}
			}

			return {
				activeSubtaskParentId: null,
				activeSubtaskSource: null,
				expandedTaskIds,
			}
		})
	},

	async submitSubtask(parentTaskId, title) {
		const trimmedTitle = title.trim()
		const parentTask = findTaskInAnyContext(parentTaskId, getTaskCollections(get()))
		if (!trimmedTitle || !parentTask || get().subtaskSubmittingParentId === parentTaskId) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'create tasks')) {
			return false
		}

		const parsed = parseQuickAddMagic(trimmedTitle)
		const finalTitle = parsed.title.trim()
		const dueDate = parsed.date ? parsed.date.toISOString() : null
		if (!finalTitle) {
			return false
		}

		set({
			subtaskSubmittingParentId: parentTaskId,
			error: null,
		})

		try {
			const result = await api<
				{task: Task},
				{
					title: string
					parentTaskId: number
					due_date: string | null
					priority: number | null
					repeat_after: number | null
					repeat_from_current_date: boolean
				}
			>(
				`/api/projects/${parentTask.project_id}/tasks`,
				{
					method: 'POST',
					body: {
						title: finalTitle,
						parentTaskId,
						due_date: dueDate,
						priority: parsed.priority,
						repeat_after: parsed.repeatAfter,
						repeat_from_current_date: false,
					},
				},
			)

			const createdTask = result.task
			if (createdTask?.id) {
				await applyQuickAddLabels(get, parentTask.project_id, createdTask.id, parsed.labels)
				await applyQuickAddAssignees(parentTask.project_id, createdTask.id, parsed.assignees)
			}

			await get().refreshCurrentCollections()
			set(state => {
				const expandedTaskIds = new Set(state.expandedTaskIds)
				if (state.activeSubtaskSource === 'list') {
					expandedTaskIds.add(parentTaskId)
				}
				return {
					activeSubtaskParentId: parentTaskId,
					activeSubtaskSource: state.activeSubtaskSource,
					expandedTaskIds,
				}
			})
			if (get().taskDetailOpen && get().taskDetail?.id === parentTaskId) {
				await get().openTaskDetail(parentTaskId)
			}
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({subtaskSubmittingParentId: null})
		}
	},
})

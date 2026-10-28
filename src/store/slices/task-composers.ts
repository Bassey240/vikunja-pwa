import {api} from '@/api'
import {Task} from '@/types'
import {formatError} from '@/utils/formatting'
import {parseQuickAddMagic} from '@/utils/quickAddMagic'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {enqueueMutation, getNextTempId} from '../offline-queue'
import {blockNonQueueableOfflineAction, shouldQueueOffline} from '../offline-readonly'
import {findTaskInAnyContext} from '../selectors'
import {
	applyQuickAddAssignees,
	applyQuickAddLabels,
	buildTaskRelationRef,
	getCurrentComposeParentTaskId,
	getCurrentComposeProjectId,
	getTaskCollections,
	getTodayDueDateIso,
	insertOptimisticTask,
	resolveQuickAddProjectId,
	shouldDefaultComposeToToday,
} from '../task-helpers'

export interface TaskComposersSlice {
	rootComposerOpen: boolean
	rootComposerPlacement: 'sheet' | 'center' | 'project-preview'
	composerDueDate: string | null
	composerInitialTitle: string | null
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
		defaultDueDate?: string | null
		initialTitle?: string
	}) => void
	consumeComposerInitialTitle: () => string | null
	closeRootComposer: () => void
	setComposerProjectId: (projectId: number) => void
	submitRootTask: (title: string) => Promise<number>
	openInlineSubtaskComposer: (parentTaskId: number, source?: 'list' | 'detail' | 'focus') => void
	closeInlineSubtaskComposer: () => void
	submitSubtask: (parentTaskId: number, title: string) => Promise<boolean>
}

export const createTaskComposersSlice: StateCreator<AppStore, [], [], TaskComposersSlice> = (set, get) => ({
	rootComposerOpen: false,
	rootComposerPlacement: 'sheet',
	composerDueDate: null,
	composerInitialTitle: null,
	rootSubmitting: false,
	composerParentTaskId: null,
	activeSubtaskParentId: null,
	activeSubtaskSource: null,
	subtaskSubmittingParentId: null,

	consumeComposerInitialTitle() {
		const initial = get().composerInitialTitle
		if (initial) {
			set({composerInitialTitle: null})
		}
		return initial
	},

	openRootComposer({
		parentTaskId = null,
		projectId = null,
		placement = 'sheet',
		defaultDueToday = false,
		defaultDueDate = null,
		initialTitle = undefined,
	} = {}) {
		const composerProjectId = projectId || getCurrentComposeProjectId(get())
		const nextParentTaskId = parentTaskId ?? getCurrentComposeParentTaskId(get())
		const composerDueDate = nextParentTaskId
			? null
			: defaultDueDate ?? (defaultDueToday || shouldDefaultComposeToToday(get(), nextParentTaskId)
				? getTodayDueDateIso(get().account?.user?.settings?.frontend_settings?.default_due_time || undefined)
				: null)
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
			composerInitialTitle: typeof initialTitle === 'string' ? initialTitle : null,
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
		const lines = title.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
		const composerProjectId = get().composerProjectId
		if (!lines.length || !composerProjectId || get().rootSubmitting) return 0
		if (lines.length > 100) {
			set({error: 'Add up to 100 tasks at a time.'})
			return 0
		}

		const entries = lines.map(line => {
			const parsed = parseQuickAddMagic(line, new Date(), get().account?.user?.settings?.frontend_settings?.default_due_time || undefined)
			const projectId = resolveQuickAddProjectId(get(), parsed.project) || composerProjectId
			return {
				parsed,
				projectId,
				body: {
					title: parsed.title.trim(),
					due_date: parsed.date ? parsed.date.toISOString() : get().composerDueDate,
					parentTaskId: projectId === composerProjectId ? get().composerParentTaskId || null : null,
					priority: parsed.priority ?? 0,
					repeat_after: parsed.repeatAfter,
					repeat_from_current_date: false,
				},
			}
		})
		const emptyTitleIndex = entries.findIndex(entry => !entry.body.title)
		if (emptyTitleIndex !== -1) {
			set({error: `Task ${emptyTitleIndex + 1} needs a title.`})
			return 0
		}

		set({rootSubmitting: true, error: null})
		let createdCount = 0
		try {
			if (shouldQueueOffline(get, 'submitRootTask')) {
				for (const {projectId, body, parsed} of entries) {
					const tempId = getNextTempId()
					const parentTask = body.parentTaskId
						? findTaskInAnyContext(body.parentTaskId, getTaskCollections(get()))
						: null
					const optimisticTask = buildOptimisticCreatedTask(get(), {
						id: tempId,
						projectId,
						title: body.title,
						dueDate: body.due_date,
						parentTask,
						priority: parsed.priority,
						repeatAfter: parsed.repeatAfter,
					})
					await enqueueMutation({
						type: 'task-create',
						endpoint: `/api/projects/${projectId}/tasks`,
						method: 'POST',
						body,
						metadata: {
							entityType: 'task',
							entityId: tempId,
							parentEntityId: projectId,
							description: `Create "${body.title}"`,
						},
					})
					createdCount++
					set(state => ({...insertOptimisticTask(state, optimisticTask, {parentTaskId: body.parentTaskId})}))
				}
				await get().refreshOfflineQueueCounts()
			} else {
				const version = get().vikunjaInfo?.version || get().account?.instanceFeatures?.serverVersion || ''
				const release = /^v?(\d+)\.(\d+)\./.exec(version)
				const bulkAvailable = release && (Number(release[1]) > 2 || Number(release[1]) === 2 && Number(release[2]) >= 5)
				const projectId = entries[0].projectId
				const useBulk = entries.length > 1 && bulkAvailable && get().account?.instanceFeatures?.apiV2Available !== false
					&& entries.every(entry => entry.projectId === projectId && !entry.body.parentTaskId)
				try {
					if (useBulk) {
						const result = await api<{tasks: Task[]}>(`/api/projects/${projectId}/tasks/bulk`, {
							method: 'POST', body: {tasks: entries.map(entry => entry.body)},
						})
						createdCount = entries.length
						for (const [index, task] of result.tasks.entries()) {
							await applyQuickAddLabels(get, projectId, task.id, entries[index].parsed.labels)
							await applyQuickAddAssignees(projectId, task.id, entries[index].parsed.assignees)
						}
					} else {
						for (const {projectId, body, parsed} of entries) {
							const {task} = await api<{task: Task}>(`/api/projects/${projectId}/tasks`, {method: 'POST', body})
							createdCount++
							await applyQuickAddLabels(get, projectId, task.id, parsed.labels)
							await applyQuickAddAssignees(projectId, task.id, parsed.assignees)
						}
					}
				} finally {
					if (createdCount) {
						await get().refreshCurrentCollections()
						const currentTaskId = get().taskDetail?.id
						if (get().taskDetailOpen && entries.some(entry => entry.projectId === get().taskDetail?.project_id) && currentTaskId) {
							await get().openTaskDetail(currentTaskId)
						}
					}
				}
			}
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({rootSubmitting: false})
		}
		return createdCount
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

		if (blockNonQueueableOfflineAction(get, set, 'submitSubtask')) {
			return false
		}

		const parsed = parseQuickAddMagic(trimmedTitle, new Date(), get().account?.user?.settings?.frontend_settings?.default_due_time || undefined)
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
			if (shouldQueueOffline(get, 'submitSubtask')) {
				const tempId = getNextTempId()
				const optimisticTask = buildOptimisticCreatedTask(get(), {
					id: tempId,
					projectId: parentTask.project_id,
					title: finalTitle,
					dueDate,
					parentTask,
					priority: parsed.priority,
					repeatAfter: parsed.repeatAfter,
				})
				set(state => {
					const expandedTaskIds = new Set(state.expandedTaskIds)
					if (state.activeSubtaskSource === 'list') {
						expandedTaskIds.add(parentTaskId)
					}
					return {
						...insertOptimisticTask(state, optimisticTask, {parentTaskId}),
						expandedTaskIds,
						error: null,
					}
				})
				await enqueueMutation({
					type: 'task-create',
					endpoint: `/api/projects/${parentTask.project_id}/tasks`,
					method: 'POST',
					body: {
						title: finalTitle,
						parentTaskId,
						due_date: dueDate,
						priority: parsed.priority,
						repeat_after: parsed.repeatAfter,
						repeat_from_current_date: false,
					},
					metadata: {
						entityType: 'task',
						entityId: tempId,
						parentEntityId: parentTask.project_id,
						description: `Create "${finalTitle}"`,
					},
				})
				await get().refreshOfflineQueueCounts()
				return true
			}

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

function buildOptimisticCreatedTask(
	state: AppStore,
	options: {
		id: number
		projectId: number
		title: string
		dueDate: string | null
		parentTask?: Task | null
		priority: number | null
		repeatAfter: number | null
	},
): Task {
	const now = new Date().toISOString()
	const nextPosition = Math.max(
		0,
		...state.tasks
			.filter(task => task.project_id === options.projectId)
			.map(task => Number(task.position || 0)),
		...(state.projectPreviewTasksById[options.projectId] || []).map(task => Number(task.position || 0)),
	) + 1024
	const createdBy = state.account?.user

	return {
		id: options.id,
		project_id: options.projectId,
		title: options.title,
		description: '',
		done: false,
		due_date: options.dueDate,
		start_date: null,
		end_date: null,
		done_at: null,
		created: now,
		updated: now,
		position: nextPosition,
		priority: options.priority ?? 0,
		percent_done: 0,
		repeat_after: options.repeatAfter,
		repeat_from_current_date: false,
		created_by: createdBy
			? {
				id: createdBy.id,
				name: createdBy.name || '',
				username: createdBy.username || '',
				email: createdBy.email || '',
			}
			: null,
		assignees: [],
		comments: [],
		comment_count: 0,
		attachments: [],
		labels: [],
		related_tasks: options.parentTask
			? {
				parenttask: [
					buildTaskRelationRef(options.parentTask),
				],
			}
			: {},
	}
}

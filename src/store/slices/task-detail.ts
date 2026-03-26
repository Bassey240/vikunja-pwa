import {api, uploadApi} from '@/api'
import type {
	Task,
	TaskAssignee,
	TaskAttachment,
	TaskComment,
	TaskRelationKind,
} from '@/types'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {blockOfflineReadOnlyAction, isOfflineReadOnly} from '../offline-readonly'
import {findTaskInAnyContext} from '../selectors'
import {
	applyTaskAssigneesOptimisticUpdate,
	applyTaskAttachmentsOptimisticUpdate,
	applyTaskCommentsOptimisticUpdate,
	buildTaskProjectMovePayload,
	buildOptimisticTaskComment,
	getTaskCollections,
	normalizeTaskAssignees,
	normalizeTaskAttachments,
	normalizeTaskComments,
	withTaskAttachments,
} from '../task-helpers'

export interface TaskDetailStoreSlice {
	taskDetailOpen: boolean
	taskDetailLoading: boolean
	taskDetail: Task | null
	openTaskDetail: (taskId: number) => Promise<void>
	closeTaskDetail: () => void
	saveTaskDetailPatch: (patch: Partial<Task>) => Promise<boolean>
	loadTaskAttachments: (taskId: number) => Promise<void>
	addAttachmentToTask: (file: File) => Promise<boolean>
	removeTaskAttachment: (attachmentId: number) => Promise<boolean>
	addAssigneeToTask: (assignee: TaskAssignee) => Promise<boolean>
	removeAssigneeFromTask: (userId: number) => Promise<boolean>
	addCommentToTask: (comment: string) => Promise<boolean>
	updateTaskComment: (commentId: number, comment: string) => Promise<boolean>
	deleteTaskComment: (commentId: number) => Promise<boolean>
	addLabelToTask: (labelId: number) => Promise<boolean>
	removeLabelFromTask: (labelId: number) => Promise<boolean>
	addTaskRelation: (taskId: number, otherTaskId: number, relationKind: TaskRelationKind) => Promise<boolean>
	removeTaskRelation: (taskId: number, otherTaskId: number, relationKind: TaskRelationKind) => Promise<boolean>
	createTaskAndRelate: (taskId: number, title: string, relationKind: TaskRelationKind) => Promise<boolean>
	moveTaskToProject: (taskId: number, targetProjectId: number) => Promise<boolean>
	makeTaskSubtask: (taskId: number, parentTaskId: number) => Promise<boolean>
}

export const createTaskDetailSlice: StateCreator<AppStore, [], [], TaskDetailStoreSlice> = (set, get) => ({
	taskDetailOpen: false,
	taskDetailLoading: false,
	taskDetail: null,

	async openTaskDetail(taskId) {
		const cachedTask = withTaskAttachments(
			findTaskInAnyContext(taskId, getTaskCollections(get())),
			get().taskDetail?.id === taskId ? get().taskDetail?.attachments : [],
		)
		set({
			taskDetailOpen: true,
			taskDetailLoading: true,
			taskDetail: cachedTask,
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
			openMenu: null,
		})

		if (isOfflineReadOnly(get)) {
			set({taskDetailLoading: false})
			return
		}

		try {
			await get().ensureLabelsLoaded()
			const result = await api<{task: Task}>(`/api/tasks/${taskId}`)
			set(state => ({
				taskDetail: withTaskAttachments(
					result.task,
					state.taskDetail?.id === taskId ? state.taskDetail.attachments : [],
				),
			}))
			void get().loadTaskAttachments(taskId)
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({taskDetailLoading: false})
		}
	},

	closeTaskDetail() {
		set({
			taskDetailOpen: false,
			taskDetailLoading: false,
			taskDetail: null,
		})
	},

	async saveTaskDetailPatch(patch) {
		if (blockOfflineReadOnlyAction(get, set, 'edit tasks')) {
			return false
		}

		const currentTask = get().taskDetail
		if (!currentTask?.id) {
			return false
		}

		const optimisticTask = {
			...currentTask,
			...patch,
		}

		try {
			set({taskDetail: optimisticTask})
			const result = await api<{task: Task}, Partial<Task>>(`/api/tasks/${currentTask.id}`, {
				method: 'POST',
				body: {
					...currentTask,
					...patch,
				},
			})
			set({taskDetail: withTaskAttachments(result.task, currentTask.attachments)})
			void get().refreshCurrentCollections()
			return true
		} catch (error) {
			set({taskDetail: currentTask})
			set({error: formatError(error as Error)})
			return false
		}
	},

	async loadTaskAttachments(taskId) {
		if (isOfflineReadOnly(get)) {
			return
		}

		const numericTaskId = Number(taskId || 0)
		if (!numericTaskId) {
			return
		}

		try {
			const result = await api<{attachments: TaskAttachment[]}>(`/api/tasks/${numericTaskId}/attachments`)
			set(state => applyTaskAttachmentsOptimisticUpdate(state, numericTaskId, normalizeTaskAttachments(result.attachments)))
		} catch (error) {
			set({error: formatError(error as Error)})
		}
	},

	async addAttachmentToTask(file) {
		if (blockOfflineReadOnlyAction(get, set, 'manage attachments')) {
			return false
		}

		const currentTask = get().taskDetail
		if (!currentTask?.id || !file) {
			return false
		}

		try {
			const formData = new FormData()
			formData.append('files', file)
			const result = await uploadApi<{attachments: TaskAttachment[]}>(`/api/tasks/${currentTask.id}/attachments`, formData)
			const currentAttachments = normalizeTaskAttachments(get().taskDetail?.attachments)
			const committedAttachments = normalizeTaskAttachments([...currentAttachments, ...(result.attachments || [])])
			set(state => applyTaskAttachmentsOptimisticUpdate(state, currentTask.id, committedAttachments))
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async removeTaskAttachment(attachmentId) {
		if (blockOfflineReadOnlyAction(get, set, 'manage attachments')) {
			return false
		}

		const currentTask = get().taskDetail
		const numericAttachmentId = Number(attachmentId || 0)
		if (!currentTask?.id || !numericAttachmentId) {
			return false
		}

		const currentAttachments = normalizeTaskAttachments(currentTask.attachments)
		const nextAttachments = currentAttachments.filter(attachment => attachment.id !== numericAttachmentId)
		if (nextAttachments.length === currentAttachments.length) {
			return false
		}

		set(state => applyTaskAttachmentsOptimisticUpdate(state, currentTask.id, nextAttachments))

		try {
			await api(`/api/tasks/${currentTask.id}/attachments/${numericAttachmentId}`, {
				method: 'DELETE',
			})
			return true
		} catch (error) {
			set(state => applyTaskAttachmentsOptimisticUpdate(state, currentTask.id, currentAttachments))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async addAssigneeToTask(assignee) {
		if (blockOfflineReadOnlyAction(get, set, 'manage assignees')) {
			return false
		}

		const currentTask = get().taskDetail
		if (!currentTask?.id || !assignee?.id) {
			return false
		}

		const currentAssignees = normalizeTaskAssignees(currentTask.assignees)
		if (currentAssignees.some(entry => entry.id === assignee.id)) {
			return true
		}

		const nextAssignees = normalizeTaskAssignees([...currentAssignees, assignee])
		set(state => applyTaskAssigneesOptimisticUpdate(state, currentTask.id, nextAssignees))

		try {
			await api(`/api/tasks/${currentTask.id}/assignees`, {
				method: 'POST',
				body: {
					userId: assignee.id,
				},
			})
			void get().refreshCurrentCollections()
			return true
		} catch (error) {
			set(state => applyTaskAssigneesOptimisticUpdate(state, currentTask.id, currentAssignees))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async removeAssigneeFromTask(userId) {
		if (blockOfflineReadOnlyAction(get, set, 'manage assignees')) {
			return false
		}

		const currentTask = get().taskDetail
		const numericUserId = Number(userId || 0)
		if (!currentTask?.id || !numericUserId) {
			return false
		}

		const currentAssignees = normalizeTaskAssignees(currentTask.assignees)
		const nextAssignees = currentAssignees.filter(entry => entry.id !== numericUserId)
		set(state => applyTaskAssigneesOptimisticUpdate(state, currentTask.id, nextAssignees))

		try {
			await api(`/api/tasks/${currentTask.id}/assignees/${numericUserId}`, {
				method: 'DELETE',
			})
			void get().refreshCurrentCollections()
			return true
		} catch (error) {
			set(state => applyTaskAssigneesOptimisticUpdate(state, currentTask.id, currentAssignees))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async addCommentToTask(comment) {
		if (blockOfflineReadOnlyAction(get, set, 'manage comments')) {
			return false
		}

		const currentTask = get().taskDetail
		const normalizedComment = `${comment || ''}`.trim()
		if (!currentTask?.id || !normalizedComment) {
			return false
		}

		const currentComments = normalizeTaskComments(currentTask.comments)
		const optimisticComment = buildOptimisticTaskComment(get().account?.user, normalizedComment)
		const nextComments = normalizeTaskComments([...currentComments, optimisticComment])
		set(state => applyTaskCommentsOptimisticUpdate(state, currentTask.id, nextComments))

		try {
			const result = await api<{comment: TaskComment}, {comment: string}>(`/api/tasks/${currentTask.id}/comments`, {
				method: 'POST',
				body: {comment: normalizedComment},
			})
			const committedComments = normalizeTaskComments([...currentComments, result.comment])
			set(state => applyTaskCommentsOptimisticUpdate(state, currentTask.id, committedComments))
			void get().refreshCurrentCollections()
			return true
		} catch (error) {
			set(state => applyTaskCommentsOptimisticUpdate(state, currentTask.id, currentComments))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async updateTaskComment(commentId, comment) {
		if (blockOfflineReadOnlyAction(get, set, 'manage comments')) {
			return false
		}

		const currentTask = get().taskDetail
		const numericCommentId = Number(commentId || 0)
		const normalizedComment = `${comment || ''}`.trim()
		if (!currentTask?.id || !numericCommentId || !normalizedComment) {
			return false
		}

		const currentComments = normalizeTaskComments(currentTask.comments)
		const previousComment = currentComments.find(entry => entry.id === numericCommentId)
		if (!previousComment) {
			return false
		}
		if (previousComment.comment === normalizedComment) {
			return true
		}

		const optimisticComments = currentComments.map(entry => entry.id === numericCommentId
			? {
				...entry,
				comment: normalizedComment,
				updated: new Date().toISOString(),
			}
			: entry)
		set(state => applyTaskCommentsOptimisticUpdate(state, currentTask.id, optimisticComments))

		try {
			const result = await api<{comment: TaskComment}, {comment: string}>(`/api/tasks/${currentTask.id}/comments/${numericCommentId}`, {
				method: 'POST',
				body: {comment: normalizedComment},
			})
			const committedComments = currentComments.map(entry => entry.id === numericCommentId ? result.comment : entry)
			set(state => applyTaskCommentsOptimisticUpdate(state, currentTask.id, committedComments))
			void get().refreshCurrentCollections()
			return true
		} catch (error) {
			set(state => applyTaskCommentsOptimisticUpdate(state, currentTask.id, currentComments))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async deleteTaskComment(commentId) {
		if (blockOfflineReadOnlyAction(get, set, 'manage comments')) {
			return false
		}

		const currentTask = get().taskDetail
		const numericCommentId = Number(commentId || 0)
		if (!currentTask?.id || !numericCommentId) {
			return false
		}

		const currentComments = normalizeTaskComments(currentTask.comments)
		const nextComments = currentComments.filter(entry => entry.id !== numericCommentId)
		if (nextComments.length === currentComments.length) {
			return false
		}

		set(state => applyTaskCommentsOptimisticUpdate(state, currentTask.id, nextComments))

		try {
			await api(`/api/tasks/${currentTask.id}/comments/${numericCommentId}`, {
				method: 'DELETE',
			})
			void get().refreshCurrentCollections()
			return true
		} catch (error) {
			set(state => applyTaskCommentsOptimisticUpdate(state, currentTask.id, currentComments))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async addLabelToTask(labelId) {
		if (blockOfflineReadOnlyAction(get, set, 'manage labels')) {
			return false
		}

		if (!get().taskDetail?.id || !labelId) {
			return false
		}

		try {
			await api<{ok: boolean}, {labelId: number}>(`/api/tasks/${get().taskDetail?.id}/labels`, {
				method: 'POST',
				body: {labelId},
			})
			const currentTaskId = get().taskDetail?.id
			if (currentTaskId) {
				await get().openTaskDetail(currentTaskId)
			}
			await get().refreshCurrentCollections()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async removeLabelFromTask(labelId) {
		if (blockOfflineReadOnlyAction(get, set, 'manage labels')) {
			return false
		}

		if (!get().taskDetail?.id || !labelId) {
			return false
		}

		try {
			await api<{ok: boolean}>(`/api/tasks/${get().taskDetail?.id}/labels/${labelId}`, {
				method: 'DELETE',
			})
			const currentTaskId = get().taskDetail?.id
			if (currentTaskId) {
				await get().openTaskDetail(currentTaskId)
			}
			await get().refreshCurrentCollections()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async addTaskRelation(taskId, otherTaskId, relationKind) {
		if (blockOfflineReadOnlyAction(get, set, 'manage task relations')) {
			return false
		}

		const numericTaskId = Number(taskId || 0)
		const numericOtherTaskId = Number(otherTaskId || 0)
		if (!numericTaskId || !numericOtherTaskId || !relationKind || numericTaskId === numericOtherTaskId) {
			return false
		}

		try {
			await api(`/api/tasks/${numericTaskId}/relations`, {
				method: 'PUT',
				body: {
					other_task_id: numericOtherTaskId,
					relation_kind: relationKind,
				},
			})
			await get().refreshCurrentCollections()
			await get().openTaskDetail(numericTaskId)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async removeTaskRelation(taskId, otherTaskId, relationKind) {
		if (blockOfflineReadOnlyAction(get, set, 'manage task relations')) {
			return false
		}

		const numericTaskId = Number(taskId || 0)
		const numericOtherTaskId = Number(otherTaskId || 0)
		if (!numericTaskId || !numericOtherTaskId || !relationKind) {
			return false
		}

		try {
			await api(`/api/tasks/${numericTaskId}/relations/${relationKind}/${numericOtherTaskId}`, {
				method: 'DELETE',
			})
			await get().refreshCurrentCollections()
			await get().openTaskDetail(numericTaskId)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async createTaskAndRelate(taskId, title, relationKind) {
		if (blockOfflineReadOnlyAction(get, set, 'create related tasks')) {
			return false
		}

		const currentTask = get().taskDetail
		const normalizedTaskId = Number(taskId || 0)
		const normalizedTitle = `${title || ''}`.trim()
		if (!currentTask?.id || currentTask.id !== normalizedTaskId || !normalizedTitle || !relationKind) {
			return false
		}

		try {
			const result = await api<{task: Task}, {title: string}>(`/api/projects/${currentTask.project_id}/tasks`, {
				method: 'POST',
				body: {
					title: normalizedTitle,
				},
			})
			await get().addTaskRelation(normalizedTaskId, result.task.id, relationKind)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async moveTaskToProject(taskId, targetProjectId) {
		if (blockOfflineReadOnlyAction(get, set, 'move tasks between projects')) {
			return false
		}

		const task = findTaskInAnyContext(taskId, getTaskCollections(get()))
		const nextProjectId = Number(targetProjectId || 0)
		if (!task || !nextProjectId || task.project_id === nextProjectId) {
			return false
		}

		try {
			set({openMenu: null})
			const currentParentRefs = [...(task.related_tasks?.parenttask || [])]
			for (const parentRef of currentParentRefs) {
				await api(`/api/tasks/${parentRef.id}/relations/subtask/${taskId}`, {
					method: 'DELETE',
				})
			}

			await api(`/api/tasks/${taskId}`, {
				method: 'POST',
				body: buildTaskProjectMovePayload(task, nextProjectId),
			})

			await get().refreshCurrentCollections()
			if (get().taskDetailOpen && get().taskDetail?.id === taskId) {
				await get().openTaskDetail(taskId)
			}
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async makeTaskSubtask(taskId, parentTaskId) {
		return get().moveTaskToPlacement(taskId, {
			parentTaskId,
		})
	},
})

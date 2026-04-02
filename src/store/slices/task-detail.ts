import {api, uploadApi} from '@/api'
import type {
	Label,
	ReactionMap,
	Task,
	TaskAssignee,
	TaskAttachment,
	TaskComment,
	TaskReaction,
	TaskRelationKind,
} from '@/types'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {enqueueMutation} from '../offline-queue'
import {blockNonQueueableOfflineAction, blockOfflineReadOnlyAction, isOfflineReadOnly, shouldQueueOffline} from '../offline-readonly'
import {findTaskInAnyContext} from '../selectors'
import {
	applyTaskAssigneesOptimisticUpdate,
	applyTaskAttachmentsOptimisticUpdate,
	applyTaskCommentsOptimisticUpdate,
	applyTaskLabelsOptimisticUpdate,
	applyTaskPatchOptimisticUpdate,
	applyTaskRelationRefsOptimisticUpdate,
	buildTaskRelationRef,
	buildTaskProjectMovePayload,
	buildOptimisticTaskComment,
	getTaskCollections,
	normalizeTaskAssignees,
	normalizeTaskAttachments,
	normalizeTaskComments,
	withTaskAttachments,
} from '../task-helpers'

type RawReactionPayload = TaskReaction[] | Record<string, Array<Record<string, unknown>>> | null | undefined

export interface TaskDetailStoreSlice {
	taskDetailOpen: boolean
	taskDetailLoading: boolean
	taskDetail: Task | null
	taskReactions: ReactionMap
	openTaskDetail: (taskId: number) => Promise<void>
	closeTaskDetail: () => void
	loadReactions: (kind: 'task' | 'comment', id: number) => Promise<void>
	addReaction: (kind: 'task' | 'comment', id: number, value: string) => Promise<boolean>
	removeReaction: (kind: 'task' | 'comment', id: number, value: string) => Promise<boolean>
	markTaskRead: (taskId: number) => Promise<boolean>
	saveTaskDetailPatch: (patch: Partial<Task>) => Promise<boolean>
	loadTaskAttachments: (taskId: number) => Promise<void>
	addAttachmentToTask: (file: File) => Promise<boolean>
	removeTaskAttachment: (attachmentId: number) => Promise<boolean>
	addAssigneeToTask: (assignee: TaskAssignee) => Promise<boolean>
	removeAssigneeFromTask: (userId: number) => Promise<boolean>
	bulkUpdateAssignees: (taskId: number, assignees: TaskAssignee[]) => Promise<boolean>
	addCommentToTask: (comment: string) => Promise<boolean>
	updateTaskComment: (commentId: number, comment: string) => Promise<boolean>
	deleteTaskComment: (commentId: number) => Promise<boolean>
	addLabelToTask: (labelId: number) => Promise<boolean>
	removeLabelFromTask: (labelId: number) => Promise<boolean>
	bulkUpdateLabels: (taskId: number, labels: Label[]) => Promise<boolean>
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
	taskReactions: {},

	async openTaskDetail(taskId) {
		const cachedTask = withTaskAttachments(
			findTaskInAnyContext(taskId, getTaskCollections(get())),
			get().taskDetail?.id === taskId ? get().taskDetail?.attachments : [],
		)
		get().setSubscriptionState('task', taskId, null)
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
			get().setSubscriptionState('task', taskId, result.task.subscription?.subscribed ?? null)
			void get().markTaskRead(taskId)
			void get().loadReactions('task', taskId)
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
			taskReactions: {},
		})
	},

	async loadReactions(kind, id) {
		if (isOfflineReadOnly(get) || Number(id || 0) < 1) {
			return
		}

		try {
			const result = await api<{reactions?: RawReactionPayload}>(`/api/${kind}s/${id}/reactions`)
			const key = `${kind}-${id}`
			set(state => ({
				taskReactions: {
					...state.taskReactions,
					[key]: normalizeReactionPayload(result.reactions),
				},
			}))
		} catch (error) {
			set({error: formatError(error as Error)})
		}
	},

	async addReaction(kind, id, value) {
		if (blockOfflineReadOnlyAction(get, set, 'add reaction')) {
			return false
		}

		const reactionValue = `${value || ''}`.trim()
		const user = get().account?.user
		if (!id || !reactionValue || !user) {
			return false
		}

		const key = `${kind}-${id}`
		const current = get().taskReactions[key] || []
		set(state => ({
			taskReactions: {
				...state.taskReactions,
				[key]: [...current, {value: reactionValue, user}],
			},
		}))

		try {
			await api(`/api/${kind}s/${id}/reactions`, {
				method: 'PUT',
				body: {value: reactionValue},
			})
			return true
		} catch (error) {
			set(state => ({
				taskReactions: {
					...state.taskReactions,
					[key]: current,
				},
			}))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async removeReaction(kind, id, value) {
		if (blockOfflineReadOnlyAction(get, set, 'remove reaction')) {
			return false
		}

		const reactionValue = `${value || ''}`.trim()
		const userId = get().account?.user?.id
		if (!id || !reactionValue || !userId) {
			return false
		}

		const key = `${kind}-${id}`
		const current = get().taskReactions[key] || []
		set(state => ({
			taskReactions: {
				...state.taskReactions,
				[key]: current.filter(reaction => !(reaction.value === reactionValue && reaction.user.id === userId)),
			},
		}))

		try {
			await api(`/api/${kind}s/${id}/reactions/delete`, {
				method: 'POST',
				body: {value: reactionValue},
			})
			return true
		} catch (error) {
			set(state => ({
				taskReactions: {
					...state.taskReactions,
					[key]: current,
				},
			}))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async markTaskRead(taskId) {
		if (isOfflineReadOnly(get)) {
			return false
		}

		const numericTaskId = Number(taskId || 0)
		if (!numericTaskId) {
			return false
		}

		const currentTask = get().taskDetail
		if (currentTask?.id === numericTaskId && (currentTask.read || currentTask.read_at)) {
			return true
		}

		try {
			await api<{ok: boolean}>(`/api/tasks/${numericTaskId}/read`, {
				method: 'POST',
			})
			const readAt = new Date().toISOString()
			set(state => ({
				taskDetail:
					state.taskDetail?.id === numericTaskId
						? {
							...state.taskDetail,
							read: true,
							read_at: readAt,
						}
						: state.taskDetail,
			}))
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async saveTaskDetailPatch(patch) {
		if (blockNonQueueableOfflineAction(get, set, 'saveTaskDetailPatch')) {
			return false
		}

		const currentTask = get().taskDetail
		if (!currentTask?.id) {
			return false
		}

		const optimisticTask = {...currentTask, ...patch}
		const taskPayload = {...currentTask}
		delete taskPayload.subscription
		delete taskPayload.read
		delete taskPayload.read_at
		const queuedBody = {
			...taskPayload,
			...patch,
		}
		set(state => ({
			...applyTaskPatchOptimisticUpdate(state, currentTask.id, patch),
		}))

		if (shouldQueueOffline(get, 'saveTaskDetailPatch')) {
			await enqueueMutation({
				type: 'task-update',
				endpoint: `/api/tasks/${currentTask.id}`,
				method: 'POST',
				body: queuedBody,
				metadata: {
					entityType: 'task',
					entityId: currentTask.id,
					description: `Edit "${currentTask.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

		try {
			const result = await api<{task: Task}, Partial<Task>>(`/api/tasks/${currentTask.id}`, {
				method: 'POST',
				body: queuedBody,
			})
			set({taskDetail: withTaskAttachments(result.task, currentTask.attachments)})
			void get().refreshCurrentCollections()
			return true
		} catch (error) {
			set(state => ({
				...applyTaskPatchOptimisticUpdate(state, currentTask.id, currentTask),
				taskDetail: optimisticTask.id === currentTask.id ? currentTask : state.taskDetail,
			}))
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
		if (blockNonQueueableOfflineAction(get, set, 'addAssigneeToTask')) {
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

		if (shouldQueueOffline(get, 'addAssigneeToTask')) {
			await enqueueMutation({
				type: 'assignee-add',
				endpoint: `/api/tasks/${currentTask.id}/assignees`,
				method: 'POST',
				body: {userId: assignee.id},
				metadata: {
					entityType: 'assignee',
					entityId: currentTask.id,
					description: `Assign ${assignee.name || assignee.username || `#${assignee.id}`} to "${currentTask.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

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
		if (blockNonQueueableOfflineAction(get, set, 'removeAssigneeFromTask')) {
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

		if (shouldQueueOffline(get, 'removeAssigneeFromTask')) {
			await enqueueMutation({
				type: 'assignee-remove',
				endpoint: `/api/tasks/${currentTask.id}/assignees/${numericUserId}`,
				method: 'DELETE',
				body: null,
				metadata: {
					entityType: 'assignee',
					entityId: currentTask.id,
					description: `Remove assignee from "${currentTask.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

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

	async bulkUpdateAssignees(taskId, assignees) {
		if (blockOfflineReadOnlyAction(get, set, 'manage assignees')) {
			return false
		}

		const currentTask = get().taskDetail
		if (!currentTask?.id || currentTask.id !== taskId) {
			return false
		}

		const currentAssignees = normalizeTaskAssignees(currentTask.assignees)
		set(state =>
			applyTaskAssigneesOptimisticUpdate(state, taskId, normalizeTaskAssignees(assignees)),
		)

		try {
			await api(`/api/tasks/${taskId}/assignees/bulk`, {
				method: 'POST',
				body: {assignees},
			})
			void get().refreshCurrentCollections()
			return true
		} catch (error) {
			set(state => applyTaskAssigneesOptimisticUpdate(state, taskId, currentAssignees))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async addCommentToTask(comment) {
		if (blockNonQueueableOfflineAction(get, set, 'addCommentToTask')) {
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

		if (shouldQueueOffline(get, 'addCommentToTask')) {
			await enqueueMutation({
				type: 'comment-add',
				endpoint: `/api/tasks/${currentTask.id}/comments`,
				method: 'POST',
				body: {comment: normalizedComment},
				metadata: {
					entityType: 'comment',
					entityId: currentTask.id,
					description: `Comment on "${currentTask.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

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
		if (blockNonQueueableOfflineAction(get, set, 'deleteTaskComment')) {
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

		if (shouldQueueOffline(get, 'deleteTaskComment')) {
			await enqueueMutation({
				type: 'comment-delete',
				endpoint: `/api/tasks/${currentTask.id}/comments/${numericCommentId}`,
				method: 'DELETE',
				body: null,
				metadata: {
					entityType: 'comment',
					entityId: numericCommentId,
					parentEntityId: currentTask.id,
					description: `Delete comment from "${currentTask.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

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
		if (blockNonQueueableOfflineAction(get, set, 'addLabelToTask')) {
			return false
		}

		const currentTask = get().taskDetail
		if (!currentTask?.id || !labelId) {
			return false
		}

		const label = get().labels.find(entry => entry.id === labelId) || null
		if (!label) {
			return false
		}

		const currentLabels = Array.isArray(currentTask.labels) ? currentTask.labels : []
		if (currentLabels.some(entry => entry.id === labelId)) {
			return true
		}

		const nextLabels = [...currentLabels, label]
		set(state => applyTaskLabelsOptimisticUpdate(state, currentTask.id, nextLabels))

		if (shouldQueueOffline(get, 'addLabelToTask')) {
			await enqueueMutation({
				type: 'label-add',
				endpoint: `/api/tasks/${currentTask.id}/labels`,
				method: 'POST',
				body: {labelId},
				metadata: {
					entityType: 'label',
					entityId: labelId,
					parentEntityId: currentTask.id,
					description: `Add label "${label.title}" to "${currentTask.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

		try {
			await api<{ok: boolean}, {labelId: number}>(`/api/tasks/${currentTask.id}/labels`, {
				method: 'POST',
				body: {labelId},
			})
			await get().refreshCurrentCollections()
			return true
		} catch (error) {
			set(state => applyTaskLabelsOptimisticUpdate(state, currentTask.id, currentLabels))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async removeLabelFromTask(labelId) {
		if (blockNonQueueableOfflineAction(get, set, 'removeLabelFromTask')) {
			return false
		}

		const currentTask = get().taskDetail
		if (!currentTask?.id || !labelId) {
			return false
		}

		const currentLabels = Array.isArray(currentTask.labels) ? currentTask.labels : []
		const nextLabels = currentLabels.filter(entry => entry.id !== labelId)
		if (nextLabels.length === currentLabels.length) {
			return false
		}
		const removedLabel = currentLabels.find(entry => entry.id === labelId) || null
		set(state => applyTaskLabelsOptimisticUpdate(state, currentTask.id, nextLabels))

		if (shouldQueueOffline(get, 'removeLabelFromTask')) {
			await enqueueMutation({
				type: 'label-remove',
				endpoint: `/api/tasks/${currentTask.id}/labels/${labelId}`,
				method: 'DELETE',
				body: null,
				metadata: {
					entityType: 'label',
					entityId: labelId,
					parentEntityId: currentTask.id,
					description: `Remove label "${removedLabel?.title || labelId}" from "${currentTask.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

		try {
			await api<{ok: boolean}>(`/api/tasks/${currentTask.id}/labels/${labelId}`, {
				method: 'DELETE',
			})
			await get().refreshCurrentCollections()
			return true
		} catch (error) {
			set(state => applyTaskLabelsOptimisticUpdate(state, currentTask.id, currentLabels))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async bulkUpdateLabels(taskId, labels) {
		if (blockOfflineReadOnlyAction(get, set, 'manage labels')) {
			return false
		}

		const currentTask = get().taskDetail
		if (!currentTask?.id || currentTask.id !== taskId) {
			return false
		}

		try {
			await api(`/api/tasks/${taskId}/labels/bulk`, {
				method: 'POST',
				body: {labels},
			})
			await get().openTaskDetail(taskId)
			void get().refreshCurrentCollections()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async addTaskRelation(taskId, otherTaskId, relationKind) {
		if (blockNonQueueableOfflineAction(get, set, 'addTaskRelation')) {
			return false
		}

		const numericTaskId = Number(taskId || 0)
		const numericOtherTaskId = Number(otherTaskId || 0)
		if (!numericTaskId || !numericOtherTaskId || !relationKind || numericTaskId === numericOtherTaskId) {
			return false
		}

		const currentTask = get().taskDetail?.id === numericTaskId ? get().taskDetail : null
		const otherTask = findTaskInAnyContext(numericOtherTaskId, getTaskCollections(get()))
		const currentRefs = [...(currentTask?.related_tasks?.[relationKind] || [])]
		const nextRefs = currentRefs.some(entry => entry.id === numericOtherTaskId)
			? currentRefs
			: [
				...currentRefs,
				otherTask
					? buildTaskRelationRef(otherTask)
					: {id: numericOtherTaskId, title: `#${numericOtherTaskId}`, project_id: 0, done: false},
			]
		if (currentTask) {
			set(state => applyTaskRelationRefsOptimisticUpdate(state, numericTaskId, relationKind, nextRefs))
		}

		if (shouldQueueOffline(get, 'addTaskRelation')) {
			await enqueueMutation({
				type: 'relation-add',
				endpoint: `/api/tasks/${numericTaskId}/relations`,
				method: 'PUT',
				body: {
					other_task_id: numericOtherTaskId,
					relation_kind: relationKind,
				},
				metadata: {
					entityType: 'relation',
					entityId: numericTaskId,
					parentEntityId: numericOtherTaskId,
					description: `Relate task #${numericTaskId} to #${numericOtherTaskId}`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
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
			if (currentTask) {
				set(state => applyTaskRelationRefsOptimisticUpdate(state, numericTaskId, relationKind, currentRefs))
			}
			set({error: formatError(error as Error)})
			return false
		}
	},

	async removeTaskRelation(taskId, otherTaskId, relationKind) {
		if (blockNonQueueableOfflineAction(get, set, 'removeTaskRelation')) {
			return false
		}

		const numericTaskId = Number(taskId || 0)
		const numericOtherTaskId = Number(otherTaskId || 0)
		if (!numericTaskId || !numericOtherTaskId || !relationKind) {
			return false
		}

		const currentTask = get().taskDetail?.id === numericTaskId ? get().taskDetail : null
		const currentRefs = [...(currentTask?.related_tasks?.[relationKind] || [])]
		const nextRefs = currentRefs.filter(entry => entry.id !== numericOtherTaskId)
		if (currentTask) {
			set(state => applyTaskRelationRefsOptimisticUpdate(state, numericTaskId, relationKind, nextRefs))
		}

		if (shouldQueueOffline(get, 'removeTaskRelation')) {
			await enqueueMutation({
				type: 'relation-remove',
				endpoint: `/api/tasks/${numericTaskId}/relations/${relationKind}/${numericOtherTaskId}`,
				method: 'DELETE',
				body: null,
				metadata: {
					entityType: 'relation',
					entityId: numericTaskId,
					parentEntityId: numericOtherTaskId,
					description: `Remove relation between #${numericTaskId} and #${numericOtherTaskId}`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

		try {
			await api(`/api/tasks/${numericTaskId}/relations/${relationKind}/${numericOtherTaskId}`, {
				method: 'DELETE',
			})
			await get().refreshCurrentCollections()
			await get().openTaskDetail(numericTaskId)
			return true
		} catch (error) {
			if (currentTask) {
				set(state => applyTaskRelationRefsOptimisticUpdate(state, numericTaskId, relationKind, currentRefs))
			}
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
		return get().moveTask({
			taskId,
			parentTaskId,
		})
	},
})

function normalizeReactionPayload(payload: RawReactionPayload): TaskReaction[] {
	if (Array.isArray(payload)) {
		return payload
			.filter(reaction => reaction && typeof reaction === 'object')
			.map(reaction => ({
				value: `${reaction.value || ''}`.trim(),
				user: reaction.user,
			}))
			.filter(reaction => reaction.value && reaction.user)
	}

	if (!payload || typeof payload !== 'object') {
		return []
	}

	const normalized: TaskReaction[] = []
	for (const [value, users] of Object.entries(payload)) {
		if (!Array.isArray(users)) {
			continue
		}

			for (const user of users) {
				if (!user || typeof user !== 'object') {
					continue
				}

				normalized.push({
					value: `${value || ''}`.trim(),
					user: user as unknown as TaskReaction['user'],
				})
			}
	}

	return normalized.filter(reaction => reaction.value && reaction.user)
}

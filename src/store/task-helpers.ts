import {api} from '@/api'
import type {
	Bucket,
	BulkTaskAction,
	Label,
	Screen,
	Task,
	TaskAssignee,
	TaskAttachment,
	TaskComment,
	TaskRelationKind,
	TaskRelationRef,
	UserProfile,
} from '@/types'
import {cloneRelatedTasksMap} from '@/utils/taskRelations'
import {calculateTaskPosition} from '@/utils/taskPosition'
import type {AppStore} from './index'
import {persistOfflineBrowseSnapshot} from './offline-browse-cache'
import {compareByPositionThenId} from './project-helpers'
import {findTaskInAnyContext} from './selectors'

export type TopLevelTaskCollectionKey =
	| 'tasks'
	| 'todayTasks'
	| 'inboxTasks'
	| 'upcomingTasks'
	| 'searchTasks'
	| 'savedFilterTasks'
	| 'projectFilterTasks'

export interface TaskCollectionMutationSet {
	topLevelKeys: Set<TopLevelTaskCollectionKey>
	previewProjectIds: Set<number>
	taskDetailChanged: boolean
	nextBucketsByViewId: Record<number, Bucket[]> | null
}

interface TaskCollectionEntry {
	kind: 'topLevel'
	key: TopLevelTaskCollectionKey
	list: Task[]
}

interface TaskCollectionPreviewEntry {
	kind: 'preview'
	projectId: number
	list: Task[]
}

type AnyTaskCollectionEntry = TaskCollectionEntry | TaskCollectionPreviewEntry

export interface TaskDeletionSnapshot {
	tasks: Task[]
	todayTasks: Task[]
	inboxTasks: Task[]
	upcomingTasks: Task[]
	searchTasks: Task[]
	savedFilterTasks: Task[]
	projectFilterTasks: Task[]
	projectPreviewTasksById: Record<number, Task[]>
	projectBucketsByViewId: Record<number, Bucket[]>
	taskDetailOpen: boolean
	taskDetailLoading: boolean
	taskDetail: Task | null
	focusedTaskStack: Array<{taskId: number; projectId: number; sourceScreen: Screen}>
	focusedTaskId: number | null
	focusedTaskProjectId: number | null
	focusedTaskSourceScreen: Screen | null
	activeSubtaskParentId: number | null
	activeSubtaskSource: 'list' | 'detail' | 'focus' | null
	togglingTaskIds: Set<number>
	recentlyCompletedTaskIds: Set<number>
}

export const COMPLETION_ANIMATION_MS = 520
export const UNDOABLE_MUTATION_MS = 4200
export const completionAnimationTimers = new Map<number, ReturnType<typeof setTimeout>>()

export function persistOfflineTaskCollections(state: AppStore) {
	void persistOfflineBrowseSnapshot(state)
}

export function normalizeTaskAssignees(assignees: TaskAssignee[] | null | undefined) {
	if (!Array.isArray(assignees)) {
		return []
	}

	const byId = new Map<number, TaskAssignee>()
	for (const assignee of assignees) {
		const id = Number(assignee?.id || 0)
		if (!id || byId.has(id)) {
			continue
		}

		byId.set(id, {
			id,
			name: `${assignee?.name || ''}`.trim(),
			username: `${assignee?.username || ''}`.trim(),
			email: `${assignee?.email || ''}`.trim(),
		})
	}

	return [...byId.values()].sort((left, right) => left.id - right.id)
}

export function normalizeTaskComments(comments: TaskComment[] | null | undefined) {
	if (!Array.isArray(comments)) {
		return []
	}

	const byId = new Map<number, TaskComment>()
	for (const comment of comments) {
		const id = Number(comment?.id || 0)
		if (!id || byId.has(id)) {
			continue
		}

		byId.set(id, {
			id,
			comment: `${comment?.comment || ''}`.trim(),
			author: {
				id: Number(comment?.author?.id || 0),
				name: `${comment?.author?.name || ''}`.trim(),
				username: `${comment?.author?.username || ''}`.trim(),
				email: `${comment?.author?.email || ''}`.trim(),
			},
			created: comment?.created || null,
			updated: comment?.updated || comment?.created || null,
		})
	}

	return [...byId.values()].sort(
		(left, right) => new Date(left.created || 0).getTime() - new Date(right.created || 0).getTime() || left.id - right.id,
	)
}

export function normalizeTaskAttachments(attachments: TaskAttachment[] | null | undefined) {
	if (!Array.isArray(attachments)) {
		return []
	}

	const byId = new Map<number, TaskAttachment>()
	for (const attachment of attachments) {
		const id = Number(attachment?.id || 0)
		if (!id || byId.has(id)) {
			continue
		}

		byId.set(id, {
			id,
			task_id: Number(attachment?.task_id || 0),
			created_by: {
				id: Number(attachment?.created_by?.id || 0),
				name: `${attachment?.created_by?.name || ''}`.trim(),
				username: `${attachment?.created_by?.username || ''}`.trim(),
				email: `${attachment?.created_by?.email || ''}`.trim(),
			},
			file: {
				id: Number(attachment?.file?.id || 0),
				name: `${attachment?.file?.name || ''}`.trim(),
				mime: `${attachment?.file?.mime || ''}`.trim(),
				size: Number(attachment?.file?.size || 0),
			},
			created: attachment?.created || null,
		})
	}

	return [...byId.values()].sort(
		(left, right) => new Date(left.created || 0).getTime() - new Date(right.created || 0).getTime() || left.id - right.id,
	)
}

export function buildTaskProjectMovePayload(task: Task, projectId: number) {
	return {
		title: task.title,
		description: task.description || '',
		done: Boolean(task.done),
		is_favorite: Boolean(task.is_favorite),
		due_date: task.due_date || null,
		start_date: task.start_date || null,
		end_date: task.end_date || null,
		done_at: task.done_at || null,
		priority: Number(task.priority || 0),
		percent_done: Number(task.percent_done || 0),
		reminders: Array.isArray(task.reminders) ? task.reminders : [],
		repeat_after: task.repeat_after ?? null,
		repeat_from_current_date: Boolean(task.repeat_from_current_date),
		project_id: projectId,
	}
}

export function buildOptimisticTaskComment(
	user: UserProfile | null | undefined,
	comment: string,
): TaskComment {
	const now = new Date().toISOString()
	return {
		id: Date.now() * -1,
		comment,
		author: {
			id: Number(user?.id || 0),
			name: `${user?.name || ''}`.trim(),
			username: `${user?.username || ''}`.trim(),
			email: `${user?.email || ''}`.trim(),
		},
		created: now,
		updated: now,
	}
}

export function applyTaskAssigneesOptimisticUpdate(state: AppStore, taskId: number, assignees: TaskAssignee[]) {
	const nextCollections = getClonedTaskCollections(state)
	const nextAssignees = assignees.map(assignee => ({...assignee}))
	for (const taskList of [
		nextCollections.tasks,
		nextCollections.todayTasks,
		nextCollections.inboxTasks,
		nextCollections.upcomingTasks,
		nextCollections.searchTasks,
		nextCollections.savedFilterTasks,
		nextCollections.projectFilterTasks,
	]) {
		for (const task of taskList) {
			if (task.id === taskId) {
				task.assignees = nextAssignees.map(assignee => ({...assignee}))
			}
		}
	}

	for (const taskList of Object.values(nextCollections.projectPreviewTasksById)) {
		for (const task of taskList) {
			if (task.id === taskId) {
				task.assignees = nextAssignees.map(assignee => ({...assignee}))
			}
		}
	}

	return {
		...nextCollections,
		taskDetail:
			state.taskDetail?.id === taskId
				? {
					...state.taskDetail,
					labels: Array.isArray(state.taskDetail.labels) ? [...state.taskDetail.labels] : [],
					attachments: Array.isArray(state.taskDetail.attachments)
						? state.taskDetail.attachments.map(attachment => ({
							...attachment,
							created_by: attachment?.created_by
								? {...attachment.created_by}
								: {id: 0, name: '', username: '', email: ''},
							file: attachment?.file ? {...attachment.file} : {id: 0, name: '', mime: '', size: 0},
						}))
						: [],
					assignees: nextAssignees.map(assignee => ({...assignee})),
					related_tasks: cloneRelatedTasksMap(state.taskDetail.related_tasks),
				}
				: state.taskDetail,
	}
}

export function applyTaskCommentsOptimisticUpdate(state: AppStore, taskId: number, comments: TaskComment[]) {
	const nextCollections = getClonedTaskCollections(state)
	const nextComments = comments.map(comment => ({
		...comment,
		author: {...comment.author},
	}))
	const nextCommentCount = nextComments.length
	for (const taskList of [
		nextCollections.tasks,
		nextCollections.todayTasks,
		nextCollections.inboxTasks,
		nextCollections.upcomingTasks,
		nextCollections.searchTasks,
		nextCollections.savedFilterTasks,
		nextCollections.projectFilterTasks,
	]) {
		for (const task of taskList) {
			if (task.id === taskId) {
				task.comment_count = nextCommentCount
			}
		}
	}

	for (const taskList of Object.values(nextCollections.projectPreviewTasksById)) {
		for (const task of taskList) {
			if (task.id === taskId) {
				task.comment_count = nextCommentCount
			}
		}
	}

	return {
		...nextCollections,
		taskDetail:
			state.taskDetail?.id === taskId
				? {
					...state.taskDetail,
					comments: nextComments,
					comment_count: nextCommentCount,
					attachments: Array.isArray(state.taskDetail.attachments)
						? state.taskDetail.attachments.map(attachment => ({
							...attachment,
							created_by: attachment?.created_by
								? {...attachment.created_by}
								: {id: 0, name: '', username: '', email: ''},
							file: attachment?.file ? {...attachment.file} : {id: 0, name: '', mime: '', size: 0},
						}))
						: [],
					assignees: Array.isArray(state.taskDetail.assignees)
						? state.taskDetail.assignees.map(assignee => ({...assignee}))
						: [],
					labels: Array.isArray(state.taskDetail.labels) ? [...state.taskDetail.labels] : [],
					related_tasks: cloneRelatedTasksMap(state.taskDetail.related_tasks),
				}
				: state.taskDetail,
	}
}

export function applyTaskAttachmentsOptimisticUpdate(state: AppStore, taskId: number, attachments: TaskAttachment[]) {
	const nextAttachments = attachments.map(attachment => ({
		...attachment,
		created_by: attachment?.created_by ? {...attachment.created_by} : {id: 0, name: '', username: '', email: ''},
		file: attachment?.file ? {...attachment.file} : {id: 0, name: '', mime: '', size: 0},
	}))

	return {
		taskDetail:
			state.taskDetail?.id === taskId
				? {
					...state.taskDetail,
					attachments: nextAttachments,
					comments: Array.isArray(state.taskDetail.comments)
						? state.taskDetail.comments.map(comment => ({
							...comment,
							author: comment?.author ? {...comment.author} : {id: 0, name: '', username: '', email: ''},
						}))
						: [],
					comment_count: Number(state.taskDetail.comment_count || 0),
					assignees: Array.isArray(state.taskDetail.assignees)
						? state.taskDetail.assignees.map(assignee => ({...assignee}))
						: [],
					labels: Array.isArray(state.taskDetail.labels) ? [...state.taskDetail.labels] : [],
					related_tasks: cloneRelatedTasksMap(state.taskDetail.related_tasks),
				}
				: state.taskDetail,
	}
}

export function applyTaskDoneOptimisticUpdate(
	state: AppStore,
	taskId: number,
	done: boolean,
	doneAt: string | null,
	options: {
		viewId?: number | null
		targetBucketId?: number | null
	} = {},
) {
	const targetViewId = Number(options.viewId || 0) || null
	const hasTargetBucket = options.targetBucketId !== undefined
	const targetBucketId = hasTargetBucket ? (Number(options.targetBucketId || 0) || null) : null
	const movedPosition =
		targetViewId && targetBucketId
			? Math.max(
				0,
				...((state.projectBucketsByViewId[targetViewId] || [])
					.find(bucket => bucket.id === targetBucketId)
					?.tasks || [])
					.filter(task => task.id !== taskId)
					.map(task => Number(task.position || 0)),
			) + 1024
			: null
	const patchTask = (task: Task, includeBucketState = false) =>
		task.id === taskId
			? {
				...task,
				done,
				done_at: done ? doneAt : null,
				...(includeBucketState
					? {
						bucket_id: targetBucketId,
						bucketId: targetBucketId,
					}
					: {}),
				...(movedPosition ? {position: movedPosition} : {}),
			}
			: task
	const patchList = (list: Task[], includeBucketState = false) =>
		list.map(task => patchTask(task, includeBucketState))

	return {
		tasks: patchList(state.tasks, hasTargetBucket),
		todayTasks: patchList(state.todayTasks, hasTargetBucket),
		inboxTasks: patchList(state.inboxTasks, hasTargetBucket),
		upcomingTasks: patchList(state.upcomingTasks, hasTargetBucket),
		searchTasks: patchList(state.searchTasks, hasTargetBucket),
		savedFilterTasks: patchList(state.savedFilterTasks, hasTargetBucket),
		projectFilterTasks: patchList(state.projectFilterTasks, hasTargetBucket),
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(state.projectPreviewTasksById).map(([projectId, list]) => [projectId, patchList(list, hasTargetBucket)]),
		),
		projectBucketsByViewId: Object.fromEntries(
			Object.entries(state.projectBucketsByViewId).map(([viewId, buckets]) => {
				const numericViewId = Number(viewId || 0) || null
				if (!(targetViewId && numericViewId === targetViewId && hasTargetBucket)) {
					return [viewId, buckets.map(bucket => ({
						...bucket,
						tasks: patchList(bucket.tasks),
					}))]
				}

				let movedTask: Task | null = null
				const updatedBuckets = buckets.map(bucket => {
					const nextTasks: Task[] = []
					for (const bucketTask of bucket.tasks) {
						if (bucketTask.id === taskId) {
							movedTask = patchTask(bucketTask, true)
							continue
						}

						nextTasks.push(patchTask(bucketTask))
					}

					return {
						...bucket,
						tasks: nextTasks,
					}
				})

				if (movedTask && targetBucketId) {
					const targetBucket = updatedBuckets.find(bucket => bucket.id === targetBucketId) || null
					if (targetBucket) {
						targetBucket.tasks.push(movedTask)
					}
				}

				return [viewId, updatedBuckets.map(bucket => ({
					...bucket,
					count: bucket.tasks.length,
				}))]
			}),
		),
		taskDetail:
			state.taskDetail?.id === taskId
				? {
					...state.taskDetail,
					done,
					done_at: done ? doneAt : null,
					...(hasTargetBucket
						? {
							bucket_id: targetBucketId,
							bucketId: targetBucketId,
						}
						: {}),
					...(movedPosition ? {position: movedPosition} : {}),
					comments: Array.isArray(state.taskDetail.comments)
						? state.taskDetail.comments.map(comment => ({
							...comment,
							author: comment?.author ? {...comment.author} : {id: 0, name: '', username: '', email: ''},
						}))
						: [],
					attachments: Array.isArray(state.taskDetail.attachments)
						? state.taskDetail.attachments.map(attachment => ({
							...attachment,
							created_by: attachment?.created_by
								? {...attachment.created_by}
								: {id: 0, name: '', username: '', email: ''},
							file: attachment?.file ? {...attachment.file} : {id: 0, name: '', mime: '', size: 0},
						}))
						: [],
					assignees: Array.isArray(state.taskDetail.assignees)
						? state.taskDetail.assignees.map(assignee => ({...assignee}))
						: [],
					labels: Array.isArray(state.taskDetail.labels) ? [...state.taskDetail.labels] : [],
					related_tasks: cloneRelatedTasksMap(state.taskDetail.related_tasks),
				}
				: state.taskDetail,
	}
}

export function applyTaskPatchOptimisticUpdate(state: AppStore, taskId: number, patch: Partial<Task>) {
	const patchTask = (task: Task) => (task.id === taskId ? {...task, ...patch} : task)
	const patchList = (list: Task[]) => list.map(patchTask)

	return {
		tasks: patchList(state.tasks),
		todayTasks: patchList(state.todayTasks),
		inboxTasks: patchList(state.inboxTasks),
		upcomingTasks: patchList(state.upcomingTasks),
		searchTasks: patchList(state.searchTasks),
		savedFilterTasks: patchList(state.savedFilterTasks),
		projectFilterTasks: patchList(state.projectFilterTasks),
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(state.projectPreviewTasksById).map(([projectId, tasks]) => [projectId, patchList(tasks)]),
		),
		projectBucketsByViewId: Object.fromEntries(
			Object.entries(state.projectBucketsByViewId).map(([viewId, buckets]) => [
				viewId,
				buckets.map(bucket => ({
					...bucket,
					tasks: patchList(bucket.tasks),
				})),
			]),
		),
		taskDetail:
			state.taskDetail?.id === taskId
				? cloneTaskDetailWithPatch(state.taskDetail, patch)
				: state.taskDetail,
	}
}

export function applyTaskLabelsOptimisticUpdate(state: AppStore, taskId: number, labels: Label[]) {
	const nextLabels = labels.map(label => ({...label}))
	return applyTaskPatchOptimisticUpdate(state, taskId, {labels: nextLabels})
}

export function applyTaskRelationRefsOptimisticUpdate(
	state: AppStore,
	taskId: number,
	relationKind: TaskRelationKind,
	refs: TaskRelationRef[],
) {
	const nextRefs = refs.map(ref => ({...ref}))
	const patchTask = (task: Task) =>
		task.id === taskId
			? {
				...task,
				related_tasks: {
					...cloneRelatedTasksMap(task.related_tasks),
					[relationKind]: nextRefs.map(ref => ({...ref})),
				},
			}
			: task
	const patchList = (list: Task[]) => list.map(patchTask)

	return {
		tasks: patchList(state.tasks),
		todayTasks: patchList(state.todayTasks),
		inboxTasks: patchList(state.inboxTasks),
		upcomingTasks: patchList(state.upcomingTasks),
		searchTasks: patchList(state.searchTasks),
		savedFilterTasks: patchList(state.savedFilterTasks),
		projectFilterTasks: patchList(state.projectFilterTasks),
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(state.projectPreviewTasksById).map(([projectId, tasks]) => [projectId, patchList(tasks)]),
		),
		projectBucketsByViewId: Object.fromEntries(
			Object.entries(state.projectBucketsByViewId).map(([viewId, buckets]) => [
				viewId,
				buckets.map(bucket => ({
					...bucket,
					tasks: patchList(bucket.tasks),
				})),
			]),
		),
		taskDetail:
			state.taskDetail?.id === taskId
				? cloneTaskDetailWithPatch(state.taskDetail, {
					related_tasks: {
						...cloneRelatedTasksMap(state.taskDetail.related_tasks),
						[relationKind]: nextRefs.map(ref => ({...ref})),
					},
				})
				: state.taskDetail,
	}
}

export function buildTaskRelationRef(task: Task): TaskRelationRef {
	return {
		id: task.id,
		title: task.title,
		project_id: task.project_id,
		done: task.done,
		position: task.position ?? null,
	}
}

export function insertOptimisticTask(
	state: AppStore,
	task: Task,
	options: {
		parentTaskId?: number | null
	} = {},
) {
	const nextTask = cloneTaskSnapshot(task)
	const addTask = (list: Task[]) =>
		[...list.filter(entry => entry.id !== nextTask.id), cloneTaskSnapshot(nextTask)].sort(compareByPositionThenId)
	const nextTasks = state.currentTasksProjectId === task.project_id ? addTask(state.tasks) : state.tasks.slice()
	const nextInboxTasks = state.inboxProjectId === task.project_id ? addTask(state.inboxTasks) : state.inboxTasks.slice()
	const nextProjectPreviewTasks: Record<number, Task[]> = Object.fromEntries(
		Object.entries(state.projectPreviewTasksById).map(([projectId, tasks]) => [Number(projectId), tasks.slice()]),
	)
	nextProjectPreviewTasks[task.project_id] = addTask(nextProjectPreviewTasks[task.project_id] || [])

	const nextState: Partial<AppStore> = {
		tasks: nextTasks,
		inboxTasks: nextInboxTasks,
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(nextProjectPreviewTasks).map(([projectId, tasks]) => [
				Number(projectId),
				tasks.map(cloneTaskSnapshot),
			]),
		),
	}

	const numericParentTaskId = Number(options.parentTaskId || 0) || null
	if (numericParentTaskId) {
		const parentTask = findTaskInAnyContext(numericParentTaskId, getTaskCollections(state))
		if (parentTask) {
			const currentSubtasks = [...(parentTask.related_tasks?.subtask || [])]
			nextState.taskDetail = state.taskDetail
			Object.assign(
				nextState,
				applyTaskRelationRefsOptimisticUpdate(
					{
						...state,
						...nextState,
					} as AppStore,
					numericParentTaskId,
					'subtask',
					[...currentSubtasks, buildTaskRelationRef(nextTask)],
				),
			)
		}
	}

	return nextState
}

function cloneTaskDetailWithPatch(taskDetail: Task, patch: Partial<Task>) {
	const nextTaskDetail = {
		...taskDetail,
		...patch,
	}

	return {
		...nextTaskDetail,
		comments: Array.isArray(nextTaskDetail.comments)
			? nextTaskDetail.comments.map(comment => ({
				...comment,
				author: comment?.author ? {...comment.author} : {id: 0, name: '', username: '', email: ''},
			}))
			: [],
		attachments: Array.isArray(nextTaskDetail.attachments)
			? nextTaskDetail.attachments.map(attachment => ({
				...attachment,
				created_by: attachment?.created_by ? {...attachment.created_by} : {id: 0, name: '', username: '', email: ''},
				file: attachment?.file ? {...attachment.file} : {id: 0, name: '', mime: '', size: 0},
			}))
			: [],
		assignees: Array.isArray(nextTaskDetail.assignees)
			? nextTaskDetail.assignees.map(assignee => ({...assignee}))
			: [],
		labels: Array.isArray(nextTaskDetail.labels) ? nextTaskDetail.labels.map(label => ({...label})) : [],
		related_tasks: cloneRelatedTasksMap(nextTaskDetail.related_tasks),
	}
}

export function applyBulkTaskOptimisticUpdate(
	state: AppStore,
	taskIds: number[],
	getPatch: (task: Task) => Partial<Task>,
) {
	const selectedTaskIds = new Set(taskIds)
	const patchTask = (task: Task) => (selectedTaskIds.has(task.id) ? {...task, ...getPatch(task)} : task)
	const patchList = (list: Task[]) => list.map(patchTask)

	return {
		tasks: patchList(state.tasks),
		todayTasks: patchList(state.todayTasks),
		inboxTasks: patchList(state.inboxTasks),
		upcomingTasks: patchList(state.upcomingTasks),
		searchTasks: patchList(state.searchTasks),
		savedFilterTasks: patchList(state.savedFilterTasks),
		projectFilterTasks: patchList(state.projectFilterTasks),
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(state.projectPreviewTasksById).map(([projectId, list]) => [projectId, patchList(list)]),
		),
		projectBucketsByViewId: Object.fromEntries(
			Object.entries(state.projectBucketsByViewId).map(([viewId, buckets]) => [
				viewId,
				buckets.map(bucket => ({
					...bucket,
					tasks: patchList(bucket.tasks),
				})),
			]),
		),
		taskDetail:
			state.taskDetail && selectedTaskIds.has(state.taskDetail.id)
				? cloneTaskDetailWithPatch(state.taskDetail, getPatch(state.taskDetail))
				: state.taskDetail,
	}
}

export function restoreBulkTaskSnapshots(state: AppStore, snapshots: Map<number, Task>) {
	const patchTask = (task: Task) => {
		const snapshot = snapshots.get(task.id)
		return snapshot ? cloneTaskSnapshot(snapshot) : task
	}
	const patchList = (list: Task[]) => list.map(patchTask)

	return {
		tasks: patchList(state.tasks),
		todayTasks: patchList(state.todayTasks),
		inboxTasks: patchList(state.inboxTasks),
		upcomingTasks: patchList(state.upcomingTasks),
		searchTasks: patchList(state.searchTasks),
		savedFilterTasks: patchList(state.savedFilterTasks),
		projectFilterTasks: patchList(state.projectFilterTasks),
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(state.projectPreviewTasksById).map(([projectId, list]) => [projectId, patchList(list)]),
		),
		projectBucketsByViewId: Object.fromEntries(
			Object.entries(state.projectBucketsByViewId).map(([viewId, buckets]) => [
				viewId,
				buckets.map(bucket => ({
					...bucket,
					tasks: patchList(bucket.tasks),
				})),
			]),
		),
		taskDetail:
			state.taskDetail && snapshots.has(state.taskDetail.id)
				? cloneTaskSnapshot(snapshots.get(state.taskDetail.id)!)
				: state.taskDetail,
	}
}

export function getTaskCollections(state: AppStore) {
	return {
		tasks: state.tasks,
		todayTasks: state.todayTasks,
		inboxTasks: state.inboxTasks,
		upcomingTasks: state.upcomingTasks,
		searchTasks: state.searchTasks,
		savedFilterTasks: state.savedFilterTasks,
		projectPreviewTasksById: state.projectPreviewTasksById,
	}
}

export function buildProjectTaskQuery(sortBy: string[], orderBy: string[], filter = '') {
	const params = new URLSearchParams()
	const normalizedFilter = `${filter || ''}`.trim()
	for (const value of sortBy) {
		if (value) {
			params.append('sort_by', value)
		}
	}
	for (const value of orderBy) {
		if (value) {
			params.append('order_by', value)
		}
	}
	if (normalizedFilter) {
		params.set('filter', normalizedFilter)
		params.set('filter_timezone', 'UTC')
	}
	params.append('expand', 'subtasks')
	params.append('expand', 'comment_count')
	const query = params.toString()
	return query ? `?${query}` : ''
}

export function mergeTaskListsWithStablePositions(
	primaryTasks: Task[],
	secondaryTasks: Task[],
	previousTasks: Task[] = [],
	pinnedTaskIds: ReadonlySet<number> = new Set(),
) {
	const previousPositionById = new Map(
		previousTasks
			.map(task => [task.id, Number(task.position || 0)] as const)
			.filter(([, position]) => position > 0),
	)
	let nextSyntheticPosition = Math.max(
		0,
		...primaryTasks.map(task => Number(task.position || 0)),
		...secondaryTasks.map(task => Number(task.position || 0)),
	)
	const mergedById = new Map<number, Task>()

	for (const task of [...primaryTasks, ...secondaryTasks]) {
		if (!task?.id || mergedById.has(task.id)) {
			continue
		}

		let position = Number(task.position || 0)
		const previousPosition = previousPositionById.get(task.id)
		if (previousPosition && (position <= 0 || pinnedTaskIds.has(task.id))) {
			position = previousPosition
		} else if (position <= 0) {
			nextSyntheticPosition += 1024
			position = nextSyntheticPosition
		}

		mergedById.set(task.id, {
			...task,
			position,
		})
	}

	return [...mergedById.values()].sort(compareByPositionThenId)
}

export function mergeTaskListsPreservingPrimaryOrder(
	primaryTasks: Task[],
	secondaryTasks: Task[],
) {
	const mergedTaskIds = new Set<number>()
	const mergedTasks: Task[] = []

	for (const task of [...primaryTasks, ...secondaryTasks]) {
		if (!task?.id || mergedTaskIds.has(task.id)) {
			continue
		}

		mergedTaskIds.add(task.id)
		mergedTasks.push(task)
	}

	return mergedTasks
}

export function getClonedTaskCollections(state: AppStore) {
	return {
		tasks: state.tasks.slice(),
		todayTasks: state.todayTasks.slice(),
		inboxTasks: state.inboxTasks.slice(),
		upcomingTasks: state.upcomingTasks.slice(),
		searchTasks: state.searchTasks.slice(),
		savedFilterTasks: state.savedFilterTasks.slice(),
		projectFilterTasks: state.projectFilterTasks.slice(),
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(state.projectPreviewTasksById).map(([projectId, tasks]) => [projectId, tasks.slice()]),
		),
	}
}

export function getSelectiveTaskCollectionUpdate(state: AppStore, mutationSet: TaskCollectionMutationSet) {
	const nextState: Partial<AppStore> = {}

	for (const key of mutationSet.topLevelKeys) {
		nextState[key] = state[key].slice()
	}

	if (mutationSet.previewProjectIds.size > 0) {
		nextState.projectPreviewTasksById = {...state.projectPreviewTasksById}
		for (const projectId of mutationSet.previewProjectIds) {
			nextState.projectPreviewTasksById[projectId] = (state.projectPreviewTasksById[projectId] || []).slice()
		}
	}

	if (mutationSet.nextBucketsByViewId) {
		nextState.projectBucketsByViewId = mutationSet.nextBucketsByViewId
		console.log('[getSelectiveTaskCollectionUpdate] bucket update included', {
			viewIds: Object.keys(mutationSet.nextBucketsByViewId),
			bucketSummary: Object.entries(mutationSet.nextBucketsByViewId).map(([vid, buckets]) => ({
				viewId: vid,
				buckets: (Array.isArray(buckets) ? buckets : []).map((b: {id: number; title: string; tasks: {id: number}[]}) => ({id: b.id, title: b.title, taskCount: b.tasks?.length})),
			})),
			sameRefAsState: mutationSet.nextBucketsByViewId === state.projectBucketsByViewId,
		})
	}

	if (mutationSet.taskDetailChanged && state.taskDetail) {
		nextState.taskDetail = {
			...state.taskDetail,
			comments: Array.isArray(state.taskDetail.comments)
				? state.taskDetail.comments.map(comment => ({
					...comment,
					author: comment?.author ? {...comment.author} : {id: 0, name: '', username: '', email: ''},
				}))
				: [],
			comment_count: Number(state.taskDetail.comment_count || 0),
			attachments: Array.isArray(state.taskDetail.attachments)
				? state.taskDetail.attachments.map(attachment => ({
					...attachment,
					created_by: attachment?.created_by ? {...attachment.created_by} : {id: 0, name: '', username: '', email: ''},
					file: attachment?.file ? {...attachment.file} : {id: 0, name: '', mime: '', size: 0},
				}))
				: [],
			assignees: Array.isArray(state.taskDetail.assignees)
				? state.taskDetail.assignees.map(assignee => ({...assignee}))
				: [],
			labels: Array.isArray(state.taskDetail.labels) ? [...state.taskDetail.labels] : [],
			related_tasks: cloneRelatedTasksMap(state.taskDetail.related_tasks),
		}
	}

	return nextState
}

export function buildBulkTaskMutationPayload(
	action: BulkTaskAction,
	options: {
		targetProjectId: number | null
		priority: number
	},
) {
	switch (action) {
		case 'complete':
			return {
				fields: ['done'],
				values: {done: true},
			}
		case 'reopen':
			return {
				fields: ['done'],
				values: {done: false},
			}
		case 'move-project':
			return {
				fields: ['project_id'],
				values: {project_id: Number(options.targetProjectId || 0)},
			}
		case 'set-priority':
			return {
				fields: ['priority'],
				values: {priority: Number(options.priority || 0)},
			}
		case 'favorite':
			return {
				fields: ['is_favorite'],
				values: {is_favorite: true},
			}
		case 'unfavorite':
			return {
				fields: ['is_favorite'],
				values: {is_favorite: false},
			}
		default:
			throw new Error('This bulk action is not supported by the bulk task endpoint.')
	}
}

export function buildBulkTaskOptimisticPatch(
	action: BulkTaskAction,
	task: Task,
	options: {
		targetProjectId: number | null
		priority: number
		doneAt: string | null
	},
) {
	switch (action) {
		case 'complete':
			return {
				done: true,
				done_at: options.doneAt,
			}
		case 'reopen':
			return {
				done: false,
				done_at: null,
			}
		case 'set-priority':
			return {
				priority: Number(options.priority || 0),
			}
		case 'favorite':
			return {
				is_favorite: true,
			}
		case 'unfavorite':
			return {
				is_favorite: false,
			}
		case 'move-project':
			return {
				project_id: Number(options.targetProjectId || task.project_id || 0),
			}
		default:
			return {}
	}
}

export function buildBulkTaskMutationNotice(action: BulkTaskAction, taskCount: number) {
	const countLabel = `${taskCount} task${taskCount === 1 ? '' : 's'}`
	switch (action) {
		case 'complete':
			return {
				title: taskCount === 1 ? 'Task completed' : 'Tasks completed',
				body: `${countLabel} marked completed`,
			}
		case 'reopen':
			return {
				title: taskCount === 1 ? 'Task reopened' : 'Tasks reopened',
				body: `${countLabel} marked active`,
			}
		case 'set-priority':
			return {
				title: 'Priority updated',
				body: `${countLabel} updated`,
			}
		case 'favorite':
			return {
				title: taskCount === 1 ? 'Task favorited' : 'Tasks favorited',
				body: `${countLabel} added to favorites`,
			}
		case 'unfavorite':
			return {
				title: taskCount === 1 ? 'Task updated' : 'Tasks updated',
				body: `${countLabel} removed from favorites`,
			}
		case 'delete':
			return {
				title: taskCount === 1 ? 'Task deleted' : 'Tasks deleted',
				body: `${countLabel} removed`,
			}
		case 'move-project':
			return {
				title: taskCount === 1 ? 'Task moved' : 'Tasks moved',
				body: `${countLabel} moved to another project`,
			}
	}
}

export function withTaskAttachments(task: Task | null | undefined, attachments: TaskAttachment[] | null | undefined) {
	if (!task) {
		return task
	}

	return {
		...task,
		attachments: normalizeTaskAttachments(attachments),
	}
}

export function cloneTaskSnapshot(task: Task): Task {
	return {
		...task,
		assignees: Array.isArray(task.assignees) ? task.assignees.map(assignee => ({...assignee})) : [],
		comments: Array.isArray(task.comments)
			? task.comments.map(comment => ({
				...comment,
				author: comment?.author ? {...comment.author} : {id: 0, name: '', username: '', email: ''},
			}))
			: [],
		labels: Array.isArray(task.labels) ? [...task.labels] : [],
		attachments: Array.isArray(task.attachments)
			? task.attachments.map(attachment => ({
				...attachment,
				created_by: attachment?.created_by ? {...attachment.created_by} : {id: 0, name: '', username: '', email: ''},
				file: attachment?.file ? {...attachment.file} : {id: 0, name: '', mime: '', size: 0},
			}))
			: [],
		related_tasks: cloneRelatedTasksMap(task.related_tasks),
	}
}

function cloneBucketSnapshot(bucket: Bucket): Bucket {
	return {
		...bucket,
		tasks: Array.isArray(bucket.tasks) ? bucket.tasks.map(cloneTaskSnapshot) : [],
	}
}

export function captureTaskDeletionSnapshot(state: AppStore): TaskDeletionSnapshot {
	return {
		tasks: state.tasks.map(cloneTaskSnapshot),
		todayTasks: state.todayTasks.map(cloneTaskSnapshot),
		inboxTasks: state.inboxTasks.map(cloneTaskSnapshot),
		upcomingTasks: state.upcomingTasks.map(cloneTaskSnapshot),
		searchTasks: state.searchTasks.map(cloneTaskSnapshot),
		savedFilterTasks: state.savedFilterTasks.map(cloneTaskSnapshot),
		projectFilterTasks: state.projectFilterTasks.map(cloneTaskSnapshot),
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(state.projectPreviewTasksById).map(([projectId, tasks]) => [projectId, tasks.map(cloneTaskSnapshot)]),
		),
		projectBucketsByViewId: Object.fromEntries(
			Object.entries(state.projectBucketsByViewId).map(([viewId, buckets]) => [viewId, buckets.map(cloneBucketSnapshot)]),
		),
		taskDetailOpen: state.taskDetailOpen,
		taskDetailLoading: state.taskDetailLoading,
		taskDetail: state.taskDetail ? cloneTaskSnapshot(state.taskDetail) : null,
		focusedTaskStack: state.focusedTaskStack.map(entry => ({...entry})),
		focusedTaskId: state.focusedTaskId,
		focusedTaskProjectId: state.focusedTaskProjectId,
		focusedTaskSourceScreen: state.focusedTaskSourceScreen,
		activeSubtaskParentId: state.activeSubtaskParentId,
		activeSubtaskSource: state.activeSubtaskSource,
		togglingTaskIds: new Set(state.togglingTaskIds),
		recentlyCompletedTaskIds: new Set(state.recentlyCompletedTaskIds),
	}
}

export function restoreTaskDeletionSnapshot(snapshot: TaskDeletionSnapshot): Partial<AppStore> {
	return {
		tasks: snapshot.tasks.map(cloneTaskSnapshot),
		todayTasks: snapshot.todayTasks.map(cloneTaskSnapshot),
		inboxTasks: snapshot.inboxTasks.map(cloneTaskSnapshot),
		upcomingTasks: snapshot.upcomingTasks.map(cloneTaskSnapshot),
		searchTasks: snapshot.searchTasks.map(cloneTaskSnapshot),
		savedFilterTasks: snapshot.savedFilterTasks.map(cloneTaskSnapshot),
		projectFilterTasks: snapshot.projectFilterTasks.map(cloneTaskSnapshot),
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(snapshot.projectPreviewTasksById).map(([projectId, tasks]) => [projectId, tasks.map(cloneTaskSnapshot)]),
		),
		projectBucketsByViewId: Object.fromEntries(
			Object.entries(snapshot.projectBucketsByViewId).map(([viewId, buckets]) => [viewId, buckets.map(cloneBucketSnapshot)]),
		),
		taskDetailOpen: snapshot.taskDetailOpen,
		taskDetailLoading: snapshot.taskDetailLoading,
		taskDetail: snapshot.taskDetail ? cloneTaskSnapshot(snapshot.taskDetail) : null,
		focusedTaskStack: snapshot.focusedTaskStack.map(entry => ({...entry})),
		focusedTaskId: snapshot.focusedTaskId,
		focusedTaskProjectId: snapshot.focusedTaskProjectId,
		focusedTaskSourceScreen: snapshot.focusedTaskSourceScreen,
		activeSubtaskParentId: snapshot.activeSubtaskParentId,
		activeSubtaskSource: snapshot.activeSubtaskSource,
		togglingTaskIds: new Set(snapshot.togglingTaskIds),
		recentlyCompletedTaskIds: new Set(snapshot.recentlyCompletedTaskIds),
	}
}

export function applyTaskDeletionOptimisticUpdate(state: AppStore, taskIds: number[]) {
	const deletedTaskIds = new Set(taskIds)
	const patchVisibleList = (taskList: Task[]) => {
		for (const taskId of taskIds) {
			removeTaskFromVisibleList(taskList, taskId)
			removeSubtaskRefFromVisibleList(taskList, taskId)
		}
	}

	for (const taskList of [
		state.tasks,
		state.todayTasks,
		state.inboxTasks,
		state.upcomingTasks,
		state.searchTasks,
		state.savedFilterTasks,
		state.projectFilterTasks,
	]) {
		patchVisibleList(taskList)
	}

	for (const taskList of Object.values(state.projectPreviewTasksById)) {
		patchVisibleList(taskList)
	}

	for (const buckets of Object.values(state.projectBucketsByViewId)) {
		for (const bucket of buckets) {
			patchVisibleList(bucket.tasks)
		}
	}

	const nextFocusedTaskStack = state.focusedTaskStack.filter(entry => !deletedTaskIds.has(entry.taskId))
	const nextFocusedEntry = nextFocusedTaskStack[nextFocusedTaskStack.length - 1] || null

	return {
		tasks: state.tasks.slice(),
		todayTasks: state.todayTasks.slice(),
		inboxTasks: state.inboxTasks.slice(),
		upcomingTasks: state.upcomingTasks.slice(),
		searchTasks: state.searchTasks.slice(),
		savedFilterTasks: state.savedFilterTasks.slice(),
		projectFilterTasks: state.projectFilterTasks.slice(),
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(state.projectPreviewTasksById).map(([projectId, tasks]) => [projectId, tasks.slice()]),
		),
		projectBucketsByViewId: Object.fromEntries(
			Object.entries(state.projectBucketsByViewId).map(([viewId, buckets]) => [
				viewId,
				buckets.map(bucket => ({
					...bucket,
					tasks: bucket.tasks.slice(),
				})),
			]),
		),
		taskDetailOpen:
			state.taskDetailOpen && state.taskDetail ? !deletedTaskIds.has(state.taskDetail.id) : state.taskDetailOpen,
		taskDetailLoading:
			state.taskDetailOpen && state.taskDetail
				? !deletedTaskIds.has(state.taskDetail.id) && state.taskDetailLoading
				: state.taskDetailLoading,
		taskDetail: state.taskDetail && deletedTaskIds.has(state.taskDetail.id) ? null : state.taskDetail,
		focusedTaskStack: nextFocusedTaskStack,
		focusedTaskId: nextFocusedEntry?.taskId || null,
		focusedTaskProjectId: nextFocusedEntry?.projectId || null,
		focusedTaskSourceScreen: nextFocusedEntry?.sourceScreen || null,
		activeSubtaskParentId:
			state.activeSubtaskParentId && deletedTaskIds.has(state.activeSubtaskParentId) ? null : state.activeSubtaskParentId,
		activeSubtaskSource:
			state.activeSubtaskParentId && deletedTaskIds.has(state.activeSubtaskParentId) ? null : state.activeSubtaskSource,
	}
}

export function clearCompletionAnimationTimer(taskId: number) {
	const timer = completionAnimationTimers.get(taskId)
	if (!timer) {
		return
	}
	clearTimeout(timer)
	completionAnimationTimers.delete(taskId)
}

function getTaskCollectionEntries(state: AppStore): AnyTaskCollectionEntry[] {
	return [
		{kind: 'topLevel', key: 'tasks', list: state.tasks},
		{kind: 'topLevel', key: 'todayTasks', list: state.todayTasks},
		{kind: 'topLevel', key: 'inboxTasks', list: state.inboxTasks},
		{kind: 'topLevel', key: 'upcomingTasks', list: state.upcomingTasks},
		{kind: 'topLevel', key: 'searchTasks', list: state.searchTasks},
		{kind: 'topLevel', key: 'savedFilterTasks', list: state.savedFilterTasks},
		{kind: 'topLevel', key: 'projectFilterTasks', list: state.projectFilterTasks},
		...Object.entries(state.projectPreviewTasksById).map(([projectId, list]) => ({
			kind: 'preview' as const,
			projectId: Number(projectId),
			list,
		})),
	]
}

function markTaskCollectionEntryChanged(mutationSet: TaskCollectionMutationSet, entry: AnyTaskCollectionEntry | null) {
	if (!entry) {
		return
	}

	if (entry.kind === 'topLevel') {
		mutationSet.topLevelKeys.add(entry.key)
		return
	}

	mutationSet.previewProjectIds.add(entry.projectId)
}

function findTaskCollectionEntryForList(entries: AnyTaskCollectionEntry[], list: Task[]) {
	return entries.find(entry => entry.list === list) || null
}

export function getCurrentComposeProjectId(state: AppStore) {
	if (state.taskDetailOpen && state.taskDetail) {
		return state.taskDetail.project_id
	}

	if (state.screen === 'tasks' && state.selectedProjectId) {
		return state.selectedProjectId
	}

	if (state.screen === 'inbox' && state.inboxProjectId) {
		return state.inboxProjectId
	}

	return state.selectedProjectId || state.composerProjectId || state.getDefaultComposeProjectId()
}

export function resolveQuickAddProjectId(state: AppStore, projectQuery: string | null) {
	if (!projectQuery) {
		return null
	}

	const normalizedQuery = projectQuery.trim().toLowerCase()
	if (!normalizedQuery) {
		return null
	}

	const exactPathMatch = state.projects.find(project => {
		const path = state.getProjectAncestors(project.id).map(entry => entry.title).join(' / ').toLowerCase()
		return path === normalizedQuery
	})
	if (exactPathMatch) {
		return exactPathMatch.id
	}

	const exactTitleMatch = state.projects.find(project => project.title.trim().toLowerCase() === normalizedQuery)
	if (exactTitleMatch) {
		return exactTitleMatch.id
	}

	const partialPathMatch = state.projects.find(project => {
		const path = state.getProjectAncestors(project.id).map(entry => entry.title).join(' / ').toLowerCase()
		return path.includes(normalizedQuery)
	})
	return partialPathMatch?.id || null
}

export async function applyQuickAddLabels(get: () => AppStore, projectId: number, taskId: number, labelNames: string[]) {
	if (labelNames.length === 0) {
		return
	}

	await get().ensureLabelsLoaded()
	let availableLabels = get().labels.slice()
	for (const rawLabelName of labelNames) {
		const labelName = rawLabelName.trim()
		if (!labelName) {
			continue
		}

		let label = availableLabels.find(entry => entry.title.trim().toLowerCase() === labelName.toLowerCase()) || null
		if (!label) {
			const created = await api<{label?: {id: number; title: string}} | {id: number; title: string}, {title: string}>(
				'/api/labels',
				{
					method: 'POST',
					body: {title: labelName},
				},
			)
			await get().loadLabels()
			availableLabels = get().labels.slice()
			if ('id' in created) {
				label = created
			} else {
				label = availableLabels.find(entry => entry.title.trim().toLowerCase() === labelName.toLowerCase()) || null
			}
		}

		if (!label?.id) {
			continue
		}

		await api(`/api/tasks/${taskId}/labels`, {
			method: 'POST',
			body: {labelId: label.id},
		})
	}
	if (get().taskDetail?.id === taskId) {
		await get().openTaskDetail(taskId)
	} else if (get().selectedProjectId === projectId) {
		await get().loadTasks(projectId)
	}
}

export async function applyQuickAddAssignees(projectId: number, taskId: number, assignees: string[]) {
	for (const rawAssignee of assignees) {
		const assignee = rawAssignee.trim().toLowerCase()
		if (!assignee) {
			continue
		}

		const result = await api<{users: TaskAssignee[]}>(`/api/projects/${projectId}/projectusers?s=${encodeURIComponent(assignee)}`)
		const match = (result.users || []).find(user => {
			return [user.username, user.name, user.email || '']
				.map(value => value.trim().toLowerCase())
				.includes(assignee)
		})
		if (!match?.id) {
			continue
		}

		await api(`/api/tasks/${taskId}/assignees`, {
			method: 'POST',
			body: {userId: match.id},
		})
	}
}

export function getCurrentComposeParentTaskId(state: AppStore) {
	if (state.taskDetailOpen && state.taskDetail) {
		return state.taskDetail.id
	}

	return null
}

export function shouldDefaultComposeToToday(state: AppStore, parentTaskId: number | null) {
	return !parentTaskId && state.screen === 'today'
}

export function getTodayDueDateIso() {
	const now = new Date()
	now.setHours(12, 0, 0, 0)
	return now.toISOString()
}

export function getTaskPositionSnapshot(taskList: Task[]) {
	return new Map((taskList || []).map(task => [task.id, Number(task?.position)]))
}

export function applyLocalSiblingReorder(
	state: AppStore,
	orderedSiblings: Task[],
	movedTaskId: number | null = null,
	movedTaskPosition: number | null = null,
) {
	if (!Array.isArray(orderedSiblings) || orderedSiblings.length === 0) {
		return
	}

	const localPositions = getLocalSiblingPositionsForOrder(orderedSiblings, movedTaskId, movedTaskPosition)
	for (let index = 0; index < orderedSiblings.length; index += 1) {
		const task = orderedSiblings[index]
		const position = localPositions[index]
		if (!task?.id || !Number.isFinite(position)) {
			continue
		}

		updateTaskPositionAcrossCollections(state, task.id, position)
	}
}

function applyLocalSiblingReorderInList(
	orderedSiblings: Task[],
	movedTaskId: number | null = null,
	movedTaskPosition: number | null = null,
) {
	if (!Array.isArray(orderedSiblings) || orderedSiblings.length === 0) {
		return
	}

	const localPositions = getLocalSiblingPositionsForOrder(orderedSiblings, movedTaskId, movedTaskPosition)
	for (let index = 0; index < orderedSiblings.length; index += 1) {
		const task = orderedSiblings[index]
		const position = localPositions[index]
		if (!task?.id || !Number.isFinite(position)) {
			continue
		}

		task.position = position
	}
}

export function applyTaskPositionSnapshot(state: AppStore, positionSnapshot: Map<number, number>) {
	if (!(positionSnapshot instanceof Map) || positionSnapshot.size === 0) {
		return
	}

	for (const [taskId, position] of positionSnapshot.entries()) {
		if (!Number.isFinite(position)) {
			continue
		}

		updateTaskPositionAcrossCollections(state, taskId, position)
	}
}

function getLocalSiblingPositionsForOrder(
	orderedSiblings: Task[],
	movedTaskId: number | null = null,
	movedTaskPosition: number | null = null,
) {
	const orderedTaskIds = orderedSiblings.map(task => task.id)
	const currentSiblingPositions = orderedSiblings
		.map(task => Number(task?.position))
		.filter(position => Number.isFinite(position))
		.sort((a, b) => a - b)

	const normalizedPositions: number[] = []
	let lastPosition = Number.NEGATIVE_INFINITY
	for (let index = 0; index < orderedSiblings.length; index += 1) {
		let nextPosition = currentSiblingPositions[index]
		if (!Number.isFinite(nextPosition)) {
			nextPosition = (index + 1) * 1024
		}
		if (nextPosition <= lastPosition) {
			nextPosition = lastPosition + 1024
		}
		normalizedPositions.push(nextPosition)
		lastPosition = nextPosition
	}

	if (!movedTaskId) {
		return normalizedPositions
	}

	const movedIndex = orderedTaskIds.findIndex(taskId => taskId === movedTaskId)
	if (movedIndex === -1) {
		return normalizedPositions
	}

	const persistedPosition = Number(movedTaskPosition)
	if (!Number.isFinite(persistedPosition)) {
		return normalizedPositions
	}

	normalizedPositions[movedIndex] = persistedPosition
	for (let index = movedIndex - 1; index >= 0; index -= 1) {
		if (normalizedPositions[index] < normalizedPositions[index + 1]) {
			continue
		}
		normalizedPositions[index] = normalizedPositions[index + 1] - 1024
	}
	for (let index = movedIndex + 1; index < normalizedPositions.length; index += 1) {
		if (normalizedPositions[index] > normalizedPositions[index - 1]) {
			continue
		}
		normalizedPositions[index] = normalizedPositions[index - 1] + 1024
	}

	return normalizedPositions
}

function updateTaskPositionAcrossCollections(state: AppStore, taskId: number, position: number) {
	for (const taskList of [
		state.tasks,
		state.todayTasks,
		state.inboxTasks,
		state.upcomingTasks,
		state.searchTasks,
		state.savedFilterTasks,
		state.projectFilterTasks,
	]) {
		for (const task of taskList) {
			if (task.id === taskId) {
				task.position = position
			}
		}
	}

	for (const taskList of Object.values(state.projectPreviewTasksById)) {
		for (const task of taskList) {
			if (task.id === taskId) {
				task.position = position
			}
		}
	}

	for (const bucketList of Object.values(state.projectBucketsByViewId)) {
		for (const bucket of bucketList || []) {
			for (const task of bucket.tasks || []) {
				if (task.id === taskId) {
					task.position = position
				}
			}
		}
	}
}

export function resolveTaskById(taskId: number | null, collections: ReturnType<typeof getTaskCollections>) {
	if (!taskId) {
		return null
	}

	return findTaskInAnyContext(taskId, collections)
}

export function resolveMovedTaskPosition({
	task,
	parentTask,
	beforeTask,
	afterTask,
	taskList,
}: {
	task: Task
	parentTask: Task | null
	beforeTask: Task | null
	afterTask: Task | null
	taskList: Task[]
}) {
	if (beforeTask || afterTask) {
		return calculateTaskPosition(beforeTask?.position ?? null, afterTask?.position ?? null)
	}

	if (!parentTask) {
		const rootTasks = taskList
			.filter(candidate => !candidate.related_tasks?.parenttask?.some(parentRef => parentRef.id))
			.filter(candidate => candidate.id !== task.id)
			.sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
		const lastRootTask = rootTasks[rootTasks.length - 1] || null
		return Number(lastRootTask?.position || task.position || 0) + 1024
	}

	const siblingTasks = taskList
		.filter(candidate => candidate.id !== task.id)
		.filter(candidate => candidate.related_tasks?.parenttask?.some(parentRef => parentRef.id === parentTask.id))
		.sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
	const lastSiblingTask = siblingTasks[siblingTasks.length - 1] || null
	return Number(lastSiblingTask?.position || task.position || 0) + 1024
}

export function applyOptimisticTaskMove(
	state: AppStore,
	{
		task,
		sourceTaskList,
		taskList,
		targetProjectId,
		parentTask,
		nextParentTaskId,
		beforeTaskId,
		afterTaskId,
		siblingIds,
		position,
		bucketId,
		viewId,
	}: {
		task: Task
		sourceTaskList: Task[]
		taskList: Task[] | null
		targetProjectId: number
		parentTask: Task | null
		nextParentTaskId: number | null
		beforeTaskId: number | null
		afterTaskId: number | null
		siblingIds: number[] | null
		position: number
		bucketId?: number | null
		viewId?: number | null
	},
) {
	if (bucketId !== undefined) {
		return applyOptimisticBucketTaskMove(state, {
			task,
			targetProjectId,
			parentTask,
			nextParentTaskId,
			beforeTaskId,
			afterTaskId,
			siblingIds,
			position,
			bucketId,
			viewId: viewId || null,
		})
	}

	const mutationSet = targetProjectId !== task.project_id
		? applyOptimisticVisibleTaskPlacement(state, {
			task,
			sourceTaskList,
			taskList,
			targetProjectId,
			parentTask,
			nextParentTaskId,
			beforeTaskId,
			afterTaskId,
			siblingIds,
			position,
		})
		: applyOptimisticTaskPlacement(state, {
			task,
			taskList: Array.isArray(taskList) ? taskList : sourceTaskList,
			targetProjectId,
			parentTask,
			nextParentTaskId,
			beforeTaskId,
			afterTaskId,
			siblingIds,
			position,
		})

	// Sync bucket data when parent relationship changes via non-bucket path
	// (e.g. list view moves). The bucket path handles its own updates above.
	if (!mutationSet.nextBucketsByViewId) {
		const hasBucketData = Object.keys(state.projectBucketsByViewId).length > 0
		if (hasBucketData) {
			if (nextParentTaskId) {
				// Becoming a subtask — remove from all buckets so the card
				// disappears from Kanban immediately.
				mutationSet.nextBucketsByViewId = Object.fromEntries(
					Object.entries(state.projectBucketsByViewId).map(([key, bucketList]) => {
						if (!Array.isArray(bucketList)) return [key, bucketList]
						const anyBucketHasTask = bucketList.some(b => b.tasks.some(t => t.id === task.id))
						if (!anyBucketHasTask) return [key, bucketList]
						return [key, bucketList.map(bucket => ({
							...bucket,
							tasks: bucket.tasks.filter(t => t.id !== task.id),
							count: bucket.tasks.filter(t => t.id !== task.id).length,
						}))]
					}),
				)
			} else {
				// Becoming a root task — add back to its bucket if it's not
				// already in any bucket (was previously removed when subtasked).
				const taskBucketId = Number(task.bucket_id ?? task.bucketId ?? 0) || null
				const alreadyInBucket = Object.values(state.projectBucketsByViewId).some(
					bucketList => Array.isArray(bucketList) && bucketList.some(b => b.tasks.some(t => t.id === task.id)),
				)
				console.log('[applyOptimisticTaskMove] re-root bucket sync', {
					taskId: task.id,
					taskBucketId,
					rawBucketId: task.bucket_id,
					rawBucketIdAlt: task.bucketId,
					alreadyInBucket,
					hasBucketData,
					viewIds: Object.keys(state.projectBucketsByViewId),
				})
				if (taskBucketId && !alreadyInBucket) {
					const rootedTask: Task = {
						...task,
						related_tasks: {
							...cloneRelatedTasksMap(task.related_tasks),
							parenttask: [],
						},
					}
					mutationSet.nextBucketsByViewId = Object.fromEntries(
						Object.entries(state.projectBucketsByViewId).map(([key, bucketList]) => {
							if (!Array.isArray(bucketList)) return [key, bucketList]
							const targetBucket = bucketList.find(b => b.id === taskBucketId) || null
							if (!targetBucket) return [key, bucketList]
							return [key, bucketList.map(bucket =>
								bucket.id === taskBucketId
									? {
										...bucket,
										tasks: [...bucket.tasks, rootedTask],
										count: bucket.tasks.length + 1,
									}
									: bucket,
							)]
						}),
					)
				}
			}
		}
	}

	return mutationSet
}

function applyOptimisticTaskPlacement(
	state: AppStore,
	{
		task,
		taskList,
		targetProjectId,
		parentTask,
		nextParentTaskId,
		beforeTaskId,
		afterTaskId,
		siblingIds,
		position,
	}: {
		task: Task
		taskList: Task[]
		targetProjectId: number
		parentTask: Task | null
		nextParentTaskId: number | null
		beforeTaskId: number | null
		afterTaskId: number | null
		siblingIds: number[] | null
		position: number
	},
) {
	const mutationSet: TaskCollectionMutationSet = {
		topLevelKeys: new Set(),
		previewProjectIds: new Set(),
		taskDetailChanged: false,
		nextBucketsByViewId: null,
	}
	const collectionEntries = getTaskCollectionEntries(state)

	const optimisticTask: Task = {
		...task,
		project_id: targetProjectId,
		position,
		labels: Array.isArray(task.labels) ? [...task.labels] : [],
		related_tasks: {
			...cloneRelatedTasksMap(task.related_tasks),
			parenttask: nextParentTaskId && parentTask ? [createTaskRelationRef(parentTask)] : [],
		},
	}

	for (const entry of collectionEntries) {
		const {list} = entry
		let listChanged = false
		const taskIndex = list.findIndex(candidate => candidate.id === task.id)
		if (taskIndex !== -1) {
			list.splice(taskIndex, 1)
			listChanged = true
		}

		for (const candidate of list) {
			if (candidate.related_tasks?.subtask) {
				const nextSubtasks = candidate.related_tasks.subtask.filter(ref => ref.id !== task.id)
				if (nextSubtasks.length !== candidate.related_tasks.subtask.length) {
					candidate.related_tasks.subtask = nextSubtasks
					listChanged = true
				}
			}

			if (nextParentTaskId && candidate.id === nextParentTaskId) {
				if (!candidate.related_tasks) {
					candidate.related_tasks = {parenttask: [], subtask: []}
					listChanged = true
				}
				if (!candidate.related_tasks.subtask) {
					candidate.related_tasks.subtask = []
					listChanged = true
				}
				if (!candidate.related_tasks.subtask.some(ref => ref.id === task.id)) {
					candidate.related_tasks.subtask.push(createTaskRelationRef(optimisticTask))
					listChanged = true
				}
			}
		}

		if (listChanged) {
			markTaskCollectionEntryChanged(mutationSet, entry)
		}
	}

	const insertionIndex = resolveTaskInsertionIndex(taskList, beforeTaskId, afterTaskId)
	taskList.splice(insertionIndex, 0, optimisticTask)
	markTaskCollectionEntryChanged(mutationSet, findTaskCollectionEntryForList(collectionEntries, taskList))

	const orderedSiblingTasks = getOrderedSiblingTasksForPlacement(taskList, nextParentTaskId, siblingIds)
	applyLocalSiblingReorderInList(orderedSiblingTasks, task.id, position)

	if (state.taskDetailOpen && state.taskDetail?.id === task.id) {
		state.taskDetail = optimisticTask
		mutationSet.taskDetailChanged = true
	}

	return mutationSet
}

function applyOptimisticVisibleTaskPlacement(
	state: AppStore,
	{
		task,
		sourceTaskList,
		taskList,
		targetProjectId,
		parentTask,
		nextParentTaskId,
		beforeTaskId,
		afterTaskId,
		siblingIds,
		position,
	}: {
		task: Task
		sourceTaskList: Task[]
		taskList: Task[] | null
		targetProjectId: number
		parentTask: Task | null
		nextParentTaskId: number | null
		beforeTaskId: number | null
		afterTaskId: number | null
		siblingIds: number[] | null
		position: number
	},
) {
	const mutationSet: TaskCollectionMutationSet = {
		topLevelKeys: new Set(),
		previewProjectIds: new Set(),
		taskDetailChanged: false,
		nextBucketsByViewId: null,
	}
	const collectionEntries = getTaskCollectionEntries(state)
	const sourceEntry = findTaskCollectionEntryForList(collectionEntries, sourceTaskList)
	const targetEntry = Array.isArray(taskList) ? findTaskCollectionEntryForList(collectionEntries, taskList) : null
	const currentParentId = task.related_tasks?.parenttask?.[0]?.id || null
	const optimisticTask: Task = {
		...task,
		project_id: targetProjectId,
		position,
		labels: Array.isArray(task.labels) ? [...task.labels] : [],
		related_tasks: {
			...cloneRelatedTasksMap(task.related_tasks),
			parenttask: nextParentTaskId && parentTask ? [createTaskRelationRef(parentTask)] : [],
		},
	}

	removeTaskFromVisibleList(sourceTaskList, task.id)
	removeSubtaskRefFromVisibleList(sourceTaskList, task.id)
	if (currentParentId) {
		removeSubtaskRefFromTask(sourceTaskList, currentParentId, task.id)
	}
	markTaskCollectionEntryChanged(mutationSet, sourceEntry)

	if (Array.isArray(taskList) && taskList !== sourceTaskList) {
		removeTaskFromVisibleList(taskList, task.id)
		removeSubtaskRefFromVisibleList(taskList, task.id)
	}
	if (Array.isArray(taskList) && nextParentTaskId) {
		ensureVisibleParentSubtaskRef(taskList, nextParentTaskId, optimisticTask)
	}

	if (Array.isArray(taskList)) {
		const insertionIndex = resolveTaskInsertionIndex(taskList, beforeTaskId, afterTaskId)
		taskList.splice(insertionIndex, 0, optimisticTask)
		markTaskCollectionEntryChanged(mutationSet, targetEntry)

		const orderedSiblingTasks = getOrderedSiblingTasksForPlacement(taskList, nextParentTaskId, siblingIds)
		applyLocalSiblingReorderInList(orderedSiblingTasks, task.id, position)
	}

	if (state.taskDetailOpen && state.taskDetail?.id === task.id) {
		state.taskDetail = optimisticTask
		mutationSet.taskDetailChanged = true
	}

	return mutationSet
}

function applyOptimisticBucketTaskMove(
	state: AppStore,
	{
		task,
		targetProjectId,
		parentTask,
		nextParentTaskId,
		beforeTaskId,
		afterTaskId,
		siblingIds,
		position,
		bucketId,
		viewId,
	}: {
		task: Task
		targetProjectId: number
		parentTask: Task | null
		nextParentTaskId: number | null
		beforeTaskId: number | null
		afterTaskId: number | null
		siblingIds: number[] | null
		position: number
		bucketId: number | null
		viewId: number | null
	},
) {
	const mutationSet: TaskCollectionMutationSet = {
		topLevelKeys: new Set(),
		previewProjectIds: new Set(),
		taskDetailChanged: false,
		nextBucketsByViewId: null,
	}
	const collectionEntries = getTaskCollectionEntries(state)
	const nextBucketId = Number(bucketId || 0) || null
	const optimisticTask: Task = {
		...task,
		project_id: targetProjectId,
		position,
		bucket_id: nextBucketId,
		bucketId: nextBucketId,
		labels: Array.isArray(task.labels) ? [...task.labels] : [],
		related_tasks: {
			...cloneRelatedTasksMap(task.related_tasks),
			parenttask: nextParentTaskId && parentTask ? [createTaskRelationRef(parentTask)] : [],
		},
	}

	for (const entry of collectionEntries) {
		let listChanged = false
		for (let index = 0; index < entry.list.length; index += 1) {
			const candidate = entry.list[index]
			if (candidate.id !== task.id) {
				continue
			}
			entry.list[index] = {
				...candidate,
				project_id: targetProjectId,
				position,
				bucket_id: nextBucketId,
				bucketId: nextBucketId,
				related_tasks: optimisticTask.related_tasks,
			}
			listChanged = true
		}

		if (listChanged) {
			markTaskCollectionEntryChanged(mutationSet, entry)
		}
	}

	if (viewId) {
		mutationSet.nextBucketsByViewId = Object.fromEntries(
			Object.entries(state.projectBucketsByViewId).map(([key, bucketList]) => {
				if (!Array.isArray(bucketList)) {
					return [key, bucketList]
				}
				const updatedBuckets = bucketList.map(bucket => ({
					...bucket,
					tasks: bucket.tasks.filter(entry => entry.id !== task.id),
				}))
				for (const bucket of updatedBuckets) {
					if (bucket.count != null) {
						bucket.count = bucket.tasks.length
					}
				}

				if (Number(key) === viewId && nextBucketId) {
					const targetBucket = updatedBuckets.find(bucket => bucket.id === nextBucketId) || null
					if (targetBucket) {
						if (siblingIds && siblingIds.length > 0) {
							// Reorder using the authoritative sibling order from SortableJS
							const taskMap = new Map<number, Task>()
							for (const t of targetBucket.tasks) {
								taskMap.set(t.id, t)
							}
							taskMap.set(optimisticTask.id, optimisticTask)
							const reordered: Task[] = []
							for (const id of siblingIds) {
								const found = taskMap.get(id)
								if (found) {
									reordered.push(found)
								}
							}
							// Append any tasks not in siblingIds (edge case)
							for (const t of targetBucket.tasks) {
								if (!siblingIds.includes(t.id) && t.id !== optimisticTask.id) {
									reordered.push(t)
								}
							}
							targetBucket.tasks = reordered
						} else {
							const insertIndex = resolveTaskInsertionIndex(targetBucket.tasks, beforeTaskId, afterTaskId)
							targetBucket.tasks.splice(insertIndex, 0, optimisticTask)
						}
						if (targetBucket.count != null) {
							targetBucket.count = targetBucket.tasks.length
						}
						for (let index = 0; index < targetBucket.tasks.length; index += 1) {
							targetBucket.tasks[index] = {
								...targetBucket.tasks[index],
								position: (index + 1) * 1024,
							}
						}
					}
				}

				return [key, updatedBuckets]
			}),
		)
	}

	if (state.taskDetailOpen && state.taskDetail?.id === task.id) {
		state.taskDetail = optimisticTask
		mutationSet.taskDetailChanged = true
	}

	return mutationSet
}

function resolveTaskInsertionIndex(taskList: Task[], beforeTaskId: number | null, afterTaskId: number | null) {
	if (afterTaskId) {
		const afterIndex = taskList.findIndex(candidate => candidate.id === afterTaskId)
		if (afterIndex !== -1) {
			return afterIndex
		}
	}

	if (beforeTaskId) {
		const beforeIndex = taskList.findIndex(candidate => candidate.id === beforeTaskId)
		if (beforeIndex !== -1) {
			return beforeIndex + 1
		}
	}

	return taskList.length
}

function getOrderedSiblingTasksForPlacement(taskList: Task[], parentTaskId: number | null, siblingIds: number[] | null) {
	const siblingTasks = taskList.filter(candidate => {
		const candidateParentId = candidate.related_tasks?.parenttask?.[0]?.id || null
		return candidateParentId === parentTaskId
	})

	if (!Array.isArray(siblingIds) || siblingIds.length === 0) {
		return siblingTasks.sort(compareByPositionThenId)
	}

	const siblingTaskMap = new Map(siblingTasks.map(task => [task.id, task]))
	const orderedSiblingTasks = siblingIds
		.map(taskId => siblingTaskMap.get(taskId))
		.filter((task): task is Task => Boolean(task))

	if (orderedSiblingTasks.length === siblingTasks.length) {
		return orderedSiblingTasks
	}

	return siblingTasks.sort(compareByPositionThenId)
}

function removeTaskFromVisibleList(taskList: Task[], taskId: number) {
	const taskIndex = taskList.findIndex(candidate => candidate.id === taskId)
	if (taskIndex !== -1) {
		taskList.splice(taskIndex, 1)
	}
}

function removeSubtaskRefFromVisibleList(taskList: Task[], taskId: number) {
	for (const candidate of taskList) {
		if (!candidate.related_tasks?.subtask) {
			continue
		}

		candidate.related_tasks.subtask = candidate.related_tasks.subtask.filter(ref => ref.id !== taskId)
	}
}

function removeSubtaskRefFromTask(taskList: Task[], parentTaskId: number, taskId: number) {
	const parentTask = taskList.find(candidate => candidate.id === parentTaskId)
	if (!parentTask?.related_tasks?.subtask) {
		return
	}

	parentTask.related_tasks.subtask = parentTask.related_tasks.subtask.filter(ref => ref.id !== taskId)
}

function ensureVisibleParentSubtaskRef(taskList: Task[], parentTaskId: number, task: Task) {
	const parentTask = taskList.find(candidate => candidate.id === parentTaskId)
	if (!parentTask) {
		return
	}

	if (!parentTask.related_tasks) {
		parentTask.related_tasks = {parenttask: [], subtask: []}
	}
	if (!parentTask.related_tasks.subtask) {
		parentTask.related_tasks.subtask = []
	}

	if (!parentTask.related_tasks.subtask.some(ref => ref.id === task.id)) {
		parentTask.related_tasks.subtask.push(createTaskRelationRef(task))
	}
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

export function isTaskDescendant(taskId: number, candidateParentId: number, taskList: Task[]) {
	const taskMap = new Map(taskList.map(task => [task.id, task]))
	const stack = [taskId]
	const visited = new Set<number>()

	while (stack.length > 0) {
		const currentId = stack.pop()
		if (!currentId || visited.has(currentId)) {
			continue
		}

		visited.add(currentId)
		const currentTask = taskMap.get(currentId)
		if (!currentTask) {
			continue
		}

		for (const childRef of currentTask.related_tasks?.subtask || []) {
			if (childRef.id === candidateParentId) {
				return true
			}
			stack.push(childRef.id)
		}

		for (const candidate of taskList) {
			if (candidate.related_tasks?.parenttask?.some(parentRef => parentRef.id === currentId)) {
				if (candidate.id === candidateParentId) {
					return true
				}
				stack.push(candidate.id)
			}
		}
	}

	return false
}

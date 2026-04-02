import {api, type ApiError} from '@/api'
import type {TaskRelationKind} from '@/types'
import {
	getAllMutations,
	markFailed,
	markSucceeded,
	markSyncing,
	remapTempId,
	type OfflineMutationEntry,
} from './offline-queue'

export interface ConflictEntry {
	mutationId: string
	description: string
	error: string
	statusCode: number | null
}

export interface SyncResult {
	succeeded: number
	failed: number
	conflicts: ConflictEntry[]
}

const MAX_RETRIES = 3

interface TaskMoveReplayPayload {
	_moveIntent?: boolean
	taskId: number
	targetProjectId: number
	currentProjectId: number
	nextParentTaskId: number | null
	currentParentTaskId: number | null
	bucketId?: number | null
	viewId?: number | null
	position?: number | null
}

export async function replayOfflineQueue(): Promise<SyncResult> {
	const result: SyncResult = {
		succeeded: 0,
		failed: 0,
		conflicts: [],
	}
	const mutations = await getAllMutations()
	const pending = mutations.filter(entry => entry.status === 'pending' || entry.status === 'failed')

	for (const entry of pending) {
		if (entry.retries >= MAX_RETRIES) {
			result.conflicts.push({
				mutationId: entry.id,
				description: entry.metadata.description,
				error: entry.lastError || 'Max retries exceeded',
				statusCode: null,
			})
			result.failed += 1
			continue
		}

		await markSyncing(entry.id)

		try {
			if (entry.type === 'task-move' && isTaskMoveReplayPayload(entry.body)) {
				await replayTaskMove(entry)
			} else {
				const response = await api<Record<string, unknown>, Record<string, unknown> | null>(
					entry.endpoint,
					{
						method: entry.method,
						body: isRecordBody(entry.body) ? entry.body : null,
					},
				)

				if (entry.type.endsWith('-create') && entry.metadata.entityId && entry.metadata.entityId < 0) {
					const realId = extractIdFromResponse(response, entry.metadata.entityType)
					if (realId) {
						await remapTempId(entry.metadata.entityId, realId)
					}
				}
			}

			await markSucceeded(entry.id)
			result.succeeded += 1
		} catch (error) {
			const apiError = error as ApiError
			const statusCode = apiError.statusCode ?? null
			const message = apiError.message || 'Unknown error'

			await markFailed(entry.id, message)

			if (statusCode && statusCode >= 400 && statusCode < 500) {
				result.conflicts.push({
					mutationId: entry.id,
					description: entry.metadata.description,
					error: message,
					statusCode,
				})
			}

			result.failed += 1
		}
	}

	return result
}

function extractIdFromResponse(
	response: Record<string, unknown>,
	entityType: string,
): number | null {
	const directId = response.id
	if (typeof directId === 'number' && directId > 0) {
		return directId
	}

	const nested = response[entityType]
	if (nested && typeof nested === 'object' && 'id' in nested) {
		const nestedId = (nested as {id?: unknown}).id
		if (typeof nestedId === 'number' && nestedId > 0) {
			return nestedId
		}
	}

	return null
}

function isRecordBody(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isTaskMoveReplayPayload(value: unknown): value is TaskMoveReplayPayload {
	return isRecordBody(value) && value._moveIntent === true
}

async function replayTaskMove(entry: OfflineMutationEntry): Promise<void> {
	const intent = entry.body as TaskMoveReplayPayload

	if (intent.targetProjectId !== intent.currentProjectId) {
		await api(`/api/tasks/${intent.taskId}`, {
			method: 'POST',
			body: {
				project_id: intent.targetProjectId,
			},
		})
	}

	if (intent.currentParentTaskId !== intent.nextParentTaskId) {
		if (intent.currentParentTaskId) {
			try {
				await api(`/api/tasks/${intent.currentParentTaskId}/relations/subtask/${intent.taskId}`, {
					method: 'DELETE',
				})
			} catch {
				// Ignore stale relation deletes during replay.
			}
		}

		if (intent.nextParentTaskId) {
			await api(`/api/tasks/${intent.nextParentTaskId}/relations`, {
				method: 'PUT',
				body: {
					other_task_id: intent.taskId,
					relation_kind: 'subtask' satisfies TaskRelationKind,
				},
			})
		}
	}

	if (intent.bucketId && intent.viewId) {
		await api(`/api/projects/${intent.targetProjectId}/views/${intent.viewId}/buckets/${intent.bucketId}/tasks`, {
			method: 'POST',
			body: {
				task_id: intent.taskId,
				bucket_id: intent.bucketId,
				project_view_id: intent.viewId,
				project_id: intent.targetProjectId,
			},
		})
	}

	if (intent.viewId && Number.isFinite(intent.position)) {
		await api(`/api/tasks/${intent.taskId}/position`, {
			method: 'POST',
			body: {
				project_view_id: intent.viewId,
				position: intent.position,
			},
		})
	}
}

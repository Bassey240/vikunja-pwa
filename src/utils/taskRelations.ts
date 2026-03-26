import type {TaskRelationKind, TaskRelationRef} from '@/types'

export const TASK_RELATION_KINDS: readonly TaskRelationKind[] = [
	'subtask',
	'parenttask',
	'related',
	'duplicateof',
	'duplicates',
	'blocking',
	'blocked',
	'precedes',
	'follows',
	'copiedfrom',
	'copiedto',
]

export const TASK_RELATION_LABELS: Record<TaskRelationKind, string> = {
	subtask: 'Subtasks',
	parenttask: 'Parent tasks',
	related: 'Related tasks',
	duplicateof: 'Duplicate of',
	duplicates: 'Duplicates',
	blocking: 'Blocking',
	blocked: 'Blocked by',
	precedes: 'Precedes',
	follows: 'Follows',
	copiedfrom: 'Copied from',
	copiedto: 'Copied to',
}

export function cloneRelatedTasksMap(
	relatedTasks: Partial<Record<TaskRelationKind, TaskRelationRef[]>> | null | undefined,
): Partial<Record<TaskRelationKind, TaskRelationRef[]>> {
	const nextMap: Partial<Record<TaskRelationKind, TaskRelationRef[]>> = {}

	for (const relationKind of TASK_RELATION_KINDS) {
		const entries = relatedTasks?.[relationKind]
		if (!Array.isArray(entries) || entries.length === 0) {
			continue
		}

		nextMap[relationKind] = entries.map(entry => ({...entry}))
	}

	return nextMap
}

export function getRelatedTasksByKind(
	relatedTasks: Partial<Record<TaskRelationKind, TaskRelationRef[]>> | null | undefined,
	relationKind: TaskRelationKind,
) {
	return relatedTasks?.[relationKind] || []
}

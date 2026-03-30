import type {Task} from '@/types'

export interface TaskMoveIntent {
	taskId: number
	beforeTaskId?: number | null
	afterTaskId?: number | null
	siblingIds?: number[] | null
	parentTaskId?: number | null
	targetProjectId?: number | null
	viewId?: number | null
	bucketId?: number | null
	taskList?: Task[] | null
	traceToken?: string | null
}

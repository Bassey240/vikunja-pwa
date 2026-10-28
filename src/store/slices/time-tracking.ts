import {api} from '@/api'
import type {Account, TimeEntry} from '@/types'
import {formatError} from '@/utils/formatting'
import {PRO_FEATURE_TIME_TRACKING, hasEnabledProFeature} from '@/utils/instance-features'
import {buildRunningTimerFilter, sortTimeEntriesForDisplay} from '@/utils/time-tracking'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {blockOfflineReadOnlyAction} from '../offline-readonly'
import {clearLoadError, setLoadError} from './load-error'

interface TimeEntryInput {
	startTime?: string
	endTime?: string | null
	comment?: string
}

export interface TimeTrackingSlice {
	timeEntriesByTask: Record<number, TimeEntry[]>
	timeEntriesLoadingTaskId: number | null
	runningTimeEntry: TimeEntry | null
	timeTrackingMutating: boolean
	loadTaskTimeEntries: (taskId: number, options?: {silent?: boolean}) => Promise<void>
	loadRunningTimeEntry: (options?: {silent?: boolean}) => Promise<void>
	startTaskTimer: (taskId: number) => Promise<boolean>
	stopRunningTimer: () => Promise<boolean>
	createTaskTimeEntry: (taskId: number, input: TimeEntryInput) => Promise<boolean>
	updateTimeEntry: (entryId: number, input: TimeEntryInput) => Promise<boolean>
	deleteTimeEntry: (entryId: number) => Promise<boolean>
	resetTimeTrackingState: () => void
}

/* Time tracking is a licensed v2-only feature, and Vikunja excludes link shares
 * from it entirely, so all three conditions gate every entry point. */
export function isTimeTrackingAvailable(state: {account: Account | null}) {
	const features = state.account?.instanceFeatures
	if (!features || features.apiV2Available !== true || state.account?.linkShareAuth) {
		return false
	}

	return hasEnabledProFeature(features.enabledProFeatures, PRO_FEATURE_TIME_TRACKING)
}

function buildInitialState() {
	return {
		timeEntriesByTask: {} as Record<number, TimeEntry[]>,
		timeEntriesLoadingTaskId: null as number | null,
		runningTimeEntry: null as TimeEntry | null,
		timeTrackingMutating: false,
	}
}

export const createTimeTrackingSlice: StateCreator<AppStore, [], [], TimeTrackingSlice> = (set, get) => ({
	...buildInitialState(),

	async loadTaskTimeEntries(taskId, options = {}) {
		const silent = options.silent === true
		if (!isTimeTrackingAvailable(get()) || !(taskId > 0)) {
			return
		}

		if (!silent) {
			set({timeEntriesLoadingTaskId: taskId})
		}

		try {
			const response = await api<{timeEntries: TimeEntry[]}>(`/api/tasks/${taskId}/time-entries`)
			const timeEntries = sortTimeEntriesForDisplay(response.timeEntries || [])
			set(state => ({
				timeEntriesByTask: {...state.timeEntriesByTask, [taskId]: timeEntries},
			}))
			clearLoadError(set, get, 'timeEntries')
		} catch (error) {
			setLoadError(set, 'timeEntries', formatError(error as Error), silent)
		} finally {
			if (!silent) {
				set(state => ({
					timeEntriesLoadingTaskId: state.timeEntriesLoadingTaskId === taskId ? null : state.timeEntriesLoadingTaskId,
				}))
			}
		}
	},

	async loadRunningTimeEntry(options = {}) {
		const silent = options.silent === true
		const userId = Number(get().account?.user?.id || 0)
		if (!isTimeTrackingAvailable(get()) || !(userId > 0)) {
			return
		}

		try {
			const params = new URLSearchParams({filter: buildRunningTimerFilter(userId)})
			const response = await api<{timeEntries: TimeEntry[]}>(`/api/time-entries?${params.toString()}`)
			const entries = sortTimeEntriesForDisplay(response.timeEntries || [])
			set({runningTimeEntry: entries[0] || null})
			clearLoadError(set, get, 'runningTimer')
		} catch (error) {
			setLoadError(set, 'runningTimer', formatError(error as Error), silent)
		}
	},

	async startTaskTimer(taskId) {
		return runTimeEntryMutation(set, get, async () => {
			const previousTaskId = Number(get().runningTimeEntry?.task_id || 0)
			await api<{timeEntry: TimeEntry}>('/api/time-entries', {
				method: 'POST',
				body: {taskId, endTime: null},
			})
			return [taskId, previousTaskId]
		})
	},

	async stopRunningTimer() {
		return runTimeEntryMutation(set, get, async () => {
			const runningTaskId = Number(get().runningTimeEntry?.task_id || 0)
			await api<{timeEntry: TimeEntry}>('/api/time-entries/timer/stop', {method: 'POST'})
			return [runningTaskId]
		})
	},

	async createTaskTimeEntry(taskId, input) {
		return runTimeEntryMutation(set, get, async () => {
			const previousTaskId = Number(get().runningTimeEntry?.task_id || 0)
			await api<{timeEntry: TimeEntry}>('/api/time-entries', {
				method: 'POST',
				body: {taskId, ...buildTimeEntryBody(input)},
			})
			return [taskId, previousTaskId]
		})
	},

	async updateTimeEntry(entryId, input) {
		return runTimeEntryMutation(set, get, async () => {
			const affectedTaskId = findCachedTimeEntryTaskId(get(), entryId)
			await api<{timeEntry: TimeEntry}>(`/api/time-entries/${entryId}`, {
				method: 'PUT',
				body: buildTimeEntryBody(input),
			})
			return [affectedTaskId]
		})
	},

	async deleteTimeEntry(entryId) {
		return runTimeEntryMutation(set, get, async () => {
			const affectedTaskId = findCachedTimeEntryTaskId(get(), entryId)
			await api<{ok: boolean}>(`/api/time-entries/${entryId}`, {method: 'DELETE'})
			return [affectedTaskId]
		})
	},

	resetTimeTrackingState() {
		set(buildInitialState())
	},
})

type MutationSet = (partial: Partial<AppStore>) => void

/* Every mutation can move the single running timer, and starting one silently
 * ends another task's, so the affected task lists are re-read from the server
 * rather than patched locally. */
async function runTimeEntryMutation(
	set: MutationSet,
	get: () => AppStore,
	mutate: () => Promise<Array<number>>,
) {
	if (!isTimeTrackingAvailable(get())) {
		return false
	}

	if (blockOfflineReadOnlyAction(get, set, 'track time')) {
		return false
	}

	set({timeTrackingMutating: true})
	try {
		const affectedTaskIds = await mutate()
		await get().loadRunningTimeEntry()
		const reloadable = [...new Set(affectedTaskIds.filter(taskId => taskId > 0))]
		for (const taskId of reloadable) {
			await get().loadTaskTimeEntries(taskId, {silent: true})
		}
		return true
	} catch (error) {
		set({error: formatError(error as Error)})
		return false
	} finally {
		set({timeTrackingMutating: false})
	}
}

function buildTimeEntryBody(input: TimeEntryInput) {
	return {
		...(input.startTime ? {startTime: input.startTime} : {}),
		// null is what marks the entry as the running timer, so it is sent as-is.
		endTime: input.endTime ?? null,
		comment: `${input.comment || ''}`,
	}
}

function findCachedTimeEntryTaskId(state: AppStore, entryId: number) {
	for (const [taskId, entries] of Object.entries(state.timeEntriesByTask)) {
		if (entries.some(entry => entry.id === entryId)) {
			return Number(taskId)
		}
	}

	return 0
}

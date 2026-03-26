import {storageKeys} from '@/storageKeys'
import type {
	Account,
	AppNotification,
	Bucket,
	Project,
	ProjectView,
	SavedFilter,
	ServerConfig,
	Task,
} from '@/types'
import {loadJson, saveJson} from '@/utils/storage'

const OFFLINE_SNAPSHOT_VERSION = 1

export interface OfflineSnapshot {
	version: number
	savedAt: string | null
	serverConfig: ServerConfig | null
	account: Account | null
	defaultProjectId: number | null
	projects: Project[]
	savedFilters: SavedFilter[]
	selectedProjectId: number | null
	selectedSavedFilterProjectId: number | null
	inboxProjectId: number | null
	currentTasksProjectId: number | null
	currentProjectViewId: number | null
	currentInboxViewId: number | null
	currentSavedFilterViewId: number | null
	tasks: Task[]
	tasksByProjectId: Record<string, Task[]>
	projectPreviewTasksById: Record<string, Task[]>
	todayTasks: Task[]
	inboxTasks: Task[]
	upcomingTasks: Task[]
	savedFilterTasks: Task[]
	projectFilterTasks: Task[]
	projectFilterTasksLoaded: boolean
	projectViewsById: Record<string, ProjectView[]>
	projectBucketsByViewId: Record<string, Bucket[]>
	notifications: AppNotification[]
}

const emptyOfflineSnapshot: OfflineSnapshot = {
	version: OFFLINE_SNAPSHOT_VERSION,
	savedAt: null,
	serverConfig: null,
	account: null,
	defaultProjectId: null,
	projects: [],
	savedFilters: [],
	selectedProjectId: null,
	selectedSavedFilterProjectId: null,
	inboxProjectId: null,
	currentTasksProjectId: null,
	currentProjectViewId: null,
	currentInboxViewId: null,
	currentSavedFilterViewId: null,
	tasks: [],
	tasksByProjectId: {},
	projectPreviewTasksById: {},
	todayTasks: [],
	inboxTasks: [],
	upcomingTasks: [],
	savedFilterTasks: [],
	projectFilterTasks: [],
	projectFilterTasksLoaded: false,
	projectViewsById: {},
	projectBucketsByViewId: {},
	notifications: [],
}

export function loadOfflineSnapshot() {
	const snapshot = loadJson<OfflineSnapshot | null>(storageKeys.offlineSnapshot, null)
	if (!snapshot || snapshot.version !== OFFLINE_SNAPSHOT_VERSION) {
		return null
	}

	return {
		...emptyOfflineSnapshot,
		...snapshot,
		projects: Array.isArray(snapshot.projects) ? snapshot.projects : [],
		savedFilters: Array.isArray(snapshot.savedFilters) ? snapshot.savedFilters : [],
		tasks: Array.isArray(snapshot.tasks) ? snapshot.tasks : [],
		tasksByProjectId:
			snapshot.tasksByProjectId && typeof snapshot.tasksByProjectId === 'object'
				? Object.fromEntries(
					Object.entries(snapshot.tasksByProjectId).map(([projectId, tasks]) => [
						projectId,
						Array.isArray(tasks) ? tasks : [],
					]),
				)
				: {},
		projectPreviewTasksById:
			snapshot.projectPreviewTasksById && typeof snapshot.projectPreviewTasksById === 'object'
				? Object.fromEntries(
					Object.entries(snapshot.projectPreviewTasksById).map(([projectId, tasks]) => [
						projectId,
						Array.isArray(tasks) ? tasks : [],
					]),
				)
				: {},
		todayTasks: Array.isArray(snapshot.todayTasks) ? snapshot.todayTasks : [],
		inboxTasks: Array.isArray(snapshot.inboxTasks) ? snapshot.inboxTasks : [],
		upcomingTasks: Array.isArray(snapshot.upcomingTasks) ? snapshot.upcomingTasks : [],
		savedFilterTasks: Array.isArray(snapshot.savedFilterTasks) ? snapshot.savedFilterTasks : [],
		projectFilterTasks: Array.isArray(snapshot.projectFilterTasks) ? snapshot.projectFilterTasks : [],
		projectFilterTasksLoaded: Boolean(snapshot.projectFilterTasksLoaded),
		projectViewsById:
			snapshot.projectViewsById && typeof snapshot.projectViewsById === 'object'
				? Object.fromEntries(
					Object.entries(snapshot.projectViewsById).map(([projectId, views]) => [
						projectId,
						Array.isArray(views) ? views : [],
					]),
				)
				: {},
		projectBucketsByViewId:
			snapshot.projectBucketsByViewId && typeof snapshot.projectBucketsByViewId === 'object'
				? Object.fromEntries(
					Object.entries(snapshot.projectBucketsByViewId).map(([viewId, buckets]) => [
						viewId,
						Array.isArray(buckets) ? buckets : [],
					]),
				)
				: {},
		notifications: Array.isArray(snapshot.notifications) ? snapshot.notifications : [],
	}
}

export function mergeOfflineSnapshot(patch: Partial<OfflineSnapshot>) {
	const current = loadOfflineSnapshot() || emptyOfflineSnapshot
	saveJson(storageKeys.offlineSnapshot, {
		...current,
		...patch,
		version: OFFLINE_SNAPSHOT_VERSION,
		savedAt: new Date().toISOString(),
	})
}

export function clearOfflineSnapshot() {
	saveJson(storageKeys.offlineSnapshot, null)
}

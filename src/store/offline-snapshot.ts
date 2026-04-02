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
import {idbDelete, idbGet, idbPut} from './offline-db'

const OFFLINE_SNAPSHOT_VERSION = 1
const SNAPSHOT_KEY = 'current'
const SNAPSHOT_STORE = 'snapshot'
const LEGACY_STORAGE_KEY = storageKeys.offlineSnapshot

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

function buildEmptySnapshot(): OfflineSnapshot {
	return {
		...emptyOfflineSnapshot,
		projects: [],
		savedFilters: [],
		tasks: [],
		tasksByProjectId: {},
		projectPreviewTasksById: {},
		todayTasks: [],
		inboxTasks: [],
		upcomingTasks: [],
		savedFilterTasks: [],
		projectFilterTasks: [],
		projectViewsById: {},
		projectBucketsByViewId: {},
		notifications: [],
	}
}

function validateSnapshot(snapshot: OfflineSnapshot | null | undefined): OfflineSnapshot | null {
	if (!snapshot || snapshot.version !== OFFLINE_SNAPSHOT_VERSION) {
		return null
	}

	return {
		...buildEmptySnapshot(),
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

export async function loadOfflineSnapshot(): Promise<OfflineSnapshot | null> {
	try {
		const idbSnapshot = await idbGet<{key: string; data: OfflineSnapshot}>(SNAPSHOT_STORE, SNAPSHOT_KEY)
		if (idbSnapshot?.data) {
			return validateSnapshot(idbSnapshot.data)
		}
	} catch {
		// IndexedDB unavailable, fall through to localStorage.
	}

	if (typeof localStorage === 'undefined') {
		return null
	}

	try {
		const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
		if (!raw) {
			return null
		}

		const parsed = JSON.parse(raw) as OfflineSnapshot
		const validated = validateSnapshot(parsed)
		if (validated) {
			try {
				await idbPut(SNAPSHOT_STORE, {key: SNAPSHOT_KEY, data: validated})
				localStorage.removeItem(LEGACY_STORAGE_KEY)
			} catch {
				// Keep the legacy snapshot when IDB migration fails.
			}
		}
		return validated
	} catch {
		return null
	}
}

export async function mergeOfflineSnapshot(patch: Partial<OfflineSnapshot>): Promise<void> {
	const current = await loadOfflineSnapshot()
	const merged: OfflineSnapshot = {
		...(current || buildEmptySnapshot()),
		...patch,
		version: OFFLINE_SNAPSHOT_VERSION,
		savedAt: new Date().toISOString(),
	}

	try {
		await idbPut(SNAPSHOT_STORE, {key: SNAPSHOT_KEY, data: merged})
	} catch {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(merged))
		}
	}
}

export async function clearOfflineSnapshot(): Promise<void> {
	try {
		await idbDelete(SNAPSHOT_STORE, SNAPSHOT_KEY)
	} catch {
		// Ignore IndexedDB clear failures and still clear legacy storage.
	}

	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(LEGACY_STORAGE_KEY)
	}
}

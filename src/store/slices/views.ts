import {api, type ApiError} from '@/api'
import type {Bucket, ProjectView, Task} from '@/types'
import {formatError} from '@/utils/formatting'
import {parseQuickAddMagic} from '@/utils/quickAddMagic'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {persistOfflineBrowseSnapshot} from '../offline-browse-cache'
import {blockOfflineReadOnlyAction} from '../offline-readonly'
import {
	loadPersistedPreferredProjectViewKind,
	persistPreferredProjectViewKind,
} from '../view-selections'
import {normalizeTaskGraph} from '../selectors'

export interface ViewsSlice {
	projectViewsById: Record<number, ProjectView[]>
	preferredProjectViewKind: string | null
	projectBucketsByViewId: Record<number, Bucket[]>
	loadingProjectBuckets: Record<number, boolean>
	currentProjectViewId: number | null
	currentInboxViewId: number | null
	currentSavedFilterViewId: number | null
	loadProjectViews: (projectId: number, options?: {force?: boolean}) => Promise<ProjectView[]>
	loadProjectBuckets: (projectId: number, viewId: number, options?: {force?: boolean}) => Promise<Bucket[]>
	createBucket: (projectId: number, viewId: number, title: string) => Promise<Bucket | null>
	updateBucket: (projectId: number, viewId: number, bucketId: number, patch: Partial<Bucket>) => Promise<Bucket | null>
	deleteBucket: (projectId: number, viewId: number, bucketId: number) => Promise<boolean>
	updateProjectViewConfig: (
		projectId: number,
		viewId: number,
		patch: Partial<Pick<ProjectView, 'default_bucket_id' | 'done_bucket_id' | 'defaultBucketId' | 'doneBucketId'>>,
	) => Promise<ProjectView | null>
	createTaskInBucket: (projectId: number, viewId: number, bucketId: number, title: string) => Promise<boolean>
	resolveProjectTaskViewId: (projectId: number) => Promise<number | null>
	ensureCurrentProjectTaskViewId: () => Promise<number | null>
	selectProjectView: (
		projectId: number,
		viewId: number | null,
		context?: 'project' | 'inbox' | 'savedFilter',
		options?: {persistPreference?: boolean},
	) => Promise<void>
	savePreferredProjectViewKind: () => void
	resetViewsState: () => void
}

export const createViewsSlice: StateCreator<AppStore, [], [], ViewsSlice> = (set, get) => ({
	projectViewsById: {},
	preferredProjectViewKind: loadPersistedPreferredProjectViewKind(),
	projectBucketsByViewId: {},
	loadingProjectBuckets: {},
	currentProjectViewId: null,
	currentInboxViewId: null,
	currentSavedFilterViewId: null,

	async loadProjectViews(projectId, {force = false} = {}) {
		if (!projectId) {
			return []
		}

		const existingViews = get().projectViewsById[projectId]
		if (!force && Array.isArray(existingViews)) {
			return existingViews
		}

		if (!get().isOnline && get().offlineReadOnlyMode) {
			return existingViews || []
		}

		try {
			const payload = await api<ProjectView[] | {views?: ProjectView[]}>(`/api/projects/${projectId}/views`)
			const views = (Array.isArray(payload)
				? payload
				: Array.isArray(payload.views)
					? payload.views
					: [])
				.map(normalizeProjectView)
			set(state => ({
				projectViewsById: {
					...state.projectViewsById,
					[projectId]: views,
				},
			}))
			persistOfflineBrowseSnapshot(get())
			return views
		} catch (error) {
			if (isMissingRouteError(error)) {
				set(state => ({
					projectViewsById: {
						...state.projectViewsById,
						[projectId]: [],
					},
				}))
				persistOfflineBrowseSnapshot(get())
				return []
			}

			set({error: formatError(error as Error)})
			return []
		}
	},

	async loadProjectBuckets(projectId, viewId, {force = false} = {}) {
		if (!projectId || !viewId) {
			return []
		}

		const existingBuckets = get().projectBucketsByViewId[viewId]
		if (!force && Array.isArray(existingBuckets) && existingBuckets.length > 0) {
			return existingBuckets
		}

		if (!get().isOnline && get().offlineReadOnlyMode) {
			return existingBuckets || []
		}

		set(state => ({
			loadingProjectBuckets: {
				...state.loadingProjectBuckets,
				[viewId]: true,
			},
		}))

		try {
			const payload = await api<Bucket[] | {buckets?: Bucket[]}>(`/api/projects/${projectId}/views/${viewId}/buckets`)
			const normalizedBuckets = normalizeBuckets(
				Array.isArray(payload)
					? payload
					: Array.isArray(payload.buckets)
						? payload.buckets
						: [],
			)
			const projectViews = get().projectViewsById[projectId] || await get().loadProjectViews(projectId)
			const currentView = projectViews.find(view => view.id === viewId) || null
			const projectTasks = await loadTasksForProjectView(projectId, viewId)
			const buckets = reconcileBucketsWithTasks(normalizedBuckets, projectTasks as Task[], currentView)
			set(state => ({
				projectBucketsByViewId: {
					...state.projectBucketsByViewId,
					[viewId]: buckets,
				},
				loadingProjectBuckets: {
					...state.loadingProjectBuckets,
					[viewId]: false,
				},
			}))
			persistOfflineBrowseSnapshot(get())
			return buckets
		} catch (error) {
			set(state => ({
				error: formatError(error as Error),
				loadingProjectBuckets: {
					...state.loadingProjectBuckets,
					[viewId]: false,
				},
			}))
			return []
		}
	},

	async createBucket(projectId, viewId, title) {
		const trimmedTitle = `${title || ''}`.trim()
		if (!projectId || !viewId || !trimmedTitle) {
			return null
		}

		if (blockOfflineReadOnlyAction(get, set, 'create buckets')) {
			return null
		}

		try {
			const payload = await api<Bucket | {bucket?: Bucket}, {title: string}>(`/api/projects/${projectId}/views/${viewId}/buckets`, {
				method: 'POST',
				body: {
					title: trimmedTitle,
				},
			})
			const rawBucket = 'bucket' in payload && payload.bucket ? payload.bucket : payload
			const bucket = normalizeBuckets([{...rawBucket, tasks: []}])[0] || null
			if (!bucket) {
				return null
			}

			set(state => ({
				projectBucketsByViewId: {
					...state.projectBucketsByViewId,
					[viewId]: sortBuckets([
						...(state.projectBucketsByViewId[viewId] || []),
						bucket,
					]),
				},
			}))
			persistOfflineBrowseSnapshot(get())
			return bucket
		} catch (error) {
			set({error: formatError(error as Error)})
			return null
		}
	},

	async updateBucket(projectId, viewId, bucketId, patch) {
		if (!projectId || !viewId || !bucketId) {
			return null
		}

		if (blockOfflineReadOnlyAction(get, set, 'edit buckets')) {
			return null
		}

		try {
			const payload = await api<Bucket | {bucket?: Bucket}, Partial<Bucket>>(`/api/projects/${projectId}/views/${viewId}/buckets/${bucketId}`, {
				method: 'POST',
				body: patch,
			})
			const rawBucket = 'bucket' in payload && payload.bucket ? payload.bucket : payload
			const bucket = normalizeBuckets([rawBucket])[0] || null
			if (!bucket) {
				return null
			}

			set(state => ({
				projectBucketsByViewId: {
					...state.projectBucketsByViewId,
					[viewId]: sortBuckets((state.projectBucketsByViewId[viewId] || []).map(entry => (entry.id === bucketId ? {...bucket, tasks: bucket.tasks.length > 0 ? bucket.tasks : entry.tasks} : entry))),
				},
			}))
			persistOfflineBrowseSnapshot(get())
			return bucket
		} catch (error) {
			set({error: formatError(error as Error)})
			return null
		}
	},

	async deleteBucket(projectId, viewId, bucketId) {
		if (!projectId || !viewId || !bucketId) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'delete buckets')) {
			return false
		}

		try {
			await api(`/api/projects/${projectId}/views/${viewId}/buckets/${bucketId}`, {
				method: 'DELETE',
			})
			set(state => ({
				projectBucketsByViewId: {
					...state.projectBucketsByViewId,
					[viewId]: (state.projectBucketsByViewId[viewId] || []).filter(bucket => bucket.id !== bucketId),
				},
			}))
			persistOfflineBrowseSnapshot(get())

			const currentView = get().projectViewsById[projectId]?.find(view => view.id === viewId) || null
			const patch: Partial<ProjectView> = {}
			if (currentView?.defaultBucketId === bucketId || currentView?.default_bucket_id === bucketId) {
				patch.defaultBucketId = 0
				patch.default_bucket_id = 0
			}
			if (currentView?.doneBucketId === bucketId || currentView?.done_bucket_id === bucketId) {
				patch.doneBucketId = 0
				patch.done_bucket_id = 0
			}
			if (Object.keys(patch).length > 0) {
				void get().updateProjectViewConfig(projectId, viewId, patch)
			}
			await get().loadProjectBuckets(projectId, viewId, {force: true})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async updateProjectViewConfig(projectId, viewId, patch) {
		if (!projectId || !viewId) {
			return null
		}

		if (blockOfflineReadOnlyAction(get, set, 'update project views')) {
			return null
		}

		try {
			const existingViews = get().projectViewsById[projectId] || await get().loadProjectViews(projectId)
			const currentView = existingViews.find(view => view.id === viewId) || null
			if (!currentView) {
				return null
			}

			const mergedView = normalizeProjectView({
				...currentView,
				...patch,
			})
			const requestBody = {
				title: mergedView.title,
				project_id: projectId,
				view_kind: mergedView.view_kind,
				filter: mergedView.filter ?? null,
				position: Number(mergedView.position || 0),
				bucket_configuration_mode: mergedView.bucket_configuration_mode || 'manual',
				bucket_configuration: Array.isArray(mergedView.bucket_configuration) ? mergedView.bucket_configuration : [],
				default_bucket_id: Number(mergedView.defaultBucketId ?? mergedView.default_bucket_id ?? 0) || 0,
				done_bucket_id: Number(mergedView.doneBucketId ?? mergedView.done_bucket_id ?? 0) || 0,
			}

			const payload = await api<ProjectView | {view?: ProjectView}, typeof requestBody>(`/api/projects/${projectId}/views/${viewId}`, {
				method: 'POST',
				body: requestBody,
			})
			const view = normalizeProjectView('view' in payload && payload.view ? payload.view : payload)
			set(state => ({
				projectViewsById: {
					...state.projectViewsById,
					[projectId]: (state.projectViewsById[projectId] || []).map(entry => (entry.id === viewId ? view : entry)),
				},
			}))
			persistOfflineBrowseSnapshot(get())
			await get().loadProjectBuckets(projectId, viewId, {force: true})
			return view
		} catch (error) {
			set({error: formatError(error as Error)})
			return null
		}
	},

	async createTaskInBucket(projectId, viewId, bucketId, title) {
		const trimmedTitle = `${title || ''}`.trim()
		if (!projectId || !viewId || !bucketId || !trimmedTitle) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'create tasks')) {
			return false
		}

		const parsed = parseQuickAddMagic(trimmedTitle)
		const finalTitle = parsed.title.trim()
		const dueDate = parsed.date ? parsed.date.toISOString() : null
		if (!finalTitle) {
			return false
		}

		try {
			await api<
				{task: Task},
				{
					title: string
					bucketId: number
					projectViewId: number
					due_date: string | null
					priority: number | null
					repeat_after: number | null
					repeat_from_current_date: boolean
				}
			>(`/api/projects/${projectId}/tasks`, {
				method: 'POST',
				body: {
					title: finalTitle,
					bucketId,
					projectViewId: viewId,
					due_date: dueDate,
					priority: parsed.priority,
					repeat_after: parsed.repeatAfter,
					repeat_from_current_date: false,
				},
			})
			await get().refreshCurrentCollections()
			await get().loadProjectBuckets(projectId, viewId, {force: true})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async resolveProjectTaskViewId(projectId) {
		const views = await get().loadProjectViews(projectId)
		if (views.length === 0) {
			return null
		}

		const currentViewId =
			(projectId === Number(get().selectedProjectId || 0)
				? Number(get().currentProjectViewId || 0)
				: projectId === Number(get().inboxProjectId || 0)
					? Number(get().currentInboxViewId || 0)
					: projectId === Number(get().selectedSavedFilterProjectId || 0)
						? Number(get().currentSavedFilterViewId || 0)
						: 0) || 0
		if (currentViewId && views.some(view => view.id === currentViewId)) {
			return currentViewId
		}

		const preferredViewKind = get().preferredProjectViewKind
		const preferredView = preferredViewKind
			? views.find(view => view.view_kind === preferredViewKind)
			: null
		if (preferredView) {
			return preferredView.id
		}

		const firstListView = views.find(view => view.view_kind === 'list')
		return firstListView?.id || views[0]?.id || null
	},

	async ensureCurrentProjectTaskViewId() {
		if (get().currentProjectViewId) {
			return get().currentProjectViewId
		}

		if (!get().selectedProjectId || get().screen !== 'tasks') {
			return null
		}

		try {
			const selectedProjectId = get().selectedProjectId
			if (!selectedProjectId) {
				return null
			}

			const currentProjectViewId = await get().resolveProjectTaskViewId(selectedProjectId)
			set({currentProjectViewId})
			return currentProjectViewId
		} catch (error) {
			set({error: formatError(error as Error)})
			return null
		}
	},

	async selectProjectView(projectId, viewId, context = 'project', {persistPreference = true} = {}) {
		if (!projectId) {
			return
		}

		const selectedView = viewId
			? (get().projectViewsById[projectId] || []).find(view => view.id === viewId) || null
			: null

		if (persistPreference && selectedView?.view_kind) {
			set({preferredProjectViewKind: selectedView.view_kind})
			get().savePreferredProjectViewKind()
		}

		if (context === 'inbox' && projectId === get().inboxProjectId) {
			set({currentInboxViewId: viewId})
			persistOfflineBrowseSnapshot(get())
			await get().loadInboxTasks()
			return
		}

		if (context === 'savedFilter' && projectId === get().selectedSavedFilterProjectId) {
			set({currentSavedFilterViewId: viewId})
			persistOfflineBrowseSnapshot(get())
			await get().loadSavedFilterTasks(projectId)
			return
		}

		if (projectId === get().selectedProjectId) {
			set({currentProjectViewId: viewId})
			persistOfflineBrowseSnapshot(get())
			await get().loadTasks(projectId)
			if (!get().isOnline && get().offlineReadOnlyMode) {
				return
			}
		}
	},

	savePreferredProjectViewKind() {
		persistPreferredProjectViewKind(get().preferredProjectViewKind)
	},

	resetViewsState() {
		set({
			projectViewsById: {},
			preferredProjectViewKind: loadPersistedPreferredProjectViewKind(),
			projectBucketsByViewId: {},
			loadingProjectBuckets: {},
			currentProjectViewId: null,
			currentInboxViewId: null,
			currentSavedFilterViewId: null,
		})
	},
})

function normalizeBuckets(bucketList: Bucket[]) {
	return sortBuckets(
		bucketList.map(bucket => ({
			...bucket,
			tasks: sortTasksByPosition(normalizeTaskGraph(Array.isArray(bucket.tasks) ? bucket.tasks : [])),
		})),
	)
}

function normalizeProjectView(view: ProjectView) {
	return {
		...view,
		defaultBucketId: Number(view.defaultBucketId ?? view.default_bucket_id ?? 0) || 0,
		doneBucketId: Number(view.doneBucketId ?? view.done_bucket_id ?? 0) || 0,
		default_bucket_id: Number(view.default_bucket_id ?? view.defaultBucketId ?? 0) || 0,
		done_bucket_id: Number(view.done_bucket_id ?? view.doneBucketId ?? 0) || 0,
	}
}

function isMissingRouteError(error: unknown) {
	const apiError = error as ApiError | null | undefined
	if (apiError?.statusCode === 404) {
		return true
	}

	const message = formatError(apiError).toLowerCase()
	return message.includes('route not found') || message.includes('not found')
}

async function loadTasksForProjectView(
	projectId: number,
	_viewId: number,
) {
	const query = new URLSearchParams()
	query.append('expand', 'subtasks')
	query.append('expand', 'comment_count')
	query.append('sort_by', 'id')
	query.append('order_by', 'asc')
	return api<Task[]>(`/api/projects/${projectId}/tasks?${query.toString()}`)
}

function reconcileBucketsWithTasks(
	buckets: Bucket[],
	taskList: Task[],
	view: ProjectView | null,
) {
	if (buckets.length === 0) {
		return []
	}

	const nextBuckets = sortBuckets(
		buckets.map(bucket => ({
			...bucket,
			tasks: [],
			count: 0,
		})),
	)
	const bucketMap = new Map(nextBuckets.map(bucket => [bucket.id, bucket]))
	const defaultBucketId = resolveDefaultBucketId(nextBuckets, view)
	const doneBucketId = resolveDoneBucketId(view)

	for (const task of sortTasksByPosition(normalizeTaskGraph(taskList))) {
		let targetBucketId = Number(task.bucket_id ?? task.bucketId ?? 0) || 0

		if (doneBucketId && task.done) {
			targetBucketId = doneBucketId
		} else if (!targetBucketId || !bucketMap.has(targetBucketId) || (doneBucketId && targetBucketId === doneBucketId && !task.done)) {
			targetBucketId = defaultBucketId
		}

		if (!targetBucketId || !bucketMap.has(targetBucketId)) {
			continue
		}

		const bucket = bucketMap.get(targetBucketId)
		if (!bucket) {
			continue
		}

		bucket.tasks.push({
			...task,
			bucket_id: targetBucketId,
			bucketId: targetBucketId,
		})
	}

	for (const bucket of nextBuckets) {
		bucket.tasks = sortTasksByPosition(bucket.tasks)
		bucket.count = bucket.tasks.length
	}

	return nextBuckets
}

function resolveDefaultBucketId(buckets: Bucket[], view: ProjectView | null) {
	const configuredDefaultBucketId = Number(view?.defaultBucketId ?? view?.default_bucket_id ?? 0) || 0
	if (configuredDefaultBucketId && buckets.some(bucket => bucket.id === configuredDefaultBucketId)) {
		return configuredDefaultBucketId
	}

	return buckets[0]?.id || 0
}

function resolveDoneBucketId(view: ProjectView | null) {
	return Number(view?.doneBucketId ?? view?.done_bucket_id ?? 0) || 0
}

function sortBuckets(bucketList: Bucket[]) {
	return bucketList
		.slice()
		.sort((left, right) => Number(left.position || 0) - Number(right.position || 0) || left.id - right.id)
}

function sortTasksByPosition(taskList: Task[]) {
	return taskList
		.slice()
		.sort((left, right) => Number(left.position || 0) - Number(right.position || 0) || left.id - right.id)
}

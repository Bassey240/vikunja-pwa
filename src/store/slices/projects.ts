import {api, uploadApi} from '@/api'
import {
	defaultProjectFilters,
	normalizeProjectFilters,
	setProjectFilterField as updateProjectFilterField,
	type ProjectFilterField,
	type ProjectFilters,
} from '@/hooks/useFilters'
import {storageKeys} from '@/storageKeys'
import type {BackgroundImage, MenuAnchor, Project, SavedFilter, Task} from '@/types'
import {getBlobFromBlurHash} from '@/utils/blurhash'
import {markProjectDropTrace} from '@/utils/dragPerf'
import {formatError} from '@/utils/formatting'
import {getProjectBackgroundBlurHash, getProjectBackgroundInformation, projectHasBackground} from '@/utils/project-background'
import {loadJson, loadNumber, saveJson, saveNumber} from '@/utils/storage'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {enqueueMutation, getNextTempId} from '../offline-queue'
import {
	getOfflineCachedProjectTasks,
	persistOfflineBrowseSnapshot,
	resolveOfflineProjectViewId,
} from '../offline-browse-cache'
import {blockNonQueueableOfflineAction, blockOfflineReadOnlyAction, isOfflineReadOnly, shouldQueueOffline} from '../offline-readonly'
import {loadOfflineSnapshot, mergeOfflineSnapshot} from '../offline-snapshot'
import {
	compareByPositionThenId,
	findDefaultProjectId,
	getAvailableParentProjects,
	getDefaultComposeProjectId,
	getProjectAncestors,
	getSavedFilterProjectId,
	resolveInboxProjectId,
} from '../project-helpers'
import {buildTaskStatusFilter, getTaskSortQuery, isManualTaskSort, normalizeTaskGraph} from '../selectors'
import {mergeTaskListsWithStablePositions} from '../task-helpers'

export interface ProjectsSlice {
	projects: Project[]
	savedFilters: SavedFilter[]
	loadingProjects: boolean
	selectedProjectId: number | null
	inboxProjectId: number | null
	composerProjectId: number | null
	selectedSavedFilterProjectId: number | null
	projectDetailOpen: boolean
	projectDetailLoading: boolean
	projectDetail: Project | null
	projectComposerOpen: boolean
	projectComposerParentId: number | null
	projectComposerPlacement: 'sheet' | 'center' | 'sidebar'
	projectSubmitting: boolean
	projectFilters: ProjectFilters
	projectFilterDraft: ProjectFilters
	projectPreviewTasksById: Record<number, Task[]>
	expandedProjectIds: Set<number>
	loadingProjectPreviewIds: Set<number>
	projectBackgroundUrls: Record<number, string | null>
	projectBackgroundPreviewUrls: Record<number, string | null>
	uploadingProjectBackground: Record<number, boolean>
	unsplashSearchResults: BackgroundImage[]
	unsplashSearchLoading: boolean
	loadProjects: (options?: {silent?: boolean}) => Promise<void>
	findDefaultProjectId: () => number | null
	getDefaultComposeProjectId: () => number | null
	resolveInboxProjectId: () => number | null
	getProjectAncestors: (projectId: number) => Project[]
	getAvailableParentProjects: (projectId: number) => Project[]
	setProjectFilterField: (field: ProjectFilterField, value: string) => void
	syncProjectFilterDraftFromActive: () => void
	applyProjectFilterDraft: () => Promise<void>
	resetProjectFilterDraft: () => void
	toggleProjectExpanded: (projectId: number) => Promise<void>
	expandAllProjects: () => Promise<void>
	collapseAllProjects: () => void
	toggleProjectMenu: (projectId: number, anchor: MenuAnchor) => void
	openProjectDetail: (projectId: number) => Promise<void>
	closeProjectDetail: () => void
	openProjectComposer: (
		parentProjectId?: number | null,
		options?: {placement?: 'sheet' | 'center' | 'sidebar'},
	) => void
	closeProjectComposer: () => void
	submitProject: (title: string) => Promise<boolean>
	navigateToProject: (projectId: number) => Promise<void>
	loadProjectPreview: (projectId: number, options?: {silent?: boolean}) => Promise<void>
	refreshExpandedProjectPreviews: (options?: {silent?: boolean}) => Promise<void>
	moveProjectToParent: (
		projectId: number,
		parentProjectId: number,
		options?: {position?: number | null; traceToken?: string | null},
	) => Promise<boolean>
	moveSavedFilterProject: (
		projectId: number,
		parentProjectId: number,
		options?: {position?: number | null; traceToken?: string | null},
	) => Promise<boolean>
	duplicateProject: (projectId: number) => Promise<void>
	deleteProject: (projectId: number) => Promise<boolean>
	saveProjectDetailPatch: (patch: Partial<Project>) => Promise<boolean>
	editProject: (projectId: number) => Promise<void>
	loadProjectBackground: (projectId: number) => Promise<string | null>
	uploadProjectBackground: (projectId: number, file: File) => Promise<boolean>
	setUnsplashProjectBackground: (projectId: number, image: BackgroundImage) => Promise<boolean>
	removeProjectBackground: (projectId: number) => Promise<boolean>
	searchUnsplashBackgrounds: (query: string) => Promise<BackgroundImage[]>
	clearProjectBackgroundUrls: () => void
	resetProjectsState: () => void
}

interface ProjectDeletionSnapshot {
	projects: Project[]
	projectDetailOpen: boolean
	projectDetailLoading: boolean
	projectDetail: Project | null
	selectedProjectId: number | null
	screen: AppStore['screen']
	currentProjectViewId: number | null
	tasks: Task[]
	currentTasksProjectId: number | null
	projectPreviewTasksById: Record<number, Task[]>
	expandedProjectIds: Set<number>
	taskDetailOpen: boolean
	taskDetailLoading: boolean
	taskDetail: Task | null
	focusedTaskStack: Array<{taskId: number; projectId: number; sourceScreen: AppStore['screen']}>
	focusedTaskId: number | null
	focusedTaskProjectId: number | null
	focusedTaskSourceScreen: AppStore['screen'] | null
}

export const createProjectsSlice: StateCreator<AppStore, [], [], ProjectsSlice> = (set, get) => ({
	projects: [],
	savedFilters: [],
	loadingProjects: false,
	selectedProjectId: loadNumber(storageKeys.selectedProjectId),
	inboxProjectId: null,
	composerProjectId: null,
	selectedSavedFilterProjectId: null,
	projectDetailOpen: false,
	projectDetailLoading: false,
	projectDetail: null,
	projectComposerOpen: false,
	projectComposerParentId: null,
	projectComposerPlacement: 'sheet',
	projectSubmitting: false,
	projectFilters: defaultProjectFilters,
	projectFilterDraft: defaultProjectFilters,
	projectPreviewTasksById: {},
	expandedProjectIds: new Set(),
	loadingProjectPreviewIds: new Set(),
	projectBackgroundUrls: {},
	projectBackgroundPreviewUrls: {},
	uploadingProjectBackground: {},
	unsplashSearchResults: [],
	unsplashSearchLoading: false,

	async loadProjects({silent = false} = {}) {
		if (!get().isOnline && get().offlineReadOnlyMode) {
			return
		}

		if (!silent) {
			set({loadingProjects: true, error: null})
		}

			try {
				const [projects, filtersResponse] = await Promise.all([
					api<Project[]>('/api/projects'),
					api<{filters: SavedFilter[]}>('/api/filters'),
				])
				const activeProjects = projects
					.map(normalizeProjectRecord)
					.filter(project => !project.is_archived && project.id > 0)
				const savedFilters = assignSavedFilterProjectPositions(
					dedupeSavedFilters(
					filtersResponse.filters
						.map(filter => ({
							...filter,
							projectId: filter.projectId < 0 ? filter.projectId : getSavedFilterProjectId(filter.id),
						}))
						.filter(filter => filter.projectId < 0),
					),
					activeProjects,
				)

			const availableProjectIds = new Set(activeProjects.map(project => project.id))
			let selectedProjectId = get().selectedProjectId
			if (!selectedProjectId || !availableProjectIds.has(selectedProjectId)) {
				selectedProjectId = findDefaultProjectId(activeProjects)
				saveNumber(storageKeys.selectedProjectId, selectedProjectId)
			}

			let composerProjectId = get().composerProjectId
			if (!composerProjectId || !availableProjectIds.has(composerProjectId)) {
				composerProjectId = getDefaultComposeProjectId(activeProjects, get().defaultProjectId)
			}

			let selectedSavedFilterProjectId = get().selectedSavedFilterProjectId
			const availableSavedFilterProjectIds = new Set(savedFilters.map(filter => filter.projectId))
			if (selectedSavedFilterProjectId && !availableSavedFilterProjectIds.has(selectedSavedFilterProjectId)) {
				selectedSavedFilterProjectId = null
			}

			const inboxProjectId = resolveInboxProjectId(activeProjects, get().defaultProjectId)

			set({
				projects: activeProjects,
				savedFilters,
				selectedProjectId,
				composerProjectId,
				selectedSavedFilterProjectId,
				inboxProjectId,
				currentInboxViewId: inboxProjectId ? get().currentInboxViewId : null,
				currentSavedFilterViewId: selectedSavedFilterProjectId ? get().currentSavedFilterViewId : null,
			})
			await mergeOfflineSnapshot({
				projects: activeProjects,
				savedFilters,
				selectedProjectId,
				inboxProjectId,
			})
			void Promise.allSettled(
				activeProjects
					.filter(project => projectHasBackground(project))
					.map(async project => {
						await ensureProjectBackgroundPreview(set, get, project)
						return get().loadProjectBackground(project.id)
					}),
			)
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			if (!silent) {
				set({loadingProjects: false})
			}
		}
	},

	findDefaultProjectId() {
		return findDefaultProjectId(get().projects)
	},

	getDefaultComposeProjectId() {
		return getDefaultComposeProjectId(get().projects, get().defaultProjectId)
	},

	resolveInboxProjectId() {
		return resolveInboxProjectId(get().projects, get().defaultProjectId)
	},

	getProjectAncestors(projectId) {
		return getProjectAncestors(projectId, get().projects)
	},

	getAvailableParentProjects(projectId) {
		return getAvailableParentProjects(projectId, get().projects)
	},

	setProjectFilterField(field, value) {
		set(state => ({
			projectFilterDraft: updateProjectFilterField(
				normalizeProjectFilters(state.projectFilterDraft),
				field,
				value,
			),
		}))
	},

	syncProjectFilterDraftFromActive() {
		set(state => ({
			projectFilterDraft: normalizeProjectFilters(state.projectFilters),
		}))
	},

	async applyProjectFilterDraft() {
		set(state => ({
			projectFilters: normalizeProjectFilters(state.projectFilterDraft),
		}))
		await get().refreshExpandedProjectPreviews({silent: true})
	},

	resetProjectFilterDraft() {
		set({projectFilterDraft: defaultProjectFilters})
	},

	async toggleProjectExpanded(projectId) {
		const isOpening = !get().expandedProjectIds.has(projectId)
		set(state => {
			const expandedProjectIds = new Set(state.expandedProjectIds)
			if (expandedProjectIds.has(projectId)) {
				expandedProjectIds.delete(projectId)
			} else {
				expandedProjectIds.add(projectId)
			}

			return {expandedProjectIds}
		})

		if (isOpening) {
			await get().loadProjectPreview(projectId)
		}
	},

	async expandAllProjects() {
		const expandedProjectIds = new Set<number>()

		for (const project of get().projects) {
			const parentProjectId = Number(project.parent_project_id || 0)
			if (parentProjectId > 0) {
				expandedProjectIds.add(parentProjectId)
			}
		}

		set({expandedProjectIds})
		await Promise.all(Array.from(expandedProjectIds).map(projectId => get().loadProjectPreview(projectId, {silent: true})))
	},

	collapseAllProjects() {
		set({expandedProjectIds: new Set()})
	},

	toggleProjectMenu(projectId, anchor) {
		set(state => ({
			openMenu:
				state.openMenu?.kind === 'project' && state.openMenu.id === projectId
					? null
					: {
						kind: 'project',
						id: projectId,
						anchor,
					},
		}))
	},

	async openProjectDetail(projectId) {
		get().resetProjectSharingState()
		get().setSubscriptionState('project', projectId, null)
		const cachedProject = get().projects.find(project => project.id === projectId) || null
		set({
			projectDetailOpen: true,
			projectDetailLoading: true,
			projectDetail: cachedProject,
			taskDetailOpen: false,
			taskDetailLoading: false,
			taskDetail: null,
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
			set({projectDetailLoading: false})
			return
		}

		try {
			const result = await api<{project: Project}>(`/api/projects/${projectId}`)
			const project = normalizeProjectRecord(result.project)
			set({projectDetail: project})
			get().setSubscriptionState('project', projectId, project.subscription?.subscribed ?? null)
			if (projectHasBackground(project)) {
				void ensureProjectBackgroundPreview(set, get, project)
				void get().loadProjectBackground(project.id)
			}
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({projectDetailLoading: false})
		}
	},

	closeProjectDetail() {
		get().resetProjectSharingState()
		set({
			projectDetailOpen: false,
			projectDetailLoading: false,
			projectDetail: null,
		})
	},

	openProjectComposer(parentProjectId, {placement = 'sheet'} = {}) {
		set({
			projectComposerOpen: true,
			projectComposerParentId:
				parentProjectId === undefined ? (get().screen === 'tasks' ? get().selectedProjectId : null) : parentProjectId,
			projectComposerPlacement:
				parentProjectId === null || parentProjectId === undefined ? placement : 'center',
			projectSubmitting: false,
			rootComposerOpen: false,
			rootComposerPlacement: 'sheet',
			composerDueDate: null,
			rootSubmitting: false,
			composerParentTaskId: null,
			taskDetailOpen: false,
			taskDetailLoading: false,
			taskDetail: null,
			projectDetailOpen: false,
			projectDetailLoading: false,
			projectDetail: null,
			openMenu: null,
		})
	},

	closeProjectComposer() {
		set({
			projectComposerOpen: false,
			projectComposerParentId: null,
			projectComposerPlacement: 'sheet',
			projectSubmitting: false,
		})
	},

	async submitProject(title) {
		const trimmedTitle = title.trim()
		if (!trimmedTitle || get().projectSubmitting) {
			return false
		}

		set({
			projectSubmitting: true,
			error: null,
		})

		try {
			if (shouldQueueOffline(get, 'submitProject')) {
				const tempId = getNextTempId()
				const optimisticProject = buildOptimisticProject(tempId, trimmedTitle, get().projectComposerParentId || null)
				set(state => ({
					...insertOptimisticProject(state, optimisticProject),
					error: null,
				}))
				await enqueueMutation({
					type: 'project-create',
					endpoint: '/api/projects',
					method: 'POST',
					body: {
						title: trimmedTitle,
						parentProjectId: get().projectComposerParentId || null,
					},
					metadata: {
						entityType: 'project',
						entityId: tempId,
						parentEntityId: get().projectComposerParentId || undefined,
						description: `Create project "${trimmedTitle}"`,
					},
				})
				await get().refreshOfflineQueueCounts()
				return true
			}

			await api<{project: Project}, {title: string; parentProjectId: number | null}>('/api/projects', {
				method: 'POST',
				body: {
					title: trimmedTitle,
					parentProjectId: get().projectComposerParentId || null,
				},
			})
			await get().loadProjects()
			await get().refreshCurrentCollections()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({projectSubmitting: false})
		}
	},

	async navigateToProject(projectId) {
		const comingFromDifferentScreen = get().screen !== 'tasks'
		const offlineReadOnly = !get().isOnline && get().offlineReadOnlyMode
		saveNumber(storageKeys.selectedProjectId, projectId)
		set({
			selectedProjectId: projectId,
			composerProjectId: projectId,
			screen: 'tasks',
			openMenu: null,
			rootComposerOpen: false,
			rootComposerPlacement: 'sheet',
			composerDueDate: null,
			composerParentTaskId: null,
			activeSubtaskParentId: null,
			taskDetailOpen: false,
			taskDetail: null,
			...(!offlineReadOnly && comingFromDifferentScreen ? {tasks: [], currentTasksProjectId: null, currentProjectViewId: null} : {}),
		})
		await mergeOfflineSnapshot({selectedProjectId: projectId})

		if (get().account?.linkShareAuth && !get().projects.some(project => project.id === projectId)) {
			try {
				const result = await api<{project: Project}>(`/api/projects/${projectId}`)
				const sharedProject = normalizeProjectRecord(result.project)
				set(state => ({
					...(() => {
						const projects = dedupeProjects([sharedProject, ...state.projects]).filter(project => !project.is_archived && project.id > 0)
						return {
							projects,
							inboxProjectId: resolveInboxProjectId(projects, state.defaultProjectId),
						}
					})(),
				}))
			} catch (error) {
				set({error: formatError(error as Error)})
			}
		}

		if (offlineReadOnly) {
			const snapshot = await loadOfflineSnapshot()
			const cachedProjectTasks = getOfflineCachedProjectTasks({
				projectId,
				tasksByProjectId: {
					...(snapshot?.tasksByProjectId || {}),
					...(get().currentTasksProjectId ? {[String(get().currentTasksProjectId)]: get().tasks} : {}),
				},
				projectPreviewTasksById: {
					...(snapshot?.projectPreviewTasksById || {}),
					...get().projectPreviewTasksById,
				},
				projectFilterTasks:
					get().projectFilterTasks.length > 0 ? get().projectFilterTasks : snapshot?.projectFilterTasks,
				projectFilterTasksLoaded:
					get().projectFilterTasksLoaded || snapshot?.projectFilterTasksLoaded,
			})
			if (cachedProjectTasks !== null) {
				const offlineProjectViewId = resolveOfflineProjectViewId({
					projectId,
					currentViewId: get().currentProjectViewId ?? snapshot?.currentProjectViewId,
					projectViewsById: {
						...(snapshot?.projectViewsById || {}),
						...get().projectViewsById,
					},
				})
				set({
					tasks: cachedProjectTasks,
					currentTasksProjectId: projectId,
					currentProjectViewId: offlineProjectViewId,
					error: null,
				})
			} else if (get().currentTasksProjectId !== projectId) {
				set({
					tasks: [],
					currentTasksProjectId: projectId,
					error: 'This project is not cached for offline viewing yet.',
				})
			}
			return
		}

		await get().loadTasks(projectId)
	},

	async loadProjectPreview(projectId, {silent = false} = {}) {
		if (!projectId) {
			return
		}

		if (!get().isOnline && get().offlineReadOnlyMode) {
			const snapshot = await loadOfflineSnapshot()
			const cachedPreviewTasks = getOfflineCachedProjectTasks({
				projectId,
				tasksByProjectId: snapshot?.tasksByProjectId,
				projectPreviewTasksById: {
					...(snapshot?.projectPreviewTasksById || {}),
					...get().projectPreviewTasksById,
				},
				projectFilterTasks:
					get().projectFilterTasks.length > 0 ? get().projectFilterTasks : snapshot?.projectFilterTasks,
				projectFilterTasksLoaded:
					get().projectFilterTasksLoaded || snapshot?.projectFilterTasksLoaded,
			})
			if (cachedPreviewTasks !== null) {
				set(state => ({
					projectPreviewTasksById: {
						...state.projectPreviewTasksById,
						[projectId]: cachedPreviewTasks,
					},
					error: null,
				}))
			}
			return
		}

		if (!silent) {
			const nextLoadingIds = new Set(get().loadingProjectPreviewIds)
			nextLoadingIds.add(projectId)
			set({loadingProjectPreviewIds: nextLoadingIds})
		}

		try {
			const {sortBy, orderBy} = getTaskSortQuery(
				get().projectFilters.taskSortBy,
				get().projectFilters.taskSortOrder,
			)
			const useViewEndpoint = isManualTaskSort(get().projectFilters.taskSortBy)
			let tasks = get().projectPreviewTasksById[projectId] || []
			if (useViewEndpoint) {
				const viewId = await get().resolveProjectPreviewTaskViewId(projectId)
				if (viewId) {
					const normalizedSort = sanitizeProjectPreviewTaskSort(sortBy, orderBy)
					const [viewTasks, completedTasks] = await Promise.all([
						api<Task[]>(`/api/projects/${projectId}/views/${viewId}/tasks${buildProjectPreviewTaskQuery(sortBy, orderBy)}`),
						api<Task[]>(
							`/api/projects/${projectId}/tasks${buildProjectPreviewTaskQuery(
								normalizedSort.sortBy,
								normalizedSort.orderBy,
								buildTaskStatusFilter('done'),
							)}`,
						),
					])
					const normalizedViewTasks = normalizeTaskGraph(viewTasks)
					const normalizedCompletedTasks = normalizeTaskGraph(completedTasks)
					tasks = mergeTaskListsWithStablePositions(
						normalizedViewTasks,
						normalizedCompletedTasks,
						tasks,
						get().movingTaskIds,
					)
				} else {
					const normalizedSort = sanitizeProjectPreviewTaskSort(sortBy, orderBy)
					tasks = normalizeTaskGraph(
						await api<Task[]>(`/api/projects/${projectId}/tasks${buildProjectPreviewTaskQuery(normalizedSort.sortBy, normalizedSort.orderBy)}`),
					)
				}
			} else {
				const normalizedSort = sanitizeProjectPreviewTaskSort(sortBy, orderBy)
				tasks = normalizeTaskGraph(
					await api<Task[]>(`/api/projects/${projectId}/tasks${buildProjectPreviewTaskQuery(normalizedSort.sortBy, normalizedSort.orderBy)}`),
				)
			}
			set(state => ({
				error: state.error === 'You must provide a project view ID when sorting by position' ? null : state.error,
				projectPreviewTasksById: {
					...state.projectPreviewTasksById,
					[projectId]: tasks,
				},
			}))
			persistOfflineBrowseSnapshot(get())
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			if (!silent) {
				const loadingProjectPreviewIds = new Set(get().loadingProjectPreviewIds)
				loadingProjectPreviewIds.delete(projectId)
				set({loadingProjectPreviewIds})
			}
		}
	},

	async refreshExpandedProjectPreviews({silent = false} = {}) {
		if (!get().isOnline && get().offlineReadOnlyMode) {
			return
		}

		for (const projectId of get().expandedProjectIds) {
			if (get().projectPreviewTasksById[projectId]) {
				await get().loadProjectPreview(projectId, {silent})
			}
		}
	},

	async moveProjectToParent(projectId, parentProjectId, options = {}) {
		if (blockNonQueueableOfflineAction(get, set, 'moveProjectToParent')) {
			return false
		}

		const project = get().projects.find(entry => entry.id === projectId)
		if (!project) {
			return false
		}

		const nextParentProjectId = Number(parentProjectId || 0)
		const nextPosition = Number(options.position)
		const hasPositionUpdate = Number.isFinite(nextPosition)
		if (
			Number(project.parent_project_id || 0) === nextParentProjectId &&
			(!hasPositionUpdate || nextPosition === Number(project.position || 0))
		) {
			return true
		}

		try {
			set({openMenu: null})
			markProjectDropTrace(options.traceToken || null, 'optimistic-set-start', {
				parentProjectId: nextParentProjectId,
				position: hasPositionUpdate ? nextPosition : Number(project.position || 0),
			})
			set(state => applyLocalProjectMove(state, projectId, {
				parentProjectId: nextParentProjectId,
				position: hasPositionUpdate ? nextPosition : project.position,
			}))
			markProjectDropTrace(options.traceToken || null, 'optimistic-set-end')

			if (shouldQueueOffline(get, 'moveProjectToParent')) {
				await enqueueMutation({
					type: 'project-move',
					endpoint: `/api/projects/${projectId}`,
					method: 'POST',
					body: {
						...project,
						parent_project_id: nextParentProjectId,
						position: hasPositionUpdate ? nextPosition : project.position,
					},
					metadata: {
						entityType: 'project',
						entityId: projectId,
						parentEntityId: nextParentProjectId || undefined,
						description: `Move project "${project.title}"`,
					},
				})
				await get().refreshOfflineQueueCounts()
				return true
			}

			markProjectDropTrace(options.traceToken || null, 'api-project-update-start', {
				parentProjectId: nextParentProjectId,
				position: hasPositionUpdate ? nextPosition : Number(project.position || 0),
			})
			await api<{project: Project}, Partial<Project>>(`/api/projects/${projectId}`, {
				method: 'POST',
				body: {
					...project,
					parent_project_id: nextParentProjectId,
					position: hasPositionUpdate ? nextPosition : project.position,
				},
			})
			markProjectDropTrace(options.traceToken || null, 'api-project-update-end')
			markProjectDropTrace(options.traceToken || null, 'skip-full-refresh-for-visible-project-drop')
			void syncProjectMoveInBackground(get, projectId, options.traceToken || null)
			return true
		} catch (error) {
			markProjectDropTrace(options.traceToken || null, 'drop-failed', formatError(error as Error))
			await get().loadProjects({silent: true})
			if (get().projectDetail?.id === projectId) {
				await get().openProjectDetail(projectId)
			}
			set({error: formatError(error as Error)})
			return false
		}
	},

	async moveSavedFilterProject(projectId, parentProjectId, options = {}) {
		if (Number(parentProjectId || 0) !== 0) {
			return false
		}

		const nextPosition = Number(options.position)
		if (!Number.isFinite(nextPosition)) {
			return false
		}

		const savedFilter = get().savedFilters.find(entry => entry.projectId === projectId) || null
		if (!savedFilter) {
			return false
		}

		if (Number(savedFilter.position || 0) === nextPosition) {
			return true
		}

		set(state => ({
			openMenu: null,
			savedFilters: state.savedFilters
				.map(entry => entry.projectId === projectId ? {...entry, position: nextPosition} : entry)
				.sort(compareByPositionThenId),
		}))
		saveSavedFilterProjectPositions(get().savedFilters)
		await mergeOfflineSnapshot({savedFilters: get().savedFilters})
		return true
	},

	async duplicateProject(projectId) {
		if (blockOfflineReadOnlyAction(get, set, 'duplicate projects')) {
			return
		}

		const project = get().projects.find(entry => entry.id === projectId)
		if (!project) {
			return
		}

		try {
			set({openMenu: null})
			await api(`/api/projects/${projectId}/duplicate`, {
				method: 'POST',
				body: {
					parentProjectId: Number(project.parent_project_id || 0),
				},
			})
			await get().loadProjects()
			await get().refreshCurrentCollections()
		} catch (error) {
			set({error: formatError(error as Error)})
		}
	},

	async deleteProject(projectId) {
		if (blockNonQueueableOfflineAction(get, set, 'deleteProject')) {
			return false
		}

		if (!window.confirm('Delete this project and its tasks?')) {
			return false
		}

		const project = get().projects.find(entry => entry.id === projectId)
		if (!project) {
			return false
		}

		const snapshot = captureProjectDeletionSnapshot(get())
		set(state => ({
			...applyProjectDeletionOptimisticUpdate(state, projectId),
			openMenu: null,
			error: null,
		}))

		if (shouldQueueOffline(get, 'deleteProject')) {
			if (get().selectedProjectId === null) {
				saveNumber(storageKeys.selectedProjectId, null)
			}
			await enqueueMutation({
				type: 'project-delete',
				endpoint: `/api/projects/${projectId}`,
				method: 'DELETE',
				body: null,
				metadata: {
					entityType: 'project',
					entityId: projectId,
					description: `Delete project "${project.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

		const started = await get().startUndoableMutation({
			notice: {
				id: `project-delete:${projectId}:${Date.now()}`,
				kind: 'project-delete',
				title: 'Project deleted',
				body: project.title || `#${projectId}`,
			},
			durationMs: 4200,
			commit: async () => {
				await api(`/api/projects/${projectId}`, {method: 'DELETE'})
				if (snapshot.selectedProjectId === projectId) {
					saveNumber(storageKeys.selectedProjectId, null)
				}
			},
			rollback: () => {
				set(restoreProjectDeletionSnapshot(snapshot))
				if (snapshot.selectedProjectId) {
					saveNumber(storageKeys.selectedProjectId, snapshot.selectedProjectId)
				}
			},
			onCommitted: async () => {
				await get().loadProjects()
				if (!get().pendingUndoMutation) {
					await get().refreshCurrentCollections()
				}
			},
		})

		if (!started) {
			set(restoreProjectDeletionSnapshot(snapshot))
		}

		return started
	},

	async saveProjectDetailPatch(patch) {
		if (blockNonQueueableOfflineAction(get, set, 'saveProjectDetailPatch')) {
			return false
		}

		const currentProject = get().projectDetail
		if (!currentProject?.id) {
			return false
		}
		const projectPayload = {...currentProject}
		delete projectPayload.subscription
		const queuedBody = {
			...projectPayload,
			...patch,
		}
		set(state => applyProjectPatchOptimisticUpdate(state, currentProject.id, patch))

		if (shouldQueueOffline(get, 'saveProjectDetailPatch')) {
			await enqueueMutation({
				type: 'project-update',
				endpoint: `/api/projects/${currentProject.id}`,
				method: 'POST',
				body: queuedBody,
				metadata: {
					entityType: 'project',
					entityId: currentProject.id,
					description: `Edit project "${currentProject.title}"`,
				},
			})
			await get().refreshOfflineQueueCounts()
			return true
		}

		try {
			const result = await api<{project: Project}, Partial<Project>>(
				`/api/projects/${currentProject.id}`,
				{
					method: 'POST',
					body: queuedBody,
				},
			)
			const project = normalizeProjectRecord(result.project)
			set({projectDetail: project})
			await get().loadProjects()
			await get().refreshCurrentCollections()
			await get().openProjectDetail(project.id)
			return true
		} catch (error) {
			set(state => applyProjectPatchOptimisticUpdate(state, currentProject.id, currentProject))
			set({error: formatError(error as Error)})
			return false
		}
	},

	async editProject(projectId) {
		set({openMenu: null})
		await get().openProjectDetail(projectId)
	},

	async loadProjectBackground(projectId) {
		const numericProjectId = Number(projectId || 0)
		if (!numericProjectId || isOfflineReadOnly(get)) {
			return null
		}

		try {
			const response = await fetch(`/api/projects/${numericProjectId}/background`, {
				credentials: 'same-origin',
			})
			if (response.status === 404) {
				set(state => ({
					projectBackgroundUrls: {
						...state.projectBackgroundUrls,
						[numericProjectId]: null,
					},
				}))
				return null
			}
			if (!response.ok) {
				throw new Error(`Background load failed: ${response.status}`)
			}
			const blob = await response.blob()
			const nextUrl = URL.createObjectURL(blob)
			set(state => {
				const previousUrl = state.projectBackgroundUrls[numericProjectId]
				if (previousUrl) {
					URL.revokeObjectURL(previousUrl)
				}
				return {
					projectBackgroundUrls: {
						...state.projectBackgroundUrls,
						[numericProjectId]: nextUrl,
					},
				}
			})
			return nextUrl
		} catch (error) {
			set({error: formatError(error as Error)})
			return null
		}
	},

	async uploadProjectBackground(projectId, file) {
		const numericProjectId = Number(projectId || 0)
		if (!numericProjectId || !file) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'upload project background')) {
			return false
		}

		if (!file.type.startsWith('image/')) {
			set({error: 'Please choose an image file.'})
			return false
		}

		if (file.size > 15 * 1024 * 1024) {
			set({error: 'Background images must be 15 MB or smaller.'})
			return false
		}

		set(state => ({
			uploadingProjectBackground: {
				...state.uploadingProjectBackground,
				[numericProjectId]: true,
			},
		}))

		try {
			const formData = new FormData()
			formData.append('background', file)
			const result = await uploadApi<{project?: Project}>(`/api/projects/${numericProjectId}/backgrounds/upload`, formData, {
				method: 'PUT',
			})
			const project = result?.project ? normalizeProjectRecord(result.project) : null
			if (project) {
				set(state => applyProjectPatchOptimisticUpdate(state, numericProjectId, project))
				await ensureProjectBackgroundPreview(set, get, project)
			}
			await get().loadProjectBackground(numericProjectId)
			if (!project) {
				set(state => applyProjectPatchOptimisticUpdate(state, numericProjectId, {has_background: true}))
			}
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set(state => ({
				uploadingProjectBackground: {
					...state.uploadingProjectBackground,
					[numericProjectId]: false,
				},
			}))
		}
	},

	async setUnsplashProjectBackground(projectId, image) {
		const numericProjectId = Number(projectId || 0)
		if (!numericProjectId || !image?.id) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'set project background')) {
			return false
		}

		try {
			const result = await api<{project?: Project}>(`/api/projects/${numericProjectId}/backgrounds/unsplash`, {
				method: 'POST',
				body: image,
			})
			const project = result?.project ? normalizeProjectRecord(result.project) : null
			if (project) {
				set(state => applyProjectPatchOptimisticUpdate(state, numericProjectId, project))
				await ensureProjectBackgroundPreview(set, get, project)
			}
			await get().loadProjectBackground(numericProjectId)
			if (!project) {
				set(state => applyProjectPatchOptimisticUpdate(state, numericProjectId, {has_background: true}))
			}
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async removeProjectBackground(projectId) {
		const numericProjectId = Number(projectId || 0)
		if (!numericProjectId) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'remove project background')) {
			return false
		}

		try {
			await api(`/api/projects/${numericProjectId}/background`, {
				method: 'DELETE',
			})
			set(state => {
				const previousUrl = state.projectBackgroundUrls[numericProjectId]
				const previousPreviewUrl = state.projectBackgroundPreviewUrls[numericProjectId]
				if (previousUrl) {
					URL.revokeObjectURL(previousUrl)
				}
				if (previousPreviewUrl) {
					URL.revokeObjectURL(previousPreviewUrl)
				}
				return {
					...applyProjectPatchOptimisticUpdate(state, numericProjectId, {
						has_background: false,
						background_information: null,
						backgroundInformation: null,
						background_blur_hash: null,
						backgroundBlurHash: null,
					}),
					projectBackgroundUrls: {
						...state.projectBackgroundUrls,
						[numericProjectId]: null,
					},
					projectBackgroundPreviewUrls: {
						...state.projectBackgroundPreviewUrls,
						[numericProjectId]: null,
					},
				}
			})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async searchUnsplashBackgrounds(query) {
		const trimmedQuery = `${query || ''}`.trim()
		if (!trimmedQuery) {
			set({unsplashSearchResults: []})
			return []
		}

		set({unsplashSearchLoading: true})
		try {
			const payload = await api<{results: BackgroundImage[]}>(`/api/backgrounds/unsplash/search?s=${encodeURIComponent(trimmedQuery)}`)
			const results = Array.isArray(payload.results) ? payload.results : []
			set({unsplashSearchResults: results})
			return results
		} catch (error) {
			set({
				error: formatError(error as Error),
				unsplashSearchResults: [],
			})
			return []
		} finally {
			set({unsplashSearchLoading: false})
		}
	},

	clearProjectBackgroundUrls() {
		const projectBackgroundUrls = get().projectBackgroundUrls
		const projectBackgroundPreviewUrls = get().projectBackgroundPreviewUrls
		for (const value of Object.values(projectBackgroundUrls)) {
			if (value) {
				URL.revokeObjectURL(value)
			}
		}
		for (const value of Object.values(projectBackgroundPreviewUrls)) {
			if (value) {
				URL.revokeObjectURL(value)
			}
		}
		set({
			projectBackgroundUrls: {},
			projectBackgroundPreviewUrls: {},
			uploadingProjectBackground: {},
			unsplashSearchResults: [],
			unsplashSearchLoading: false,
		})
	},

	resetProjectsState() {
		get().clearProjectBackgroundUrls()
		saveNumber(storageKeys.selectedProjectId, null)
		set({
			projects: [],
			savedFilters: [],
			loadingProjects: false,
			selectedProjectId: null,
			inboxProjectId: null,
			composerProjectId: null,
			selectedSavedFilterProjectId: null,
			projectDetailOpen: false,
			projectDetailLoading: false,
			projectDetail: null,
			projectComposerOpen: false,
			projectComposerParentId: null,
			projectComposerPlacement: 'sheet',
			projectSubmitting: false,
			projectFilters: defaultProjectFilters,
			projectFilterDraft: defaultProjectFilters,
			projectPreviewTasksById: {},
			expandedProjectIds: new Set(),
			loadingProjectPreviewIds: new Set(),
			projectBackgroundUrls: {},
			projectBackgroundPreviewUrls: {},
			uploadingProjectBackground: {},
			unsplashSearchResults: [],
			unsplashSearchLoading: false,
		})
	},
})

function buildProjectPreviewTaskQuery(sortBy: string[], orderBy: string[], filter = '') {
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
	const query = params.toString()
	return query ? `?${query}` : ''
}

function sanitizeProjectPreviewTaskSort(sortBy: string[], orderBy: string[]) {
	const pairs = sortBy.map((value, index) => ({
		sortBy: value,
		orderBy: orderBy[index] || 'asc',
	}))
	const filteredPairs = pairs.filter(pair => pair.sortBy && pair.sortBy !== 'position')

	if (filteredPairs.length === 0) {
		return {
			sortBy: ['id'],
			orderBy: ['asc'],
		}
	}

	return {
		sortBy: filteredPairs.map(pair => pair.sortBy),
		orderBy: filteredPairs.map(pair => pair.orderBy),
	}
}

function dedupeSavedFilters(filters: SavedFilter[]) {
	const seen = new Set<number>()
	return filters.filter(filter => {
		if (seen.has(filter.projectId)) {
			return false
		}

		seen.add(filter.projectId)
		return true
	})
}

function loadSavedFilterProjectPositions() {
	const raw = loadJson<Record<string, unknown>>(storageKeys.savedFilterProjectPositions, {})
	return Object.fromEntries(
		Object.entries(raw).filter(([, value]) => Number.isFinite(Number(value))),
	) as Record<string, number>
}

function saveSavedFilterProjectPositions(savedFilters: SavedFilter[]) {
	const positions = Object.fromEntries(
		savedFilters
			.filter(filter => Number.isFinite(Number(filter.position)))
			.map(filter => [String(filter.projectId), Number(filter.position)]),
	)
	saveJson(storageKeys.savedFilterProjectPositions, positions)
}

function assignSavedFilterProjectPositions(savedFilters: SavedFilter[], projects: Project[]) {
	const storedPositions = loadSavedFilterProjectPositions()
	const nextPositions = {...storedPositions}
	const activeProjectIds = new Set(savedFilters.map(filter => String(filter.projectId)))
	let changed = false
	let highestPosition = Math.max(
		0,
		...projects
			.filter(project => Number(project.parent_project_id || 0) === 0)
			.map(project => Number(project.position || 0))
			.filter(position => Number.isFinite(position)),
		...Object.values(nextPositions).filter(position => Number.isFinite(Number(position))).map(position => Number(position)),
	)

	const positionedFilters = savedFilters
		.map(filter => {
			const key = String(filter.projectId)
			const storedPosition = Number(nextPositions[key])
			const position = Number.isFinite(storedPosition)
				? storedPosition
				: (() => {
					highestPosition += 100
					nextPositions[key] = highestPosition
					changed = true
					return highestPosition
				})()
			highestPosition = Math.max(highestPosition, position)
			return {...filter, position}
		})
		.sort(compareByPositionThenId)

	for (const key of Object.keys(nextPositions)) {
		if (activeProjectIds.has(key)) {
			continue
		}
		delete nextPositions[key]
		changed = true
	}

	if (changed) {
		saveJson(storageKeys.savedFilterProjectPositions, nextPositions)
	}

	return positionedFilters
}

function dedupeProjects(projects: Project[]) {
	const seen = new Set<number>()
	return projects
		.map(normalizeProjectRecord)
		.filter(project => {
		if (!project?.id || seen.has(project.id)) {
			return false
		}

		seen.add(project.id)
		return true
	})
}

async function ensureProjectBackgroundPreview(
	set: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>), replace?: false) => void,
	get: () => AppStore,
	project: Project | null | undefined,
) {
	if (!project || !projectHasBackground(project)) {
		return null
	}

	const projectId = Number(project.id || 0)
	const blurHash = getProjectBackgroundBlurHash(project)
	if (!projectId || !blurHash) {
		return null
	}

	const existingPreviewUrl = get().projectBackgroundPreviewUrls[projectId]
	if (existingPreviewUrl) {
		return existingPreviewUrl
	}

	try {
		const blob = await getBlobFromBlurHash(blurHash)
		if (!blob) {
			return null
		}

		const nextUrl = URL.createObjectURL(blob)
		set(state => {
			const previousUrl = state.projectBackgroundPreviewUrls[projectId]
			if (previousUrl) {
				URL.revokeObjectURL(previousUrl)
			}
			return {
				projectBackgroundPreviewUrls: {
					...state.projectBackgroundPreviewUrls,
					[projectId]: nextUrl,
				},
			}
		})
		return nextUrl
	} catch {
		return null
	}
}

function normalizeProjectRecord(project: Project): Project {
	const normalizedPermission = normalizeProjectPermission(project.maxPermission ?? project.max_permission)
	const backgroundInformation = getProjectBackgroundInformation(project)
	const backgroundBlurHash = getProjectBackgroundBlurHash(project)
	const hasBackground = projectHasBackground(project)
	return {
		...project,
		has_background: hasBackground,
		background_information: backgroundInformation,
		backgroundInformation,
		background_blur_hash: backgroundBlurHash,
		backgroundBlurHash: backgroundBlurHash,
		max_permission: normalizedPermission,
		maxPermission: normalizedPermission,
	}
}

function normalizeProjectPermission(value: unknown) {
	const permission = Number(value)
	if (permission === 2) {
		return 2
	}
	if (permission === 1) {
		return 1
	}
	return 0
}

function cloneProjectSnapshot(project: Project): Project {
	return {
		...project,
		subscription: project.subscription ? {...project.subscription} : null,
	}
}

function cloneTaskListSnapshot(tasks: Task[]) {
	return tasks.map(task => ({
		...task,
		labels: Array.isArray(task.labels) ? [...task.labels] : [],
		assignees: Array.isArray(task.assignees) ? task.assignees.map(assignee => ({...assignee})) : [],
		comments: Array.isArray(task.comments)
			? task.comments.map(comment => ({
				...comment,
				author: comment?.author ? {...comment.author} : {id: 0, name: '', username: '', email: ''},
			}))
			: [],
		attachments: Array.isArray(task.attachments)
			? task.attachments.map(attachment => ({
				...attachment,
				created_by: attachment?.created_by ? {...attachment.created_by} : {id: 0, name: '', username: '', email: ''},
				file: attachment?.file ? {...attachment.file} : {id: 0, name: '', mime: '', size: 0},
			}))
			: [],
		related_tasks: task.related_tasks
			? {
				parenttask: Array.isArray(task.related_tasks.parenttask)
					? task.related_tasks.parenttask.map(ref => ({...ref}))
					: [],
				subtask: Array.isArray(task.related_tasks.subtask)
					? task.related_tasks.subtask.map(ref => ({...ref}))
					: [],
			}
			: {parenttask: [], subtask: []},
		subscription: task.subscription ? {...task.subscription} : null,
	}))
}

function captureProjectDeletionSnapshot(state: AppStore): ProjectDeletionSnapshot {
	return {
		projects: state.projects.map(cloneProjectSnapshot),
		projectDetailOpen: state.projectDetailOpen,
		projectDetailLoading: state.projectDetailLoading,
		projectDetail: state.projectDetail ? cloneProjectSnapshot(state.projectDetail) : null,
		selectedProjectId: state.selectedProjectId,
		screen: state.screen,
		currentProjectViewId: state.currentProjectViewId,
		tasks: cloneTaskListSnapshot(state.tasks),
		currentTasksProjectId: state.currentTasksProjectId,
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(state.projectPreviewTasksById).map(([projectId, tasks]) => [projectId, cloneTaskListSnapshot(tasks)]),
		),
		expandedProjectIds: new Set(state.expandedProjectIds),
		taskDetailOpen: state.taskDetailOpen,
		taskDetailLoading: state.taskDetailLoading,
		taskDetail: state.taskDetail ? cloneTaskListSnapshot([state.taskDetail])[0] : null,
		focusedTaskStack: state.focusedTaskStack.map(entry => ({...entry})),
		focusedTaskId: state.focusedTaskId,
		focusedTaskProjectId: state.focusedTaskProjectId,
		focusedTaskSourceScreen: state.focusedTaskSourceScreen,
	}
}

function restoreProjectDeletionSnapshot(snapshot: ProjectDeletionSnapshot): Partial<AppStore> {
	return {
		projects: snapshot.projects.map(cloneProjectSnapshot),
		projectDetailOpen: snapshot.projectDetailOpen,
		projectDetailLoading: snapshot.projectDetailLoading,
		projectDetail: snapshot.projectDetail ? cloneProjectSnapshot(snapshot.projectDetail) : null,
		selectedProjectId: snapshot.selectedProjectId,
		screen: snapshot.screen,
		currentProjectViewId: snapshot.currentProjectViewId,
		tasks: cloneTaskListSnapshot(snapshot.tasks),
		currentTasksProjectId: snapshot.currentTasksProjectId,
		projectPreviewTasksById: Object.fromEntries(
			Object.entries(snapshot.projectPreviewTasksById).map(([projectId, tasks]) => [projectId, cloneTaskListSnapshot(tasks)]),
		),
		expandedProjectIds: new Set(snapshot.expandedProjectIds),
		taskDetailOpen: snapshot.taskDetailOpen,
		taskDetailLoading: snapshot.taskDetailLoading,
		taskDetail: snapshot.taskDetail ? cloneTaskListSnapshot([snapshot.taskDetail])[0] : null,
		focusedTaskStack: snapshot.focusedTaskStack.map(entry => ({...entry})),
		focusedTaskId: snapshot.focusedTaskId,
		focusedTaskProjectId: snapshot.focusedTaskProjectId,
		focusedTaskSourceScreen: snapshot.focusedTaskSourceScreen,
	}
}

function collectProjectTreeIds(projects: Project[], rootProjectId: number) {
	const deletedProjectIds = new Set<number>([rootProjectId])
	let changed = true
	while (changed) {
		changed = false
		for (const project of projects) {
			const parentProjectId = Number(project.parent_project_id || 0)
			if (!project.id || deletedProjectIds.has(project.id) || !deletedProjectIds.has(parentProjectId)) {
				continue
			}
			deletedProjectIds.add(project.id)
			changed = true
		}
	}
	return deletedProjectIds
}

function applyProjectDeletionOptimisticUpdate(state: AppStore, projectId: number) {
	const deletedProjectIds = collectProjectTreeIds(state.projects, projectId)
	const nextProjects = state.projects.filter(project => !deletedProjectIds.has(project.id))
	const nextExpandedProjectIds = new Set(
		[...state.expandedProjectIds].filter(entry => !deletedProjectIds.has(entry)),
	)
	const nextProjectPreviewTasksById = Object.fromEntries(
		Object.entries(state.projectPreviewTasksById).filter(([projectIdKey]) => !deletedProjectIds.has(Number(projectIdKey))),
	)
	const deletingSelectedProject = state.selectedProjectId ? deletedProjectIds.has(state.selectedProjectId) : false
	const deletingTaskDetailProject =
		state.taskDetailOpen && state.taskDetail ? deletedProjectIds.has(Number(state.taskDetail.project_id || 0)) : false
	const nextFocusedTaskStack = state.focusedTaskStack.filter(entry => !deletedProjectIds.has(entry.projectId))
	const nextFocusedEntry = nextFocusedTaskStack[nextFocusedTaskStack.length - 1] || null

	return {
		projects: nextProjects,
		expandedProjectIds: nextExpandedProjectIds,
		projectPreviewTasksById: nextProjectPreviewTasksById,
		projectDetailOpen:
			state.projectDetailOpen && state.projectDetail ? !deletedProjectIds.has(state.projectDetail.id) : state.projectDetailOpen,
		projectDetailLoading:
			state.projectDetailOpen && state.projectDetail ? !deletedProjectIds.has(state.projectDetail.id) && state.projectDetailLoading : state.projectDetailLoading,
		projectDetail: state.projectDetail && deletedProjectIds.has(state.projectDetail.id) ? null : state.projectDetail,
		selectedProjectId: deletingSelectedProject ? null : state.selectedProjectId,
		screen: deletingSelectedProject ? 'projects' : state.screen,
		currentProjectViewId: deletingSelectedProject ? null : state.currentProjectViewId,
		tasks: deletingSelectedProject ? [] : state.tasks,
		currentTasksProjectId: deletingSelectedProject ? null : state.currentTasksProjectId,
		taskDetailOpen: deletingTaskDetailProject ? false : state.taskDetailOpen,
		taskDetailLoading: deletingTaskDetailProject ? false : state.taskDetailLoading,
		taskDetail: deletingTaskDetailProject ? null : state.taskDetail,
		focusedTaskStack: nextFocusedTaskStack,
		focusedTaskId: nextFocusedEntry?.taskId || null,
		focusedTaskProjectId: nextFocusedEntry?.projectId || null,
		focusedTaskSourceScreen: nextFocusedEntry?.sourceScreen || null,
	}
}

function applyProjectPatchOptimisticUpdate(state: AppStore, projectId: number, patch: Partial<Project>) {
	return {
		projects: state.projects.map(project => (project.id === projectId ? {...project, ...patch} : project)),
		projectDetail:
			state.projectDetail?.id === projectId
				? {
					...state.projectDetail,
					...patch,
				}
				: state.projectDetail,
	}
}

function buildOptimisticProject(projectId: number, title: string, parentProjectId: number | null): Project {
	const now = new Date().toISOString()
	return {
		id: projectId,
		title,
		parent_project_id: parentProjectId || 0,
		position: Date.now(),
		description: '',
		created: now,
		updated: now,
	}
}

function insertOptimisticProject(state: AppStore, project: Project) {
	return {
		projects: dedupeProjects([...state.projects, project])
			.map(cloneProjectSnapshot)
			.sort(compareByPositionThenId),
	}
}

function applyLocalProjectMove(
	state: AppStore,
	projectId: number,
	{
		parentProjectId,
		position,
	}: {
		parentProjectId: number
		position: number | null | undefined
	},
) {
	return {
		projects: state.projects.map(project =>
			project.id === projectId
				? {
					...project,
					parent_project_id: parentProjectId,
					position: position ?? project.position,
				}
				: project,
		),
		projectDetail:
			state.projectDetail?.id === projectId
				? {
					...state.projectDetail,
					parent_project_id: parentProjectId,
					position: position ?? state.projectDetail.position,
				}
				: state.projectDetail,
	}
}

async function syncProjectMoveInBackground(
	get: () => AppStore,
	projectId: number,
	traceToken: string | null,
) {
	try {
		markProjectDropTrace(traceToken, 'background-load-projects-start')
		await get().loadProjects({silent: true})
		markProjectDropTrace(traceToken, 'background-load-projects-end')
		if (get().projectDetail?.id === projectId) {
			markProjectDropTrace(traceToken, 'project-detail-reload-start')
			await get().openProjectDetail(projectId)
			markProjectDropTrace(traceToken, 'project-detail-reload-end')
		}
	} catch (error) {
		markProjectDropTrace(traceToken, 'background-load-projects-failed', formatError(error as Error))
	}
}

import {api} from '@/api'
import {
	defaultProjectFilters,
	normalizeProjectFilters,
	setProjectFilterField as updateProjectFilterField,
	type ProjectFilterField,
	type ProjectFilters,
} from '@/hooks/useFilters'
import {storageKeys} from '@/storageKeys'
import type {MenuAnchor, Project, SavedFilter, Task} from '@/types'
import {markProjectDropTrace} from '@/utils/dragPerf'
import {formatError} from '@/utils/formatting'
import {loadNumber, saveNumber} from '@/utils/storage'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {
	getOfflineCachedProjectTasks,
	persistOfflineBrowseSnapshot,
	resolveOfflineProjectViewId,
} from '../offline-browse-cache'
import {blockOfflineReadOnlyAction, isOfflineReadOnly} from '../offline-readonly'
import {loadOfflineSnapshot, mergeOfflineSnapshot} from '../offline-snapshot'
import {
	findDefaultProjectId,
	getAvailableParentProjects,
	getDefaultComposeProjectId,
	getProjectAncestors,
	getSavedFilterProjectId,
	resolveInboxProjectId,
} from '../project-helpers'
import {getTaskSortQuery, normalizeTaskGraph} from '../selectors'

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
	duplicateProject: (projectId: number) => Promise<void>
	deleteProject: (projectId: number) => Promise<boolean>
	saveProjectDetailPatch: (patch: Partial<Project>) => Promise<boolean>
	editProject: (projectId: number) => Promise<void>
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
				const activeProjects = projects.filter(project => !project.is_archived && project.id > 0)
				const savedFilters = dedupeSavedFilters(
					filtersResponse.filters
						.map(filter => ({
							...filter,
							projectId: filter.projectId < 0 ? filter.projectId : getSavedFilterProjectId(filter.id),
						}))
						.filter(filter => filter.projectId < 0),
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
			mergeOfflineSnapshot({
				projects: activeProjects,
				savedFilters,
				selectedProjectId,
				inboxProjectId,
			})
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
			set({projectDetail: result.project})
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
		if (!get().isOnline && get().offlineReadOnlyMode) {
			set({
				error: null,
				offlineActionNotice: 'Offline mode is read-only. Reconnect to create projects.',
			})
			return
		}

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

		if (!get().isOnline && get().offlineReadOnlyMode) {
			set({
				error: null,
				offlineActionNotice: 'Offline mode is read-only. Reconnect to create projects.',
			})
			return false
		}

		set({
			projectSubmitting: true,
			error: null,
		})

		try {
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
		mergeOfflineSnapshot({selectedProjectId: projectId})

		if (get().account?.linkShareAuth && !get().projects.some(project => project.id === projectId)) {
			try {
				const result = await api<{project: Project}>(`/api/projects/${projectId}`)
				const sharedProject = result.project
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
			const snapshot = loadOfflineSnapshot()
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
			const snapshot = loadOfflineSnapshot()
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
			const normalizedSort = sanitizeProjectPreviewTaskSort(sortBy, orderBy)
			const query = buildProjectPreviewTaskQuery(normalizedSort.sortBy, normalizedSort.orderBy)
			const tasks = await api<Task[]>(`/api/projects/${projectId}/tasks${query}`)
			set(state => ({
				error: state.error === 'You must provide a project view ID when sorting by position' ? null : state.error,
				projectPreviewTasksById: {
					...state.projectPreviewTasksById,
					[projectId]: normalizeTaskGraph(tasks),
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
		if (blockOfflineReadOnlyAction(get, set, 'reorganize projects')) {
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
		if (blockOfflineReadOnlyAction(get, set, 'delete projects')) {
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
		if (blockOfflineReadOnlyAction(get, set, 'edit projects')) {
			return false
		}

		const currentProject = get().projectDetail
		if (!currentProject?.id) {
			return false
		}

		try {
			const result = await api<{project: Project}, Partial<Project>>(
				`/api/projects/${currentProject.id}`,
				{
					method: 'POST',
					body: {
						...currentProject,
						...patch,
					},
				},
			)
			set({projectDetail: result.project})
			await get().loadProjects()
			await get().refreshCurrentCollections()
			await get().openProjectDetail(result.project.id)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async editProject(projectId) {
		set({openMenu: null})
		await get().openProjectDetail(projectId)
	},

	resetProjectsState() {
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
		})
	},
})

function buildProjectPreviewTaskQuery(sortBy: string[], orderBy: string[]) {
	const params = new URLSearchParams()
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

function dedupeProjects(projects: Project[]) {
	const seen = new Set<number>()
	return projects.filter(project => {
		if (!project?.id || seen.has(project.id)) {
			return false
		}

		seen.add(project.id)
		return true
	})
}

function cloneProjectSnapshot(project: Project): Project {
	return {...project}
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

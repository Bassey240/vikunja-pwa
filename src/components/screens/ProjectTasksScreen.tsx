import InlineSearchPanel from '@/components/filters/InlineSearchPanel'
import TaskFilterPanel from '@/components/filters/TaskFilterPanel'
import ContextMenu from '@/components/common/ContextMenu'
import StatusCards from '@/components/layout/StatusCards'
import Topbar from '@/components/layout/Topbar'
import ProjectGanttView from '@/components/project/views/ProjectGanttView'
import ProjectKanbanView from '@/components/project/views/ProjectKanbanView'
import ProjectTableView from '@/components/project/views/ProjectTableView'
import InlineProjectComposer from '@/components/projects/InlineProjectComposer'
import ProjectNode from '@/components/projects/ProjectNode'
import ProjectPreview from '@/components/projects/ProjectPreview'
import BulkTaskEditor from '@/components/tasks/BulkTaskEditor'
import InlineRootTaskComposer from '@/components/tasks/InlineRootTaskComposer'
import TaskFocusScreen from '@/components/tasks/TaskFocusScreen'
import TaskTree from '@/components/tasks/TaskTree'
import {getTaskFilterUiConfig, hasActiveTaskFilters, taskMatchesFilters} from '@/hooks/useFilters'
import {useShowCompletedTaskFilter} from '@/hooks/useShowCompleted'
import useWideLayout from '@/hooks/useWideLayout'
import {getProjectDescendantIds, getVisibleChildProjects, getProjectAggregateCountsMap} from '@/store/project-helpers'
import {canManageProjectSharing, canWriteProject, getProjectPermission, getVisibleRootTasksFor} from '@/store/selectors'
import {useAppStore} from '@/store'
import {getMenuAnchor} from '@/utils/menuPosition'
import {projectHasBackground} from '@/utils/project-background'
import {buildSavedFilterProject} from '@/utils/saved-filters'
import {type FormEvent, type MouseEvent, useEffect, useMemo, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'

function getSharePermissionLabel(permission: number) {
	switch (permission) {
		case 2:
			return 'Admin'
		case 1:
			return 'Read & Write'
		default:
			return 'Read'
	}
}

export default function ProjectTasksScreen({
	projectId: projectIdProp,
	presentation = 'app',
}: {
	projectId?: number
	presentation?: 'app' | 'shared-link'
}) {
	const isWideLayout = useWideLayout()
	const navigate = useNavigate()
	const {id} = useParams()
	const projectId = Number(projectIdProp || id || 0)
	const bulkScopeKey = `project:${projectId}:list`
	const account = useAppStore(state => state.account)
	const connected = useAppStore(state => state.connected)
	const offlineReadOnlyMode = useAppStore(state => state.offlineReadOnlyMode)
	const projects = useAppStore(state => state.projects)
	const tasks = useAppStore(state => state.tasks)
	const projectFilterTasks = useAppStore(state => state.projectFilterTasks)
	const projectFilterTasksLoaded = useAppStore(state => state.projectFilterTasksLoaded)
	const projectBackgroundUrls = useAppStore(state => state.projectBackgroundUrls)
	const projectBackgroundPreviewUrls = useAppStore(state => state.projectBackgroundPreviewUrls)
	const savedFilters = useAppStore(state => state.savedFilters)
	const savedFilterTasks = useAppStore(state => state.savedFilterTasks)
	const taskFilters = useAppStore(state => state.taskFilters)
	const taskFilterDraft = useAppStore(state => state.taskFilterDraft)
	const recentlyCompletedTaskIds = useAppStore(state => state.recentlyCompletedTaskIds)
	const selectedProjectId = useAppStore(state => state.selectedProjectId)
	const selectedSavedFilterProjectId = useAppStore(state => state.selectedSavedFilterProjectId)
	const currentTasksProjectId = useAppStore(state => state.currentTasksProjectId)
	const loadingTasks = useAppStore(state => state.loadingTasks)
	const loadingSavedFilterTasks = useAppStore(state => state.loadingSavedFilterTasks)
	const focusedTaskId = useAppStore(state => state.focusedTaskId)
	const focusedTaskSourceScreen = useAppStore(state => state.focusedTaskSourceScreen)
	const currentProjectViewId = useAppStore(state => state.currentProjectViewId)
	const currentSavedFilterViewId = useAppStore(state => state.currentSavedFilterViewId)
	const projectViewsById = useAppStore(state => state.projectViewsById)
	const projectBucketsByViewId = useAppStore(state => state.projectBucketsByViewId)
	const navigateToProject = useAppStore(state => state.navigateToProject)
	const clearSearchState = useAppStore(state => state.clearSearchState)
	const openSearchTaskResult = useAppStore(state => state.openSearchTaskResult)
	const ensureLabelsLoaded = useAppStore(state => state.ensureLabelsLoaded)
	const ensureProjectFilterTasksLoaded = useAppStore(state => state.ensureProjectFilterTasksLoaded)
	const loadProjectViews = useAppStore(state => state.loadProjectViews)
	const selectProjectView = useAppStore(state => state.selectProjectView)
	const createProjectView = useAppStore(state => state.createProjectView)
	const deleteProjectView = useAppStore(state => state.deleteProjectView)
	const syncTaskFilterDraftFromActive = useAppStore(state => state.syncTaskFilterDraftFromActive)
	const setTaskFilterField = useAppStore(state => state.setTaskFilterField)
	const applyTaskFilterDraft = useAppStore(state => state.applyTaskFilterDraft)
	const resetTaskFilterDraft = useAppStore(state => state.resetTaskFilterDraft)
	const loadSavedFilterTasks = useAppStore(state => state.loadSavedFilterTasks)
	const openRootComposer = useAppStore(state => state.openRootComposer)
	const openBulkTaskEditor = useAppStore(state => state.openBulkTaskEditor)
	const openProjectDetail = useAppStore(state => state.openProjectDetail)
	const editProject = useAppStore(state => state.editProject)
	const openProjectComposer = useAppStore(state => state.openProjectComposer)
	const expandAllProjects = useAppStore(state => state.expandAllProjects)
	const collapseAllProjects = useAppStore(state => state.collapseAllProjects)
	const loadProjectBackground = useAppStore(state => state.loadProjectBackground)
	const {showingCompleted, label: completedLabel, toggle: toggleShowCompleted} = useShowCompletedTaskFilter(false)
	const [searchOpen, setSearchOpen] = useState(false)
	const [filterOpen, setFilterOpen] = useState(false)
	const [viewAnchor, setViewAnchor] = useState<ReturnType<typeof getMenuAnchor> | null>(null)
	const [panelAnchor, setPanelAnchor] = useState<ReturnType<typeof getMenuAnchor> | null>(null)
	const [newViewTitle, setNewViewTitle] = useState('')
	const [newViewKind, setNewViewKind] = useState<'list' | 'kanban' | 'table' | 'gantt'>('list')
	const [seedViewFromDraft, setSeedViewFromDraft] = useState(false)
	const bulkMode = useAppStore(state => state.bulkTaskEditorScope === bulkScopeKey)

	const selectedSavedFilter = savedFilters.find(filter => filter.projectId === projectId) || null
	const savedFilterProject = selectedSavedFilter ? buildSavedFilterProject(selectedSavedFilter) : null
	const isSavedFilterRoute = Boolean(savedFilterProject)

	useEffect(() => {
		if ((!connected && !offlineReadOnlyMode) || !projectId) {
			return
		}

		if (isSavedFilterRoute) {
			if (loadingSavedFilterTasks || selectedSavedFilterProjectId === projectId) {
				return
			}

			void loadSavedFilterTasks(projectId)
			return
		}

		if (loadingTasks || currentTasksProjectId === projectId) {
			return
		}

		void navigateToProject(projectId)
	}, [
		connected,
		currentTasksProjectId,
		isSavedFilterRoute,
		loadSavedFilterTasks,
		loadingSavedFilterTasks,
		loadingTasks,
		navigateToProject,
		offlineReadOnlyMode,
		projectId,
		selectedSavedFilterProjectId,
	])

	useEffect(() => {
		if (!connected || projectFilterTasksLoaded) {
			return
		}

		void ensureProjectFilterTasksLoaded()
	}, [connected, ensureProjectFilterTasksLoaded, projectFilterTasksLoaded])

	const taskCollection = isSavedFilterRoute ? savedFilterTasks : tasks
	const projectTasksReady = isSavedFilterRoute ? selectedSavedFilterProjectId === projectId : currentTasksProjectId === projectId
	const displayProjectId = isSavedFilterRoute ? projectId : (projectTasksReady ? projectId : (currentTasksProjectId || projectId))
	const selectedProject = projects.find(project => project.id === projectId) || savedFilterProject
	const displayProject = isSavedFilterRoute
		? savedFilterProject
		: projects.find(project => project.id === displayProjectId) || selectedProject
	const displayProjectHasBackground = projectHasBackground(displayProject)
	const displayProjectBackgroundUrl = !isSavedFilterRoute && displayProjectId > 0 ? (projectBackgroundUrls[displayProjectId] ?? null) : null
	const displayProjectBackgroundPreviewUrl = !isSavedFilterRoute && displayProjectId > 0 ? (projectBackgroundPreviewUrls[displayProjectId] ?? null) : null
	const displayProjectResolvedBackgroundUrl = displayProjectBackgroundUrl || displayProjectBackgroundPreviewUrl
	const parentProject = displayProject?.parent_project_id
		? projects.find(project => project.id === displayProject.parent_project_id) || null
		: null

	useEffect(() => {
		if (!displayProject?.id || !displayProjectHasBackground || displayProjectBackgroundUrl) {
			return
		}

		void loadProjectBackground(displayProject.id)
	}, [displayProject?.id, displayProjectBackgroundUrl, displayProjectHasBackground, loadProjectBackground])

	const childProjects = useMemo(
		() => (displayProject && !isSavedFilterRoute ? getVisibleChildProjects(displayProject.id, projects) : []),
		[displayProject, isSavedFilterRoute, projects],
	)
	const countsByProjectId = useMemo(
		() => getProjectAggregateCountsMap(projects, projectFilterTasks, projectFilterTasksLoaded),
		[projectFilterTasks, projectFilterTasksLoaded, projects],
	)
	const projectSubtreeIds = useMemo(() => {
		if (!selectedProject || isSavedFilterRoute) {
			return new Set<number>()
		}

		const ids = new Set<number>([selectedProject.id])
		for (const descendantId of getProjectDescendantIds(selectedProject.id, projects)) {
			ids.add(descendantId)
		}
		return ids
	}, [isSavedFilterRoute, projects, selectedProject])
	const taskMatcher = useMemo(
		() => (task: (typeof tasks)[number]) => taskMatchesFilters(task, taskFilters) || recentlyCompletedTaskIds.has(task.id),
		[recentlyCompletedTaskIds, taskFilters],
	)
	const rootTasks = useMemo(
		() => getVisibleRootTasksFor(taskCollection, taskMatcher, taskFilters.sortBy),
		[taskCollection, taskFilters.sortBy, taskMatcher],
	)
	const tableTasks = useMemo(() => {
		if (isSavedFilterRoute) {
			return taskCollection.slice()
		}
		const sourceTasks = projectFilterTasksLoaded ? projectFilterTasks : tasks
		const seenTaskIds = new Set<number>()
		return sourceTasks.filter(task => {
			if (!projectSubtreeIds.has(Number(task.project_id || 0)) || seenTaskIds.has(task.id)) {
				return false
			}
			seenTaskIds.add(task.id)
			return true
		})
	}, [isSavedFilterRoute, projectFilterTasks, projectFilterTasksLoaded, projectSubtreeIds, taskCollection, tasks])
	const visibleRootTasks = rootTasks
	const totalItems = childProjects.length + visibleRootTasks.length
	const taskFilterConfig = getTaskFilterUiConfig('tasks')
	const activeViewId = isSavedFilterRoute ? currentSavedFilterViewId : currentProjectViewId
	const currentViews = selectedProject ? projectViewsById[selectedProject.id] || [] : []
	const currentViewKind = currentViews.find(view => view.id === activeViewId)?.view_kind || 'list'
	const supportedViewKinds = useMemo(
		() => (isWideLayout ? new Set(['list', 'kanban', 'table', 'gantt']) : new Set(['list', 'kanban'])),
		[isWideLayout],
	)
	const isSharedLinkPresentation = presentation === 'shared-link' || account?.linkShareAuth === true
	const hasOfflineKanbanCache = Boolean(
		activeViewId &&
		Array.isArray(projectBucketsByViewId[activeViewId]) &&
		projectBucketsByViewId[activeViewId].length > 0,
	)
	const effectiveViewKind =
		offlineReadOnlyMode && currentViewKind === 'kanban' && !hasOfflineKanbanCache
			? 'list'
			: supportedViewKinds.has(currentViewKind)
				? currentViewKind
				: 'list'
	const visibleViews = currentViews.filter(view => supportedViewKinds.has(view.view_kind))
	const showFocusedTask = Boolean(focusedTaskId && focusedTaskSourceScreen === 'tasks')
	const sharedRootProjectId = Number(account?.linkShareProjectId || 0)
	const projectPermissionActor = isSharedLinkPresentation
		? null
		: {
			id: Number(account?.user?.id || 0),
			username: account?.user?.username || '',
			email: account?.user?.email || '',
			canUseAdminBridge: account?.canUseAdminBridge,
		}
	const sharedProjectPermission = getProjectPermission(selectedProject, projectPermissionActor)
	const canUseSharedComposer = !isSavedFilterRoute && canWriteProject(selectedProject, projectPermissionActor)
	const canEditSelectedProject = !isSharedLinkPresentation && !isSavedFilterRoute && canWriteProject(selectedProject, projectPermissionActor)
	const canShareSelectedProject = !isSharedLinkPresentation && !isSavedFilterRoute && canManageProjectSharing(selectedProject, projectPermissionActor)
	const sharedPermissionLabel = getSharePermissionLabel(sharedProjectPermission)
	const canSeedViewFromDraft = hasActiveTaskFilters(taskFilterDraft)
	const viewContext = isSavedFilterRoute ? 'savedFilter' : 'project'
	const canManageViewDefinitions = canEditSelectedProject
	const canCreateRootTask = !isSavedFilterRoute && (!isSharedLinkPresentation || canUseSharedComposer)
	const focusProjectIdOverride = isSavedFilterRoute ? projectId : null
	const showSharedBackButton = Boolean(
		isSharedLinkPresentation &&
			selectedProject &&
			(selectedProject.id !== sharedRootProjectId || parentProject),
	)

	useEffect(() => {
		if (!isSharedLinkPresentation || !viewAnchor) {
			return
		}

		function handlePointerDown(event: PointerEvent) {
			const target = event.target
			if (!(target instanceof Element)) {
				return
			}

			if (target.closest('[data-menu-root]') || target.closest('[data-menu-toggle="true"]')) {
				return
			}

			setViewAnchor(null)
		}

		document.addEventListener('pointerdown', handlePointerDown, true)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown, true)
		}
	}, [isSharedLinkPresentation, viewAnchor])

	useEffect(() => {
		if (
			!selectedProject ||
			(!isSavedFilterRoute && selectedProjectId !== selectedProject.id) ||
			(isSavedFilterRoute && selectedSavedFilterProjectId !== selectedProject.id) ||
			!activeViewId ||
			supportedViewKinds.has(currentViewKind)
		) {
			return
		}

		const fallbackView =
			currentViews.find(view => view.view_kind === 'list') ||
			currentViews.find(view => view.view_kind === 'kanban') ||
			null
		if (!fallbackView) {
			return
		}

		void selectProjectView(selectedProject.id, fallbackView.id, viewContext, {persistPreference: false})
	}, [
		activeViewId,
		currentViewKind,
		currentViews,
		isSavedFilterRoute,
		selectProjectView,
		selectedProject,
		selectedProjectId,
		selectedSavedFilterProjectId,
		supportedViewKinds,
		viewContext,
	])

	async function handleSearchProjectResult(targetProjectId: number) {
		clearSearchState()
		setSearchOpen(false)
		await navigateToProject(targetProjectId)
		navigate(`/projects/${targetProjectId}`)
	}

	async function handleSearchTaskResult(taskId: number, targetProjectId: number) {
		clearSearchState()
		setSearchOpen(false)
		await openSearchTaskResult(taskId, targetProjectId)
		navigate(`/projects/${targetProjectId}`)
	}

	async function handleSavedFilterSelect(projectId: number | null) {
		setFilterOpen(false)
		if (!projectId) {
			await loadSavedFilterTasks(null)
			return
		}

		await loadSavedFilterTasks(projectId)
		navigate(`/projects/${projectId}`)
	}

	async function handleCreateProjectView(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!selectedProject) {
			return
		}
		try {
			await createProjectView(selectedProject.id, {
				title: newViewTitle.trim(),
				viewKind: newViewKind,
				seedFilterFromDraft: seedViewFromDraft && canSeedViewFromDraft,
			})
			setNewViewTitle('')
			setNewViewKind('list')
			setSeedViewFromDraft(false)
			setViewAnchor(null)
		} catch (error) {
			console.error('Failed to create project view', error)
		}
	}

	async function handleDeleteProjectView(viewId: number) {
		if (!selectedProject) {
			return
		}
		const view = currentViews.find(candidate => candidate.id === viewId)
		if (!view) {
			return
		}
		const confirmed = window.confirm(`Delete the "${view.title || view.view_kind}" view?`)
		if (!confirmed) {
			return
		}
		try {
			await deleteProjectView(selectedProject.id, viewId)
			setViewAnchor(null)
		} catch (error) {
			console.error('Failed to delete project view', error)
		}
	}


	if (!selectedProject) {
		if (isSharedLinkPresentation) {
			return (
				<div className="surface shared-project-surface">
					<div className="shared-project-surface-content">
						<section className="panel shared-project-header-card shared-project-loading-card">
							<div className="detail-label">Shared project</div>
							<div className="empty-state">
								{account?.linkShareAuth && projectId > 0 ? 'Loading shared project…' : 'No shared project selected.'}
							</div>
						</section>
					</div>
				</div>
			)
		}

		return (
			<div className="surface">
				<Topbar includeBackButton={false} title="" />
				<div className="surface-content">
					<StatusCards />
					<section className="panel screen-card">
						<div className="screen-body">
							<div className="empty-state">No project selected.</div>
						</div>
					</section>
				</div>
			</div>
		)
	}

	const showProjectMenu = !isSharedLinkPresentation
	const showSearchAction = !isSharedLinkPresentation
	const rootComposerPlacement = isWideLayout ? 'center' : 'sheet'
	const topbarActions = [
		...(showSearchAction
			? [{
					action: 'go-search',
					label: 'Search',
					icon: 'search' as const,
					active: searchOpen,
					onClick: () => {
						setViewAnchor(null)
						setPanelAnchor(null)
						setFilterOpen(false)
						setSearchOpen(open => !open)
					},
				}]
			: []),
		...(effectiveViewKind === 'list'
			? [{
					action: 'toggle-task-filters',
					label: 'Filters',
					icon: 'filter' as const,
					active: filterOpen || hasActiveTaskFilters(taskFilters),
					onClick: () => {
						const opening = !filterOpen
						setViewAnchor(null)
						setPanelAnchor(null)
						setSearchOpen(false)
						setFilterOpen(open => !open)
						if (opening) {
							syncTaskFilterDraftFromActive(taskFilterConfig.allowProject)
							void ensureLabelsLoaded()
						}
					},
				}]
			: []),
		...(visibleViews.length > 1 || !isSharedLinkPresentation
			? [{
					action: 'toggle-project-view-menu',
					label: 'View',
					icon:
						effectiveViewKind === 'kanban'
							? 'view-kanban'
							: effectiveViewKind === 'table'
								? 'view-table'
								: effectiveViewKind === 'gantt'
									? 'view-gantt'
									: 'view-list',
					active: Boolean(viewAnchor),
					menuToggle: true,
					onClick: async (event: MouseEvent<HTMLButtonElement>) => {
						if (!viewAnchor) {
							const trigger = event.currentTarget
							await loadProjectViews(selectedProject.id)
							setPanelAnchor(null)
							setViewAnchor(getMenuAnchor(trigger))
							return
						}
						setViewAnchor(null)
					},
				}]
			: []),
		...(showProjectMenu
			? [{
					action: 'open-project-tasks-menu',
					label: 'Menu',
					text: '⋯',
					className: 'topbar-overview-menu-button',
					active: Boolean(panelAnchor),
					menuToggle: true,
					onClick: (event: MouseEvent<HTMLButtonElement>) => {
						const anchor = getMenuAnchor(event.currentTarget)
						setViewAnchor(null)
						setSearchOpen(false)
						setFilterOpen(false)
						setPanelAnchor(current => (current ? null : anchor))
					},
				}]
			: []),
	]

	if (showFocusedTask) {
		return <TaskFocusScreen sourceScreen="tasks" />
	}

	if (isSharedLinkPresentation) {
		return (
			<div
				className={`surface shared-project-surface ${
					effectiveViewKind === 'kanban' || effectiveViewKind === 'gantt' ? 'is-shared-project-fullwidth' : ''
				}`.trim()}
			>
				<div className="shared-project-surface-content">
					<section
						className={`panel shared-project-header-card ${displayProjectHasBackground ? 'has-background' : ''}`.trim()}
						data-project-background-surface="screen"
						data-has-background={displayProjectHasBackground ? 'true' : 'false'}
					>
						{displayProjectHasBackground ? (
							<div className="project-surface-background-media" aria-hidden="true">
								{displayProjectResolvedBackgroundUrl ? (
									<img src={displayProjectResolvedBackgroundUrl} alt="" className="project-surface-background-image" />
								) : (
									<div className="project-surface-background-placeholder" />
								)}
								<div className="project-surface-background-overlay project-screen-background-overlay" />
							</div>
						) : null}
						<div className="project-surface-background-content">
							<div className="shared-project-header-main">
							<div className="shared-project-title-stack">
								<div className="detail-label">Shared project</div>
								<h1 className="shared-project-title">{displayProject?.title || selectedProject.title}</h1>
								<div className="shared-project-meta-row">
									<div className="count-chip">{totalItems} item{totalItems === 1 ? '' : 's'}</div>
									<div className="meta-chip">{sharedPermissionLabel}</div>
								</div>
							</div>
							<div className="shared-project-toolbar">
								{showSharedBackButton ? (
									<button
										className="pill-button subtle"
										type="button"
										onClick={() =>
											navigate(`/projects/${parentProject?.id || sharedRootProjectId || selectedProject.id}`)
										}
									>
										Back
									</button>
								) : null}
								<button
									className="pill-button subtle"
									type="button"
									onClick={() => {
										setViewAnchor(null)
										setFilterOpen(false)
										void openProjectDetail(selectedProject.id)
									}}
								>
									Project details
								</button>
								{effectiveViewKind === 'list' ? (
									<button
										className={`pill-button subtle ${filterOpen || hasActiveTaskFilters(taskFilters) ? 'is-active' : ''}`.trim()}
										type="button"
										onClick={() => {
											const opening = !filterOpen
											setViewAnchor(null)
											setFilterOpen(open => !open)
											if (opening) {
												syncTaskFilterDraftFromActive(taskFilterConfig.allowProject)
												void ensureLabelsLoaded()
											}
										}}
									>
										Filters
									</button>
								) : null}
								{visibleViews.length > 1 ? (
									<div className="shared-project-view-anchor">
									<button
										className={`pill-button subtle ${viewAnchor ? 'is-active' : ''}`.trim()}
											type="button"
											data-menu-toggle="true"
											onClick={event => {
												if (!viewAnchor) {
													const trigger = event.currentTarget
													setFilterOpen(false)
													setViewAnchor(getMenuAnchor(trigger))
													void loadProjectViews(selectedProject.id)
													return
												}
												setViewAnchor(null)
											}}
										>
											View: {effectiveViewKind}
										</button>
										{viewAnchor ? (
											<ContextMenu anchor={viewAnchor} className="shared-project-view-menu">
												{visibleViews.map(view => (
													<button
														key={view.id}
														className={`menu-item ${view.id === activeViewId ? 'is-active' : ''}`.trim()}
														type="button"
														onClick={() => {
															setViewAnchor(null)
															void selectProjectView(selectedProject.id, view.id, viewContext)
														}}
													>
														{view.title || view.view_kind}
													</button>
												))}
											</ContextMenu>
										) : null}
									</div>
								) : null}
								{canCreateRootTask ? (
									<button className="composer-submit" type="button" onClick={() => openRootComposer({placement: rootComposerPlacement})}>
										Add task
									</button>
								) : null}
							</div>
						</div>
						</div>
					</section>
					{filterOpen && effectiveViewKind === 'list' ? (
						<section className="panel shared-project-filter-panel">
							<TaskFilterPanel
								screen="tasks"
								allowProject={taskFilterConfig.allowProject}
								visibleTaskList={taskCollection}
								showSavedFilters={false}
								showManageFilters={false}
								onApply={() => {
									void applyTaskFilterDraft(taskFilterConfig.allowProject)
									setFilterOpen(false)
								}}
								onReset={() => {
									if (!isSavedFilterRoute) {
										void loadSavedFilterTasks(null)
									}
									resetTaskFilterDraft()
									void applyTaskFilterDraft(taskFilterConfig.allowProject)
								}}
								onSavedFilterSelect={() => undefined}
								onManageFilters={() => undefined}
							/>
						</section>
					) : null}
					<section
						className={`panel screen-card shared-project-canvas ${
							effectiveViewKind === 'kanban' || effectiveViewKind === 'gantt' ? 'is-fullwidth' : ''
						}`.trim()}
					>
						<div className="screen-body">
							{canCreateRootTask ? <InlineRootTaskComposer /> : null}
							{effectiveViewKind === 'kanban' && activeViewId ? (
								<ProjectKanbanView projectId={selectedProject.id} viewId={activeViewId} tasks={taskCollection} focusProjectIdOverride={focusProjectIdOverride} />
							) : effectiveViewKind === 'table' ? (
								<ProjectTableView projectId={selectedProject.id} tasks={tableTasks} focusProjectIdOverride={focusProjectIdOverride} />
							) : effectiveViewKind === 'gantt' ? (
								<ProjectGanttView projectId={selectedProject.id} tasks={tableTasks} focusProjectIdOverride={focusProjectIdOverride} />
							) : (
								<>
									{(isSavedFilterRoute ? loadingSavedFilterTasks : loadingTasks) && !projectTasksReady && rootTasks.length === 0 && childProjects.length === 0 ? <div className="empty-state">Loading tasks…</div> : null}
									{childProjects.length > 0 ? (
										<ProjectPreview label="Sub-projects" parentProjectId={selectedProject.id}>
											{childProjects.map(project => (
												<ProjectNode
													key={project.id}
													project={project}
													depth={0}
													parentProjectId={selectedProject.id}
													countsByProjectId={countsByProjectId}
													previewTaskMatcher={taskMatcher}
											previewTaskSortBy={taskFilters.sortBy}
											taskDropEnabled={true}
										/>
									))}
								</ProjectPreview>
							) : null}
									{visibleRootTasks.length > 0 ? (
										<ProjectPreview label="Tasks" parentProjectId={selectedProject.id}>
											<TaskTree
												taskList={taskCollection}
												matcher={taskMatcher}
												sortBy={taskFilters.sortBy}
												focusProjectIdOverride={focusProjectIdOverride}
												savedFilterProjectId={isSavedFilterRoute ? projectId : null}
											/>
										</ProjectPreview>
									) : null}
									{!(isSavedFilterRoute ? loadingSavedFilterTasks : loadingTasks) && projectTasksReady && childProjects.length === 0 && visibleRootTasks.length === 0 ? (
										<div className="empty-state">{isSavedFilterRoute ? 'No tasks currently match this saved filter.' : 'No tasks or sub-projects are visible in this shared project yet.'}</div>
									) : null}
								</>
							)}
						</div>
					</section>
				</div>
			</div>
		)
	}

	return (
		<div className="surface">
			<Topbar
				title=""
				backAction="go-back"
				includeBackButton={true}
				onBack={() =>
					navigate(
						parentProject ? `/projects/${parentProject.id}` : '/projects',
					)
				}
				desktopHeadingTitle={displayProject?.title || selectedProject.title}
				desktopHeadingCount={`${totalItems} item${totalItems === 1 ? '' : 's'}`}
				onDismissTray={() => {
					setViewAnchor(null)
					setPanelAnchor(null)
				}}
				primaryAction={
					canCreateRootTask
						? {
								action: 'open-root-composer',
								label: 'Add task',
								text: '+',
								className: 'topbar-primary-add-button',
								onClick: () => openRootComposer({placement: rootComposerPlacement}),
							}
						: null
				}
				tray={
					viewAnchor ? (
						<div className="inline-menu topbar-action-menu" data-menu-root="true">
							{visibleViews.length === 0 ? <div className="empty-state compact">No supported project views available.</div> : null}
							{visibleViews.map(view => (
								<div key={view.id} className="view-menu-item">
									<button
										className={`menu-item view-menu-select ${view.id === activeViewId ? 'is-active' : ''}`.trim()}
										data-action="select-project-view"
										data-project-id={selectedProject.id}
										data-view-id={view.id}
										type="button"
										onClick={() => {
											setViewAnchor(null)
											void selectProjectView(selectedProject.id, view.id, viewContext)
										}}
									>
										{view.title || view.view_kind}
									</button>
									{canManageViewDefinitions && visibleViews.length > 1 ? (
										<button
											className="menu-item subtle view-menu-delete"
											data-action="delete-project-view"
											data-project-id={selectedProject.id}
											data-view-id={view.id}
											type="button"
											onClick={() => {
												void handleDeleteProjectView(view.id)
											}}
										>
											Delete
										</button>
									) : null}
								</div>
							))}
							{canManageViewDefinitions ? (
								<form className="view-menu-add" data-form="project-view" onSubmit={handleCreateProjectView}>
									<label className="inline-field">
										<span>Name</span>
										<input
											data-project-view-title="true"
											type="text"
											value={newViewTitle}
											onChange={event => setNewViewTitle(event.currentTarget.value)}
											placeholder="New view"
											maxLength={120}
										/>
									</label>
									<label className="inline-field">
										<span>Type</span>
										<select
											data-project-view-kind="true"
											value={newViewKind}
											onChange={event => setNewViewKind(event.currentTarget.value as 'list' | 'kanban' | 'table' | 'gantt')}
										>
											<option value="list">List</option>
											<option value="kanban">Kanban</option>
											{isWideLayout ? <option value="table">Table</option> : null}
											{isWideLayout ? <option value="gantt">Gantt</option> : null}
										</select>
									</label>
									{canSeedViewFromDraft ? (
										<label className="checkbox-row view-menu-seed">
											<input
												data-project-view-seed-filter="true"
												type="checkbox"
												checked={seedViewFromDraft}
												onChange={event => setSeedViewFromDraft(event.currentTarget.checked)}
											/>
											<span>Seed from current task filters</span>
										</label>
									) : null}
									<button
										className="button-primary"
										data-action="create-project-view"
										type="submit"
										disabled={!newViewTitle.trim()}
									>
										Create view
									</button>
								</form>
							) : null}
						</div>
					) : panelAnchor ? (
						<div className="inline-menu topbar-action-menu" data-menu-root="true">
							{canCreateRootTask ? (
								<button className="menu-item" data-action="open-root-composer" data-project-id={selectedProject.id} type="button" onClick={() => {
									setPanelAnchor(null)
									openRootComposer({placement: rootComposerPlacement})
								}}>
									Add task
								</button>
							) : null}
							<button
								className={`menu-item ${showingCompleted ? 'is-active' : ''}`.trim()}
								data-action="toggle-show-completed"
								type="button"
								onClick={() => {
									toggleShowCompleted()
									setPanelAnchor(null)
								}}
							>
								{completedLabel}
							</button>
							{canEditSelectedProject ? (
								<button className="menu-item" data-action="edit-project" data-project-id={selectedProject.id} type="button" onClick={() => {
									setPanelAnchor(null)
									void editProject(selectedProject.id)
								}}>
									Edit project
								</button>
							) : null}
							{effectiveViewKind === 'list' ? (
								<button className="menu-item" data-action="open-bulk-task-editor" type="button" onClick={() => {
									setPanelAnchor(null)
									openBulkTaskEditor(bulkScopeKey)
								}}>
									Bulk edit
								</button>
							) : null}
							{canShareSelectedProject ? (
								<button className="menu-item" data-action="share-project" data-project-id={selectedProject.id} type="button" onClick={() => {
									setPanelAnchor(null)
									void openProjectDetail(selectedProject.id)
								}}>
									Share project
								</button>
							) : null}
							{canEditSelectedProject ? (
								<button className="menu-item" data-action="open-project-composer" data-parent-project-id={selectedProject.id} type="button" onClick={() => {
									setPanelAnchor(null)
									openProjectComposer(selectedProject.id)
								}}>
									Add sub-project
								</button>
							) : null}
							<button className="menu-item" data-action="expand-all-projects" type="button" onClick={() => {
								setPanelAnchor(null)
								expandAllProjects()
							}}>
								Expand all
							</button>
							<button className="menu-item" data-action="collapse-all-projects" type="button" onClick={() => {
								setPanelAnchor(null)
								collapseAllProjects()
							}}>
								Collapse all
							</button>
						</div>
					) : null
				}
				actions={topbarActions}
			/>
			<div className="surface-content">
				<StatusCards />
						{displayProjectHasBackground ? (
					<section
						className="panel project-screen-header-card"
						data-project-background-surface="screen"
						data-has-background="true"
					>
						<div className="project-surface-background-media" aria-hidden="true">
							{displayProjectResolvedBackgroundUrl ? (
								<img src={displayProjectResolvedBackgroundUrl} alt="" className="project-surface-background-image" />
							) : (
								<div className="project-surface-background-placeholder" />
							)}
							<div className="project-surface-background-overlay project-screen-background-overlay" />
						</div>
						<div className="project-surface-background-content project-screen-header-content">
							<div className="project-screen-title-stack">
								<div className="detail-label">{isSavedFilterRoute ? 'Saved filter' : 'Project'}</div>
								<h2 className="project-screen-title">{displayProject?.title || selectedProject.title}</h2>
								<div className="project-screen-meta-row">
									<div className="count-chip">{totalItems} item{totalItems === 1 ? '' : 's'}</div>
									{isSavedFilterRoute ? <div className="meta-chip filter-project-chip">Filter project</div> : null}
									{parentProject ? <div className="meta-chip">Inside {parentProject.title}</div> : null}
								</div>
							</div>
						</div>
					</section>
				) : null}
				<section className="panel screen-card">
					{!displayProjectHasBackground ? (
						<div className="panel-head desktop-promoted-panel-head">
							<div className="panel-heading-inline">
								<h2 className="panel-title">{displayProject?.title || selectedProject.title}</h2>
								<div className="count-chip">{totalItems} item{totalItems === 1 ? '' : 's'}</div>
								{isSavedFilterRoute ? <div className="meta-chip filter-project-chip">Filter project</div> : null}
							</div>
						</div>
					) : null}
					<div className="screen-body">
						{searchOpen ? (
							<InlineSearchPanel
								onProjectResultSelect={targetProjectId => void handleSearchProjectResult(targetProjectId)}
								onTaskResultSelect={(taskId, targetProjectId) => void handleSearchTaskResult(taskId, targetProjectId)}
							/>
						) : null}
						{filterOpen && effectiveViewKind === 'list' ? (
								<TaskFilterPanel
									screen="tasks"
									allowProject={taskFilterConfig.allowProject}
									visibleTaskList={taskCollection}
									showSavedFilters={true}
									showManageFilters={true}
								onApply={() => {
										void applyTaskFilterDraft(taskFilterConfig.allowProject)
										setFilterOpen(false)
								}}
								onReset={() => {
									if (!isSavedFilterRoute) {
										void loadSavedFilterTasks(null)
									}
									resetTaskFilterDraft()
									void applyTaskFilterDraft(taskFilterConfig.allowProject)
								}}
								onSavedFilterSelect={projectId => void handleSavedFilterSelect(projectId)}
								onManageFilters={() => {
									setFilterOpen(false)
									navigate('/filters')
								}}
							/>
						) : null}
						{effectiveViewKind === 'list' ? <BulkTaskEditor scopeKey={bulkScopeKey} /> : null}
						{canCreateRootTask ? <InlineRootTaskComposer /> : null}
						{effectiveViewKind === 'kanban' && activeViewId ? (
							<ProjectKanbanView projectId={selectedProject.id} viewId={activeViewId} tasks={taskCollection} focusProjectIdOverride={focusProjectIdOverride} />
						) : effectiveViewKind === 'table' ? (
							<ProjectTableView projectId={selectedProject.id} tasks={tableTasks} focusProjectIdOverride={focusProjectIdOverride} />
						) : effectiveViewKind === 'gantt' ? (
							<ProjectGanttView projectId={selectedProject.id} tasks={tableTasks} focusProjectIdOverride={focusProjectIdOverride} />
						) : (
							<>
								{!isSavedFilterRoute ? <InlineProjectComposer parentProjectId={selectedProject.id} /> : null}
								{(isSavedFilterRoute ? loadingSavedFilterTasks : loadingTasks) && !projectTasksReady && rootTasks.length === 0 && childProjects.length === 0 ? <div className="empty-state">Loading tasks…</div> : null}
								{childProjects.length > 0 ? (
									<ProjectPreview label="Sub-projects" parentProjectId={selectedProject.id}>
										{childProjects.map(project => (
											<ProjectNode
												key={project.id}
											project={project}
											depth={0}
											parentProjectId={selectedProject.id}
											countsByProjectId={countsByProjectId}
											previewTaskMatcher={taskMatcher}
											previewTaskSortBy={taskFilters.sortBy}
											taskDropEnabled={true}
											previewTaskBulkMode={bulkMode}
										/>
									))}
								</ProjectPreview>
							) : null}
							{visibleRootTasks.length > 0 ? (
								<ProjectPreview label="Tasks" parentProjectId={selectedProject.id}>
								<TaskTree
									taskList={taskCollection}
									matcher={taskMatcher}
									sortBy={taskFilters.sortBy}
									bulkMode={bulkMode}
									focusProjectIdOverride={focusProjectIdOverride}
									savedFilterProjectId={isSavedFilterRoute ? projectId : null}
								/>
							</ProjectPreview>
						) : null}
								{!(isSavedFilterRoute ? loadingSavedFilterTasks : loadingTasks) && projectTasksReady && childProjects.length === 0 && visibleRootTasks.length === 0 ? (
									<div className="empty-state">{isSavedFilterRoute ? 'No tasks currently match this saved filter.' : 'No tasks or sub-projects yet. Use the + button to start adding.'}</div>
								) : null}
							</>
						)}
					</div>
				</section>
			</div>
		</div>
	)
}

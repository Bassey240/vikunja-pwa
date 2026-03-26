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
import {getVisibleRootTasksFor} from '@/store/selectors'
import {useAppStore} from '@/store'
import {getMenuAnchor} from '@/utils/menuPosition'
import {type MouseEvent, useEffect, useMemo, useState} from 'react'
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
	const taskFilters = useAppStore(state => state.taskFilters)
	const recentlyCompletedTaskIds = useAppStore(state => state.recentlyCompletedTaskIds)
	const selectedProjectId = useAppStore(state => state.selectedProjectId)
	const currentTasksProjectId = useAppStore(state => state.currentTasksProjectId)
	const loadingTasks = useAppStore(state => state.loadingTasks)
	const focusedTaskId = useAppStore(state => state.focusedTaskId)
	const focusedTaskSourceScreen = useAppStore(state => state.focusedTaskSourceScreen)
	const currentProjectViewId = useAppStore(state => state.currentProjectViewId)
	const projectViewsById = useAppStore(state => state.projectViewsById)
	const projectBucketsByViewId = useAppStore(state => state.projectBucketsByViewId)
	const navigateToProject = useAppStore(state => state.navigateToProject)
	const clearSearchState = useAppStore(state => state.clearSearchState)
	const openSearchTaskResult = useAppStore(state => state.openSearchTaskResult)
	const ensureLabelsLoaded = useAppStore(state => state.ensureLabelsLoaded)
	const ensureProjectFilterTasksLoaded = useAppStore(state => state.ensureProjectFilterTasksLoaded)
	const loadProjectViews = useAppStore(state => state.loadProjectViews)
	const selectProjectView = useAppStore(state => state.selectProjectView)
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
	const {showingCompleted, label: completedLabel, toggle: toggleShowCompleted} = useShowCompletedTaskFilter(false)
	const [searchOpen, setSearchOpen] = useState(false)
	const [filterOpen, setFilterOpen] = useState(false)
	const [viewAnchor, setViewAnchor] = useState<ReturnType<typeof getMenuAnchor> | null>(null)
	const [panelAnchor, setPanelAnchor] = useState<ReturnType<typeof getMenuAnchor> | null>(null)
	const bulkMode = useAppStore(state => state.bulkTaskEditorScope === bulkScopeKey)

	useEffect(() => {
		if ((!connected && !offlineReadOnlyMode) || !projectId) {
			return
		}

		if (loadingTasks || currentTasksProjectId === projectId) {
			return
		}

		void navigateToProject(projectId)
	}, [connected, currentTasksProjectId, loadingTasks, navigateToProject, offlineReadOnlyMode, projectId])

	useEffect(() => {
		if (!connected || projectFilterTasksLoaded) {
			return
		}

		void ensureProjectFilterTasksLoaded()
	}, [connected, ensureProjectFilterTasksLoaded, projectFilterTasksLoaded])

	const projectTasksReady = currentTasksProjectId === projectId
	const displayProjectId = projectTasksReady ? projectId : (currentTasksProjectId || projectId)
	const selectedProject = projects.find(project => project.id === projectId) || null
	const displayProject = projects.find(project => project.id === displayProjectId) || selectedProject
	const parentProject = displayProject?.parent_project_id
		? projects.find(project => project.id === displayProject.parent_project_id) || null
		: null
	const childProjects = useMemo(
		() => (displayProject ? getVisibleChildProjects(displayProject.id, projects) : []),
		[projects, displayProject],
	)
	const countsByProjectId = useMemo(
		() => getProjectAggregateCountsMap(projects, projectFilterTasks, projectFilterTasksLoaded),
		[projectFilterTasks, projectFilterTasksLoaded, projects],
	)
	const projectSubtreeIds = useMemo(() => {
		if (!selectedProject) {
			return new Set<number>()
		}

		const ids = new Set<number>([selectedProject.id])
		for (const descendantId of getProjectDescendantIds(selectedProject.id, projects)) {
			ids.add(descendantId)
		}
		return ids
	}, [projects, selectedProject])
	const taskMatcher = useMemo(
		() => (task: (typeof tasks)[number]) => taskMatchesFilters(task, taskFilters) || recentlyCompletedTaskIds.has(task.id),
		[recentlyCompletedTaskIds, taskFilters],
	)
	const rootTasks = useMemo(
		() => getVisibleRootTasksFor(tasks, taskMatcher, taskFilters.sortBy),
		[taskFilters.sortBy, taskMatcher, tasks],
	)
	const tableTasks = useMemo(() => {
		const sourceTasks = projectFilterTasksLoaded ? projectFilterTasks : tasks
		const seenTaskIds = new Set<number>()
		return sourceTasks.filter(task => {
			if (!projectSubtreeIds.has(Number(task.project_id || 0)) || seenTaskIds.has(task.id)) {
				return false
			}
			seenTaskIds.add(task.id)
			return true
		})
	}, [projectFilterTasks, projectFilterTasksLoaded, projectSubtreeIds, tasks])
	const visibleRootTasks = rootTasks
	const totalItems = childProjects.length + visibleRootTasks.length
	const taskFilterConfig = getTaskFilterUiConfig('tasks')
	const currentViews = selectedProject ? projectViewsById[selectedProject.id] || [] : []
	const currentViewKind = currentViews.find(view => view.id === currentProjectViewId)?.view_kind || 'list'
	const supportedViewKinds = useMemo(
		() => (isWideLayout ? new Set(['list', 'kanban', 'table', 'gantt']) : new Set(['list', 'kanban'])),
		[isWideLayout],
	)
	const isSharedLinkPresentation = presentation === 'shared-link' || account?.linkShareAuth === true
	const hasOfflineKanbanCache = Boolean(
		currentProjectViewId &&
		Array.isArray(projectBucketsByViewId[currentProjectViewId]) &&
		projectBucketsByViewId[currentProjectViewId].length > 0,
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
	const sharedProjectPermission = Number((selectedProject as unknown as {max_permission?: number | null})?.max_permission || 0)
	const canUseSharedComposer = sharedProjectPermission > 1 && !offlineReadOnlyMode
	const sharedPermissionLabel = getSharePermissionLabel(sharedProjectPermission)
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
			selectedProjectId !== selectedProject.id ||
			!currentProjectViewId ||
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

		void selectProjectView(selectedProject.id, fallbackView.id, 'project', {persistPreference: false})
	}, [currentProjectViewId, currentViewKind, currentViews, selectProjectView, selectedProject, selectedProjectId, supportedViewKinds])

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
			return
		}

		await loadSavedFilterTasks(projectId)
		navigate('/filters')
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
					<section className="panel shared-project-header-card">
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
														className={`menu-item ${view.id === currentProjectViewId ? 'is-active' : ''}`.trim()}
														type="button"
														onClick={() => {
															setViewAnchor(null)
															void selectProjectView(selectedProject.id, view.id, 'project')
														}}
													>
														{view.title || view.view_kind}
													</button>
												))}
											</ContextMenu>
										) : null}
									</div>
								) : null}
								{canUseSharedComposer ? (
									<button className="composer-submit" type="button" onClick={() => openRootComposer({placement: rootComposerPlacement})}>
										Add task
									</button>
								) : null}
							</div>
						</div>
					</section>
					{filterOpen && effectiveViewKind === 'list' ? (
						<section className="panel shared-project-filter-panel">
							<TaskFilterPanel
								screen="tasks"
								allowProject={taskFilterConfig.allowProject}
								visibleTaskList={tasks}
								showSavedFilters={false}
								showManageFilters={false}
								onApply={() => {
									void applyTaskFilterDraft(taskFilterConfig.allowProject)
									setFilterOpen(false)
								}}
								onReset={() => {
									void loadSavedFilterTasks(null)
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
							<InlineRootTaskComposer />
							{effectiveViewKind === 'kanban' && currentProjectViewId ? (
								<ProjectKanbanView projectId={selectedProject.id} viewId={currentProjectViewId} tasks={tasks} />
							) : effectiveViewKind === 'table' ? (
								<ProjectTableView projectId={selectedProject.id} tasks={tableTasks} />
							) : effectiveViewKind === 'gantt' ? (
								<ProjectGanttView projectId={selectedProject.id} tasks={tableTasks} />
							) : (
								<>
									{loadingTasks && !projectTasksReady && rootTasks.length === 0 && childProjects.length === 0 ? <div className="empty-state">Loading tasks…</div> : null}
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
											<TaskTree taskList={tasks} matcher={taskMatcher} sortBy={taskFilters.sortBy} />
										</ProjectPreview>
									) : null}
									{!loadingTasks && projectTasksReady && childProjects.length === 0 && visibleRootTasks.length === 0 ? (
										<div className="empty-state">No tasks or sub-projects are visible in this shared project yet.</div>
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
					!isSharedLinkPresentation || canUseSharedComposer
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
								<button
									key={view.id}
									className={`menu-item ${view.id === currentProjectViewId ? 'is-active' : ''}`.trim()}
									data-action="select-project-view"
									data-project-id={selectedProject.id}
									data-view-id={view.id}
									type="button"
									onClick={() => {
										setViewAnchor(null)
										void selectProjectView(selectedProject.id, view.id, 'project')
									}}
								>
									{view.title || view.view_kind}
								</button>
							))}
						</div>
					) : panelAnchor ? (
						<div className="inline-menu topbar-action-menu" data-menu-root="true">
							{!offlineReadOnlyMode ? (
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
							<button className="menu-item" data-action="edit-project" data-project-id={selectedProject.id} type="button" onClick={() => {
								setPanelAnchor(null)
								void editProject(selectedProject.id)
							}}>
								Edit project
							</button>
							{effectiveViewKind === 'list' ? (
								<button className="menu-item" data-action="open-bulk-task-editor" type="button" onClick={() => {
									setPanelAnchor(null)
									openBulkTaskEditor(bulkScopeKey)
								}}>
									Bulk edit
								</button>
							) : null}
							<button className="menu-item" data-action="share-project" data-project-id={selectedProject.id} type="button" onClick={() => {
								setPanelAnchor(null)
								void openProjectDetail(selectedProject.id)
							}}>
								Share project
							</button>
							{!offlineReadOnlyMode ? (
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
				<section className="panel screen-card">
					<div className="panel-head desktop-promoted-panel-head">
						<div className="panel-heading-inline">
							<h2 className="panel-title">{displayProject?.title || selectedProject.title}</h2>
							<div className="count-chip">{totalItems} item{totalItems === 1 ? '' : 's'}</div>
						</div>
					</div>
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
									visibleTaskList={tasks}
									showSavedFilters={true}
									showManageFilters={true}
									onApply={() => {
										void applyTaskFilterDraft(taskFilterConfig.allowProject)
										setFilterOpen(false)
								}}
								onReset={() => {
									void loadSavedFilterTasks(null)
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
						<InlineRootTaskComposer />
						{effectiveViewKind === 'kanban' && currentProjectViewId ? (
							<ProjectKanbanView projectId={selectedProject.id} viewId={currentProjectViewId} tasks={tasks} />
						) : effectiveViewKind === 'table' ? (
							<ProjectTableView projectId={selectedProject.id} tasks={tableTasks} />
						) : effectiveViewKind === 'gantt' ? (
							<ProjectGanttView projectId={selectedProject.id} tasks={tableTasks} />
						) : (
							<>
								<InlineProjectComposer parentProjectId={selectedProject.id} />
								{loadingTasks && !projectTasksReady && rootTasks.length === 0 && childProjects.length === 0 ? <div className="empty-state">Loading tasks…</div> : null}
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
									<TaskTree taskList={tasks} matcher={taskMatcher} sortBy={taskFilters.sortBy} bulkMode={bulkMode} />
								</ProjectPreview>
							) : null}
								{!loadingTasks && projectTasksReady && childProjects.length === 0 && visibleRootTasks.length === 0 ? (
									<div className="empty-state">No tasks or sub-projects yet. Use the + button to start adding.</div>
								) : null}
							</>
						)}
					</div>
				</section>
			</div>
		</div>
	)
}

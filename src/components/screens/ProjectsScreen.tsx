import ProjectFilterPanel from '@/components/filters/ProjectFilterPanel'
import InlineSearchPanel from '@/components/filters/InlineSearchPanel'
import StatusCards from '@/components/layout/StatusCards'
import Topbar from '@/components/layout/Topbar'
import InlineRootProjectComposer from '@/components/projects/InlineRootProjectComposer'
import ProjectTree from '@/components/projects/ProjectTree'
import BulkTaskEditor from '@/components/tasks/BulkTaskEditor'
import InlineRootTaskComposer from '@/components/tasks/InlineRootTaskComposer'
import TaskFocusScreen from '@/components/tasks/TaskFocusScreen'
import {
	createVisibleProjectTree,
	hasActiveProjectFilters,
	taskMatchesProjectFilters,
} from '@/hooks/useFilters'
import {useShowCompletedProjectFilter} from '@/hooks/useShowCompleted'
import {compareByPositionThenId, getProjectAggregateCountsMap} from '@/store/project-helpers'
import {useAppStore} from '@/store'
import {getMenuAnchor} from '@/utils/menuPosition'
import {buildSavedFilterProject, savedFilterMatchesProjectFilters} from '@/utils/saved-filters'
import {useEffect, useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'

export default function ProjectsScreen() {
	const bulkScopeKey = 'projects'
	const navigate = useNavigate()
	const connected = useAppStore(state => state.connected)
	const projects = useAppStore(state => state.projects)
	const loadingProjects = useAppStore(state => state.loadingProjects)
	const projectFilterTasks = useAppStore(state => state.projectFilterTasks)
	const projectFilterTasksLoaded = useAppStore(state => state.projectFilterTasksLoaded)
	const projectFilters = useAppStore(state => state.projectFilters)
	const savedFilters = useAppStore(state => state.savedFilters)
	const focusedTaskId = useAppStore(state => state.focusedTaskId)
	const focusedTaskSourceScreen = useAppStore(state => state.focusedTaskSourceScreen)
	const loadProjects = useAppStore(state => state.loadProjects)
	const ensureProjectFilterTasksLoaded = useAppStore(state => state.ensureProjectFilterTasksLoaded)
	const ensureLabelsLoaded = useAppStore(state => state.ensureLabelsLoaded)
	const openProjectComposer = useAppStore(state => state.openProjectComposer)
	const openRootComposer = useAppStore(state => state.openRootComposer)
	const openBulkTaskEditor = useAppStore(state => state.openBulkTaskEditor)
	const bulkMode = useAppStore(state => state.bulkTaskEditorScope === bulkScopeKey)
	const expandAllProjects = useAppStore(state => state.expandAllProjects)
	const collapseAllProjects = useAppStore(state => state.collapseAllProjects)
	const navigateToProject = useAppStore(state => state.navigateToProject)
	const clearSearchState = useAppStore(state => state.clearSearchState)
	const openSearchTaskResult = useAppStore(state => state.openSearchTaskResult)
	const loadSavedFilterTasks = useAppStore(state => state.loadSavedFilterTasks)
	const syncProjectFilterDraftFromActive = useAppStore(state => state.syncProjectFilterDraftFromActive)
	const applyProjectFilterDraft = useAppStore(state => state.applyProjectFilterDraft)
	const resetProjectFilterDraft = useAppStore(state => state.resetProjectFilterDraft)
	const {showingCompleted, label: completedLabel, toggle: toggleShowCompleted} = useShowCompletedProjectFilter()
	const [searchOpen, setSearchOpen] = useState(false)
	const [filterOpen, setFilterOpen] = useState(false)
	const [panelAnchor, setPanelAnchor] = useState<ReturnType<typeof getMenuAnchor> | null>(null)

	useEffect(() => {
		if (!connected || projects.length > 0) {
			return
		}

		void loadProjects()
	}, [connected, loadProjects, projects.length])

	useEffect(() => {
		if (!connected || projectFilterTasksLoaded) {
			return
		}

		void ensureProjectFilterTasksLoaded()
	}, [connected, ensureProjectFilterTasksLoaded, projectFilterTasksLoaded])

	const countsByProjectId = useMemo(
		() => getProjectAggregateCountsMap(projects, projectFilterTasks, projectFilterTasksLoaded),
		[projectFilterTasks, projectFilterTasksLoaded, projects],
	)
	const visibleProjectTree = useMemo(
		() => createVisibleProjectTree(projects, projectFilters, projectFilterTasks),
		[projectFilterTasks, projectFilters, projects],
	)
	const visibleSavedFilterProjects = useMemo(
		() =>
			savedFilters
				.filter(filter => savedFilterMatchesProjectFilters(filter, projectFilters))
				.map(buildSavedFilterProject),
		[projectFilters, savedFilters],
	)
	const visibleRootEntries = useMemo(
		() => [...visibleProjectTree.rootProjects, ...visibleSavedFilterProjects].sort(compareByPositionThenId),
		[visibleProjectTree.rootProjects, visibleSavedFilterProjects],
	)
	const previewTaskMatcher = useMemo(
		() => (task: (typeof projectFilterTasks)[number]) => taskMatchesProjectFilters(task, projectFilters),
		[projectFilters],
	)
	const showFocusedTask = Boolean(focusedTaskId && focusedTaskSourceScreen === 'projects')

	if (showFocusedTask) {
		return <TaskFocusScreen sourceScreen="projects" />
	}

	async function handleProjectSearchOpen() {
		setPanelAnchor(null)
		setFilterOpen(false)
		setSearchOpen(open => !open)
	}

	async function handleProjectFilterOpen() {
		const opening = !filterOpen
		setPanelAnchor(null)
		setSearchOpen(false)
		setFilterOpen(open => !open)
		if (opening) {
			syncProjectFilterDraftFromActive()
			await ensureLabelsLoaded()
			await ensureProjectFilterTasksLoaded()
		}
	}


	async function handleProjectResult(projectId: number) {
		clearSearchState()
		setSearchOpen(false)
		await navigateToProject(projectId)
		navigate(`/projects/${projectId}`)
	}

	async function handleTaskResult(taskId: number, projectId: number) {
		clearSearchState()
		setSearchOpen(false)
		await openSearchTaskResult(taskId, projectId)
		navigate(`/projects/${projectId}`)
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

	return (
		<div className="surface">
			<Topbar
				includeBackButton={false}
				desktopHeadingTitle="Projects"
				desktopHeadingCount={visibleRootEntries.length}
				onDismissTray={() => setPanelAnchor(null)}
				primaryAction={{
					action: 'open-root-composer',
					label: 'Add task',
					text: '+',
					className: 'topbar-primary-add-button',
					onClick: () => openRootComposer({placement: 'center'}),
				}}
				tray={
					panelAnchor ? (
						<div className="inline-menu topbar-action-menu" data-menu-root="true">
							<button
								className="menu-item"
								data-action="open-bulk-task-editor"
								type="button"
								onClick={() => {
									setPanelAnchor(null)
									openBulkTaskEditor(bulkScopeKey)
								}}
							>
								Bulk edit
							</button>
							<button
								className="menu-item"
								data-action="open-project-composer"
								type="button"
								onClick={() => {
									setPanelAnchor(null)
									openProjectComposer(null, {placement: 'center'})
								}}
							>
								Add project
							</button>
							<button
								className="menu-item"
								data-action="expand-all-projects"
								type="button"
								onClick={() => {
									setPanelAnchor(null)
									expandAllProjects()
								}}
							>
								Expand all
							</button>
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
							<button
								className="menu-item"
								data-action="collapse-all-projects"
								type="button"
								onClick={() => {
									setPanelAnchor(null)
									collapseAllProjects()
								}}
							>
								Collapse all
							</button>
						</div>
					) : null
				}
				actions={[
					{
						action: 'go-search',
						label: 'Search',
						icon: 'search',
						active: searchOpen,
						onClick: () => void handleProjectSearchOpen(),
					},
					{
						action: 'toggle-project-filters',
						label: 'Filters',
						icon: 'filter',
						active: filterOpen || hasActiveProjectFilters(projectFilters),
						onClick: () => void handleProjectFilterOpen(),
					},
					{
						action: 'open-projects-menu',
						label: 'Menu',
						text: '⋯',
						className: 'topbar-overview-menu-button',
						active: Boolean(panelAnchor),
						menuToggle: true,
						onClick: event => {
							const anchor = getMenuAnchor(event.currentTarget)
							setSearchOpen(false)
							setFilterOpen(false)
							setPanelAnchor(current => (current ? null : anchor))
						},
					},
				]}
			/>
			<div className="surface-content">
				<StatusCards />
				<section className="panel screen-card">
					<div className="panel-head desktop-promoted-panel-head">
						<div className="panel-heading-inline">
							<h2 className="panel-title">Projects</h2>
							<div className="count-chip">{visibleRootEntries.length}</div>
						</div>
					</div>
					<div className="screen-body">
						{searchOpen ? (
							<InlineSearchPanel
								onProjectResultSelect={projectId => void handleProjectResult(projectId)}
								onTaskResultSelect={(taskId, projectId) => void handleTaskResult(taskId, projectId)}
							/>
						) : null}
						{filterOpen ? (
							<ProjectFilterPanel
								projectFilterTasks={projectFilterTasks}
								onApply={() => {
									void applyProjectFilterDraft()
									setFilterOpen(false)
								}}
								onReset={() => {
									void loadSavedFilterTasks(null)
									resetProjectFilterDraft()
									void applyProjectFilterDraft()
								}}
								onSavedFilterSelect={projectId => void handleSavedFilterSelect(projectId)}
								onManageFilters={() => {
									setFilterOpen(false)
									navigate('/filters')
								}}
							/>
						) : null}
						<BulkTaskEditor scopeKey={bulkScopeKey} />
						<InlineRootTaskComposer />
						<InlineRootProjectComposer placement="center" />
						{loadingProjects && visibleRootEntries.length === 0 ? <div className="empty-state">Loading projects...</div> : null}
						{visibleRootEntries.length > 0 ? (
						<ProjectTree
							countsByProjectId={countsByProjectId}
							rootProjects={visibleRootEntries}
							getChildren={projectId => (projectId < 0 ? [] : visibleProjectTree.getChildren(projectId))}
							previewTaskMatcher={previewTaskMatcher}
							previewTaskSortBy={projectFilters.taskSortBy}
							previewTaskBulkMode={bulkMode}
							/>
						) : null}
						{!loadingProjects && visibleRootEntries.length === 0 ? <div className="empty-state">No projects available.</div> : null}
					</div>
				</section>
			</div>
		</div>
	)
}

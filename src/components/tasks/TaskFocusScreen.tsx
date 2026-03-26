import StatusCards from '@/components/layout/StatusCards'
import Topbar from '@/components/layout/Topbar'
import BulkTaskEditor from '@/components/tasks/BulkTaskEditor'
import SubtaskComposer from '@/components/tasks/SubtaskComposer'
import TaskTree from '@/components/tasks/TaskTree'
import {defaultTaskFilters, taskMatchesFilters, taskMatchesProjectFilters} from '@/hooks/useFilters'
import {useShowCompletedProjectFilter, useShowCompletedTaskFilter} from '@/hooks/useShowCompleted'
import useWideLayout from '@/hooks/useWideLayout'
import {useAppStore} from '@/store'
import {findTaskInAnyContext, getSubtasksFor, getTaskCollectionForTask} from '@/store/selectors'
import type {Screen, Task} from '@/types'
import {formatOptionalLongDate} from '@/utils/formatting'
import {getMenuAnchor} from '@/utils/menuPosition'
import {useEffect, useMemo, useRef, useState} from 'react'

export default function TaskFocusScreen({sourceScreen}: {sourceScreen: Screen}) {
	const isWideLayout = useWideLayout()
	const focusedTaskId = useAppStore(state => state.focusedTaskId)
	const focusedTaskProjectId = useAppStore(state => state.focusedTaskProjectId)
	const currentTasksProjectId = useAppStore(state => state.currentTasksProjectId)
	const loadingTasks = useAppStore(state => state.loadingTasks)
	const taskFilters = useAppStore(state => state.taskFilters)
	const projectFilters = useAppStore(state => state.projectFilters)
	const recentlyCompletedTaskIds = useAppStore(state => state.recentlyCompletedTaskIds)
	const tasks = useAppStore(state => state.tasks)
	const todayTasks = useAppStore(state => state.todayTasks)
	const inboxTasks = useAppStore(state => state.inboxTasks)
	const upcomingTasks = useAppStore(state => state.upcomingTasks)
	const searchTasks = useAppStore(state => state.searchTasks)
	const savedFilterTasks = useAppStore(state => state.savedFilterTasks)
	const projectPreviewTasksById = useAppStore(state => state.projectPreviewTasksById)
	const projects = useAppStore(state => state.projects)
	const activeSubtaskParentId = useAppStore(state => state.activeSubtaskParentId)
	const activeSubtaskSource = useAppStore(state => state.activeSubtaskSource)
	const subtaskSubmittingParentId = useAppStore(state => state.subtaskSubmittingParentId)
	const getProjectAncestors = useAppStore(state => state.getProjectAncestors)
	const closeFocusedTask = useAppStore(state => state.closeFocusedTask)
	const loadTasks = useAppStore(state => state.loadTasks)
	const openInlineSubtaskComposer = useAppStore(state => state.openInlineSubtaskComposer)
	const closeInlineSubtaskComposer = useAppStore(state => state.closeInlineSubtaskComposer)
	const submitSubtask = useAppStore(state => state.submitSubtask)
	const taskDetailOpen = useAppStore(state => state.taskDetailOpen)
	const taskDetail = useAppStore(state => state.taskDetail)
	const openTaskDetail = useAppStore(state => state.openTaskDetail)
	const openBulkTaskEditor = useAppStore(state => state.openBulkTaskEditor)
	const taskShowCompleted = useShowCompletedTaskFilter(sourceScreen !== 'tasks')
	const projectShowCompleted = useShowCompletedProjectFilter()
	const [panelAnchor, setPanelAnchor] = useState<ReturnType<typeof getMenuAnchor> | null>(null)
	const syncedInspectorTaskIdRef = useRef<number | null>(null)
	const bulkScopeKey = focusedTaskId ? `task-focus:${sourceScreen}:${focusedTaskId}` : `task-focus:${sourceScreen}:0`
	const bulkMode = useAppStore(state => state.bulkTaskEditorScope === bulkScopeKey)
	const {showingCompleted, label: completedLabel, toggle: toggleShowCompleted} =
		sourceScreen === 'projects' ? projectShowCompleted : taskShowCompleted

	const fallbackCollections = useMemo(
		() => ({
			tasks,
			todayTasks,
			inboxTasks,
			upcomingTasks,
			searchTasks,
			savedFilterTasks,
			projectPreviewTasksById,
		}),
		[inboxTasks, projectPreviewTasksById, savedFilterTasks, searchTasks, tasks, todayTasks, upcomingTasks],
	)
	const projectPreviewFocusCollection = useMemo(() => {
		if (sourceScreen !== 'projects' || !focusedTaskProjectId) {
			return null
		}

		return Object.prototype.hasOwnProperty.call(projectPreviewTasksById, focusedTaskProjectId)
			? (projectPreviewTasksById[focusedTaskProjectId] || [])
			: null
	}, [focusedTaskProjectId, projectPreviewTasksById, sourceScreen])

	useEffect(() => {
		if (sourceScreen === 'projects') {
			return
		}
		if (!focusedTaskProjectId || currentTasksProjectId === focusedTaskProjectId || loadingTasks) {
			return
		}

		void loadTasks(focusedTaskProjectId)
	}, [currentTasksProjectId, focusedTaskProjectId, loadTasks, loadingTasks, sourceScreen])

	const fallbackTask = focusedTaskId ? findTaskInAnyContext(focusedTaskId, fallbackCollections) : null
	const focusCollection =
		focusedTaskId && focusedTaskProjectId
			? projectPreviewFocusCollection
				? projectPreviewFocusCollection
				: currentTasksProjectId === focusedTaskProjectId
				? tasks
				: getTaskCollectionForTask(focusedTaskId, focusedTaskProjectId, fallbackCollections)
			: tasks
	const focusedTask =
		(focusedTaskId ? focusCollection.find(task => task.id === focusedTaskId) : null) ||
		fallbackTask ||
		null
	const sortBy =
		sourceScreen === 'projects'
			? projectFilters.taskSortBy
			: sourceScreen === 'tasks' && currentTasksProjectId === focusedTaskProjectId
				? taskFilters.sortBy
				: defaultTaskFilters.sortBy
	const visibleTaskMatcher = useMemo(
		() => (task: Task) =>
			(sourceScreen === 'projects'
				? taskMatchesProjectFilters(task, projectFilters)
				: taskMatchesFilters(task, taskFilters)) ||
			recentlyCompletedTaskIds.has(task.id),
		[projectFilters, recentlyCompletedTaskIds, sourceScreen, taskFilters],
	)
	const subtasks = focusedTask ? getSubtasksFor(focusedTask, focusCollection, visibleTaskMatcher, sortBy) : []
	const descendantTasks = focusedTask ? collectTaskDescendants(focusedTask, focusCollection, visibleTaskMatcher, sortBy) : []
	const focusSubtaskComposerOpen = Boolean(
		focusedTask?.id && activeSubtaskParentId === focusedTask.id && activeSubtaskSource === 'focus',
	)
	const focusSubtaskSubmitting = Boolean(focusedTask?.id && subtaskSubmittingParentId === focusedTask.id)
	const projectPath = focusedTask ? getProjectAncestors(focusedTask.project_id).map(project => project.title) : []
	const taskPath = focusedTask ? buildTaskPath(focusedTask, focusCollection) : []
	const headerEyebrow = buildHeaderEyebrow(sourceScreen, projectPath, taskPath)
	const dueDateLabel = formatOptionalLongDate(focusedTask?.due_date || null)
	const projectTitle = projectPath[projectPath.length - 1] || focusedTask?.title || 'Task'

	useEffect(() => {
		setPanelAnchor(null)
	}, [focusedTask?.id])

	useEffect(() => {
		if (!isWideLayout || !focusedTask?.id) {
			syncedInspectorTaskIdRef.current = null
			return
		}

		if (syncedInspectorTaskIdRef.current === focusedTask.id) {
			return
		}

		syncedInspectorTaskIdRef.current = focusedTask.id
		if (!taskDetailOpen || taskDetail?.id !== focusedTask.id) {
			void openTaskDetail(focusedTask.id)
		}
	}, [focusedTask?.id, isWideLayout, openTaskDetail, taskDetail?.id, taskDetailOpen])

	if (!focusedTaskId) {
		return null
	}

	return (
		<div className="surface task-focus-surface">
			<Topbar
				backAction="close-focused-task"
				onBack={closeFocusedTask}
				title={projectTitle}
				eyebrow=""
				desktopHeadingTitle={projectTitle}
				desktopHeadingCount={subtasks.length ? `${subtasks.length} subtask${subtasks.length === 1 ? '' : 's'}` : null}
				onDismissTray={() => setPanelAnchor(null)}
				primaryAction={{
					action: 'open-focused-subtask-composer',
					label: 'Add subtask',
					text: '+',
					className: 'topbar-primary-add-button',
					onClick: () => focusedTask && openInlineSubtaskComposer(focusedTask.id, 'focus'),
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
									openInlineSubtaskComposer(focusedTaskId, 'focus')
								}}
							>
								Add subtask
							</button>
							<button
								className="menu-item"
								type="button"
								onClick={() => {
									setPanelAnchor(null)
									void openTaskDetail(focusedTaskId)
								}}
							>
								Edit task
							</button>
							<button
								className="menu-item"
								type="button"
								onClick={() => {
									setPanelAnchor(null)
									openBulkTaskEditor(bulkScopeKey)
								}}
							>
								Bulk edit
							</button>
							<button
								className={`menu-item ${showingCompleted ? 'is-active' : ''}`.trim()}
								type="button"
								onClick={() => {
									toggleShowCompleted()
									setPanelAnchor(null)
								}}
							>
								{completedLabel}
							</button>
						</div>
					) : null
				}
				actions={[
					{
						action: 'open-focused-task-menu',
						label: 'Menu',
						text: '⋯',
						className: 'topbar-overview-menu-button',
						active: Boolean(panelAnchor),
						menuToggle: true,
						onClick: event => {
							const anchor = getMenuAnchor(event.currentTarget)
							setPanelAnchor(current => (current ? null : anchor))
						},
					},
				]}
			/>
			<div className="surface-content">
				<StatusCards />
				<section className="panel screen-card">
					{isWideLayout ? (
						<div className="panel-head desktop-promoted-panel-head">
							<div className="panel-heading-inline">
								<h2 className="panel-title">{focusedTask?.title || 'Task'}</h2>
								{subtasks.length > 0 ? <div className="count-chip">{subtasks.length}</div> : null}
							</div>
						</div>
					) : null}
					<div className="screen-body">
						<BulkTaskEditor scopeKey={bulkScopeKey} />
						{!focusedTask && loadingTasks ? <div className="empty-state">Loading task…</div> : null}
						{focusedTask ? (
							<>
								<section className="task-focus-summary-card">
									<button
										className="task-focus-summary-button"
										type="button"
										data-action="open-focused-task-detail"
										data-task-id={focusedTask.id}
										onClick={() => void openTaskDetail(focusedTask.id)}
									>
										<div className="task-focus-summary-head">
										<div className="task-focus-summary-title">{focusedTask.title}</div>
										<div className="task-focus-summary-meta">
											{dueDateLabel ? <span>Due {dueDateLabel}</span> : null}
											{subtasks.length > 0 ? <span>{subtasks.length} subtasks</span> : null}
										</div>
										</div>
								{focusedTask.description ? <div className="task-focus-summary-copy">{focusedTask.description}</div> : null}
									</button>
								</section>
								{focusSubtaskComposerOpen ? (
									<SubtaskComposer
										className="detail-subtask-composer"
										formName="focus-subtask"
										inputDataAttrs={{'data-focus-subtask-input': focusedTask.id}}
										submitting={focusSubtaskSubmitting}
										onClose={closeInlineSubtaskComposer}
										onSubmit={title => submitSubtask(focusedTask.id, title)}
									/>
								) : null}
								{subtasks.length > 0 ? (
									<div className="task-focus-tree">
										<div className="project-preview-label">Subtasks</div>
										<TaskTree taskList={descendantTasks} matcher={visibleTaskMatcher} sortBy={sortBy} bulkMode={bulkMode} />
									</div>
								) : !loadingTasks ? (
									<div className="empty-state">No subtasks yet. Use the + button to add one.</div>
								) : null}
							</>
						) : null}
					</div>
				</section>
			</div>
		</div>
	)
}

function collectTaskDescendants(
	task: Task,
	taskList: Task[],
	matcher: (task: Task) => boolean,
	sortBy: typeof defaultTaskFilters.sortBy,
) {
	const collected: Task[] = []
	const seen = new Set<number>()

	function visit(parentTask: Task) {
		const children = getSubtasksFor(parentTask, taskList, matcher, sortBy)
		for (const child of children) {
			if (seen.has(child.id)) {
				continue
			}
			seen.add(child.id)
			collected.push(child)
			visit(child)
		}
	}

	visit(task)
	return collected
}

function buildTaskPath(task: Task, taskList: Task[]) {
	const titles: string[] = []
	let currentTask = task
	const visited = new Set<number>()

	while (currentTask.related_tasks?.parenttask?.[0] && !visited.has(currentTask.id)) {
		visited.add(currentTask.id)
		const parentRef = currentTask.related_tasks.parenttask[0]
		titles.unshift(parentRef.title)
		const parentTask = taskList.find(entry => entry.id === parentRef.id)
		if (!parentTask) {
			break
		}
		currentTask = parentTask
	}

	return titles
}

function buildHeaderEyebrow(sourceScreen: Screen, projectPath: string[], taskPath: string[]) {
	const sourceLabel =
		sourceScreen === 'today'
			? 'Today'
			: sourceScreen === 'inbox'
				? 'Inbox'
				: sourceScreen === 'upcoming'
					? 'Upcoming'
					: sourceScreen === 'projects'
						? 'Projects'
						: sourceScreen === 'search'
							? 'Search'
							: sourceScreen === 'filters'
								? 'Filters'
								: 'Project'

	return [sourceLabel, ...projectPath, ...taskPath].filter(Boolean).join(' / ')
}

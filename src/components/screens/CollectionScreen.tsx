import Topbar from '@/components/layout/Topbar'
import StatusCards from '@/components/layout/StatusCards'
import BulkTaskEditor from '@/components/tasks/BulkTaskEditor'
import TaskFocusScreen from '@/components/tasks/TaskFocusScreen'
import InlineRootTaskComposer from '@/components/tasks/InlineRootTaskComposer'
import TaskTree from '@/components/tasks/TaskTree'
import {taskMatchesFilters} from '@/hooks/useFilters'
import {useShowCompletedTaskFilter} from '@/hooks/useShowCompleted'
import {useAppStore} from '@/store'
import {getVisibleRootTasksFor} from '@/store/selectors'
import type {Screen, Task} from '@/types'
import {getMenuAnchor} from '@/utils/menuPosition'
import {useMemo, useState} from 'react'

interface CollectionScreenProps {
	bulkScopeKey: string
	compact?: boolean
	emptyMessage: string
	loading: boolean
	loadingMessage: string
	menuAction: string
	onOpenComposer: () => void
	sourceScreen: Extract<Screen, 'today' | 'inbox' | 'upcoming'>
	taskList: Task[]
	taskListEnabled?: boolean
	title: string
	unavailableMessage?: string | null
}

export default function CollectionScreen({
	bulkScopeKey,
	compact = false,
	emptyMessage,
	loading,
	loadingMessage,
	menuAction,
	onOpenComposer,
	sourceScreen,
	taskList,
	taskListEnabled = true,
	title,
	unavailableMessage = null,
}: CollectionScreenProps) {
	const recentlyCompletedTaskIds = useAppStore(state => state.recentlyCompletedTaskIds)
	const taskFilters = useAppStore(state => state.taskFilters)
	const focusedTaskId = useAppStore(state => state.focusedTaskId)
	const focusedTaskSourceScreen = useAppStore(state => state.focusedTaskSourceScreen)
	const openBulkTaskEditor = useAppStore(state => state.openBulkTaskEditor)
	const bulkMode = useAppStore(state => state.bulkTaskEditorScope === bulkScopeKey)
	const {showingCompleted, label: completedLabel, toggle: toggleShowCompleted} = useShowCompletedTaskFilter(true)
	const [panelAnchor, setPanelAnchor] = useState<ReturnType<typeof getMenuAnchor> | null>(null)

	const taskMatcher = useMemo(
		() => (task: Task) => taskMatchesFilters(task, taskFilters) || recentlyCompletedTaskIds.has(task.id),
		[recentlyCompletedTaskIds, taskFilters],
	)
	const rootTasks = getVisibleRootTasksFor(taskList, taskMatcher, taskFilters.sortBy)
	const showFocusedTask = Boolean(focusedTaskId && focusedTaskSourceScreen === sourceScreen)

	if (showFocusedTask) {
		return <TaskFocusScreen sourceScreen={sourceScreen} />
	}

	return (
		<div className="surface">
			<Topbar
				desktopHeadingTitle={title}
				desktopHeadingCount={rootTasks.length}
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
				onDismissTray={() => setPanelAnchor(null)}
				primaryAction={{
					action: 'open-root-composer',
					label: 'Add task',
					text: '+',
					className: 'topbar-primary-add-button',
					onClick: onOpenComposer,
				}}
				actions={[
					{
						action: menuAction,
						label: 'Menu',
						text: '⋯',
						className: 'topbar-overview-menu-button',
						active: Boolean(panelAnchor),
						menuToggle: true,
						onClick: event => setPanelAnchor(current => (current ? null : getMenuAnchor(event.currentTarget))),
					},
				]}
			/>
			<div className="surface-content">
				<StatusCards />
				<section className="panel screen-card">
					<div className="panel-head desktop-promoted-panel-head">
						<div className="panel-heading-inline">
							<h2 className="panel-title">{title}</h2>
							<div className="count-chip">{rootTasks.length}</div>
						</div>
					</div>
					<div className="screen-body">
						<BulkTaskEditor scopeKey={bulkScopeKey} />
						<InlineRootTaskComposer />
						{unavailableMessage ? <div className="empty-state">{unavailableMessage}</div> : null}
						{!unavailableMessage && loading && rootTasks.length === 0 ? <div className="empty-state">{loadingMessage}</div> : null}
						{!unavailableMessage && taskListEnabled && rootTasks.length > 0 ? (
							<TaskTree taskList={taskList} compact={compact} matcher={taskMatcher} bulkMode={bulkMode} />
						) : null}
						{!unavailableMessage && taskListEnabled && !loading && rootTasks.length === 0 ? (
							<div className="empty-state">{emptyMessage}</div>
						) : null}
					</div>
				</section>
			</div>
		</div>
	)
}

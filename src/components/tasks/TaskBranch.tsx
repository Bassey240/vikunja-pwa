import MoveToDateField from './MoveToDateField'
import SubtaskComposer from './SubtaskComposer'
import TaskCard from './TaskCard'
import TaskMenu from './TaskMenu'
import Caret from '@/components/common/Caret'
import type {TaskSortBy} from '@/hooks/useFilters'
import useWideLayout from '@/hooks/useWideLayout'
import {useAppStore} from '@/store'
import {
	canTaskUsePositionReorder,
	canTaskUseStructuralDrag,
	getSubtasksFor,
	type TaskMatcher,
} from '@/store/selectors'
import type {Task} from '@/types'
import {ScreenActiveContext} from '@/components/layout/ScreenActiveContext'
import {isTaskDropTraceTarget, markTaskDropTrace} from '@/utils/dragPerf'
import {getMenuAnchor} from '@/utils/menuPosition'
import {type CSSProperties, useContext, useLayoutEffect, useRef, useState} from 'react'

interface TaskBranchProps {
	task: Task
	depth: number
	taskList: Task[]
	parentTaskId?: number | null
	compact?: boolean
	matcher?: TaskMatcher
	sortBy?: TaskSortBy
	bulkMode?: boolean
	flat?: boolean
	onMoveToDate?: (task: Task) => void
	focusProjectIdOverride?: number | null
}

export default function TaskBranch({
	task,
	depth,
	taskList,
	parentTaskId = null,
	compact = false,
	matcher,
	sortBy = 'position',
	bulkMode = false,
	flat = false,
	onMoveToDate,
	focusProjectIdOverride = null,
}: TaskBranchProps) {
	const isWideLayout = useWideLayout()
	const openMenu = useAppStore(state => state.openMenu)
	const expandedTaskIds = useAppStore(state => state.expandedTaskIds)
	const togglingTaskIds = useAppStore(state => state.togglingTaskIds)
	const recentlyCompletedTaskIds = useAppStore(state => state.recentlyCompletedTaskIds)
	const screen = useAppStore(state => state.screen)
	const inboxProjectId = useAppStore(state => state.inboxProjectId)
	const activeSubtaskParentId = useAppStore(state => state.activeSubtaskParentId)
	const activeSubtaskSource = useAppStore(state => state.activeSubtaskSource)
	const subtaskSubmittingParentId = useAppStore(state => state.subtaskSubmittingParentId)
	const setOpenMenu = useAppStore(state => state.setOpenMenu)
	const toggleTaskExpanded = useAppStore(state => state.toggleTaskExpanded)
	const toggleTaskMenu = useAppStore(state => state.toggleTaskMenu)
	const toggleTaskDone = useAppStore(state => state.toggleTaskDone)
	const bulkSelectedTaskIds = useAppStore(state => state.bulkSelectedTaskIds)
	const toggleBulkTaskSelected = useAppStore(state => state.toggleBulkTaskSelected)
	const duplicateTask = useAppStore(state => state.duplicateTask)
	const deleteTask = useAppStore(state => state.deleteTask)
	const openFocusedTask = useAppStore(state => state.openFocusedTask)
	const openTaskDetail = useAppStore(state => state.openTaskDetail)
	const openInlineSubtaskComposer = useAppStore(state => state.openInlineSubtaskComposer)
	const closeInlineSubtaskComposer = useAppStore(state => state.closeInlineSubtaskComposer)
	const submitSubtask = useAppStore(state => state.submitSubtask)
	const rowRef = useRef<HTMLDivElement | null>(null)
	const [moveDateActive, setMoveDateActive] = useState(false)
	// Kept-warm hidden screens must not render this task's menu/picker (they'd
	// duplicate the active screen's body-level portal).
	const screenActive = useContext(ScreenActiveContext)

	const children = flat ? [] : getSubtasksFor(task, taskList, matcher, sortBy)
	const selfMatches = matcher ? matcher(task) : !task.done
	const expanded = expandedTaskIds.has(task.id)
	const menuOpen = screenActive && openMenu?.kind === 'task' && openMenu.id === task.id
	const toggling = togglingTaskIds.has(task.id)
	const recentlyCompleted = recentlyCompletedTaskIds.has(task.id)
	// Flat rows never expand, so the count comes from the task graph (total
	// subtasks) rather than what's in this list — open the task to see them.
	const childCount = flat ? (task.related_tasks?.subtask?.length ?? 0) : children.length
	const showToggle = !flat && childCount > 0
	const reorderable = canTaskUsePositionReorder(task, sortBy)
	const structuralDragEnabled = canTaskUseStructuralDrag(task)
	const subtaskComposerOpen = activeSubtaskParentId === task.id && activeSubtaskSource === 'list'
	const subtaskSubmitting = subtaskSubmittingParentId === task.id
	const bulkSelected = bulkSelectedTaskIds.has(task.id)
	const canComposeSubtasks =
		screen === 'tasks' ||
		screen === 'projects' ||
		screen === 'today' ||
		(screen === 'inbox' && inboxProjectId === task.project_id)
	const showChildrenWrap = !flat && (subtaskComposerOpen || (expanded && children.length > 0))
	const childDepth = selfMatches ? depth + 1 : depth

	useLayoutEffect(() => {
		const trace = isTaskDropTraceTarget(task.id, task.project_id, parentTaskId)
		if (!trace || !rowRef.current) {
			return
		}

		markTaskDropTrace(trace.token, 'destination-row-layout-effect', {
			parentTaskId,
			depth,
		})

		let frameId = requestAnimationFrame(() => {
			frameId = requestAnimationFrame(() => {
				const row = rowRef.current
				if (!row?.isConnected) {
					return
				}

				const rect = row.getBoundingClientRect()
				markTaskDropTrace(trace.token, 'first-destination-paint', {
					parentTaskId,
					depth,
					top: Math.round(rect.top),
					height: Math.round(rect.height),
				})
			})
		})

		return () => {
			cancelAnimationFrame(frameId)
		}
	}, [depth, parentTaskId, task.id, task.project_id])

	return (
		<div
			className={`task-branch ${menuOpen ? 'is-menu-open' : ''}`.trim()}
			style={{'--depth': depth} as CSSProperties}
			data-task-branch-id={task.id}
		>
			{selfMatches ? (
				<div
					ref={rowRef}
					className={[
						'task-row',
						task.done ? 'is-done' : '',
						recentlyCompleted ? 'is-completing' : '',
						compact ? 'is-compact' : '',
						reorderable ? 'is-reorderable' : '',
						bulkMode ? 'is-bulk-mode' : '',
						bulkSelected ? 'is-bulk-selected' : '',
						depth === 0 ? 'is-root-depth' : 'is-nested-depth',
					]
						.filter(Boolean)
						.join(' ')}
					data-task-row-id={task.id}
				>
					<div className={`task-leading ${showToggle ? 'has-toggle' : 'has-no-toggle'}`}>
						{showToggle ? (
							<button
								className="task-toggle-end"
								data-action="toggle-task"
								data-task-id={task.id}
								type="button"
								onClick={() => toggleTaskExpanded(task.id)}
							>
								<Caret expanded={expanded} />
							</button>
						) : null}
						{bulkMode ? (
							<button
								className={`bulk-select-checkbox ${bulkSelected ? 'is-checked' : ''}`.trim()}
								data-action="toggle-bulk-select"
								data-task-id={task.id}
								aria-checked={bulkSelected ? 'true' : 'false'}
								role="checkbox"
								type="button"
								onClick={() => toggleBulkTaskSelected(task.id)}
							>
								{bulkSelected ? '✓' : ''}
							</button>
						) : (
							<button
								className={`checkbox-button ${task.done ? 'is-checked' : ''}`.trim()}
								data-action="toggle-done"
								data-task-id={task.id}
								aria-checked={task.done ? 'true' : 'false'}
								role="checkbox"
								disabled={toggling}
								type="button"
								onClick={() => void toggleTaskDone(task.id)}
							>
								{task.done ? '✓' : ''}
							</button>
						)}
					</div>
					<button
						className="task-main"
						data-action={bulkMode ? 'toggle-bulk-select-main' : 'open-task-focus'}
						data-task-id={task.id}
						type="button"
						onClick={() => {
							if (bulkMode) {
								toggleBulkTaskSelected(task.id)
								return
							}
							if (isWideLayout) {
								void openTaskDetail(task.id)
							}
							openFocusedTask(task.id, focusProjectIdOverride || task.project_id, screen)
						}}
					>
						<TaskCard task={task} childCount={childCount} compact={compact} />
					</button>
					{structuralDragEnabled && !bulkMode ? (
						<div
							className="drag-handle"
							aria-hidden="true"
						>
							<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
								<circle cx="2.5" cy="2.5" r="1.5" />
								<circle cx="7.5" cy="2.5" r="1.5" />
								<circle cx="2.5" cy="8" r="1.5" />
								<circle cx="7.5" cy="8" r="1.5" />
								<circle cx="2.5" cy="13.5" r="1.5" />
								<circle cx="7.5" cy="13.5" r="1.5" />
							</svg>
						</div>
					) : null}
					{!bulkMode ? (
						<button
							className="menu-button"
							data-action="toggle-task-menu"
							data-task-id={task.id}
							data-menu-toggle="true"
							type="button"
							onClick={event => toggleTaskMenu(task.id, getMenuAnchor(event.currentTarget))}
						>
							⋮
						</button>
					) : null}
				</div>
			) : null}
			{selfMatches && !bulkMode && menuOpen && openMenu.kind === 'task' ? (
				<TaskMenu
					task={task}
					anchor={openMenu.anchor}
					showAddSubtask={canComposeSubtasks}
					onAddSubtask={() => {
						setOpenMenu(null)
						openInlineSubtaskComposer(task.id, 'list')
					}}
					extraItems={[{
						action: 'move-task-to-date',
						label: 'Move to date',
						onClick: () => {
							setOpenMenu(null)
							// Calendar passes onMoveToDate to host its large date overlay;
							// elsewhere fall back to an inline picker on the row.
							if (onMoveToDate) {
								onMoveToDate(task)
							} else {
								setMoveDateActive(true)
							}
						},
					}]}
					onEdit={() => openTaskDetail(task.id)}
					onDuplicate={() => void duplicateTask(task.id)}
					onDelete={() => void deleteTask(task.id)}
				/>
			) : null}
			{moveDateActive && screenActive ? (
				<MoveToDateField task={task} onClose={() => setMoveDateActive(false)} />
			) : null}
			{showChildrenWrap ? (
				<div className="task-children-wrap">
					{canComposeSubtasks && subtaskComposerOpen ? (
						<SubtaskComposer
							closeAction="close-subtask"
							formDataAttrs={{'data-parent-task-id': task.id}}
							formName="subtask"
							inputDataAttrs={{'data-subtask-input': task.id}}
							submitting={subtaskSubmitting}
							onClose={closeInlineSubtaskComposer}
							onSubmit={title => submitSubtask(task.id, title)}
						/>
					) : null}
					{children.map(child => (
						<TaskBranch
							key={child.id}
							task={child}
							depth={childDepth}
							taskList={taskList}
							parentTaskId={task.id}
							compact={compact}
							matcher={matcher}
							sortBy={sortBy}
							bulkMode={bulkMode}
							focusProjectIdOverride={focusProjectIdOverride}
						/>
					))}
				</div>
			) : null}
		</div>
	)
}

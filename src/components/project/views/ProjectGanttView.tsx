import {api} from '@/api'
import UserAvatar from '@/components/common/UserAvatar'
import CompactDatePicker from '@/components/common/CompactDatePicker'
import GanttBarTooltip from '@/components/project/views/gantt/GanttBarTooltip'
import GanttDependencyArrows from '@/components/project/views/gantt/GanttDependencyArrows'
import {useGanttBarDrag} from '@/components/project/views/gantt/gantt-drag'
import TaskMenu from '@/components/tasks/TaskMenu'
import {
	buildGanttPresets,
	buildTimeline,
	DAY_MS,
	endOfDay,
	type DatedEntry,
	fromDateInputValue,
	getBarColorStyle,
	getBarGridPosition,
	type GanttSort,
	getTaskPercentDone,
	type GanttZoom,
	MAX_TIMELINE_DAYS_BY_ZOOM,
	startOfDay,
	toDateInputValue,
} from '@/components/project/views/gantt/gantt-helpers'
import {useAppStore} from '@/store'
import type {Task} from '@/types'
import {DEFAULT_LABEL_BG} from '@/utils/color-constants'
import {getMenuAnchor} from '@/utils/menuPosition'
import {formatShortDate, normalizeHexColor, normalizeTaskDateValue} from '@/utils/formatting'
import {Fragment, useCallback, useEffect, useMemo, useRef, useState} from 'react'

export default function ProjectGanttView({
	projectId,
	tasks,
	focusProjectIdOverride = null,
}: {
	projectId: number
	tasks: Task[]
	focusProjectIdOverride?: number | null
}) {
	const offlineReadOnlyMode = useAppStore(state => state.offlineReadOnlyMode)
	const openFocusedTask = useAppStore(state => state.openFocusedTask)
	const openTaskDetail = useAppStore(state => state.openTaskDetail)
	const refreshCurrentCollections = useAppStore(state => state.refreshCurrentCollections)
	const openMenu = useAppStore(state => state.openMenu)
	const setOpenMenu = useAppStore(state => state.setOpenMenu)
	const toggleTaskMenu = useAppStore(state => state.toggleTaskMenu)
	const duplicateTask = useAppStore(state => state.duplicateTask)
	const deleteTask = useAppStore(state => state.deleteTask)
	const setError = useAppStore(state => state.setError)
	const setOfflineActionNotice = useAppStore(state => state.setOfflineActionNotice)
	const [showTasksWithoutDates, setShowTasksWithoutDates] = useState(false)
	const [composerOpen, setComposerOpen] = useState(false)
	const [title, setTitle] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [zoom, setZoom] = useState<GanttZoom>('day')
	const [sortBy, setSortBy] = useState<GanttSort>('start_date')
	const [hoveredTaskId, setHoveredTaskId] = useState<number | null>(null)
	const [dragOverrides, setDragOverrides] = useState<Map<number, {start: Date; end: Date}>>(new Map())
	const gridRef = useRef<HTMLDivElement | null>(null)

	const datedTasks = useMemo(() => {
		return tasks
			.map(task => {
				const startValue =
					normalizeTaskDateValue(task.start_date || null) ||
					normalizeTaskDateValue(task.due_date || null) ||
					normalizeTaskDateValue(task.end_date || null) ||
					null
				const endValue =
					normalizeTaskDateValue(task.end_date || null) ||
					normalizeTaskDateValue(task.due_date || null) ||
					normalizeTaskDateValue(task.start_date || null) ||
					null
				if (!startValue || !endValue) {
					return null
				}

				const start = startOfDay(startValue)
				const end = startOfDay(endValue)
				if (!start || !end) {
					return null
				}

				return {
					task,
					start,
					end: end >= start ? end : start,
				}
			})
			.filter(Boolean) as DatedEntry[]
	}, [tasks])

	const undatedTasks = useMemo(
		() => tasks.filter(task =>
			!normalizeTaskDateValue(task.start_date || null) &&
			!normalizeTaskDateValue(task.due_date || null) &&
			!normalizeTaskDateValue(task.end_date || null),
		),
		[tasks],
	)

	const defaultRange = useMemo(() => {
		if (datedTasks.length === 0) {
			const today = startOfDay(new Date()) || new Date()
			const nextWeek = new Date(today.getTime() + 7 * DAY_MS)
			return {
				from: toDateInputValue(today),
				to: toDateInputValue(nextWeek),
			}
		}

		const sortedEntries = [...datedTasks].sort((left, right) => left.start.getTime() - right.start.getTime())
		const minStart = sortedEntries[0].start
		const maxEnd = sortedEntries.reduce((latest, entry) => (entry.end > latest ? entry.end : latest), sortedEntries[0].end)
		return {
			from: toDateInputValue(minStart),
			to: toDateInputValue(maxEnd),
		}
	}, [datedTasks])

	const [rangeFrom, setRangeFrom] = useState(defaultRange.from)
	const [rangeTo, setRangeTo] = useState(defaultRange.to)

	useEffect(() => {
		setRangeFrom(defaultRange.from)
		setRangeTo(defaultRange.to)
	}, [defaultRange.from, defaultRange.to])

	const rangeFromDate = useMemo(() => fromDateInputValue(rangeFrom), [rangeFrom])
	const rangeToDate = useMemo(() => fromDateInputValue(rangeTo), [rangeTo])
	const normalizedRange = useMemo(() => {
		if (!rangeFromDate || !rangeToDate) {
			return {from: null, to: null, clamped: false}
		}

		const from = rangeFromDate <= rangeToDate ? rangeFromDate : rangeToDate
		const rawTo = rangeFromDate <= rangeToDate ? rangeToDate : rangeFromDate
		const maxTo = new Date(from.getTime() + (MAX_TIMELINE_DAYS_BY_ZOOM[zoom] - 1) * DAY_MS)
		const to = rawTo > maxTo ? maxTo : rawTo
		return {
			from,
			to,
			clamped: rawTo > maxTo,
		}
	}, [rangeFromDate, rangeToDate, zoom])

	const visibleDatedTasks = useMemo(() => {
		return datedTasks.filter(entry => {
			if (!normalizedRange.from || !normalizedRange.to) {
				return true
			}

			return entry.end >= normalizedRange.from && entry.start <= normalizedRange.to
		})
	}, [datedTasks, normalizedRange.from, normalizedRange.to])

	const timeline = useMemo(
		() => buildTimeline(normalizedRange.from, normalizedRange.to, zoom),
		[normalizedRange.from, normalizedRange.to, zoom],
	)
	const presets = useMemo(() => buildGanttPresets(), [])
	const columnMinWidth = zoom === 'day' ? '42px' : zoom === 'week' ? '64px' : '90px'
	const taskById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks])

	const openTask = useCallback((task: Task) => {
		void openTaskDetail(task.id)
	}, [openTaskDetail])

	const handleDragUpdate = useCallback((taskId: number, startDate: Date, endDate: Date) => {
		setDragOverrides(prev => {
			const next = new Map(prev)
			next.set(taskId, {
				start: new Date(startDate.getTime()),
				end: new Date(endDate.getTime()),
			})
			return next
		})
	}, [])

	const handleDragEnd = useCallback(async (taskId: number, startDate: Date, endDate: Date) => {
		const sourceTask = taskById.get(taskId) || null
		setDragOverrides(prev => {
			const next = new Map(prev)
			next.delete(taskId)
			return next
		})

		if (offlineReadOnlyMode) {
			setError(null)
			setOfflineActionNotice("You're offline. Reconnect to update tasks.")
			return
		}

		try {
			await api(`/api/tasks/${taskId}`, {
				method: 'POST',
				body: {
					title: sourceTask?.title,
					start_date: startDate.toISOString(),
					end_date: endOfDay(endDate).toISOString(),
					priority: sourceTask?.priority ?? 0,
					done: sourceTask?.done === true,
				},
			})
			await refreshCurrentCollections()
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Unable to update task dates.')
		}
	}, [offlineReadOnlyMode, refreshCurrentCollections, setError, setOfflineActionNotice, taskById])

	const {activeDrag, getBarPointerProps, shouldSuppressClick} = useGanttBarDrag({
		zoom,
		onDragUpdate: handleDragUpdate,
		onDragEnd: handleDragEnd,
	})

	const displayedEntries = useMemo(() => {
		const stableStartByTaskId = new Map(visibleDatedTasks.map(entry => [entry.task.id, entry.start.getTime()]))
		const entries = visibleDatedTasks.map(entry => {
			const override = dragOverrides.get(entry.task.id)
			if (!override) {
				return entry
			}

			return {
				...entry,
				start: override.start,
				end: override.end,
			}
		})

		const sortedEntries = [...entries]
		sortedEntries.sort((left, right) => {
			switch (sortBy) {
				case 'priority':
					return Number(right.task.priority || 0) - Number(left.task.priority || 0) ||
						left.start.getTime() - right.start.getTime()
				case 'title':
					return left.task.title.localeCompare(right.task.title) ||
						left.start.getTime() - right.start.getTime()
				case 'percent_done':
					return getTaskPercentDone(right.task) - getTaskPercentDone(left.task) ||
						left.start.getTime() - right.start.getTime()
				case 'start_date':
				default:
					return (
						(activeDrag?.taskId && activeDrag.taskId === left.task.id
							? stableStartByTaskId.get(left.task.id) ?? left.start.getTime()
							: left.start.getTime()) -
						(activeDrag?.taskId && activeDrag.taskId === right.task.id
							? stableStartByTaskId.get(right.task.id) ?? right.start.getTime()
							: right.start.getTime())
					) ||
						left.task.title.localeCompare(right.task.title)
			}
		})
		return sortedEntries
	}, [activeDrag?.taskId, dragOverrides, sortBy, visibleDatedTasks])

	async function handleCreateTask() {
		const trimmedTitle = title.trim()
		if (!trimmedTitle || !projectId || submitting) {
			return
		}

		if (offlineReadOnlyMode) {
			setError(null)
			setOfflineActionNotice("You're offline. Reconnect to create tasks.")
			return
		}

		setSubmitting(true)
		try {
			await api(`/api/projects/${projectId}/tasks`, {
				method: 'POST',
				body: {
					title: trimmedTitle,
					start_date: rangeFromDate ? rangeFromDate.toISOString() : null,
					end_date: rangeToDate ? endOfDay(rangeToDate).toISOString() : null,
					due_date: rangeToDate ? endOfDay(rangeToDate).toISOString() : null,
				},
			})
			setTitle('')
			setComposerOpen(false)
			await refreshCurrentCollections()
		} finally {
			setSubmitting(false)
		}
	}

	if (datedTasks.length === 0 && !showTasksWithoutDates && undatedTasks.length === 0) {
		return <div className="empty-state">No dated tasks in this Gantt view yet.</div>
	}

	return (
		<div className="project-gantt-view">
			<div className="project-gantt-toolbar">
				<div className="project-gantt-range-pickers">
					<CompactDatePicker label="From" value={rangeFrom} onChange={setRangeFrom} />
					<CompactDatePicker label="To" value={rangeTo} onChange={setRangeTo} />
				</div>
				<div className="project-gantt-toolbar-actions">
					<div className="gantt-zoom-toggle">
						{(['day', 'week', 'month'] as const).map(level => (
							<button
								key={level}
								className={`pill-button subtle${zoom === level ? ' is-active' : ''}`.trim()}
								type="button"
								onClick={() => setZoom(level)}
							>
								{level.charAt(0).toUpperCase() + level.slice(1)}
							</button>
						))}
					</div>
					<select className="gantt-sort-select" value={sortBy} onChange={event => setSortBy(event.currentTarget.value as GanttSort)}>
						<option value="start_date">Sort by start date</option>
						<option value="priority">Sort by priority</option>
						<option value="title">Sort by title</option>
						<option value="percent_done">Sort by progress</option>
					</select>
					<label className="gantt-checkbox-field">
						<input type="checkbox" checked={showTasksWithoutDates} onChange={event => setShowTasksWithoutDates(event.currentTarget.checked)} />
						<span>Show tasks without dates</span>
					</label>
					<button className="pill-button subtle" type="button" onClick={() => {
						setRangeFrom(defaultRange.from)
						setRangeTo(defaultRange.to)
					}}>
						Reset
					</button>
					<button className={`pill-button subtle ${composerOpen ? ' is-active' : ''}`.trim()} type="button" onClick={() => setComposerOpen(open => !open)}>
						Add task
					</button>
				</div>
			</div>
			<div className="project-gantt-presets">
				{presets.map(preset => (
					<button
						key={preset.label}
						className="pill-button subtle"
						type="button"
						onClick={() => {
							setRangeFrom(preset.from)
							setRangeTo(preset.to)
						}}
					>
						{preset.label}
					</button>
				))}
			</div>
			{composerOpen ? (
				<form
					className="project-gantt-composer"
					onSubmit={event => {
						event.preventDefault()
						void handleCreateTask()
					}}
				>
					<input
						className="detail-input"
						type="text"
						placeholder="Task name"
						value={title}
						onChange={event => setTitle(event.currentTarget.value)}
					/>
					<div className="inline-composer-helper">
						New tasks default to {rangeFrom} through {rangeTo}
					</div>
					<div className="inline-composer-actions">
						<button className="composer-submit" type="submit" disabled={submitting}>
							{submitting ? 'Saving…' : 'Create task'}
						</button>
						<button className="ghost-button" type="button" onClick={() => setComposerOpen(false)}>
							Done
						</button>
					</div>
				</form>
			) : null}
			{normalizedRange.clamped ? (
				<div className="inline-composer-helper">
					Gantt rendering is limited to the first {MAX_TIMELINE_DAYS_BY_ZOOM[zoom]} days of the selected range.
				</div>
			) : null}
			<div className="project-gantt-scroll">
				<div className="project-gantt-grid-shell">
					<div
						ref={gridRef}
						className="project-gantt-grid"
						style={{gridTemplateColumns: `104px repeat(${Math.max(1, timeline.length)}, minmax(${columnMinWidth}, 1fr))`}}
					>
						<div className="project-gantt-corner">Meta</div>
						{timeline.map(column => (
							<div
								key={column.key}
								className={`project-gantt-day${column.isToday ? ' is-today' : ''}${column.isWeekend ? ' is-weekend' : ''}`.trim()}
							>
								{column.label}
							</div>
						))}
						{displayedEntries.map(entry => {
							const position = getBarGridPosition(entry, timeline)
							if (!position) {
								return null
							}

							const labels = Array.isArray(entry.task.labels) ? entry.task.labels.filter(label => label?.id) : []
							const assignees = Array.isArray(entry.task.assignees) ? entry.task.assignees.filter(assignee => assignee?.id) : []
							const visibleAssignees = assignees.slice(0, 2)
							const assigneeOverflow = assignees.length - visibleAssignees.length
							const visibleLabels = labels.slice(0, 2)
							const percentDone = getTaskPercentDone(entry.task)
							const isDragging = activeDrag?.taskId === entry.task.id
							const isHovering = hoveredTaskId === entry.task.id && !isDragging
							const menuOpen = openMenu?.kind === 'task' && openMenu.id === entry.task.id

							return (
								<Fragment key={entry.task.id}>
									<button
										className={`project-gantt-task-label${entry.task.done ? ' is-done' : ''}`.trim()}
										type="button"
										onClick={() => openTask(entry.task)}
									>
										<span className="gantt-task-label-kicker">#{entry.task.id}</span>
										<span className="gantt-task-label-meta">
											{entry.task.done
												? 'Done'
												: entry.task.priority
													? `P${entry.task.priority}`
													: percentDone > 0
														? `${percentDone}%`
														: 'Task'}
										</span>
									</button>
									<div className="project-gantt-task-track">
										<div
											data-gantt-task-id={entry.task.id}
											className={`project-gantt-task-bar${entry.task.done ? ' is-done' : ''}${isDragging ? ' is-dragging' : ''}`.trim()}
											style={{
												gridColumnStart: position.gridColumnStart,
												gridColumnEnd: position.gridColumnEnd,
												...getBarColorStyle(entry.task),
											}}
											onClick={() => {
												if (shouldSuppressClick(entry.task.id)) {
													return
												}
												openTask(entry.task)
											}}
											onMouseEnter={() => setHoveredTaskId(entry.task.id)}
											onMouseLeave={() => setHoveredTaskId(current => (current === entry.task.id ? null : current))}
											{...getBarPointerProps(entry.task.id, entry.start, entry.end)}
										>
											{percentDone > 0 ? (
												<div
													className="gantt-bar-progress"
													style={{width: `${percentDone}%`}}
												/>
											) : null}
											<div className="gantt-bar-content">
												<span className="gantt-bar-label">{entry.task.title}</span>
												{visibleLabels.length > 0 ? (
													<span className="gantt-bar-labels">
														{visibleLabels.map(label => (
															<span key={label.id} className="gantt-bar-label-chip">
																<span
																	className="gantt-bar-label-chip-dot"
																	style={{background: normalizeHexColor(label.hex_color || label.hexColor || '') || DEFAULT_LABEL_BG}}
																/>
																<span className="gantt-bar-label-chip-text">{label.title}</span>
															</span>
														))}
														{labels.length > visibleLabels.length ? (
															<span className="gantt-bar-label-chip gantt-bar-label-chip-overflow">+{labels.length - visibleLabels.length}</span>
														) : null}
													</span>
												) : null}
											</div>
											{assignees.length > 0 ? (
												<span className="gantt-bar-avatars">
													{visibleAssignees.map(assignee => (
														<UserAvatar key={assignee.id} user={assignee} size={18} />
													))}
													{assigneeOverflow > 0 ? <span className="gantt-bar-avatar-overflow">+{assigneeOverflow}</span> : null}
												</span>
											) : null}
											<button
												className="menu-button gantt-bar-menu-button"
												data-action="toggle-gantt-task-menu"
												data-task-id={entry.task.id}
												data-menu-toggle="true"
												type="button"
												aria-label={`Task actions for ${entry.task.title}`}
												onPointerDown={event => {
													event.preventDefault()
													event.stopPropagation()
												}}
												onClick={event => {
													event.preventDefault()
													event.stopPropagation()
													toggleTaskMenu(entry.task.id, getMenuAnchor(event.currentTarget))
												}}
											>
												⋯
											</button>
											{isDragging ? (
												<div className="gantt-drag-tooltip">
													{formatShortDate(entry.start)} — {formatShortDate(entry.end)}
												</div>
											) : null}
											{isHovering ? (
												<GanttBarTooltip task={entry.task} startDate={entry.start} endDate={entry.end} />
											) : null}
										</div>
									</div>
									{menuOpen && openMenu.kind === 'task' ? (
										<TaskMenu
											task={entry.task}
											anchor={openMenu.anchor}
											extraItems={[
												{
													action: 'open-gantt-task-focus',
													label: 'Open focus view',
													onClick: () => {
														setOpenMenu(null)
														void openTaskDetail(entry.task.id)
														openFocusedTask(entry.task.id, focusProjectIdOverride || entry.task.project_id, 'tasks')
													},
												},
											]}
											onEdit={() => {
												setOpenMenu(null)
												void openTaskDetail(entry.task.id)
											}}
											onDuplicate={() => {
												setOpenMenu(null)
												void duplicateTask(entry.task.id)
											}}
											onDelete={() => {
												setOpenMenu(null)
												void deleteTask(entry.task.id)
											}}
										/>
									) : null}
								</Fragment>
							)
						})}
					</div>
					<GanttDependencyArrows entries={displayedEntries} gridRef={gridRef} />
				</div>
			</div>
			{showTasksWithoutDates && undatedTasks.length > 0 ? (
				<section className="project-gantt-undated">
					<div className="project-preview-label">Tasks without dates</div>
					<div className="project-gantt-undated-list">
						{undatedTasks.map(task => (
							<button
								key={task.id}
								className="project-gantt-undated-item"
								type="button"
								onClick={() => openTask(task)}
							>
								{task.title}
							</button>
						))}
					</div>
				</section>
			) : null}
		</div>
	)
}

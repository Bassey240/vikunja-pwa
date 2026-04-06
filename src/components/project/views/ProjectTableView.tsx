import ContextMenu from '@/components/common/ContextMenu'
import TaskFilterPanel from '@/components/filters/TaskFilterPanel'
import {getTaskFilterUiConfig, hasActiveTaskFilters, taskMatchesFilters, type TaskSortBy} from '@/hooks/useFilters'
import {useAppStore} from '@/store'
import type {MenuAnchor, Task} from '@/types'
import {
	formatOptionalLongDate,
	getUserInitials,
	normalizePercentDone,
} from '@/utils/formatting'
import {normalizeLabelColor, pickLabelTextColor} from '@/utils/color-helpers'
import {getMenuAnchor} from '@/utils/menuPosition'
import {useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'

type TableColumnId =
	| 'index'
	| 'done'
	| 'project'
	| 'title'
	| 'priority'
	| 'labels'
	| 'assignees'
	| 'commentCount'
	| 'dueDate'
	| 'startDate'
	| 'endDate'
	| 'percentDone'
	| 'doneAt'
	| 'created'
	| 'updated'
	| 'createdBy'

interface TableColumn {
	id: TableColumnId
	label: string
	sortKey?: TaskSortBy | 'id' | 'comment_count' | 'start_date' | 'end_date'
}

const TABLE_COLUMNS: TableColumn[] = [
	{id: 'index', label: '#', sortKey: 'id'},
	{id: 'done', label: 'Done'},
	{id: 'project', label: 'Project'},
	{id: 'title', label: 'Title', sortKey: 'title'},
	{id: 'priority', label: 'Priority', sortKey: 'priority'},
	{id: 'labels', label: 'Labels'},
	{id: 'assignees', label: 'Assignees'},
	{id: 'commentCount', label: 'Comments', sortKey: 'comment_count'},
	{id: 'dueDate', label: 'Due', sortKey: 'due_date'},
	{id: 'startDate', label: 'Start', sortKey: 'start_date'},
	{id: 'endDate', label: 'End', sortKey: 'end_date'},
	{id: 'percentDone', label: 'Progress', sortKey: 'percent_done'},
	{id: 'doneAt', label: 'Done at', sortKey: 'done_at'},
	{id: 'created', label: 'Created', sortKey: 'created'},
	{id: 'updated', label: 'Updated', sortKey: 'updated'},
	{id: 'createdBy', label: 'Created by'},
]

const DEFAULT_VISIBLE_COLUMNS: TableColumnId[] = ['index', 'done', 'title', 'labels', 'assignees', 'dueDate']

export default function ProjectTableView({
	projectId,
	tasks,
	focusProjectIdOverride = null,
}: {
	projectId: number
	tasks: Task[]
	focusProjectIdOverride?: number | null
}) {
	const navigate = useNavigate()
	const projects = useAppStore(state => state.projects)
	const taskFilters = useAppStore(state => state.taskFilters)
	const ensureLabelsLoaded = useAppStore(state => state.ensureLabelsLoaded)
	const syncTaskFilterDraftFromActive = useAppStore(state => state.syncTaskFilterDraftFromActive)
	const applyTaskFilterDraft = useAppStore(state => state.applyTaskFilterDraft)
	const resetTaskFilterDraft = useAppStore(state => state.resetTaskFilterDraft)
	const loadSavedFilterTasks = useAppStore(state => state.loadSavedFilterTasks)
	const openFocusedTask = useAppStore(state => state.openFocusedTask)
	const openTaskDetail = useAppStore(state => state.openTaskDetail)
	const [columnsAnchor, setColumnsAnchor] = useState<MenuAnchor | null>(null)
	const [filterOpen, setFilterOpen] = useState(false)
	const [visibleColumns, setVisibleColumns] = useState<TableColumnId[]>(DEFAULT_VISIBLE_COLUMNS)
	const [sort, setSort] = useState<{key: TableColumn['sortKey']; order: 'asc' | 'desc'}>({
		key: 'id',
		order: 'desc',
	})
	const taskFilterConfig = getTaskFilterUiConfig('tasks')
	void projectId

	const effectiveTaskFilters = useMemo(
		() => (hasActiveTaskFilters(taskFilters) ? taskFilters : {...taskFilters, status: 'all' as const}),
		[taskFilters],
	)

	const filteredTasks = useMemo(
		() => tasks.filter(task => taskMatchesFilters(task, effectiveTaskFilters)),
		[tasks, effectiveTaskFilters],
	)

	const sortedTasks = useMemo(() => {
		const nextTasks = filteredTasks.slice()
		nextTasks.sort((left, right) => compareTasks(left, right, sort.key, sort.order))
		return nextTasks
	}, [filteredTasks, sort])

	function toggleColumn(columnId: TableColumnId) {
		setVisibleColumns(current =>
			current.includes(columnId)
				? current.filter(entry => entry !== columnId)
				: [...current, columnId],
		)
	}

	function toggleSort(column: TableColumn) {
		if (!column.sortKey) {
			return
		}

		setSort(current => ({
			key: column.sortKey,
			order: current.key === column.sortKey && current.order === 'asc' ? 'desc' : 'asc',
		}))
	}

	if (tasks.length === 0) {
		return <div className="empty-state">No tasks in this table view yet.</div>
	}

	return (
		<div className="project-table-view">
			<div className="project-view-toolbar">
				<button
					className={`pill-button subtle ${columnsAnchor ? 'is-active' : ''}`.trim()}
					type="button"
					data-menu-toggle="true"
					onClick={event => {
						const anchor = getMenuAnchor(event.currentTarget)
						setColumnsAnchor(current => (current ? null : anchor))
					}}
				>
					Columns
				</button>
				<button
					className={`pill-button subtle ${filterOpen ? 'is-active' : ''}`.trim()}
					type="button"
					onClick={() => {
						const opening = !filterOpen
						setFilterOpen(open => !open)
						if (opening) {
							syncTaskFilterDraftFromActive(taskFilterConfig.allowProject)
							void ensureLabelsLoaded()
						}
					}}
				>
					Filters
				</button>
			</div>
			{filterOpen ? (
				<TaskFilterPanel
					screen="tasks"
					allowProject={taskFilterConfig.allowProject}
					visibleTaskList={tasks}
					onApply={() => {
						void applyTaskFilterDraft(taskFilterConfig.allowProject)
						setFilterOpen(false)
					}}
					onReset={() => {
						if (projectId > 0) {
							void loadSavedFilterTasks(null)
						}
						resetTaskFilterDraft()
						void applyTaskFilterDraft(taskFilterConfig.allowProject)
					}}
					onSavedFilterSelect={selectedProjectId => {
						void loadSavedFilterTasks(selectedProjectId)
						setFilterOpen(false)
						if (selectedProjectId) {
							navigate(`/projects/${selectedProjectId}`)
						}
					}}
					onManageFilters={() => {
						setFilterOpen(false)
						navigate('/filters')
					}}
				/>
			) : null}
			<div className="project-table-scroll">
				<table className="project-table-grid">
					<thead>
						<tr>
							{TABLE_COLUMNS.filter(column => visibleColumns.includes(column.id)).map(column => (
								<th key={column.id}>
									<button
										className={`project-table-header-button ${column.sortKey ? 'is-sortable' : ''}`.trim()}
										type="button"
										onClick={() => toggleSort(column)}
									>
										<span>{column.label}</span>
										{column.sortKey ? (
											<span className="project-table-sort-indicator">
												{sort.key === column.sortKey ? (sort.order === 'asc' ? '↑' : '↓') : '↕'}
											</span>
										) : null}
									</button>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{sortedTasks.map(task => (
							<tr key={task.id}>
								{visibleColumns.includes('index') ? <td>{task.identifier || `#${task.index || task.id}`}</td> : null}
								{visibleColumns.includes('done') ? <td>{task.done ? <span className="table-done-pill">Done</span> : '—'}</td> : null}
								{visibleColumns.includes('project') ? <td>{projects.find(project => project.id === task.project_id)?.title || task.project_id}</td> : null}
								{visibleColumns.includes('title') ? (
									<td>
										<button
											className="project-table-task-link"
											type="button"
											onClick={() => {
												void openTaskDetail(task.id)
												openFocusedTask(task.id, focusProjectIdOverride || task.project_id, 'tasks')
											}}
										>
											<span className="project-table-task-title">{task.title}</span>
										</button>
									</td>
								) : null}
								{visibleColumns.includes('priority') ? <td>{task.priority || '—'}</td> : null}
								{visibleColumns.includes('labels') ? (
									<td>
										<div className="project-table-chip-row">
											{(task.labels || []).map(label => (
												<span
													key={label.id}
													className="task-label-chip"
													style={{
														background: normalizeLabelColor(label.hex_color || label.hexColor || ''),
														color: pickLabelTextColor(normalizeLabelColor(label.hex_color || label.hexColor || '')),
													}}
												>
													{label.title}
												</span>
											))}
										</div>
									</td>
								) : null}
								{visibleColumns.includes('assignees') ? (
									<td>
										<div className="project-table-chip-row">
											{(task.assignees || []).map(assignee => (
												<span key={assignee.id} className="task-assignee-chip" title={assignee.name || assignee.username}>
													{getUserInitials(assignee)}
												</span>
											))}
										</div>
									</td>
								) : null}
								{visibleColumns.includes('commentCount') ? <td>{Math.max(0, Number(task.comment_count || 0))}</td> : null}
								{visibleColumns.includes('dueDate') ? <td>{formatOptionalLongDate(task.due_date || null) || '—'}</td> : null}
								{visibleColumns.includes('startDate') ? <td>{formatOptionalLongDate(task.start_date || null) || '—'}</td> : null}
								{visibleColumns.includes('endDate') ? <td>{formatOptionalLongDate(task.end_date || null) || '—'}</td> : null}
								{visibleColumns.includes('percentDone') ? <td>{normalizePercentDone(task.percent_done) || '—'}{normalizePercentDone(task.percent_done) ? '%' : ''}</td> : null}
								{visibleColumns.includes('doneAt') ? <td>{formatOptionalLongDate(task.done_at || null) || '—'}</td> : null}
								{visibleColumns.includes('created') ? <td>{formatOptionalLongDate(task.created || null) || '—'}</td> : null}
								{visibleColumns.includes('updated') ? <td>{formatOptionalLongDate(task.updated || null) || '—'}</td> : null}
								{visibleColumns.includes('createdBy') ? <td>{task.created_by?.name || task.created_by?.username || '—'}</td> : null}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{columnsAnchor ? (
				<ContextMenu anchor={columnsAnchor}>
					<div className="project-table-columns-menu" data-menu-root="true">
						{TABLE_COLUMNS.map(column => (
							<label key={column.id} className="project-table-column-option">
								<input
									type="checkbox"
									checked={visibleColumns.includes(column.id)}
									onChange={() => toggleColumn(column.id)}
								/>
								<span>{column.label}</span>
							</label>
						))}
					</div>
				</ContextMenu>
			) : null}
		</div>
	)
}

function compareTasks(left: Task, right: Task, key: TableColumn['sortKey'], order: 'asc' | 'desc') {
	const direction = order === 'asc' ? 1 : -1
	const leftValue = getTaskSortValue(left, key)
	const rightValue = getTaskSortValue(right, key)

	if (typeof leftValue === 'number' && typeof rightValue === 'number') {
		return (leftValue - rightValue) * direction
	}

	return `${leftValue || ''}`.localeCompare(`${rightValue || ''}`) * direction
}

function getTaskSortValue(task: Task, key: TableColumn['sortKey']) {
	switch (key) {
		case 'id':
			return Number(task.index || task.id || 0)
		case 'priority':
			return Number(task.priority || 0)
		case 'due_date':
			return new Date(task.due_date || '').getTime() || 0
		case 'start_date':
			return new Date(task.start_date || '').getTime() || 0
		case 'end_date':
			return new Date(task.end_date || '').getTime() || 0
		case 'percent_done':
			return Number(task.percent_done || 0)
		case 'done_at':
			return new Date(task.done_at || '').getTime() || 0
		case 'created':
			return new Date(task.created || '').getTime() || 0
		case 'updated':
			return new Date(task.updated || '').getTime() || 0
		case 'comment_count':
			return Number(task.comment_count || 0)
		case 'title':
			return task.title || ''
		default:
			return Number(task.position || 0)
	}
}

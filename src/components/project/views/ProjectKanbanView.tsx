import ContextMenu from '@/components/common/ContextMenu'
import TaskFilterPanel from '@/components/filters/TaskFilterPanel'
import TaskCard from '@/components/tasks/TaskCard'
import TaskMenu from '@/components/tasks/TaskMenu'
import {getTaskFilterUiConfig, hasActiveTaskFilters, taskMatchesFilters} from '@/hooks/useFilters'
import useWideLayout from '@/hooks/useWideLayout'
import {useAppStore} from '@/store'
import {getSubtasksFor, getVisibleRootTasksFor} from '@/store/selectors'
import type {Bucket, MenuAnchor, Task} from '@/types'
import {getMenuAnchor} from '@/utils/menuPosition'
import {useEffect, useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'

const EMPTY_BUCKETS: Bucket[] = []

export default function ProjectKanbanView({
	projectId,
	viewId,
	tasks,
}: {
	projectId: number
	viewId: number
	tasks: Task[]
}) {
	const isWideLayout = useWideLayout()
	const navigate = useNavigate()
	const screen = useAppStore(state => state.screen)
	const storedBuckets = useAppStore(state => state.projectBucketsByViewId[viewId])
	const buckets = storedBuckets ?? EMPTY_BUCKETS
	console.log('[KanbanView] render', {viewId, bucketCount: buckets.length, bucketSummary: buckets.map(b => ({id: b.id, title: b.title, taskCount: b.tasks?.length}))})
	const loadingBuckets = useAppStore(state => Boolean(state.loadingProjectBuckets[viewId]))
	const openMenu = useAppStore(state => state.openMenu)
	const setOpenMenu = useAppStore(state => state.setOpenMenu)
	const taskFilters = useAppStore(state => state.taskFilters)
	const recentlyCompletedTaskIds = useAppStore(state => state.recentlyCompletedTaskIds)
	const projectViewsById = useAppStore(state => state.projectViewsById)
	const loadProjectBuckets = useAppStore(state => state.loadProjectBuckets)
	const createBucket = useAppStore(state => state.createBucket)
	const updateProjectViewConfig = useAppStore(state => state.updateProjectViewConfig)
	const deleteBucket = useAppStore(state => state.deleteBucket)
	const createTaskInBucket = useAppStore(state => state.createTaskInBucket)
	const moveTask = useAppStore(state => state.moveTask)
	const toggleTaskDone = useAppStore(state => state.toggleTaskDone)
	const duplicateTask = useAppStore(state => state.duplicateTask)
	const deleteTask = useAppStore(state => state.deleteTask)
	const openFocusedTask = useAppStore(state => state.openFocusedTask)
	const openTaskDetail = useAppStore(state => state.openTaskDetail)
	const toggleTaskMenu = useAppStore(state => state.toggleTaskMenu)
	const openInlineSubtaskComposer = useAppStore(state => state.openInlineSubtaskComposer)
	const syncTaskFilterDraftFromActive = useAppStore(state => state.syncTaskFilterDraftFromActive)
	const applyTaskFilterDraft = useAppStore(state => state.applyTaskFilterDraft)
	const resetTaskFilterDraft = useAppStore(state => state.resetTaskFilterDraft)
	const ensureLabelsLoaded = useAppStore(state => state.ensureLabelsLoaded)
	const loadSavedFilterTasks = useAppStore(state => state.loadSavedFilterTasks)
	const [bucketPicker, setBucketPicker] = useState<{
		taskId: number
		anchor: MenuAnchor
	} | null>(null)
	const [bucketMenu, setBucketMenu] = useState<{
		bucketId: number
		anchor: MenuAnchor
	} | null>(null)
	const [filterOpen, setFilterOpen] = useState(false)
	const [createBucketOpen, setCreateBucketOpen] = useState(false)
	const [newBucketTitle, setNewBucketTitle] = useState('')
	const [bucketSubmitting, setBucketSubmitting] = useState(false)
	const [composerBucketId, setComposerBucketId] = useState<number | null>(null)
	const [composerTitle, setComposerTitle] = useState('')
	const [taskSubmittingBucketId, setTaskSubmittingBucketId] = useState<number | null>(null)
	const taskFilterConfig = getTaskFilterUiConfig('tasks')
	const currentView = projectViewsById[projectId]?.find(view => view.id === viewId) || null

	useEffect(() => {
		if (!projectId || !viewId) {
			return
		}

		void loadProjectBuckets(projectId, viewId, {force: true})
	}, [loadProjectBuckets, projectId, viewId])

	useEffect(() => {
		if (!bucketPicker && !bucketMenu) {
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

			setBucketPicker(null)
			setBucketMenu(null)
		}

		document.addEventListener('pointerdown', handlePointerDown, true)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown, true)
		}
	}, [bucketMenu, bucketPicker])

	const filteredBuckets = useMemo(() => {
		const doneBucketId = Number(currentView?.doneBucketId ?? currentView?.done_bucket_id ?? 0) || 0
		return buckets.map(bucket => ({
			...bucket,
			tasks: getVisibleRootTasksFor(
				bucket.tasks,
				(task: Task) =>
					(bucket.id === doneBucketId && task.done) ||
					taskMatchesFilters(task, taskFilters) ||
					recentlyCompletedTaskIds.has(task.id),
				taskFilters.sortBy,
			),
		}))
	}, [buckets, currentView?.doneBucketId, currentView?.done_bucket_id, recentlyCompletedTaskIds, taskFilters])

	async function refreshBuckets() {
		await loadProjectBuckets(projectId, viewId, {force: true})
	}

	async function handleMoveToBucket(taskId: number, targetBucketId: number) {
		console.log('[KanbanView:handleMoveToBucket]', {taskId, targetBucketId, projectId, viewId})
		setBucketPicker(null)
		setOpenMenu(null)

		// Find the task's current bucket
		const sourceBucketId = buckets.find(b => b.tasks.some(t => t.id === taskId))?.id || 0
		const doneBucketId = Number(currentView?.doneBucketId ?? currentView?.done_bucket_id ?? 0) || 0

		const result = await moveTask({
			taskId,
			targetProjectId: projectId,
			viewId,
			bucketId: targetBucketId,
		})
		console.log('[KanbanView:handleMoveToBucket] result', result)

		// Toggle done status when moving between done/non-done buckets
		if (result && doneBucketId && sourceBucketId !== targetBucketId) {
			const task = buckets.flatMap(b => b.tasks).find(t => t.id === taskId)
			const movedFromDone = sourceBucketId === doneBucketId && targetBucketId !== doneBucketId
			const movedToDone = sourceBucketId !== doneBucketId && targetBucketId === doneBucketId
			if ((movedFromDone && task?.done) || (movedToDone && !task?.done)) {
				console.log('[KanbanView:handleMoveToBucket] toggling done', {movedFromDone, movedToDone})
				void toggleTaskDone(taskId, {
					kanbanViewId: viewId,
					sourceBucketId: targetBucketId,
					targetBucketId,
				})
			}
		}
	}

	async function handleToggleTaskDone(task: Task, bucketId: number) {
		const nextDone = !task.done
		const doneBucketId = Number(currentView?.doneBucketId ?? currentView?.done_bucket_id ?? 0) || 0
		const defaultBucketId = Number(currentView?.defaultBucketId ?? currentView?.default_bucket_id ?? 0) || 0
		const targetBucketId = nextDone
			? (doneBucketId && doneBucketId !== bucketId ? doneBucketId : bucketId)
			: (doneBucketId && bucketId === doneBucketId && defaultBucketId && defaultBucketId !== bucketId ? defaultBucketId : bucketId)
		const toggled = await toggleTaskDone(task.id, {
			kanbanViewId: viewId,
			sourceBucketId: bucketId,
			targetBucketId,
		})
		if (!toggled) {
			return
		}
	}

	async function handleCreateBucket() {
		if (bucketSubmitting) {
			return
		}

		setBucketSubmitting(true)
		try {
			const bucket = await createBucket(projectId, viewId, newBucketTitle)
			if (bucket) {
				setNewBucketTitle('')
				setCreateBucketOpen(false)
			}
		} finally {
			setBucketSubmitting(false)
		}
	}

	async function handleCreateTask(bucketId: number) {
		if (taskSubmittingBucketId) {
			return
		}

		setTaskSubmittingBucketId(bucketId)
		try {
			const success = await createTaskInBucket(projectId, viewId, bucketId, composerTitle)
			if (success) {
				setComposerTitle('')
				setComposerBucketId(bucketId)
			}
		} finally {
			setTaskSubmittingBucketId(null)
		}
	}

	async function handleSetDefaultBucket(bucketId: number) {
		setBucketMenu(null)
		await updateProjectViewConfig(projectId, viewId, {
			defaultBucketId: bucketId,
			default_bucket_id: bucketId,
		})
	}

	async function handleSetDoneBucket(bucketId: number) {
		const nextDoneBucketId = currentView?.doneBucketId === bucketId ? 0 : bucketId
		setBucketMenu(null)
		await updateProjectViewConfig(projectId, viewId, {
			doneBucketId: nextDoneBucketId,
			done_bucket_id: nextDoneBucketId,
		})
	}

	async function handleDeleteBucket(bucketId: number) {
		setBucketMenu(null)
		await deleteBucket(projectId, viewId, bucketId)
	}

	if (loadingBuckets && buckets.length === 0) {
		return <div className="empty-state">Loading board…</div>
	}

	return (
		<div className={`kanban-board ${isWideLayout ? 'is-desktop' : 'is-mobile'}`.trim()}>
			<div className="project-view-toolbar">
				<button
					className={`pill-button subtle ${filterOpen || hasActiveTaskFilters(taskFilters) ? 'is-active' : ''}`.trim()}
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
				<button
					className={`pill-button subtle ${createBucketOpen ? 'is-active' : ''}`.trim()}
					type="button"
					onClick={() => setCreateBucketOpen(open => !open)}
				>
					Create bucket
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
						void loadSavedFilterTasks(null)
						resetTaskFilterDraft()
						void applyTaskFilterDraft(taskFilterConfig.allowProject)
					}}
					onSavedFilterSelect={projectId => {
						void loadSavedFilterTasks(projectId)
						setFilterOpen(false)
						if (projectId) {
							navigate('/filters')
						}
					}}
					onManageFilters={() => {
						setFilterOpen(false)
						navigate('/filters')
					}}
				/>
			) : null}
			{createBucketOpen ? (
				<form
					className="kanban-create-bucket"
					onSubmit={event => {
						event.preventDefault()
						void handleCreateBucket()
					}}
				>
					<input
						className="detail-input"
						type="text"
						placeholder="Bucket title"
						value={newBucketTitle}
						onChange={event => setNewBucketTitle(event.currentTarget.value)}
					/>
					<div className="inline-composer-actions">
						<button className="composer-submit" type="submit" disabled={bucketSubmitting}>
							{bucketSubmitting ? 'Saving…' : 'Add bucket'}
						</button>
						<button className="ghost-button" type="button" onClick={() => setCreateBucketOpen(false)}>
							Done
						</button>
					</div>
				</form>
			) : null}
			<div className="kanban-lanes" data-kanban-board="true">
				{filteredBuckets.map(bucket => (
					<section key={bucket.id} className="kanban-lane" data-kanban-lane-id={bucket.id}>
						<header className="kanban-lane-head">
							<div className="kanban-lane-heading">
								<div className="kanban-lane-title">{bucket.title}</div>
								<div className="kanban-lane-meta">
									{currentView?.defaultBucketId === bucket.id ? <span className="meta-chip">Default</span> : null}
									{currentView?.doneBucketId === bucket.id ? <span className="meta-chip success">Done</span> : null}
									{bucket.limit ? <span className="meta-chip">Limit {bucket.limit}</span> : null}
								</div>
							</div>
							<div className="kanban-lane-actions">
								<div className="count-chip compact">{bucket.tasks.length}</div>
								<button
									className="menu-button"
									type="button"
									data-menu-toggle="true"
									onClick={event => {
										const anchor = getMenuAnchor(event.currentTarget)
										setBucketPicker(null)
										setOpenMenu(null)
										setBucketMenu(current => (current?.bucketId === bucket.id ? null : {bucketId: bucket.id, anchor}))
									}}
								>
									⋯
								</button>
							</div>
						</header>
						<div className="kanban-bucket-tasks" data-kanban-bucket-id={bucket.id}>
							{bucket.tasks.map(task => {
								const childCount = getSubtasksFor(task, tasks, undefined, 'position').length
								const menuOpen = openMenu?.kind === 'task' && openMenu.id === task.id
								const recentlyCompleted = recentlyCompletedTaskIds.has(task.id)
								return (
									<div key={task.id} className={`kanban-task-item ${recentlyCompleted ? 'is-completing' : ''}`.trim()} data-task-row-id={task.id}>
										<div className={`kanban-task-frame ${recentlyCompleted ? 'is-completing' : ''}`.trim()}>
											<div className="task-leading kanban-task-leading">
												<button
													className={`checkbox-button ${task.done ? 'is-checked' : ''}`.trim()}
													data-action="toggle-done"
													data-task-id={task.id}
													aria-checked={task.done ? 'true' : 'false'}
													role="checkbox"
													type="button"
													onClick={() => {
														void handleToggleTaskDone(task, bucket.id)
													}}
												>
													{task.done ? '✓' : ''}
												</button>
											</div>
											<button
												className="task-main kanban-task-main"
												type="button"
												data-action="open-task-focus"
												data-task-id={task.id}
												onClick={() => {
													setOpenMenu(null)
													setBucketPicker(null)
													if (isWideLayout) {
														void openTaskDetail(task.id)
													}
													openFocusedTask(task.id, task.project_id, screen)
												}}
											>
												<TaskCard task={task} childCount={childCount} compact={true} />
											</button>
											<div className="drag-handle kanban-drag-handle" aria-hidden="true">
												<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
													<circle cx="2.5" cy="2.5" r="1.5" />
													<circle cx="7.5" cy="2.5" r="1.5" />
													<circle cx="2.5" cy="8" r="1.5" />
													<circle cx="7.5" cy="8" r="1.5" />
													<circle cx="2.5" cy="13.5" r="1.5" />
													<circle cx="7.5" cy="13.5" r="1.5" />
												</svg>
											</div>
											<button
												className="menu-button"
												data-action="toggle-task-menu"
												data-task-id={task.id}
												data-menu-toggle="true"
												type="button"
												onClick={event => {
													setBucketPicker(null)
													toggleTaskMenu(task.id, getMenuAnchor(event.currentTarget))
												}}
											>
												⋯
											</button>
										</div>
										{menuOpen && openMenu.kind === 'task' ? (
											<TaskMenu
												task={task}
												anchor={openMenu.anchor}
												showAddSubtask={true}
												onAddSubtask={() => {
													setOpenMenu(null)
													openInlineSubtaskComposer(task.id, 'list')
												}}
												extraItems={[
													{
														action: 'move-to-bucket',
														label: 'Move to bucket',
														onClick: () => {
															setOpenMenu(null)
															setBucketPicker({
																taskId: task.id,
																anchor: openMenu.anchor,
															})
														},
													},
												]}
												onEdit={() => {
													setOpenMenu(null)
													void openTaskDetail(task.id)
												}}
												onDuplicate={() => {
													setOpenMenu(null)
													void duplicateTask(task.id).then(() => refreshBuckets())
												}}
												onDelete={() => {
													setOpenMenu(null)
													void deleteTask(task.id).then(() => refreshBuckets())
												}}
											/>
										) : null}
									</div>
								)
							})}
						</div>
						<div className="kanban-bucket-footer">
							{composerBucketId === bucket.id ? (
								<form
									className="kanban-inline-task-composer"
									onSubmit={event => {
										event.preventDefault()
										void handleCreateTask(bucket.id)
									}}
								>
									<input
										className="detail-input"
										type="text"
										placeholder="Task name"
										value={composerTitle}
										onChange={event => setComposerTitle(event.currentTarget.value)}
									/>
									<div className="inline-composer-actions">
										<button className="composer-submit" type="submit" disabled={taskSubmittingBucketId === bucket.id}>
											{taskSubmittingBucketId === bucket.id ? 'Saving…' : 'Add task'}
										</button>
										<button className="ghost-button" type="button" onClick={() => setComposerBucketId(null)}>
											Done
										</button>
									</div>
								</form>
							) : (
								<button
									className="kanban-add-task-button"
									type="button"
									onClick={() => {
										setComposerTitle('')
										setComposerBucketId(bucket.id)
									}}
								>
									+ {bucket.tasks.length > 0 ? 'Add another task' : 'Add task'}
								</button>
							)}
							{bucket.tasks.length === 0 && composerBucketId !== bucket.id ? <div className="kanban-empty-bucket">No tasks</div> : null}
						</div>
					</section>
				))}
			</div>
			{bucketPicker ? (
				<ContextMenu
					anchor={bucketPicker.anchor}
					className="kanban-context-menu"
					positionMode="anchor-end"
				>
					<div className="kanban-bucket-picker" data-menu-root="true">
						<div className="kanban-bucket-picker-title">Move to bucket</div>
						{filteredBuckets.map(bucket => {
							const currentBucket = filteredBuckets.find(entry => entry.tasks.some(task => task.id === bucketPicker.taskId)) || null
							const active = currentBucket?.id === bucket.id
							return (
								<button
									key={bucket.id}
									className={`menu-item ${active ? 'is-active' : ''}`.trim()}
									type="button"
									onClick={() => void handleMoveToBucket(bucketPicker.taskId, bucket.id)}
								>
									{bucket.title}
								</button>
							)
						})}
					</div>
				</ContextMenu>
			) : null}
			{bucketMenu ? (
				<ContextMenu
					anchor={bucketMenu.anchor}
					className="kanban-context-menu"
					positionMode="anchor-end"
				>
					<div className="kanban-bucket-picker" data-menu-root="true">
						<div className="kanban-bucket-picker-title">Bucket</div>
						<button className="menu-item" type="button" onClick={() => void handleSetDefaultBucket(bucketMenu.bucketId)}>
							Set as default bucket
						</button>
						<button className="menu-item" type="button" onClick={() => void handleSetDoneBucket(bucketMenu.bucketId)}>
							{currentView?.doneBucketId === bucketMenu.bucketId ? 'Clear done bucket' : 'Set as done bucket'}
						</button>
						<button className="menu-item danger" type="button" onClick={() => void handleDeleteBucket(bucketMenu.bucketId)}>
							Delete bucket
						</button>
					</div>
				</ContextMenu>
			) : null}
		</div>
	)
}

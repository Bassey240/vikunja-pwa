import {useEffect, type ReactNode} from 'react'
import {flushSync} from 'react-dom'
import {useAppStore, type AppStore} from '@/store'
import {getProjectDescendantIds} from '@/store/project-helpers'
import {findTaskInAnyContext, getTaskCollectionForTask, isManualTaskSort} from '@/store/selectors'
import type {Project, Screen, Task} from '@/types'
import {
	beginProjectDropTrace,
	beginTaskDropTrace,
	markProjectDropTrace,
	markTaskDropTrace,
} from '@/utils/dragPerf'
import {calculateTaskPosition} from '@/utils/taskPosition'

let activeDragContext: DragContext | null = null
let suppressClicksUntil = 0

interface SortableInstance {
	destroy: () => void
}

interface SortableEvent {
	item?: HTMLElement
	from: HTMLElement
	to: HTMLElement
	oldIndex?: number | null
}

type SortableKind = 'task' | 'project'

interface SortableOptions {
	group: {name: string; pull: boolean; put: boolean | string[]}
	handle: string
	draggable: string
	animation: number
	forceFallback: boolean
	fallbackOnBody: boolean
	fallbackTolerance: number
	fallbackClass: string
	ghostClass: string
	chosenClass: string
	invertSwap: boolean
	invertedSwapThreshold: number
	delay: number
	delayOnTouchOnly: boolean
	touchStartThreshold: number
	filter: string
	preventOnFilter: boolean
	onStart: (event: SortableEvent) => void
	onMove: (event: SortableEvent) => boolean | void
	onEnd: (event: SortableEvent) => void
}

interface SortableConstructor {
	new (element: Element, options: SortableOptions): SortableInstance
}

interface DragContext {
	app: HTMLElement
	type: 'task' | 'project'
	id: number
	dragItem: HTMLElement | null
	dragFrom: HTMLElement | null
	dragOldIndex: number | null
	dropTargetProjectId: number | null
	dropTargetProjectElement: HTMLElement | null
	dropTargetTaskId: number | null
	dropTargetTaskElement: HTMLElement | null
	lastX: number | null
	lastY: number | null
}

interface TaskCollectionsLookup {
	tasks: Task[]
	todayTasks: Task[]
	inboxTasks: Task[]
	upcomingTasks: Task[]
	searchTasks: Task[]
	savedFilterTasks: Task[]
	projectPreviewTasksById: Record<number, Task[]>
}

let handledSidebarDrop:
	| {
			type: DragContext['type']
			id: number
	  }
	| null = null

export function shouldSuppressDragClicks() {
	return Date.now() < suppressClicksUntil
}

export function useSortableBridge() {
	const connected = useAppStore(state => state.connected)

	useEffect(() => {
		if (!connected) {
			return
		}

		const appElement = document.getElementById('app')
		const sortableCtor = (globalThis as typeof globalThis & {Sortable?: SortableConstructor}).Sortable
		if (!(appElement instanceof HTMLElement) || typeof sortableCtor !== 'function') {
			return
		}
		const app = appElement
		const Sortable = sortableCtor

		let instances: SortableInstance[] = []
		let frameId = 0

		function destroyInstances() {
			for (const instance of instances) {
				try {
					instance.destroy()
				} catch {
					// Best effort cleanup.
				}
			}
			instances = []
			clearSortableContainerKinds(app)
		}

		function createTaskSortables() {
			const taskTrees = app.querySelectorAll(
				'.workspace-screen.is-active .task-tree, .workspace-screen.is-active .task-children-wrap',
			)
			for (const tree of taskTrees) {
				if (!(tree instanceof HTMLElement)) {
					continue
				}

				const draggableBranches = tree.querySelectorAll(':scope > .task-branch .drag-handle')
				if (draggableBranches.length < 1) {
					continue
				}

				markSortableContainer(tree, 'task')
				const instance = new Sortable(tree, {
					group: {name: 'tasks', pull: true, put: ['tasks']},
					handle: '.drag-handle',
					draggable: '.task-branch',
					animation: 150,
					forceFallback: true,
					fallbackOnBody: true,
					fallbackTolerance: 3,
					fallbackClass: 'sortable-fallback',
					ghostClass: 'sortable-ghost',
					chosenClass: 'sortable-chosen',
					invertSwap: true,
					invertedSwapThreshold: 0.25,
					delay: 200,
					delayOnTouchOnly: true,
					touchStartThreshold: 3,
					filter: '.menu-button, .checkbox-button, .task-toggle-end, .add-subtask-inline, .subtask-composer',
					preventOnFilter: false,
					onStart(event) {
						const taskId = Number(
							(event.item instanceof HTMLElement ? event.item.dataset.taskRowId || '' : '') ||
							event.item?.querySelector('[data-task-row-id]')?.getAttribute('data-task-row-id') ||
							0,
						)
						if (taskId) {
							startDragTracking(app, 'task', taskId, event.item instanceof HTMLElement ? event.item : null, event.from, event.oldIndex)
						}
					},
					onMove: handleSortableOnMove,
					onEnd(event) {
						void handleSortableTaskEnd(event)
					},
				})

				instances.push(instance)
			}
		}

		function createKanbanTaskSortables() {
			const bucketContainers = app.querySelectorAll('.workspace-screen.is-active .kanban-bucket-tasks[data-kanban-bucket-id]')
			for (const container of bucketContainers) {
				if (!(container instanceof HTMLElement)) {
					continue
				}

				markSortableContainer(container, 'task')
				const instance = new Sortable(container, {
					group: {name: 'tasks', pull: true, put: ['tasks']},
					handle: '.kanban-drag-handle',
					draggable: '.kanban-task-item',
					animation: 150,
					forceFallback: true,
					fallbackOnBody: true,
					fallbackTolerance: 3,
					fallbackClass: 'sortable-fallback',
					ghostClass: 'sortable-ghost',
					chosenClass: 'sortable-chosen',
					invertSwap: true,
					invertedSwapThreshold: 0.25,
					delay: 0,
					delayOnTouchOnly: true,
					touchStartThreshold: 3,
					filter: '.menu-button, .checkbox-button',
					preventOnFilter: false,
					onStart(event) {
						const taskId = Number(
							(event.item instanceof HTMLElement ? event.item.dataset.taskRowId || '' : '') ||
							event.item?.querySelector('[data-task-row-id]')?.getAttribute('data-task-row-id') ||
							0,
						)
						if (taskId) {
							startDragTracking(app, 'task', taskId, event.item instanceof HTMLElement ? event.item : null, event.from, event.oldIndex)
						}
					},
					onMove: handleSortableOnMove,
					onEnd(event) {
						void handleSortableTaskEnd(event)
					},
				})

				instances.push(instance)
			}
		}

		function createProjectSortables() {
			const projectContainers = app.querySelectorAll('.workspace-screen.is-active .screen-body, .workspace-screen.is-active .project-preview-stack')
			for (const container of projectContainers) {
				if (!(container instanceof HTMLElement)) {
					continue
				}

				const projectNodes = container.querySelectorAll(':scope > .project-node[data-project-node-id]')
				if (projectNodes.length < 1) {
					continue
				}

				markSortableContainer(container, 'project')
				const instance = new Sortable(container, {
					group: {name: 'projects', pull: true, put: ['projects']},
					handle: '.project-drag-handle',
					draggable: '.project-node',
					animation: 150,
					forceFallback: true,
					fallbackOnBody: true,
					fallbackTolerance: 3,
					fallbackClass: 'sortable-fallback',
					ghostClass: 'sortable-ghost',
					chosenClass: 'sortable-chosen',
					invertSwap: true,
					invertedSwapThreshold: 0.25,
					delay: 200,
					delayOnTouchOnly: true,
					touchStartThreshold: 3,
					filter: '.menu-button, .chevron-button, .project-select',
					preventOnFilter: false,
					onStart(event) {
						const projectId = Number(event.item?.getAttribute('data-project-node-id') || 0)
						if (projectId) {
							startDragTracking(app, 'project', projectId, event.item instanceof HTMLElement ? event.item : null, event.from, event.oldIndex)
						}
					},
					onMove: handleSortableOnMove,
					onEnd(event) {
						void handleSortableProjectEnd(event)
					},
				})

				instances.push(instance)
			}
		}

		function bindSortables() {
			if (activeDragContext) {
				return
			}

			destroyInstances()
			createTaskSortables()
			createKanbanTaskSortables()
			createProjectSortables()
		}

		function scheduleBind() {
			if (frameId) {
				cancelAnimationFrame(frameId)
			}

			frameId = requestAnimationFrame(() => {
				frameId = requestAnimationFrame(() => {
					frameId = 0
					bindSortables()
				})
			})
		}

		const observer = new MutationObserver(() => {
			scheduleBind()
		})

		document.addEventListener('click', blockDragClick, true)
		document.addEventListener('pointerup', blockDragClick, true)
		document.addEventListener('touchend', blockDragClick, true)
		observer.observe(app, {childList: true, subtree: true})

		scheduleBind()

		return () => {
			observer.disconnect()
			if (frameId) {
				cancelAnimationFrame(frameId)
			}
			document.removeEventListener('click', blockDragClick, true)
			document.removeEventListener('pointerup', blockDragClick, true)
			document.removeEventListener('touchend', blockDragClick, true)
			destroyInstances()
			cleanupDragTracking()
		}
	}, [connected])
}

export function TaskDragProvider({children}: {children: ReactNode}) {
	return <>{children}</>
}

export function ProjectDragProvider({children}: {children: ReactNode}) {
	return <>{children}</>
}

function startDragTracking(
	app: HTMLElement,
	type: DragContext['type'],
	id: number,
	dragItem: HTMLElement | null,
	dragFrom: HTMLElement | null,
	dragOldIndex: number | null,
) {
	activeDragContext = {
		app,
		type,
		id,
		dragItem,
		dragFrom,
		dragOldIndex,
		dropTargetProjectId: null,
		dropTargetProjectElement: null,
		dropTargetTaskId: null,
		dropTargetTaskElement: null,
		lastX: null,
		lastY: null,
	}
	document.addEventListener('pointermove', handleDragOverDropTargetDetection)
	document.addEventListener('mousemove', handleDragOverDropTargetDetection)
	document.addEventListener('touchmove', handleDragOverDropTargetDetection, {passive: true})
	document.addEventListener('pointerup', handleSidebarDropPointerUp, true)
	app.classList.add('is-drag-active')
}

function handleSortableOnMove(event: SortableEvent) {
	if (!activeDragContext) {
		return
	}

	if (!isEligibleSortableContainer(activeDragContext.type, event.to)) {
		return false
	}

	if (activeDragContext.dropTargetProjectId || activeDragContext.dropTargetTaskId) {
		return false
	}

	if (isPointerOverInvalidCrossTypeSurface(activeDragContext)) {
		return false
	}

	if (activeDragContext.type === 'task' && !isManualTaskSortActive()) {
		return false
	}
}

function handleDragOverDropTargetDetection(event: MouseEvent | PointerEvent | TouchEvent) {
	if (!activeDragContext) {
		return
	}

	const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX
	const clientY = 'touches' in event ? event.touches[0]?.clientY : event.clientY
	if (clientX == null || clientY == null) {
		return
	}

	activeDragContext.lastX = clientX
	activeDragContext.lastY = clientY

	const projectTarget = hitTestProjectRows(activeDragContext, clientX, clientY)
	if (projectTarget) {
		applyDropTarget(activeDragContext, projectTarget, null)
		return
	}

	if (activeDragContext.type === 'task') {
		const taskTarget = hitTestTaskRows(activeDragContext, clientX, clientY)
		if (taskTarget) {
			applyDropTarget(activeDragContext, null, taskTarget)
			return
		}
	}

	if (activeDragContext.dropTargetProjectId || activeDragContext.dropTargetTaskId) {
		applyDropTarget(activeDragContext, null, null)
	}
}

function hitTestProjectRows(context: DragContext, clientX: number, clientY: number) {
	const store = useAppStore.getState()
	const projectRows = context.app.querySelectorAll('.workspace-screen.is-active .project-node-row, .wide-sidebar-project-row')
	for (const row of projectRows) {
		const node = row.closest('.project-node[data-project-node-id], .wide-sidebar-project-item[data-project-node-id]')
		if (!(node instanceof HTMLElement) || node.classList.contains('sortable-ghost')) {
			continue
		}

		const projectId = Number(node.dataset.projectNodeId || 0)
		if (!projectId) {
			continue
		}

		if (context.type === 'project') {
			if (projectId === context.id) {
				continue
			}
			if (getProjectDescendantIds(context.id, store.projects).has(projectId)) {
				continue
			}
		}

		const rect = row.getBoundingClientRect()
		if (clientX < rect.left || clientX > rect.right || !isInMiddleZone(clientY, rect)) {
			continue
		}

		return {
			projectId,
			element: node,
		}
	}

	return null
}

function hitTestTaskRows(context: DragContext, clientX: number, clientY: number) {
	const collections = getTaskCollections(useAppStore.getState())
	const taskRows = context.app.querySelectorAll('.workspace-screen.is-active [data-task-row-id]')
	for (const row of taskRows) {
		if (!(row instanceof HTMLElement) || row.closest('.sortable-ghost')) {
			continue
		}

		const taskId = Number(row.dataset.taskRowId || 0)
		if (!taskId || taskId === context.id) {
			continue
		}

		const rect = row.getBoundingClientRect()
		if (clientX < rect.left || clientX > rect.right || !isInMiddleZone(clientY, rect)) {
			continue
		}

		if (isTaskDescendantOf(taskId, context.id, collections)) {
			continue
		}

		return {
			taskId,
			element: (row.closest('.kanban-task-item') as HTMLElement | null) || row,
		}
	}

	return null
}

function isInMiddleZone(clientY: number, rect: DOMRect) {
	const margin = rect.height * 0.125
	return clientY >= rect.top + margin && clientY <= rect.bottom - margin
}

function applyDropTarget(
	context: DragContext,
	targetProject: {projectId: number; element: HTMLElement} | null,
	targetTask: {taskId: number; element: HTMLElement} | null,
) {
	const targetProjectId = targetProject?.projectId ?? null
	const targetTaskId = targetTask?.taskId ?? null
	const projectChanged = targetProjectId !== context.dropTargetProjectId || targetProject?.element !== context.dropTargetProjectElement
	const taskChanged = targetTaskId !== context.dropTargetTaskId || targetTask?.element !== context.dropTargetTaskElement

	if (!projectChanged && !taskChanged) {
		return
	}

	if (context.dropTargetProjectElement && projectChanged) {
		context.dropTargetProjectElement.classList.remove('is-drop-target')
	}
	if (context.dropTargetTaskElement && taskChanged) {
		context.dropTargetTaskElement.classList.remove('is-drop-target')
	}

	context.dropTargetProjectId = targetProjectId
	context.dropTargetProjectElement = targetProject?.element ?? null
	context.dropTargetTaskId = targetTaskId
	context.dropTargetTaskElement = targetTask?.element ?? null

	if (targetProject?.element) {
		targetProject.element.classList.add('is-drop-target')
	}
	if (targetTask?.element) {
		targetTask.element.classList.add('is-drop-target')
	}
}

function cleanupDragTracking() {
	document.removeEventListener('pointermove', handleDragOverDropTargetDetection)
	document.removeEventListener('mousemove', handleDragOverDropTargetDetection)
	document.removeEventListener('touchmove', handleDragOverDropTargetDetection)
	document.removeEventListener('pointerup', handleSidebarDropPointerUp, true)

	if (!activeDragContext) {
		return null
	}

	activeDragContext.app.classList.remove('is-drag-active')

	if (activeDragContext.dropTargetProjectElement) {
		activeDragContext.dropTargetProjectElement.classList.remove('is-drop-target')
	}
	if (activeDragContext.dropTargetTaskElement) {
		activeDragContext.dropTargetTaskElement.classList.remove('is-drop-target')
	}

	const context = activeDragContext
	activeDragContext = null
	suppressClicksUntil = Date.now() + 600
	return context
}

function handleSidebarDropPointerUp(event: PointerEvent) {
	const context = activeDragContext
	if (!context?.dropTargetProjectId) {
		return
	}

	const target = event.target
	if (!(target instanceof Element) || !target.closest('.wide-sidebar-project-item[data-project-node-id]')) {
		return
	}

	const sidebarDropContext = cleanupDragTracking()
	if (!sidebarDropContext?.dropTargetProjectId) {
		return
	}

	restoreStoredDragDomPosition(sidebarDropContext)
	clearSortableDragState(sidebarDropContext.dragItem)
	handledSidebarDrop = {
		type: sidebarDropContext.type,
		id: sidebarDropContext.id,
	}
	void commitSidebarProjectDrop(sidebarDropContext)
}

function blockDragClick(event: Event) {
	if (!activeDragContext && !shouldSuppressDragClicks()) {
		return
	}

	const target = event.target
	if (!(target instanceof Element) || !target.closest('#app')) {
		return
	}

	if (target.closest('[data-action]') || target.closest('button') || target.closest('a')) {
		event.preventDefault()
		event.stopPropagation()
	}
}

async function handleSortableTaskEnd(event: SortableEvent) {
	const dragContext = cleanupDragTracking()
	const movedBranch = event.item
	if (!(movedBranch instanceof HTMLElement)) {
		return
	}

	const taskRow = movedBranch.matches('[data-task-row-id]')
		? movedBranch
		: movedBranch.querySelector('[data-task-row-id]')
	if (!(taskRow instanceof HTMLElement)) {
		return
	}

	const taskId = Number(taskRow.dataset.taskRowId || 0)
	if (!taskId) {
		return
	}

	if (handledSidebarDrop?.type === 'task' && handledSidebarDrop.id === taskId) {
		clearSortableDragState(event.item instanceof HTMLElement ? event.item : null)
		handledSidebarDrop = null
		return
	}

	const store = useAppStore.getState()
	const collections = getTaskCollections(store)
	const task = findTaskInAnyContext(taskId, collections)
	if (!task) {
		restoreSortableDomPosition(event)
		return
	}

	if (dragContext?.dropTargetProjectId) {
		const targetProjectId = dragContext.dropTargetProjectId
		const visibleTaskList = getVisibleTaskListForTaskDrop(store, taskId, targetProjectId, collections)
		const traceToken = beginTaskDropTrace({
			taskId,
			sourceProjectId: task.project_id,
			targetProjectId,
			targetParentTaskId: null,
		})
		await commitTaskDrop(event, {
			traceToken,
			suppressRollbackFlash: targetProjectId !== task.project_id,
			commitMove: () => store.moveTaskToPlacement(taskId, {
			parentTaskId: null,
			targetProjectId,
			traceToken,
			taskList: visibleTaskList,
			}),
		})
		return
	}

	if (dragContext?.dropTargetTaskId) {
		const targetTaskId = dragContext.dropTargetTaskId
		const targetParentTask = findTaskInAnyContext(targetTaskId, collections)
		const traceToken = beginTaskDropTrace({
			taskId,
			sourceProjectId: task.project_id,
			targetProjectId: Number(targetParentTask?.project_id || task.project_id),
			targetParentTaskId: targetTaskId,
		})
		await commitTaskDrop(event, {
			traceToken,
			suppressRollbackFlash: Boolean(targetParentTask && targetParentTask.project_id !== task.project_id),
			commitMove: () => store.moveTaskToPlacement(taskId, {
				parentTaskId: targetTaskId,
				traceToken,
			}),
		})
		return
	}

	const kanbanBucketId = Number((event.to instanceof HTMLElement ? event.to.dataset.kanbanBucketId : 0) || 0)
	if (kanbanBucketId) {
		const siblingIds = getSiblingTaskIdsFromContainer(event.to)
		const movedIndex = siblingIds.indexOf(taskId)
		const viewId = store.currentProjectViewId
		if (movedIndex === -1 || !viewId) {
			restoreSortableDomPosition(event)
			return
		}

		await commitTaskDrop(event, {
			traceToken: beginTaskDropTrace({
				taskId,
				sourceProjectId: task.project_id,
				targetProjectId: task.project_id,
				targetParentTaskId: null,
			}),
			suppressRollbackFlash: false,
			commitMove: () =>
				store.moveTaskToBucket(task.project_id, viewId, taskId, kanbanBucketId, {
					beforeTaskId: siblingIds[movedIndex - 1] || null,
					afterTaskId: siblingIds[movedIndex + 1] || null,
				}),
		})
		return
	}

	if (dragContext && isPointerOverInvalidCrossTypeSurface(dragContext)) {
		restoreSortableDomPosition(event)
		return
	}

	if (!isManualTaskSortActive()) {
		restoreSortableDomPosition(event)
		return
	}

	const parentBranch = event.to.closest('.task-branch[data-task-branch-id]')
	const parentTaskId = parentBranch instanceof HTMLElement ? Number(parentBranch.dataset.taskBranchId || 0) || null : null
	const siblingIds = getSiblingTaskIdsFromContainer(event.to)
	const movedIndex = siblingIds.indexOf(taskId)
	if (movedIndex === -1) {
		restoreSortableDomPosition(event)
		return
	}

	const targetProjectId = resolveTaskDropTargetProjectId(event.to, store, task.project_id, parentTaskId)
	const visibleTaskList = getVisibleTaskListForTaskDrop(store, task.id, targetProjectId, collections)
	const traceToken = beginTaskDropTrace({
		taskId,
		sourceProjectId: task.project_id,
		targetProjectId,
		targetParentTaskId: parentTaskId,
	})
	await commitTaskDrop(event, {
		traceToken,
		suppressRollbackFlash: targetProjectId !== task.project_id,
		commitMove: () => store.moveTaskToPlacement(taskId, {
			parentTaskId,
			targetProjectId,
			beforeTaskId: siblingIds[movedIndex - 1] || null,
			afterTaskId: siblingIds[movedIndex + 1] || null,
			siblingIds,
			traceToken,
			taskList: visibleTaskList,
		}),
	})
}

async function handleSortableProjectEnd(event: SortableEvent) {
	const dragContext = cleanupDragTracking()
	const movedNode = event.item
	if (!(movedNode instanceof HTMLElement)) {
		return
	}

	const projectId = Number(movedNode.dataset.projectNodeId || 0)
	if (!projectId) {
		return
	}

	if (handledSidebarDrop?.type === 'project' && handledSidebarDrop.id === projectId) {
		clearSortableDragState(event.item instanceof HTMLElement ? event.item : null)
		handledSidebarDrop = null
		return
	}

	const store = useAppStore.getState()
	const project = store.projects.find(entry => entry.id === projectId)
	if (!project) {
		restoreSortableDomPosition(event)
		return
	}

	if (dragContext?.dropTargetProjectId) {
		const traceToken = beginProjectDropTrace({
			projectId,
			sourceParentProjectId: Number(project.parent_project_id || 0),
			targetParentProjectId: dragContext.dropTargetProjectId,
			targetBeforeProjectId: null,
			targetAfterProjectId: null,
		})
		await commitProjectDrop(event, {
			traceToken,
			commitMove: () => store.moveProjectToParent(projectId, dragContext.dropTargetProjectId, {traceToken}),
		})
		return
	}

	if (dragContext && isPointerOverInvalidCrossTypeSurface(dragContext)) {
		restoreSortableDomPosition(event)
		return
	}

	const containerParentProjectId = Number((event.to instanceof HTMLElement ? event.to.dataset.parentProjectId || 0 : 0) || 0)
	const parentNode = event.to.closest('.project-node[data-project-node-id]')
	const parentProjectId = containerParentProjectId || (parentNode instanceof HTMLElement ? Number(parentNode.dataset.projectNodeId || 0) : 0)
	const siblingIds = getSiblingProjectIdsFromContainer(event.to)
	const movedIndex = siblingIds.indexOf(projectId)
	if (movedIndex === -1) {
		restoreSortableDomPosition(event)
		return
	}

	const beforeProject = store.projects.find(project => project.id === (siblingIds[movedIndex - 1] || 0)) || null
	const afterProject = store.projects.find(project => project.id === (siblingIds[movedIndex + 1] || 0)) || null
	const position = calculateTaskPosition(beforeProject?.position ?? null, afterProject?.position ?? null)
	const traceToken = beginProjectDropTrace({
		projectId,
		sourceParentProjectId: Number(project.parent_project_id || 0),
		targetParentProjectId: parentProjectId,
		targetBeforeProjectId: beforeProject?.id ?? null,
		targetAfterProjectId: afterProject?.id ?? null,
	})
	await commitProjectDrop(event, {
		traceToken,
		commitMove: () => store.moveProjectToParent(projectId, parentProjectId, {position, traceToken}),
	})
}

function getSiblingTaskIdsFromContainer(container: HTMLElement) {
	return Array.from(container.querySelectorAll(':scope > .task-branch, :scope > .kanban-task-item'))
		.map(branch => {
			if (branch instanceof HTMLElement && branch.dataset.taskRowId) {
				return Number(branch.dataset.taskRowId || 0)
			}

			const row = branch.querySelector('[data-task-row-id]')
			return Number(row instanceof HTMLElement ? row.dataset.taskRowId || 0 : 0)
		})
		.filter(taskId => taskId > 0)
}

function getSiblingProjectIdsFromContainer(container: HTMLElement) {
	return Array.from(container.querySelectorAll(':scope > .project-node[data-project-node-id]'))
		.map(node => Number(node instanceof HTMLElement ? node.dataset.projectNodeId || 0 : 0))
		.filter(projectId => projectId > 0)
}

function markSortableContainer(container: HTMLElement, kind: SortableKind) {
	container.dataset.sortableKind = kind
}

function clearSortableContainerKinds(app: HTMLElement) {
	for (const container of app.querySelectorAll('[data-sortable-kind]')) {
		if (container instanceof HTMLElement) {
			delete container.dataset.sortableKind
		}
	}
}

function isEligibleSortableContainer(kind: SortableKind, container: HTMLElement) {
	return container instanceof HTMLElement && container.dataset.sortableKind === kind
}

function isManualTaskSortActive() {
	const state = useAppStore.getState()
	const activeProjectViews = state.selectedProjectId ? state.projectViewsById[state.selectedProjectId] || [] : []
	const activeProjectViewKind = activeProjectViews.find(view => view.id === state.currentProjectViewId)?.view_kind || 'list'
	if (activeProjectViewKind === 'kanban') {
		return true
	}
	const activeSortBy =
		state.screen === 'projects'
			? state.projectFilters.taskSortBy
			: state.screen === 'tasks'
				? state.taskFilters.sortBy
				: 'position'
	return isManualTaskSort(activeSortBy)
}

function isPointerOverInvalidCrossTypeSurface(context: DragContext) {
	const clientX = context.lastX
	const clientY = context.lastY
	if (clientX == null || clientY == null) {
		return false
	}

	const hitElement = getDragHitElement(clientX, clientY)
	if (!(hitElement instanceof Element)) {
		return false
	}

	const nearestSortableKind = getNearestSortableKind(hitElement)
	if (nearestSortableKind) {
		return nearestSortableKind !== context.type
	}

	if (context.type === 'task') {
		return Boolean(hitElement.closest('.project-node-row'))
	}

	return Boolean(hitElement.closest('[data-task-row-id]'))
}

function getNearestSortableKind(element: Element): SortableKind | null {
	const container = element.closest('[data-sortable-kind]')
	if (!(container instanceof HTMLElement)) {
		return null
	}

	return container.dataset.sortableKind === 'project' || container.dataset.sortableKind === 'task'
		? container.dataset.sortableKind
		: null
}

function getDragHitElement(clientX: number, clientY: number) {
	if (typeof document.elementsFromPoint === 'function') {
		for (const element of document.elementsFromPoint(clientX, clientY)) {
			if (!(element instanceof Element)) {
				continue
			}
			if (element.closest('.sortable-fallback')) {
				continue
			}
			return element
		}
	}

	const fallback = document.elementFromPoint(clientX, clientY)
	return fallback instanceof Element && !fallback.closest('.sortable-fallback') ? fallback : null
}

async function commitSidebarProjectDrop(context: DragContext) {
	const store = useAppStore.getState()
	const targetProjectId = context.dropTargetProjectId
	if (!targetProjectId) {
		return
	}

	if (context.type === 'task') {
		const collections = getTaskCollections(store)
		const task = findTaskInAnyContext(context.id, collections)
		if (!task) {
			return
		}

		if (task.project_id !== targetProjectId && (task.related_tasks?.subtask?.length || 0) > 0) {
			markTaskDropTrace(null, 'sidebar-drop-blocked-has-subtasks', {
				taskId: task.id,
				sourceProjectId: task.project_id,
				targetProjectId,
			})
			return
		}

		const visibleTaskList = getVisibleTaskListForTaskDrop(store, task.id, targetProjectId, collections)
		const traceToken = beginTaskDropTrace({
			taskId: task.id,
			sourceProjectId: task.project_id,
			targetProjectId,
			targetParentTaskId: null,
		})
		markTaskDropTrace(traceToken, 'sidebar-drop-commit-start')
		await store.moveTaskToPlacement(task.id, {
			parentTaskId: null,
			targetProjectId,
			traceToken,
			taskList: visibleTaskList,
		})
		markTaskDropTrace(traceToken, 'sidebar-drop-commit-end')
		return
	}

	const project = store.projects.find(entry => entry.id === context.id)
	if (!project) {
		return
	}

	const traceToken = beginProjectDropTrace({
		projectId: project.id,
		sourceParentProjectId: Number(project.parent_project_id || 0),
		targetParentProjectId: targetProjectId,
		targetBeforeProjectId: null,
		targetAfterProjectId: null,
	})
	markProjectDropTrace(traceToken, 'sidebar-drop-commit-start')
	await store.moveProjectToParent(project.id, targetProjectId, {traceToken})
	markProjectDropTrace(traceToken, 'sidebar-drop-commit-end')
}

async function flushTaskDropCommit(commitMove: () => Promise<unknown>) {
	let movePromise: Promise<unknown> = Promise.resolve()
	flushSync(() => {
		movePromise = commitMove()
	})
	await movePromise
}

async function commitTaskDrop(
	event: SortableEvent,
	{
		traceToken,
		suppressRollbackFlash,
		commitMove,
	}: {
		traceToken: string | null
		suppressRollbackFlash: boolean
		commitMove: () => Promise<unknown>
	},
) {
	markTaskDropTrace(traceToken, 'commit-start')
	restoreSortableDomPosition(event)
	markTaskDropTrace(traceToken, 'dom-restored')
	const item = event.item
	if (!(item instanceof HTMLElement) || !suppressRollbackFlash) {
		markTaskDropTrace(traceToken, 'flushsync-start')
		await flushTaskDropCommit(() => {
			markTaskDropTrace(traceToken, 'commit-move-invoked')
			return commitMove()
		})
		markTaskDropTrace(traceToken, 'async-resolved')
		return
	}

	item.style.visibility = 'hidden'
	item.style.pointerEvents = 'none'
	let movePromise: Promise<unknown> = Promise.resolve()
	try {
		markTaskDropTrace(traceToken, 'hide-rollback-node')
		markTaskDropTrace(traceToken, 'flushsync-start')
		flushSync(() => {
			markTaskDropTrace(traceToken, 'commit-move-invoked')
			movePromise = commitMove()
		})
		markTaskDropTrace(traceToken, 'flushsync-end')
	} finally {
		item.style.removeProperty('visibility')
		item.style.removeProperty('pointer-events')
		markTaskDropTrace(traceToken, 'rollback-node-restored')
	}
	await movePromise
	markTaskDropTrace(traceToken, 'async-resolved')
}

async function commitProjectDrop(
	event: SortableEvent,
	{
		traceToken,
		commitMove,
	}: {
		traceToken: string | null
		commitMove: () => Promise<unknown>
	},
) {
	markProjectDropTrace(traceToken, 'commit-start')
	restoreSortableDomPosition(event)
	markProjectDropTrace(traceToken, 'dom-restored')
	const item = event.item
	if (!(item instanceof HTMLElement)) {
		let movePromise: Promise<unknown> = Promise.resolve()
		markProjectDropTrace(traceToken, 'flushsync-start')
		flushSync(() => {
			markProjectDropTrace(traceToken, 'commit-move-invoked')
			movePromise = commitMove()
		})
		markProjectDropTrace(traceToken, 'flushsync-end')
		await movePromise
		markProjectDropTrace(traceToken, 'async-resolved')
		return
	}

	item.style.visibility = 'hidden'
	item.style.pointerEvents = 'none'
	let movePromise: Promise<unknown> = Promise.resolve()
	try {
		markProjectDropTrace(traceToken, 'hide-rollback-node')
		markProjectDropTrace(traceToken, 'flushsync-start')
		flushSync(() => {
			markProjectDropTrace(traceToken, 'commit-move-invoked')
			movePromise = commitMove()
		})
		markProjectDropTrace(traceToken, 'flushsync-end')
	} finally {
		item.style.removeProperty('visibility')
		item.style.removeProperty('pointer-events')
		markProjectDropTrace(traceToken, 'rollback-node-restored')
	}
	await movePromise
	markProjectDropTrace(traceToken, 'async-resolved')
}

function restoreSortableDomPosition(event: SortableEvent) {
	const item = event.item
	if (!(item instanceof HTMLElement) || !(event.from instanceof HTMLElement)) {
		return
	}

	const oldIndex = Number(event.oldIndex)
	if (!Number.isInteger(oldIndex) || oldIndex < 0) {
		return
	}

	restoreDomPosition(item, event.from, oldIndex)
}

function restoreStoredDragDomPosition(context: DragContext) {
	if (!(context.dragItem instanceof HTMLElement) || !(context.dragFrom instanceof HTMLElement)) {
		return
	}

	const oldIndex = Number(context.dragOldIndex)
	if (!Number.isInteger(oldIndex) || oldIndex < 0) {
		return
	}

	restoreDomPosition(context.dragItem, context.dragFrom, oldIndex)
}

function restoreDomPosition(item: HTMLElement, from: HTMLElement, oldIndex: number) {
	const currentChildren = Array.from(from.children).filter(child => child !== item)
	const insertionPoint = currentChildren[oldIndex] || null
	if (item.parentElement !== from || item.nextElementSibling !== insertionPoint) {
		from.insertBefore(item, insertionPoint)
	}
}

function clearSortableDragState(item: HTMLElement | null) {
	if (!(item instanceof HTMLElement)) {
		return
	}

	item.classList.remove('sortable-ghost', 'sortable-chosen')
	item.style.removeProperty('display')
	item.style.removeProperty('transform')
	item.style.removeProperty('transition')
	item.style.removeProperty('position')
	item.style.removeProperty('left')
	item.style.removeProperty('top')
	item.style.removeProperty('width')
	item.style.removeProperty('height')
	item.style.removeProperty('opacity')
	item.style.removeProperty('z-index')
	item.style.removeProperty('will-change')
	item.style.removeProperty('pointer-events')
	item.style.removeProperty('visibility')
}

function isTaskDescendantOf(candidateId: number, ancestorId: number, collections: TaskCollectionsLookup) {
	if (candidateId === ancestorId) {
		return true
	}

	const ancestorTask = findTaskInAnyContext(ancestorId, collections)
	if (ancestorTask?.related_tasks?.parenttask?.some(parentRef => parentRef.id === candidateId)) {
		return true
	}

	const visited = new Set<number>()
	const stack = [ancestorId]
	while (stack.length > 0) {
		const currentId = stack.pop()
		if (!currentId || visited.has(currentId)) {
			continue
		}

		visited.add(currentId)
		const task = findTaskInAnyContext(currentId, collections)
		if (!task) {
			continue
		}

		for (const childRef of task.related_tasks?.subtask || []) {
			if (childRef.id === candidateId) {
				return true
			}
			stack.push(childRef.id)
		}
	}

	return false
}

function getTaskCollections(state: AppStore): TaskCollectionsLookup {
	return {
		tasks: state.tasks,
		todayTasks: state.todayTasks,
		inboxTasks: state.inboxTasks,
		upcomingTasks: state.upcomingTasks,
		searchTasks: state.searchTasks,
		savedFilterTasks: state.savedFilterTasks,
		projectPreviewTasksById: state.projectPreviewTasksById,
	}
}

function getVisibleTaskListForDrag(
	state: AppStore,
	taskId: number,
	projectId: number,
	collections: TaskCollectionsLookup,
) {
	switch (state.screen) {
		case 'today':
			return collections.todayTasks
		case 'inbox':
			return collections.inboxTasks
		case 'upcoming':
			return collections.upcomingTasks
		case 'tasks':
			return collections.tasks
		case 'search':
			return collections.searchTasks
		default:
			return getTaskCollectionForTask(taskId, projectId, collections)
	}
}

function getVisibleTaskListForTaskDrop(
	state: AppStore,
	taskId: number,
	targetProjectId: number,
	collections: TaskCollectionsLookup,
): Task[] | null {
	if (state.screen === 'projects') {
		const previewTasks = collections.projectPreviewTasksById[targetProjectId]
		return Array.isArray(previewTasks) ? previewTasks : null
	}

	if (state.screen === 'tasks') {
		if (state.selectedProjectId === targetProjectId) {
			return collections.tasks
		}

		const previewTasks = collections.projectPreviewTasksById[targetProjectId]
		if (Array.isArray(previewTasks)) {
			return previewTasks
		}

		return null
	}

	return getVisibleTaskListForDrag(state, taskId, targetProjectId, collections)
}

function resolveTaskDropTargetProjectId(
	container: HTMLElement,
	state: AppStore,
	fallbackProjectId: number,
	parentTaskId: number | null,
) {
	if (parentTaskId) {
		const parentTask = findTaskInAnyContext(parentTaskId, getTaskCollections(state))
		return Number(parentTask?.project_id || fallbackProjectId)
	}

	const projectNode = container.closest('.project-node[data-project-node-id]')
	if (projectNode instanceof HTMLElement) {
		const projectId = Number(projectNode.dataset.projectNodeId || 0)
		if (projectId) {
			return projectId
		}
	}

	if (state.screen === 'tasks' && state.selectedProjectId) {
		return state.selectedProjectId
	}

	if (state.screen === 'inbox' && state.inboxProjectId) {
		return state.inboxProjectId
	}

	return fallbackProjectId
}

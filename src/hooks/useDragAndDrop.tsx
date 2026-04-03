import {useEffect, type ReactNode} from 'react'
import {flushSync} from 'react-dom'
import {useAppStore, type AppStore} from '@/store'
import {getProjectDescendantIds} from '@/store/project-helpers'
import {findTaskInAnyContext, getTaskCollectionForTask, isSameListManualTaskReorderAllowed} from '@/store/selectors'
import type {Task} from '@/types'
import {
	beginProjectDropTrace,
	beginTaskDropTrace,
	debugDragLog,
	markProjectDropTrace,
	markTaskDropTrace,
} from '@/utils/dragPerf'
import {calculateTaskPosition} from '@/utils/taskPosition'

let activeDragContext: DragContext | null = null
let suppressClicksUntil = 0
let requestSortableRebind: (() => void) | null = null

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
	const screen = useAppStore(state => state.screen)

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

		requestSortableRebind = scheduleBind

		const observer = new MutationObserver(() => {
			scheduleBind()
		})

		document.addEventListener('click', blockDragClick, true)
		document.addEventListener('pointerup', blockDragClick, true)
		document.addEventListener('touchend', blockDragClick, true)
		document.addEventListener('pointercancel', handleActiveDragInterruption, true)
		document.addEventListener('touchcancel', handleActiveDragInterruption, true)
		document.addEventListener('visibilitychange', handleActiveDragVisibilityChange)
		window.addEventListener('blur', handleActiveDragInterruption)
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
			document.removeEventListener('pointercancel', handleActiveDragInterruption, true)
			document.removeEventListener('touchcancel', handleActiveDragInterruption, true)
			document.removeEventListener('visibilitychange', handleActiveDragVisibilityChange)
			window.removeEventListener('blur', handleActiveDragInterruption)
			destroyInstances()
			if (requestSortableRebind === scheduleBind) {
				requestSortableRebind = null
			}
			abortActiveDragSession({scheduleRebind: false})
		}
	}, [connected, screen])
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
	abortActiveDragSession({scheduleRebind: false})
	handledSidebarDrop = null
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
		debugDragLog('[DnD:onMove] no active drag context')
		return
	}

	if (!isEligibleSortableContainer(activeDragContext.type, event.to)) {
		debugDragLog('[DnD:onMove] blocked: ineligible container', {
			type: activeDragContext.type,
			to: event.to,
			sortableKind: (event.to as HTMLElement)?.dataset?.sortableKind,
		})
		return false
	}

	if (activeDragContext.dropTargetProjectId || activeDragContext.dropTargetTaskId) {
		debugDragLog('[DnD:onMove] blocked: explicit drop target active', {
			projectId: activeDragContext.dropTargetProjectId,
			taskId: activeDragContext.dropTargetTaskId,
		})
		return false
	}

	if (isPointerOverInvalidCrossTypeSurface(activeDragContext)) {
		debugDragLog('[DnD:onMove] blocked: cross-type surface')
		return false
	}

	if (
		activeDragContext.type === 'task' &&
		isSameTaskListSortableMove(event) &&
		!isSameListTaskManualReorderAllowedForActiveScreen()
	) {
		debugDragLog('[DnD:onMove] blocked: same-list manual reorder inactive')
		return false
	}

	debugDragLog('[DnD:onMove] allowed')
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
		// When dragging from a Kanban bucket, skip subtask hit-testing during the
		// drag. Without this, every Kanban card under the pointer registers as a
		// subtask drop target, which sets dropTargetTaskId — and that makes
		// handleSortableOnMove return false, blocking Sortable from reordering or
		// moving items between buckets. Subtask detection for Kanban still happens
		// at the END of the drag in handleSortableTaskEnd, where the
		// sortableMovedToKanbanBucket check distinguishes bucket moves from subtask
		// drops.
		const isDraggingFromKanbanBucket =
			activeDragContext.dragFrom instanceof HTMLElement &&
			Boolean(activeDragContext.dragFrom.dataset.kanbanBucketId)
		if (!isDraggingFromKanbanBucket) {
			const taskTarget = hitTestTaskRows(activeDragContext, clientX, clientY)
			if (taskTarget) {
				applyDropTarget(activeDragContext, null, taskTarget)
				return
			}
		} else {
			// For Kanban drags, use a tight middle zone (30%) to detect subtask
			// targets.  When detected, applyDropTarget sets dropTargetTaskId which
			// makes handleSortableOnMove block SortableJS reordering — this keeps
			// the target card in place so the user can drop on it.
			const taskTarget = hitTestTaskRows(activeDragContext, clientX, clientY, 0.3)
			if (taskTarget) {
				applyDropTarget(activeDragContext, null, taskTarget)
				return
			}
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

function hitTestTaskRows(context: DragContext, clientX: number, clientY: number, middleZoneFraction = 0.75) {
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
		if (clientX < rect.left || clientX > rect.right || !isInMiddleZone(clientY, rect, middleZoneFraction)) {
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

function isInMiddleZone(clientY: number, rect: DOMRect, fraction = 0.75) {
	const margin = rect.height * ((1 - fraction) / 2)
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

function cleanupDragTracking({scheduleRebind = true}: {scheduleRebind?: boolean} = {}) {
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
	if (scheduleRebind) {
		requestSortableRebind?.()
	}
	return context
}

function abortActiveDragSession({scheduleRebind = true}: {scheduleRebind?: boolean} = {}) {
	const context = cleanupDragTracking({scheduleRebind})
	if (!context) {
		return null
	}

	restoreStoredDragDomPosition(context)
	clearSortableDragState(context.dragItem)
	handledSidebarDrop = null
	return context
}

function handleActiveDragInterruption() {
	abortActiveDragSession()
}

function handleActiveDragVisibilityChange() {
	if (document.visibilityState === 'hidden') {
		abortActiveDragSession()
	}
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
		debugDragLog('[DnD:end] missing moved branch element')
		return
	}

	const taskRow = movedBranch.matches('[data-task-row-id]')
		? movedBranch
		: movedBranch.querySelector('[data-task-row-id]')
	if (!(taskRow instanceof HTMLElement)) {
		debugDragLog('[DnD:end] missing task row element')
		return
	}

	const taskId = Number(taskRow.dataset.taskRowId || 0)
	if (!taskId) {
		debugDragLog('[DnD:end] missing task id')
		return
	}

	if (handledSidebarDrop?.type === 'task' && handledSidebarDrop.id === taskId) {
		debugDragLog('[DnD:end] task already handled by sidebar drop')
		clearSortableDragState(event.item instanceof HTMLElement ? event.item : null)
		handledSidebarDrop = null
		return
	}

	const store = useAppStore.getState()
	const collections = getTaskCollections(store)
	const task = findTaskInAnyContext(taskId, collections)
	if (!task) {
		debugDragLog('[DnD:end] task missing from store', {taskId})
		restoreSortableDomPosition(event)
		return
	}

	const releaseProjectTarget =
		dragContext && dragContext.lastX != null && dragContext.lastY != null
			? hitTestProjectRows(dragContext, dragContext.lastX, dragContext.lastY)
			: null
	// Subtask detection: try hit-testing at the last pointer position first.
	// Fall back to the dropTargetTaskId tracked during the drag — SortableJS
	// may have rearranged the DOM before onEnd, making post-drop hit-testing
	// unreliable (especially in Kanban).
	const hitTestedTaskTarget =
		dragContext && dragContext.lastX != null && dragContext.lastY != null
			? hitTestTaskRows(dragContext, dragContext.lastX, dragContext.lastY)
			: null
	const releaseTaskTarget =
		hitTestedTaskTarget
			|| (dragContext?.dropTargetTaskId
				? {taskId: dragContext.dropTargetTaskId, element: dragContext.dropTargetTaskElement}
				: null)

	const kanbanBucketId = Number((event.to instanceof HTMLElement ? event.to.dataset.kanbanBucketId : 0) || 0)
	const fromBucketId = Number((event.from instanceof HTMLElement ? (event.from as HTMLElement).dataset.kanbanBucketId : 0) || 0)
	debugDragLog('[DnD:end] resolved drop context', {
		taskId,
		taskTitle: task.title,
		releaseProjectTarget: releaseProjectTarget?.projectId || null,
		releaseTaskTarget: releaseTaskTarget?.taskId || null,
		kanbanBucketId,
		fromBucketId,
		eventToTag: event.to?.tagName,
		eventToClass: event.to?.className,
		eventFromTag: event.from?.tagName,
		eventFromClass: event.from?.className,
		currentProjectViewId: store.currentProjectViewId,
		dragContextExists: Boolean(dragContext),
		lastX: dragContext?.lastX,
		lastY: dragContext?.lastY,
	})

	if (releaseProjectTarget?.projectId) {
		debugDragLog('[DnD:end] project drop', {projectId: releaseProjectTarget.projectId})
		const targetProjectId = releaseProjectTarget.projectId
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
			commitMove: () => store.moveTask({
				taskId,
				parentTaskId: null,
				targetProjectId,
				traceToken,
				taskList: visibleTaskList,
			}),
		})
		return
	}

	if (releaseTaskTarget?.taskId) {
		debugDragLog('[DnD:end] subtask drop', {targetTaskId: releaseTaskTarget.taskId})
		const targetTaskId = releaseTaskTarget.taskId
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
			commitMove: () => store.moveTask({
				taskId,
				parentTaskId: targetTaskId,
				traceToken,
			}),
		})
		return
	}

	if (kanbanBucketId) {
		debugDragLog('[DnD:end] kanban bucket drop', {kanbanBucketId, fromBucketId})
		const siblingIds = getSiblingTaskIdsFromContainer(event.to)
		const movedIndex = siblingIds.indexOf(taskId)
		const traceToken = beginTaskDropTrace({
			taskId,
			sourceProjectId: task.project_id,
			targetProjectId: task.project_id,
			targetParentTaskId: null,
		})
		debugDragLog('[DnD:end] kanban bucket move details', {
			siblingIds,
			movedIndex,
			currentProjectViewId: store.currentProjectViewId,
		})
		if (movedIndex === -1 || !store.currentProjectViewId) {
			debugDragLog('[DnD:end] kanban drop aborted: missing target index or view id', {
				movedIndex,
				currentProjectViewId: store.currentProjectViewId,
			})
			restoreSortableDomPosition(event)
			return
		}

		await commitTaskDrop(event, {
			traceToken,
			suppressRollbackFlash: false,
			commitMove: () =>
				store.moveTask({
					taskId,
					targetProjectId: task.project_id,
					viewId: store.currentProjectViewId,
					bucketId: kanbanBucketId,
					beforeTaskId: siblingIds[movedIndex - 1] || null,
					afterTaskId: siblingIds[movedIndex + 1] || null,
					siblingIds,
					traceToken,
				}),
		})

		// Toggle done status when moving between done/non-done buckets
		if (fromBucketId && kanbanBucketId !== fromBucketId) {
			const currentStore = useAppStore.getState()
			const doneBucketId = resolveKanbanDoneBucketId(currentStore, task.project_id, store.currentProjectViewId)
			if (doneBucketId) {
				const movedFromDone = fromBucketId === doneBucketId && kanbanBucketId !== doneBucketId
				const movedToDone = fromBucketId !== doneBucketId && kanbanBucketId === doneBucketId
				if ((movedFromDone && task.done) || (movedToDone && !task.done)) {
					debugDragLog('[DnD:end] toggling done status after bucket move', {
						movedFromDone,
						movedToDone,
						taskDone: task.done,
					})
					void currentStore.toggleTaskDone(taskId, {
						kanbanViewId: store.currentProjectViewId ?? undefined,
						sourceBucketId: kanbanBucketId,
						targetBucketId: kanbanBucketId,
					})
				}
			}
		}
		return
	}

	if (dragContext && isPointerOverInvalidCrossTypeSurface(dragContext)) {
		restoreSortableDomPosition(event)
		return
	}

	if (isSameTaskListSortableMove(event) && !isSameListTaskManualReorderAllowedForActiveScreen()) {
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
		commitMove: () => store.moveTask({
			taskId,
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
	return Array.from(container.children)
		.map(child => {
			if (!(child instanceof HTMLElement)) {
				return 0
			}

			if (child.classList.contains('kanban-task-item')) {
				return Number(child.dataset.taskRowId || 0)
			}

			if (!child.classList.contains('task-branch')) {
				return 0
			}

			const row = child.querySelector('.task-row[data-task-row-id]')
			return Number(row instanceof HTMLElement ? row.dataset.taskRowId || 0 : 0)
		})
		.filter(taskId => taskId > 0)
}

function getSiblingProjectIdsFromContainer(container: HTMLElement) {
	return Array.from(container.children)
		.map(node => Number(node instanceof HTMLElement && node.classList.contains('project-node') ? node.dataset.projectNodeId || 0 : 0))
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

function isSameTaskListSortableMove(event: SortableEvent) {
	return event.from instanceof HTMLElement && event.to instanceof HTMLElement && event.from === event.to
}

function isSameListTaskManualReorderAllowedForActiveScreen() {
	const state = useAppStore.getState()
	return isSameListManualTaskReorderAllowed({
		screen: state.screen,
		taskFilters: state.taskFilters,
		projectFilters: state.projectFilters,
		activeProjectViewKind: getActiveProjectViewKind(state),
	})
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
		await store.moveTask({
			taskId: task.id,
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

function getActiveProjectViewKind(state: AppStore) {
	if (!state.selectedProjectId || !state.currentProjectViewId) {
		return null
	}

	const activeProjectViews = state.projectViewsById[state.selectedProjectId] || []
	return activeProjectViews.find(view => view.id === state.currentProjectViewId)?.view_kind || null
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

function resolveKanbanDoneBucketId(
	state: AppStore,
	projectId: number,
	viewId: number | null,
): number {
	if (!viewId || !projectId) return 0
	const views = state.projectViewsById[projectId] || []
	const view = views.find(v => v.id === viewId) || null
	if (!view) return 0
	return Number(view.doneBucketId ?? view.done_bucket_id ?? 0) || 0
}

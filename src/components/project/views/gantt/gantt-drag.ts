import {type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState} from 'react'

import type {GanttZoom} from './gantt-helpers'

export interface DragState {
	taskId: number
	mode: 'move' | 'resize-start' | 'resize-end'
	initialPointerX: number
	hasDragged: boolean
	initialStartDate: Date
	initialEndDate: Date
	currentStartDate: Date
	currentEndDate: Date
	columnWidth: number
	pointerId: number
	element: HTMLElement | null
}

export interface ActiveGanttDrag {
	taskId: number
	mode: DragState['mode']
	startDate: Date
	endDate: Date
}

const EDGE_WIDTH = 8
const DRAG_ACTIVATION_DISTANCE = 4

export function useGanttBarDrag({
	zoom,
	onDragUpdate,
	onDragEnd,
}: {
	zoom: GanttZoom
	onDragUpdate: (taskId: number, startDate: Date, endDate: Date) => void
	onDragEnd: (taskId: number, startDate: Date, endDate: Date) => void
}) {
	const dragStateRef = useRef<DragState | null>(null)
	const callbacksRef = useRef({zoom, onDragUpdate, onDragEnd})
	const suppressClickRef = useRef<{taskId: number; until: number} | null>(null)
	const [activeDrag, setActiveDrag] = useState<ActiveGanttDrag | null>(null)

	useEffect(() => {
		callbacksRef.current = {zoom, onDragUpdate, onDragEnd}
	}, [onDragEnd, onDragUpdate, zoom])

	useEffect(() => {
		function handlePointerMove(event: PointerEvent) {
			const state = dragStateRef.current
			if (!state) {
				return
			}

			if (!state.hasDragged && Math.abs(event.clientX - state.initialPointerX) >= DRAG_ACTIVATION_DISTANCE) {
				state.hasDragged = true
			}

			const deltaColumns = Math.round((event.clientX - state.initialPointerX) / state.columnWidth)
			const {zoom: currentZoom, onDragUpdate: currentOnDragUpdate} = callbacksRef.current
			let nextStart = new Date(state.initialStartDate.getTime())
			let nextEnd = new Date(state.initialEndDate.getTime())

			switch (state.mode) {
				case 'move':
					nextStart = shiftDateByZoom(state.initialStartDate, deltaColumns, currentZoom)
					nextEnd = shiftDateByZoom(state.initialEndDate, deltaColumns, currentZoom)
					break
				case 'resize-start':
					nextStart = shiftDateByZoom(state.initialStartDate, deltaColumns, currentZoom)
					if (nextStart.getTime() > nextEnd.getTime()) {
						nextStart = new Date(nextEnd.getTime())
					}
					break
				case 'resize-end':
					nextEnd = shiftDateByZoom(state.initialEndDate, deltaColumns, currentZoom)
					if (nextEnd.getTime() < nextStart.getTime()) {
						nextEnd = new Date(nextStart.getTime())
					}
					break
			}

			if (
				nextStart.getTime() === state.currentStartDate.getTime() &&
				nextEnd.getTime() === state.currentEndDate.getTime()
			) {
				return
			}

			state.currentStartDate = nextStart
			state.currentEndDate = nextEnd
			setActiveDrag({
				taskId: state.taskId,
				mode: state.mode,
				startDate: nextStart,
				endDate: nextEnd,
			})
			currentOnDragUpdate(state.taskId, nextStart, nextEnd)
		}

		function finishDrag() {
			const state = dragStateRef.current
			if (!state) {
				return
			}

			try {
				state.element?.releasePointerCapture?.(state.pointerId)
			} catch {}

			const changed =
				state.currentStartDate.getTime() !== state.initialStartDate.getTime() ||
				state.currentEndDate.getTime() !== state.initialEndDate.getTime()
			const shouldSuppress =
				state.mode !== 'move' ||
				state.hasDragged ||
				changed
			const nextStart = new Date(state.currentStartDate.getTime())
			const nextEnd = new Date(state.currentEndDate.getTime())
			const nextTaskId = state.taskId

			dragStateRef.current = null
			setActiveDrag(null)

			if (shouldSuppress) {
				suppressClickRef.current = {
					taskId: nextTaskId,
					until: Date.now() + 300,
				}
			}

			if (!changed) {
				return
			}

			callbacksRef.current.onDragEnd(nextTaskId, nextStart, nextEnd)
		}

		window.addEventListener('pointermove', handlePointerMove)
		window.addEventListener('pointerup', finishDrag)
		window.addEventListener('pointercancel', finishDrag)

		return () => {
			window.removeEventListener('pointermove', handlePointerMove)
			window.removeEventListener('pointerup', finishDrag)
			window.removeEventListener('pointercancel', finishDrag)
		}
	}, [])

	const updateHoverCursor = useCallback((event: ReactPointerEvent<HTMLElement>) => {
		if (dragStateRef.current) {
			return
		}

		const rect = event.currentTarget.getBoundingClientRect()
		const offsetX = event.clientX - rect.left
		const isResizeZone = offsetX <= EDGE_WIDTH || rect.width - offsetX <= EDGE_WIDTH
		event.currentTarget.style.cursor = isResizeZone ? 'col-resize' : 'grab'
	}, [])

	const getBarPointerProps = useCallback((taskId: number, startDate: Date, endDate: Date) => {
		return {
			onPointerDown(event: ReactPointerEvent<HTMLElement>) {
				if (event.button !== 0) {
					return
				}

				const rect = event.currentTarget.getBoundingClientRect()
				const offsetX = event.clientX - rect.left
				const mode: DragState['mode'] =
					offsetX <= EDGE_WIDTH ? 'resize-start' : rect.width - offsetX <= EDGE_WIDTH ? 'resize-end' : 'move'
				const probeColumn = event.currentTarget.ownerDocument.querySelector<HTMLElement>('.project-gantt-day')
				const columnWidth = probeColumn?.getBoundingClientRect().width || rect.width || 42
				const initialStartDate = new Date(startDate.getTime())
				const initialEndDate = new Date(endDate.getTime())

				dragStateRef.current = {
					taskId,
					mode,
					initialPointerX: event.clientX,
					hasDragged: false,
					initialStartDate,
					initialEndDate,
					currentStartDate: initialStartDate,
					currentEndDate: initialEndDate,
					columnWidth,
					pointerId: event.pointerId,
					element: event.currentTarget,
				}

				setActiveDrag({
					taskId,
					mode,
					startDate: initialStartDate,
					endDate: initialEndDate,
				})

				try {
					event.currentTarget.setPointerCapture(event.pointerId)
				} catch {}

				event.preventDefault()
				event.stopPropagation()
			},
			onPointerMove: updateHoverCursor,
			onPointerLeave(event: ReactPointerEvent<HTMLElement>) {
				if (!dragStateRef.current) {
					event.currentTarget.style.cursor = ''
				}
			},
		}
	}, [updateHoverCursor])

	const shouldSuppressClick = useCallback((taskId: number) => {
		const active = suppressClickRef.current
		if (!active) {
			return false
		}

		if (Date.now() > active.until) {
			suppressClickRef.current = null
			return false
		}

		return active.taskId === taskId
	}, [])

	return {
		activeDrag,
		getBarPointerProps,
		shouldSuppressClick,
	}
}

function shiftDateByZoom(date: Date, deltaColumns: number, zoom: GanttZoom) {
	const nextDate = new Date(date.getTime())
	nextDate.setHours(0, 0, 0, 0)

	if (!deltaColumns) {
		return nextDate
	}

	if (zoom === 'day') {
		nextDate.setDate(nextDate.getDate() + deltaColumns)
		return nextDate
	}

	if (zoom === 'week') {
		nextDate.setDate(nextDate.getDate() + deltaColumns * 7)
		return nextDate
	}

	const originalDay = nextDate.getDate()
	nextDate.setDate(1)
	nextDate.setMonth(nextDate.getMonth() + deltaColumns)
	const daysInTargetMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()
	nextDate.setDate(Math.min(originalDay, daysInTargetMonth))
	nextDate.setHours(0, 0, 0, 0)
	return nextDate
}

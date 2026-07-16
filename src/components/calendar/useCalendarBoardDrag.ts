import {type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState} from 'react'
import {MIN_SPAN_MS, snapToSlot, type RescheduleMode} from '@/utils/calendar-reschedule'
import {capturePointer, DRAG_ACTIVATION_DISTANCE, releasePointer, usePointerDragListeners} from '@/utils/pointer-drag'

const DAY_MINUTES = 24 * 60
const MINUTE_MS = 60 * 1000

export interface CalendarDragPreview {
	taskId: number
	mode: RescheduleMode
	startMs: number
	endMs: number
}

interface DragState {
	taskId: number
	mode: RescheduleMode
	pointerId: number
	handle: HTMLElement
	// The lane track is stable across preview re-renders (only the card inside it
	// is replaced), so resize and off-lane moves anchor to it, not to the handle.
	originTrack: HTMLElement
	originDayMs: number
	originStartMs: number
	originEndMs: number
	durationMs: number
	// Time offset between the grab point and the block's start, so a move keeps
	// the block under the finger instead of snapping its top to the pointer.
	grabOffsetMs: number
	initialPointerY: number
	hasDragged: boolean
	currentStartMs: number
	currentEndMs: number
}

// Minute-of-day (0–1440) for a pointer Y within a track, clamped to the day.
function pointerMinuteOfDay(clientY: number, rect: DOMRect): number {
	const fraction = (clientY - rect.top) / rect.height
	return Math.max(0, Math.min(DAY_MINUTES, fraction * DAY_MINUTES))
}

// After a drag the browser synthesizes a click at the release point; left
// unchecked it lands on a time slot and opens the add-task composer. Swallow
// exactly that next click (capture phase), with a short timeout fallback so a
// touch gesture that emits no click doesn't leave the trap armed.
function suppressNextClick(): void {
	const swallow = (event: MouseEvent) => {
		event.stopPropagation()
		event.preventDefault()
		cleanup()
	}
	function cleanup() {
		window.removeEventListener('click', swallow, true)
		window.clearTimeout(timer)
	}
	const timer = window.setTimeout(cleanup, 350)
	window.addEventListener('click', swallow, true)
}

function trackUnderPointer(clientX: number, clientY: number): HTMLElement | null {
	for (const el of document.elementsFromPoint(clientX, clientY)) {
		const track = (el as HTMLElement).closest?.('.calendar-board-track')
		if (track instanceof HTMLElement && track.dataset.dayMs) {
			return track
		}
	}
	return null
}

// Pointer-drag for the week/day timeline: a handle-started move (vertical time +
// horizontal day) and span edge-resizes, snapped to 15-minute slots. Emits a live
// preview the grid re-buckets through buildReschedulePatch, then commits on drop.
export function useCalendarBoardDrag(onReschedule: (
	taskId: number,
	mode: RescheduleMode,
	newStartMs: number,
	newEndMs: number,
) => void) {
	const dragStateRef = useRef<DragState | null>(null)
	const onRescheduleRef = useRef(onReschedule)
	const [preview, setPreview] = useState<CalendarDragPreview | null>(null)

	useEffect(() => {
		onRescheduleRef.current = onReschedule
	}, [onReschedule])

	const handlePointerMove = useCallback((event: PointerEvent) => {
		const state = dragStateRef.current
		if (!state || event.pointerId !== state.pointerId) {
			return
		}

		if (!state.hasDragged && Math.abs(event.clientY - state.initialPointerY) >= DRAG_ACTIVATION_DISTANCE) {
			state.hasDragged = true
		}

		let newStartMs = state.originStartMs
		let newEndMs = state.originEndMs

		if (state.mode === 'move') {
			// Anchor to the lane under the pointer, falling back to the origin lane
			// when the pointer strays off any track — never default to midnight,
			// which would teleport the block to the previous day's 00:00.
			const track = trackUnderPointer(event.clientX, event.clientY) ?? state.originTrack
			const dayMs = Number(track.dataset.dayMs)
			const minute = pointerMinuteOfDay(event.clientY, track.getBoundingClientRect())
			const pointerMs = dayMs + minute * MINUTE_MS
			newStartMs = snapToSlot(pointerMs - state.grabOffsetMs)
			newEndMs = newStartMs + state.durationMs
		} else {
			// The origin lane is stable across preview re-renders; the resize div
			// (state.handle) is replaced, so anchor edge math to the lane instead.
			const minute = pointerMinuteOfDay(event.clientY, state.originTrack.getBoundingClientRect())
			const edgeMs = snapToSlot(state.originDayMs + minute * MINUTE_MS)
			if (state.mode === 'resize-start') {
				newStartMs = Math.min(edgeMs, state.originEndMs - MIN_SPAN_MS)
			} else {
				newEndMs = Math.max(edgeMs, state.originStartMs + MIN_SPAN_MS)
			}
		}

		state.currentStartMs = newStartMs
		state.currentEndMs = newEndMs
		setPreview({taskId: state.taskId, mode: state.mode, startMs: newStartMs, endMs: newEndMs})
	}, [])

	const finishDrag = useCallback((event: PointerEvent) => {
		const state = dragStateRef.current
		if (!state || event.pointerId !== state.pointerId) {
			return
		}
		releasePointer(state.handle, state.pointerId)
		dragStateRef.current = null
		setPreview(null)
		if (state.hasDragged) {
			suppressNextClick()
			onRescheduleRef.current(state.taskId, state.mode, state.currentStartMs, state.currentEndMs)
		}
	}, [])

	usePointerDragListeners(handlePointerMove, finishDrag)

	function begin(
		event: ReactPointerEvent<HTMLElement>,
		mode: RescheduleMode,
		taskId: number,
		startMs: number,
		endMs: number,
	) {
		if (event.button !== 0 && event.pointerType === 'mouse') {
			return
		}
		const handle = event.currentTarget
		const track = handle.closest('.calendar-board-track') as HTMLElement | null
		if (!track) {
			return
		}
		const rect = track.getBoundingClientRect()
		const originDayMs = Number(track.dataset.dayMs)
		const grabMs = originDayMs + pointerMinuteOfDay(event.clientY, rect) * MINUTE_MS

		dragStateRef.current = {
			taskId,
			mode,
			pointerId: event.pointerId,
			handle,
			originTrack: track,
			originDayMs,
			originStartMs: startMs,
			originEndMs: endMs,
			durationMs: Math.max(0, endMs - startMs),
			grabOffsetMs: grabMs - startMs,
			initialPointerY: event.clientY,
			hasDragged: false,
			currentStartMs: startMs,
			currentEndMs: endMs,
		}
		capturePointer(handle, event.pointerId)
		event.preventDefault()
		event.stopPropagation()
	}

	return {preview, begin}
}

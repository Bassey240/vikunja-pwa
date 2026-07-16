import {useEffect, useRef} from 'react'

// Pointer travel before a press becomes a drag — shared by every non-Sortable
// pointer-span-drag engine (gantt bars, calendar timeline) so they activate
// identically.
export const DRAG_ACTIVATION_DISTANCE = 4

export function capturePointer(element: HTMLElement | null | undefined, pointerId: number): void {
	try {
		element?.setPointerCapture(pointerId)
	} catch {}
}

export function releasePointer(element: HTMLElement | null | undefined, pointerId: number): void {
	try {
		element?.releasePointerCapture?.(pointerId)
	} catch {}
}

// Wire window-level pointermove / pointerup / pointercancel to a live drag. Both
// pointer-span-drag engines share this exact lifecycle; only the geometry in the
// handlers differs. Handlers are held in a ref so they always see the latest
// closure without re-subscribing the listeners.
export function usePointerDragListeners(
	onMove: (event: PointerEvent) => void,
	onFinish: (event: PointerEvent) => void,
): void {
	const handlersRef = useRef({onMove, onFinish})

	useEffect(() => {
		handlersRef.current = {onMove, onFinish}
	}, [onFinish, onMove])

	useEffect(() => {
		function handleMove(event: PointerEvent) {
			handlersRef.current.onMove(event)
		}
		function handleFinish(event: PointerEvent) {
			handlersRef.current.onFinish(event)
		}

		window.addEventListener('pointermove', handleMove)
		window.addEventListener('pointerup', handleFinish)
		window.addEventListener('pointercancel', handleFinish)

		return () => {
			window.removeEventListener('pointermove', handleMove)
			window.removeEventListener('pointerup', handleFinish)
			window.removeEventListener('pointercancel', handleFinish)
		}
	}, [])
}

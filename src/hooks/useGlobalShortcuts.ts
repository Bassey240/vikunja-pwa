import {useEffect} from 'react'

export type ShortcutMap = Record<string, () => void>

// The subset of KeyboardEvent the guard reads — structural, so unit tests can
// exercise it without a DOM.
export interface ShortcutKeyEvent {
	metaKey: boolean
	ctrlKey: boolean
	altKey: boolean
	isComposing: boolean
	target: {closest: (selector: string) => unknown} | null
}

// Typing contexts, modifier chords, and IME composition never trigger
// single-key shortcuts.
export function isShortcutBlocked(event: ShortcutKeyEvent): boolean {
	if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
		return true
	}
	const target = event.target
	if (!target || typeof target.closest !== 'function') {
		return false
	}
	return Boolean(target.closest('input, textarea, select, [contenteditable]'))
}

// Single-key shortcuts for the active screen. Keys match event.key: letters
// are looked up case-insensitively, named keys ("ArrowLeft") verbatim.
export default function useGlobalShortcuts(map: ShortcutMap, enabled = true) {
	useEffect(() => {
		if (!enabled) {
			return
		}
		function onKeyDown(event: KeyboardEvent) {
			if (isShortcutBlocked(event)) {
				return
			}
			const handler = map[event.key] ?? map[event.key.toLowerCase()]
			if (handler) {
				event.preventDefault()
				handler()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [map, enabled])
}

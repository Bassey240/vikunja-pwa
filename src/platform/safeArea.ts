// Cross-platform keyboard handling for the mobile shell (PWA + native iOS).
//
// Two jobs, both driven off `data-editing` on <html> (set via focusin/focusout the
// instant a field is tapped, before the keyboard animates):
//
//  1. Steady fixed header. iOS shifts the *visual viewport* up to reveal a focused
//     field, riding the layout-fixed masthead up — the "flash". We don't chase it; we
//     prevent it: suppressKeyboardScroll() blanks the field until the keyboard opens so
//     WebKit skips the scroll-into-view shift entirely. The viewport never moves, so the
//     masthead (plain position:fixed; top:0) never moves. No transform, no rAF. (The
//     narrow shell is also locked to one 100vh frame — only .surface-content scrolls —
//     so no document scroll can pan the viewport either; see styles.css.)
//
//  2. Composer above the keyboard. Because we suppress the shift, iOS no longer floats
//     fixed bottom boxes above the keyboard for us — so we measure the keyboard from
//     the visual viewport (--keyboard-height = innerHeight − visualViewport.height) and
//     CSS lifts the composer/dock by it. 0 at rest. Resize-driven, never per-frame.
//
// The footer hide and safe-area are plain CSS (display:none while editing; env()).
const NON_KEYBOARD_INPUT = /^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/i

function raisesKeyboard(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) {
		return false
	}
	if (el.isContentEditable) {
		return true
	}
	if (el.tagName === 'TEXTAREA') {
		return true
	}
	if (el.tagName === 'INPUT') {
		return !NON_KEYBOARD_INPUT.test((el as HTMLInputElement).type || 'text')
	}
	return false
}

// Runtime iOS check. The reveal-pan is an iOS Safari (mobile Safari) behavior,
// so detect the browser at runtime. (iPadOS 13+ reports as MacIntel, hence the
// touch check.)
// Gating to iOS keeps the blank off desktop/Android, where it would only blink.
const IS_IOS =
	typeof navigator !== 'undefined' &&
	(/iP(hone|ad|od)/.test(navigator.platform) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
		/iPad|iPhone|iPod/.test(navigator.userAgent))

// How far the visual viewport must shrink before we treat the keyboard as already
// "open". A software keyboard is ~250–350px; a format/accessory bar is ~44px, so this
// cleanly separates "keyboard up" from "bar only".
const KEYBOARD_OPEN_MIN_PX = 120
// Safety net: restore a blanked field even if the keyboard's visualViewport 'resize'
// never arrives (e.g. a focus that opens no keyboard). Long enough to sit well past
// iOS's scroll-into-view decision, short enough to never be noticed.
const OPACITY_RESTORE_FALLBACK_MS = 600
// Debounce focusout so moving between fields doesn't drop data-editing (footer back in,
// composer drop) for a frame between blur and the next focus.
const BLUR_DEBOUNCE_MS = 100

// True when the software keyboard is already up (visual viewport shrunk well past
// any accessory bar). iOS only does the reveal-pan when the keyboard is *opening*.
function keyboardIsOpen(): boolean {
	const vp = window.visualViewport
	return vp ? window.innerHeight - vp.height > KEYBOARD_OPEN_MIN_PX : false
}

// The pan-suppression and reveal-blank only make sense inside the locked narrow
// shell (one 100vh frame, fixed chrome, internal .surface-content scroller). The
// auth/lock screens render outside it and scroll the document, so suppression there
// just kills their scroll and blocks iOS scroll-into-view — gate both on this.
function inLockedShell(target: EventTarget | null): boolean {
	return target instanceof Element && Boolean(target.closest('.shell:not(.shell-wide)'))
}

// True when an ancestor scroller can still move in the drag's dominant direction.
function dragHasConsumer(start: Element, dx: number, dy: number): boolean {
	const vertical = Math.abs(dy) >= Math.abs(dx)
	for (let el: Element | null = start; el && el !== document.body; el = el.parentElement) {
		if (!(el instanceof HTMLElement)) {
			continue
		}
		const style = getComputedStyle(el)
		if (vertical && (style.overflowY === 'auto' || style.overflowY === 'scroll')) {
			if (dy > 0 ? el.scrollTop > 0 : el.scrollTop < el.scrollHeight - el.clientHeight - 1) {
				return true
			}
		}
		if (!vertical && (style.overflowX === 'auto' || style.overflowX === 'scroll')) {
			if (dx > 0 ? el.scrollLeft > 0 : el.scrollLeft < el.scrollWidth - el.clientWidth - 1) {
				return true
			}
		}
	}
	return false
}

// Prevent iOS's scroll-into-view — the real cause of the fixed-masthead "flash".
//
// When a field is focused, WebKit shifts the *visual viewport* up to reveal it,
// and a position:fixed header (anchored to the layout viewport) rides that shift
// up before any JS can compensate. interactive-widget=resizes-content would fix it
// cleanly but is unsupported on iOS, and every chase/translate approach only corrects
// *after* the shift (the flash). WebKit skips the shift entirely when the focused
// element is opacity:0 at the instant it decides to scroll, so we blank the field
// and restore it once that decision is past — the viewport never moves, so the header
// never moves. (kiding gist; the standard zero-flash technique.)
function suppressKeyboardScroll(target: EventTarget | null): void {
	if (!IS_IOS || !(target instanceof HTMLElement)) {
		return
	}
	// Outside the locked shell (auth/lock screens) let iOS scroll the field into
	// view normally — there's no fixed masthead to flash.
	if (!inLockedShell(target)) {
		return
	}
	// The reveal-pan only fires when the keyboard is *opening*. If it's already up
	// (moving between composer fields), focusing won't pan and blanking would just
	// blink the field — so skip.
	if (keyboardIsOpen()) {
		return
	}
	const viewport = window.visualViewport
	const previous = target.style.opacity
	let restored = false
	const restore = () => {
		if (restored) {
			return
		}
		restored = true
		target.style.opacity = previous
		viewport?.removeEventListener('resize', restore)
	}
	target.style.opacity = '0'
	// Restore once iOS is past its scroll-into-view decision. A *tap* (vs the initial
	// programmatic auto-focus) schedules that decision a frame or two after focusin —
	// so the old next-tick restore was too early on a re-tap and the pan slipped
	// through (the header flew up out of view). The keyboard's first visualViewport
	// resize is reliably after the decision, so wait for that; the timer is a safety
	// net so the field can never get stuck invisible.
	viewport?.addEventListener('resize', restore)
	window.setTimeout(restore, OPACITY_RESTORE_FALLBACK_MS)
}

export function trackKeyboardInset(): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return
	}
	const root = document.documentElement
	const viewport = window.visualViewport

	// --keyboard-height: how much the keyboard covers, so CSS can lift the composer/
	// dock above it (see [data-editing] .composer-backdrop). The keyboard shrinks the
	// visual viewport's height without changing the layout viewport, so the delta is
	// its height. 0 at rest. Resize-driven only — the height doesn't change as you
	// scroll, so there's no per-frame work and nothing to make the header jitter.
	const writeKeyboardHeight = () => {
		const height = viewport ? Math.max(0, window.innerHeight - viewport.height) : 0
		root.style.setProperty('--keyboard-height', `${height}px`)
	}
	if (viewport) {
		viewport.addEventListener('resize', writeKeyboardHeight)
	}
	writeKeyboardHeight()

	// With the keyboard up, iOS pans the visual viewport for any drag no real
	// scroller consumes — riding the fixed masthead/composer out of view. Allow a
	// move only while an ancestor can still scroll that way; swallow everything
	// else (no per-gesture lock, no field exemption — a drag starting on an input
	// must not pan either). Boundary drags stop dead instead of chaining into a pan.
	let lastTouch: {x: number; y: number} | null = null
	document.addEventListener(
		'touchstart',
		event => {
			const touch = event.touches.length === 1 ? event.touches[0] : null
			lastTouch = touch ? {x: touch.clientX, y: touch.clientY} : null
		},
		{passive: true, capture: true},
	)
	document.addEventListener(
		'touchmove',
		event => {
			if (!lastTouch || !root.hasAttribute('data-editing') || event.touches.length !== 1) {
				return
			}
			const touch = event.touches[0]
			const dx = touch.clientX - lastTouch.x
			const dy = touch.clientY - lastTouch.y
			lastTouch = {x: touch.clientX, y: touch.clientY}
			if (
				(dx !== 0 || dy !== 0) &&
				event.target instanceof Element &&
				inLockedShell(event.target) &&
				!dragHasConsumer(event.target, dx, dy)
			) {
				event.preventDefault()
			}
		},
		{passive: false},
	)

	// Footer hide + composer lift: immediate on focus, debounced on blur (BLUR_DEBOUNCE_MS)
	// so moving between fields doesn't flicker it back in.
	let blurTimer = 0
	document.addEventListener(
		'focusin',
		event => {
			if (raisesKeyboard(event.target)) {
				window.clearTimeout(blurTimer)
				root.setAttribute('data-editing', '')
				suppressKeyboardScroll(event.target)
			}
		},
		true,
	)
	document.addEventListener(
		'focusout',
		() => {
			window.clearTimeout(blurTimer)
			blurTimer = window.setTimeout(() => {
				if (!raisesKeyboard(document.activeElement)) {
					root.removeAttribute('data-editing')
				}
			}, BLUR_DEBOUNCE_MS)
		},
		true,
	)
}

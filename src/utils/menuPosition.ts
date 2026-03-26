export function getMenuAnchor(element: Element | null) {
	if (!element) {
		return {
			top: 12,
			right: window.innerWidth || document.documentElement.clientWidth || 0,
			bottom: 12,
			left: 12,
		}
	}

	const rect = element.getBoundingClientRect()
	return {
		top: rect.top,
		right: rect.right,
		bottom: rect.bottom,
		left: rect.left,
	}
}

interface Anchor {
	top: number
	bottom?: number
	right: number
}

export function calculateMenuPosition(anchor: Anchor) {
	const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
	const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
	const viewportInset = 12
	const preferredMenuWidth = 192
	const menuWidth = Math.min(preferredMenuWidth, Math.max(0, viewportWidth - viewportInset * 2))
	const preferredTop = Math.round((anchor.bottom ?? anchor.top) + 6)
	const top = Math.min(Math.max(12, preferredTop), Math.max(12, viewportHeight - 220))
	const preferredLeft = Math.round(anchor.right - menuWidth)
	const maxLeft = Math.max(viewportInset, viewportWidth - menuWidth - viewportInset)
	const left = Math.min(Math.max(viewportInset, preferredLeft), maxLeft)
	const right = Math.max(viewportInset, Math.round(viewportWidth - left - menuWidth))

	return {
		top,
		left,
		right,
	}
}

interface RowMenuState {
	kind: string
	id: number | string
	anchor?: Anchor
}

export function renderRowMenuStyle(
	openMenu: RowMenuState | null,
	kind: string,
	id: number | string,
) {
	if (!openMenu || openMenu.kind !== kind || openMenu.id !== id || !openMenu.anchor) {
		return ''
	}

	const position = calculateMenuPosition(openMenu.anchor)
	return `top:${position.top}px; right:${position.right}px;`
}

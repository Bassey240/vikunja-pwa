import type {ReactNode} from 'react'

// The app's single icon set (July 2026 chrome audit, H1): the sidebar's
// Lucide-style stroked SVGs promoted to a shared component so the footer tabs
// and topbar actions stop using the old CSS pseudo-element drawings.
// 24-grid, stroke 2, round caps/joins, sized via the `size` prop.
const ICON_PATHS: Record<string, ReactNode> = {
	today: (
		<>
			<rect x="3" y="5" width="18" height="16" rx="2" />
			<line x1="16" y1="3" x2="16" y2="7" />
			<line x1="8" y1="3" x2="8" y2="7" />
			<line x1="3" y1="11" x2="21" y2="11" />
			<circle cx="12" cy="16" r="1.5" fill="currentColor" />
		</>
	),
	inbox: (
		<>
			<path d="M22 12h-6l-2 3h-4l-2-3H2" />
			<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
		</>
	),
	upcoming: (
		<>
			<polyline points="12 6 12 12 16 14" />
			<circle cx="12" cy="12" r="10" />
		</>
	),
	calendar: (
		<>
			<rect x="3" y="4" width="18" height="17" rx="2" />
			<line x1="16" y1="2" x2="16" y2="6" />
			<line x1="8" y1="2" x2="8" y2="6" />
			<line x1="3" y1="9" x2="21" y2="9" />
		</>
	),
	projects: (
		<>
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
			<rect x="14" y="14" width="7" height="7" rx="1" />
		</>
	),
	search: (
		<>
			<circle cx="11" cy="11" r="7" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</>
	),
	filter: (
		<>
			<line x1="4" y1="6" x2="14" y2="6" />
			<circle cx="17" cy="6" r="2" />
			<line x1="20" y1="12" x2="10" y2="12" />
			<circle cx="7" cy="12" r="2" />
			<line x1="4" y1="18" x2="14" y2="18" />
			<circle cx="17" cy="18" r="2" />
		</>
	),
	labels: (
		<>
			<path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
			<line x1="7" y1="7" x2="7.01" y2="7" />
		</>
	),
	settings: (
		<>
			<line x1="4" y1="21" x2="4" y2="14" />
			<line x1="4" y1="10" x2="4" y2="3" />
			<line x1="12" y1="21" x2="12" y2="12" />
			<line x1="12" y1="8" x2="12" y2="3" />
			<line x1="20" y1="21" x2="20" y2="16" />
			<line x1="20" y1="12" x2="20" y2="3" />
			<line x1="1" y1="14" x2="7" y2="14" />
			<line x1="9" y1="8" x2="15" y2="8" />
			<line x1="17" y1="16" x2="23" y2="16" />
		</>
	),
	menu: (
		<>
			<line x1="4" y1="6" x2="20" y2="6" />
			<line x1="4" y1="12" x2="20" y2="12" />
			<line x1="4" y1="18" x2="20" y2="18" />
		</>
	),
	bell: (
		<>
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
		</>
	),
	'view-list': (
		<>
			<line x1="8" y1="6" x2="21" y2="6" />
			<line x1="8" y1="12" x2="21" y2="12" />
			<line x1="8" y1="18" x2="21" y2="18" />
			<line x1="3" y1="6" x2="3.01" y2="6" />
			<line x1="3" y1="12" x2="3.01" y2="12" />
			<line x1="3" y1="18" x2="3.01" y2="18" />
		</>
	),
	'view-kanban': (
		<>
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<path d="M8 7v7" />
			<path d="M12 7v4" />
			<path d="M16 7v9" />
		</>
	),
	'view-table': (
		<>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<line x1="3" y1="10" x2="21" y2="10" />
			<line x1="12" y1="4" x2="12" y2="20" />
		</>
	),
	'view-gantt': (
		<>
			<path d="M8 6h10" />
			<path d="M6 12h9" />
			<path d="M11 18h7" />
		</>
	),
}

export type IconName = keyof typeof ICON_PATHS

export default function Icon({name, size = 16}: {name: string; size?: number}) {
	const paths = ICON_PATHS[name]
	if (!paths) {
		return null
	}
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{paths}
		</svg>
	)
}

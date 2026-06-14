export type ProjectViewKind = 'list' | 'kanban' | 'table' | 'gantt'

// A narrow (mobile) viewport can only render list and kanban; the wide layout adds table and gantt.
export const DESKTOP_VIEW_KINDS: ProjectViewKind[] = ['list', 'kanban', 'table', 'gantt']
export const MOBILE_VIEW_KINDS: ProjectViewKind[] = ['list', 'kanban']

type ResolvableView = {id: number; view_kind: string}

// Pure view-id resolution: current session view → per-project session memory → per-device default → first list.
// Every candidate is gated to a kind the current viewport can actually render (responsive supportedKinds).
export function resolveTaskViewId(
	views: ResolvableView[],
	{
		wide,
		currentViewId,
		sessionKind,
		defaultKind,
	}: {
		wide: boolean
		currentViewId?: number | null
		sessionKind?: ProjectViewKind | null
		defaultKind: ProjectViewKind
	},
): number | null {
	if (views.length === 0) {
		return null
	}

	const supportedKinds = wide ? DESKTOP_VIEW_KINDS : MOBILE_VIEW_KINDS
	const findSupportedByKind = (kind: ProjectViewKind | null | undefined) =>
		kind && supportedKinds.includes(kind)
			? views.find(view => view.view_kind === kind)
			: undefined

	const currentView = currentViewId ? views.find(view => view.id === currentViewId) : undefined
	if (currentView && supportedKinds.includes(currentView.view_kind as ProjectViewKind)) {
		return currentView.id
	}

	const sessionView = findSupportedByKind(sessionKind)
	if (sessionView) {
		return sessionView.id
	}

	const defaultView = findSupportedByKind(defaultKind)
	if (defaultView) {
		return defaultView.id
	}

	const firstListView = views.find(view => view.view_kind === 'list')
	return firstListView?.id ?? views[0]?.id ?? null
}

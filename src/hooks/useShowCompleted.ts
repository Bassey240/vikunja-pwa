import {useAppStore} from '@/store'

export interface ShowCompletedReturn {
	showingCompleted: boolean
	label: string
	toggle: () => void
}

/**
 * Hook for managing task filter "show completed" toggle.
 * For screens using the task filter system (Today, Inbox, Upcoming, Search, TaskFocusScreen).
 */
export function useShowCompletedTaskFilter(allowProject: boolean = true): ShowCompletedReturn {
	const taskFilters = useAppStore(state => state.taskFilters)
	const syncTaskFilterDraftFromActive = useAppStore(state => state.syncTaskFilterDraftFromActive)
	const setTaskFilterField = useAppStore(state => state.setTaskFilterField)
	const applyTaskFilterDraft = useAppStore(state => state.applyTaskFilterDraft)

	const showingCompleted = taskFilters.status !== 'open'

	function toggle() {
		syncTaskFilterDraftFromActive(allowProject)
		setTaskFilterField('status', showingCompleted ? 'open' : 'all', allowProject)
		void applyTaskFilterDraft(allowProject)
	}

	return {
		showingCompleted,
		label: showingCompleted ? 'Hide completed' : 'Show completed',
		toggle,
	}
}

/**
 * Hook for managing project filter "show completed" toggle.
 * For screens using the project filter system (ProjectTasksScreen, ProjectsScreen).
 */
export function useShowCompletedProjectFilter(): ShowCompletedReturn {
	const projectFilters = useAppStore(state => state.projectFilters)
	const syncProjectFilterDraftFromActive = useAppStore(state => state.syncProjectFilterDraftFromActive)
	const setProjectFilterField = useAppStore(state => state.setProjectFilterField)
	const applyProjectFilterDraft = useAppStore(state => state.applyProjectFilterDraft)

	const showingCompleted = projectFilters.taskStatus !== 'open'

	function toggle() {
		syncProjectFilterDraftFromActive()
		setProjectFilterField('taskStatus', showingCompleted ? 'open' : 'any')
		void applyProjectFilterDraft()
	}

	return {
		showingCompleted,
		label: showingCompleted ? 'Hide completed' : 'Show completed',
		toggle,
	}
}

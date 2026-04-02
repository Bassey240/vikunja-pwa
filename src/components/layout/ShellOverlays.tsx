import MutationToast from '@/components/layout/MutationToast'
import ProjectComposer from '@/components/projects/ProjectComposer'
import ProjectDetail from '@/components/projects/ProjectDetail'
import {useAppStore} from '@/store'
import RootComposer from '@/components/tasks/RootComposer'
import TaskDetail from '@/components/tasks/TaskDetail'
import {useEffect} from 'react'
import {useNavigate} from 'react-router-dom'

export default function ShellOverlays({
	showWideShell,
	offlineActionNotice,
	onClearOfflineActionNotice,
}: {
	showWideShell: boolean
	offlineActionNotice: string | null
	onClearOfflineActionNotice: () => void
}) {
	const navigate = useNavigate()
	const syncConflicts = useAppStore(state => state.offlineSyncConflicts)
	const clearOfflineSyncConflicts = useAppStore(state => state.clearOfflineSyncConflicts)

	useEffect(() => {
		if (!offlineActionNotice) {
			return
		}

		const timeoutId = window.setTimeout(() => {
			onClearOfflineActionNotice()
		}, 3200)

		return () => {
			window.clearTimeout(timeoutId)
		}
	}, [offlineActionNotice, onClearOfflineActionNotice])

	return (
		<>
			<RootComposer />
			<ProjectComposer />
			{showWideShell ? null : <ProjectDetail />}
			{showWideShell ? null : <TaskDetail />}
			<div data-overlay-root="global-row-menu"></div>
			<div data-overlay-root="root-composer"></div>
			<div data-overlay-root="project-composer"></div>
			<div data-overlay-root="project-detail"></div>
			<div data-overlay-root="saved-filter-detail"></div>
			<div data-overlay-root="label-detail"></div>
			<div data-overlay-root="task-detail"></div>
			<MutationToast />
			{syncConflicts.length > 0 ? (
				<div className="sync-conflict-bar" role="alert" aria-live="polite">
					<span>
						{syncConflicts.length} offline change{syncConflicts.length === 1 ? '' : 's'} could not sync.
					</span>
					<button
						className="pill-button subtle"
						type="button"
						onClick={() => {
							navigate('/settings?section=offline')
						}}
					>
						Review
					</button>
					<button
						className="ghost-button subtle"
						type="button"
						onClick={clearOfflineSyncConflicts}
					>
						Dismiss
					</button>
				</div>
			) : null}
			{offlineActionNotice ? (
				<div className="offline-action-toast" role="alert" aria-live="assertive">
					<div className="offline-action-toast-copy">
						<div className="offline-action-toast-title">Offline read-only</div>
						<div className="offline-action-toast-body">{offlineActionNotice}</div>
					</div>
					<button
						className="ghost-button subtle"
						type="button"
						aria-label="Dismiss offline notice"
						onClick={onClearOfflineActionNotice}
					>
						×
					</button>
				</div>
			) : null}
		</>
	)
}

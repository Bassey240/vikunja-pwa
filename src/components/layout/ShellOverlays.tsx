import MutationToast from '@/components/layout/MutationToast'
import ProjectComposer from '@/components/projects/ProjectComposer'
import ProjectDetail from '@/components/projects/ProjectDetail'
import RootComposer from '@/components/tasks/RootComposer'
import TaskDetail from '@/components/tasks/TaskDetail'
import {useEffect} from 'react'

export default function ShellOverlays({
	showWideShell,
	offlineActionNotice,
	onClearOfflineActionNotice,
}: {
	showWideShell: boolean
	offlineActionNotice: string | null
	onClearOfflineActionNotice: () => void
}) {
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

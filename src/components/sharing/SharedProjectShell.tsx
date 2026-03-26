import ProjectComposer from '@/components/projects/ProjectComposer'
import ProjectDetail from '@/components/projects/ProjectDetail'
import ProjectTasksScreen from '@/components/screens/ProjectTasksScreen'
import TaskDetail from '@/components/tasks/TaskDetail'
import RootComposer from '@/components/tasks/RootComposer'
import useWideLayout from '@/hooks/useWideLayout'
import {useAppStore} from '@/store'
import {useEffect, useMemo} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'

export default function SharedProjectShell() {
	const navigate = useNavigate()
	const location = useLocation()
	const isWideLayout = useWideLayout()
	const account = useAppStore(state => state.account)
	const isOnline = useAppStore(state => state.isOnline)
	const taskDetailOpen = useAppStore(state => state.taskDetailOpen)
	const projectDetailOpen = useAppStore(state => state.projectDetailOpen)

	const projectId = useMemo(() => {
		const match = location.pathname.match(/^\/projects\/(\d+)/)
		return match ? Number(match[1]) : 0
	}, [location.pathname])

	const targetProjectId = Number(account?.linkShareProjectId || 0)
	const detailOpen = taskDetailOpen || projectDetailOpen

	useEffect(() => {
		if (!account?.linkShareAuth || projectId > 0 || !targetProjectId) {
			return
		}

		navigate(`/projects/${targetProjectId}`, {replace: true})
	}, [account?.linkShareAuth, navigate, projectId, targetProjectId])

	if (!projectId && !targetProjectId) {
		return (
			<div className="shared-project-shell">
				<div className="shared-project-frame">
					<section className="panel screen-card shared-project-standalone-card">
						<div className="screen-body">
							<div className="empty-state">No shared project selected.</div>
						</div>
					</section>
				</div>
			</div>
		)
	}

	const resolvedProjectId = projectId || targetProjectId

	return (
		<div className="shared-project-shell">
			<div className={`shared-project-frame ${isWideLayout ? 'is-wide' : 'is-narrow'}`.trim()}>
				{!isOnline ? (
					<section className="runtime-status-banner runtime-status-banner-warning shared-runtime-status-banner" role="status" aria-live="polite">
						You&apos;re offline. This shared project stays visible from the cached shell, but live data may be stale until the connection returns.
					</section>
				) : null}
				<div className={`shared-project-layout ${detailOpen ? 'has-detail' : 'is-idle'}`.trim()}>
					<div className="shared-project-main">
						<ProjectTasksScreen projectId={resolvedProjectId} presentation="shared-link" />
					</div>
					{isWideLayout && detailOpen ? (
						<aside className={`shared-project-inspector ${detailOpen ? 'has-detail' : 'is-empty'}`.trim()}>
							<div className="shared-project-inspector-scroll">
								{projectDetailOpen ? <ProjectDetail mode="inspector" /> : null}
								{taskDetailOpen ? <TaskDetail mode="inspector" /> : null}
							</div>
						</aside>
					) : null}
				</div>
			</div>
			<RootComposer />
			<ProjectComposer />
			{isWideLayout ? null : <ProjectDetail />}
			{isWideLayout ? null : <TaskDetail />}
			<div data-overlay-root="global-row-menu"></div>
			<div data-overlay-root="root-composer"></div>
			<div data-overlay-root="project-composer"></div>
			<div data-overlay-root="project-detail"></div>
			<div data-overlay-root="saved-filter-detail"></div>
			<div data-overlay-root="label-detail"></div>
			<div data-overlay-root="task-detail"></div>
		</div>
	)
}

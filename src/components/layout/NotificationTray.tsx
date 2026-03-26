import {useAppStore} from '@/store'
import type {AppNotification} from '@/types'
import {
	formatLongDate,
	formatNotificationSummary,
	formatShortDate,
	getNotificationLeadLabel,
	isNotificationRead,
} from '@/utils/formatting'
import {getVisibleNotifications, normalizeNotificationPreferences} from '@/utils/notificationPreferences'
import {useNavigate} from 'react-router-dom'

type NotificationTarget =
	| {
			kind: 'task'
			taskId: number
			projectId: number
	  }
	| {
			kind: 'project'
			projectId: number
	  }

export default function NotificationTray() {
	const account = useAppStore(state => state.account)
	const notifications = useAppStore(state => state.notifications)
	const loadingNotifications = useAppStore(state => state.loadingNotifications)
	const markingNotificationIds = useAppStore(state => state.markingNotificationIds)
	const markNotificationRead = useAppStore(state => state.markNotificationRead)
	const markAllNotificationsRead = useAppStore(state => state.markAllNotificationsRead)
	const openSearchTaskResult = useAppStore(state => state.openSearchTaskResult)
	const navigateToProject = useAppStore(state => state.navigateToProject)
	const setOpenMenu = useAppStore(state => state.setOpenMenu)
	const navigate = useNavigate()

	const notificationPreferences = normalizeNotificationPreferences(account?.user?.settings?.frontend_settings)
	const visibleNotifications = getVisibleNotifications(notifications, notificationPreferences, account?.user?.id || null)
	const unreadCount = visibleNotifications.filter(notification => !isNotificationRead(notification)).length
	const visibleUnreadNotificationIds = visibleNotifications
		.filter(notification => !isNotificationRead(notification))
		.map(notification => notification.id)

	async function handleNotificationClick(notification: AppNotification) {
		const target = getNotificationTarget(notification)
		if (!target) {
			return
		}

		if (!isNotificationRead(notification)) {
			await markNotificationRead(notification.id, true)
		}

		setOpenMenu(null)

		if (target.kind === 'task') {
			await openSearchTaskResult(target.taskId, target.projectId)
			navigate(`/projects/${target.projectId}`)
			return
		}

		await navigateToProject(target.projectId)
		navigate(`/projects/${target.projectId}`)
	}

	return (
		<div className="topbar-notification-panel" data-menu-root="true" data-notification-panel="true">
			<div className="topbar-notification-head">
				<div className="topbar-notification-title-block">
					<div className="detail-label">Notifications</div>
					{!loadingNotifications && unreadCount === 0 ? (
						<div className="topbar-notification-empty-hint">No unread notifications right now.</div>
					) : null}
					{unreadCount > 0 ? <span className="count-chip compact">{unreadCount}</span> : null}
				</div>
				{unreadCount > 0 ? (
					<button
						className="pill-button ghost-button compact"
						data-action="mark-all-notifications-read"
						type="button"
						onClick={() => void markAllNotificationsRead(visibleUnreadNotificationIds)}
					>
						Mark all read
					</button>
				) : null}
			</div>
			<div className="topbar-notification-list">
				{loadingNotifications && visibleNotifications.length === 0 ? (
					<div className="empty-state compact">Loading notifications…</div>
				) : null}
				{!loadingNotifications && notifications.length === 0 ? (
					<div className="empty-state compact">No notifications right now.</div>
				) : null}
				{!loadingNotifications && notifications.length > 0 && visibleNotifications.length === 0 ? (
					<div className="empty-state compact">No notifications match your current preferences.</div>
				) : null}
				{!loadingNotifications && visibleNotifications.length > 0 && unreadCount === 0 ? (
					<div className="empty-state compact">No unread notifications right now.</div>
				) : null}
				{visibleNotifications.map(notification => {
					const read = isNotificationRead(notification)
					const target = getNotificationTarget(notification)
					const marking = markingNotificationIds.has(notification.id)
					return (
						<div
							key={notification.id}
							className={`notification-row ${read ? 'is-read' : ''} ${target ? 'is-clickable' : ''}`.trim()}
							data-action={target ? 'open-notification' : undefined}
							data-notification-id={notification.id}
							role={target ? 'button' : undefined}
							tabIndex={target ? 0 : undefined}
							onClick={() => {
								if (target) {
									void handleNotificationClick(notification)
								}
							}}
							onKeyDown={event => {
								if (!target) {
									return
								}
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault()
									void handleNotificationClick(notification)
								}
							}}
						>
							<div className={`notification-status-dot ${read ? 'is-read' : ''}`}></div>
							<div className="notification-lead-token" aria-hidden="true">
								{getNotificationLeadLabel(notification)}
							</div>
							<div className="notification-content">
								<div className="notification-summary">
									{formatNotificationSummary(notification, account?.user || null)}
								</div>
								<div className="notification-meta-row">
									<span className="notification-context">
										{notification.notification?.project?.title || notification.notification?.team?.name || 'Vikunja'}
									</span>
									{notification.created ? (
										<time className="notification-time" title={formatLongDate(notification.created)}>
											{formatShortDate(notification.created)}
										</time>
									) : null}
								</div>
							</div>
							{!read ? (
								<button
									className="notification-mark-button"
									data-action="mark-notification-read"
									data-notification-id={notification.id}
									type="button"
									disabled={marking}
									onClick={event => {
										event.stopPropagation()
										void markNotificationRead(notification.id, true)
									}}
								>
									Read
								</button>
							) : null}
						</div>
					)
				})}
			</div>
		</div>
	)
}

function getNotificationTarget(notification: AppNotification): NotificationTarget | null {
	switch (notification.name) {
		case 'task.comment':
		case 'task.assigned':
		case 'task.reminder':
		case 'task.mentioned': {
			const taskId = Number(notification.notification?.task?.id || 0)
			const projectId = Number(
				notification.notification?.project?.id ||
					notification.notification?.task?.project_id ||
					0,
			)
			return taskId && projectId
				? {
						kind: 'task',
						taskId,
						projectId,
					}
				: null
		}
		case 'task.undone.overdue': {
			const taskId = Number(notification.notification?.task?.id || 0)
			const projectId = Number(
				notification.notification?.project?.id ||
					notification.notification?.task?.project_id ||
					0,
			)
			return taskId && projectId
				? {
						kind: 'task',
						taskId,
						projectId,
					}
				: null
		}
		case 'project.created': {
			const projectId = Number(notification.notification?.project?.id || 0)
			return projectId
				? {
						kind: 'project',
						projectId,
					}
				: null
		}
		default:
			return null
	}
}

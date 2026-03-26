import NotificationTray from '@/components/layout/NotificationTray'
import useWideLayout from '@/hooks/useWideLayout'
import {useAppStore} from '@/store'
import {isNotificationRead} from '@/utils/formatting'
import {getVisibleNotifications, normalizeNotificationPreferences} from '@/utils/notificationPreferences'
import {useEffect} from 'react'
import type {MouseEvent, ReactNode} from 'react'

interface TopbarAction {
	action: string
	label: string
	icon?: string
	text?: string
	className?: string
	active?: boolean
	engaged?: boolean
	disabled?: boolean
	menuToggle?: boolean
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void
	dataAttrs?: Record<string, string | number>
}

interface TopbarProps {
	title?: string
	eyebrow?: string
	backAction?: string
	includeBackButton?: boolean
	onBack?: () => void
	actions?: TopbarAction[]
	tray?: ReactNode
	desktopHeadingTitle?: string
	desktopHeadingCount?: string | number | null
	primaryAction?: TopbarAction | null
	onDismissTray?: () => void
}

export default function Topbar({
	title = '',
	eyebrow = '',
	backAction = '',
	includeBackButton = true,
	onBack,
	actions = [],
	tray = null,
	desktopHeadingTitle = '',
	desktopHeadingCount = null,
	primaryAction = null,
	onDismissTray,
}: TopbarProps) {
	const isWideLayout = useWideLayout()
	const account = useAppStore(state => state.account)
	const connected = useAppStore(state => state.connected)
	const isOnline = useAppStore(state => state.isOnline)
	const offlineReadOnlyMode = useAppStore(state => state.offlineReadOnlyMode)
	const notifications = useAppStore(state => state.notifications)
	const loadNotifications = useAppStore(state => state.loadNotifications)
	const openMenu = useAppStore(state => state.openMenu)
	const toggleNotificationsMenu = useAppStore(state => state.toggleNotificationsMenu)
	const taskDetailOpen = useAppStore(state => state.taskDetailOpen)
	const projectDetailOpen = useAppStore(state => state.projectDetailOpen)
	const closeTaskDetail = useAppStore(state => state.closeTaskDetail)
	const closeProjectDetail = useAppStore(state => state.closeProjectDetail)
	const detailOverlayOpen = !isWideLayout && (taskDetailOpen || projectDetailOpen)
	const effectiveBackAction = detailOverlayOpen ? 'close-detail-overlay' : backAction
	const effectiveOnBack = detailOverlayOpen
		? () => {
				if (taskDetailOpen) {
					closeTaskDetail()
					return
				}

				if (projectDetailOpen) {
					closeProjectDetail()
				}
			}
		: onBack
	const hasBackButton = detailOverlayOpen || (includeBackButton && backAction)
	const hasExplicitTitle = Boolean(title)
	const accountLabel = title || account?.user?.name || account?.user?.username || 'Vikunja'
	const notificationsOpen = openMenu?.kind === 'notifications'
	const linkShareAuth = account?.linkShareAuth === true
	const notificationPreferences = normalizeNotificationPreferences(account?.user?.settings?.frontend_settings)
	const visibleNotifications = getVisibleNotifications(notifications, notificationPreferences, account?.user?.id || null)
	const unreadNotifications = visibleNotifications.filter(notification => !isNotificationRead(notification)).length
	const leadingActions = actions.filter(action => !isOverflowMenuAction(action))
	const trailingActions = actions.filter(action => isOverflowMenuAction(action))
	const offlineNotice =
		connected && !linkShareAuth && !isOnline && !isWideLayout
			? offlineReadOnlyMode
				? 'You’re offline. The last known signed-in state is restored in read-only mode until the connection returns.'
				: 'You’re offline. Cached screens stay available, but syncing and edits may fail until the connection returns.'
			: null
	const isComposerActionDisabled = (action: TopbarAction | null | undefined) =>
		Boolean(
			action &&
			offlineReadOnlyMode &&
			(action.action === 'open-root-composer' || action.action === 'open-project-composer'),
		)
	const overlayTray = notificationsOpen ? <NotificationTray /> : tray

	useEffect(() => {
		if (!connected || linkShareAuth || !isOnline) {
			return
		}

		let cancelled = false
		const loadIfVisible = () => {
			if (document.visibilityState !== 'visible' || cancelled) {
				return
			}
			void loadNotifications({silent: true})
		}

		void loadNotifications({silent: true})
		document.addEventListener('visibilitychange', loadIfVisible)
		const intervalId = window.setInterval(loadIfVisible, 15000)
		return () => {
			cancelled = true
			document.removeEventListener('visibilitychange', loadIfVisible)
			window.clearInterval(intervalId)
		}
	}, [connected, isOnline, linkShareAuth, loadNotifications])

	useEffect(() => {
		if (!onDismissTray || !overlayTray) {
			return
		}

		function handlePointerDown(event: PointerEvent) {
			const target = event.target
			if (!(target instanceof Element)) {
				return
			}

			if (target.closest('[data-menu-root]') || target.closest('[data-menu-toggle="true"]')) {
				return
			}

			onDismissTray()
		}

		document.addEventListener('pointerdown', handlePointerDown, true)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown, true)
		}
	}, [onDismissTray, overlayTray])

	return (
		<header className="topbar">
			<div
				className={`topbar-main ${isWideLayout ? 'is-wide-layout' : 'is-narrow-layout'} ${
					hasExplicitTitle ? 'has-screen-title' : 'has-account-label'
				}`.trim()}
			>
				<div className={`topbar-title-block topbar-title-pill ${hasExplicitTitle ? 'is-screen-title' : 'is-account-label'}`.trim()}>
					{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
					<h1>{accountLabel}</h1>
				</div>
				{desktopHeadingTitle ? (
					<div className="topbar-screen-heading">
						<h2 className="panel-title">{desktopHeadingTitle}</h2>
						{desktopHeadingCount !== null ? <div className="count-chip">{desktopHeadingCount}</div> : null}
					</div>
				) : null}
				{primaryAction ? (
					<button
						className={`topbar-primary-pill ${primaryAction.className || ''}`.trim()}
						type="button"
						data-action={primaryAction.action}
						aria-label={primaryAction.label}
						disabled={primaryAction.disabled || isComposerActionDisabled(primaryAction)}
						onClick={primaryAction.onClick}
					>
						{primaryAction.icon ? (
							<span className={`topbar-icon topbar-icon-${primaryAction.icon}`} aria-hidden="true"></span>
						) : (
							primaryAction.text
						)}
					</button>
				) : null}
				{hasBackButton || actions.length > 0 || connected ? (
					<div className="topbar-nav-pill">
						{hasBackButton ? (
							<button
								className="topbar-nav-button topbar-back-button"
								data-action={effectiveBackAction}
								data-menu-toggle="true"
								aria-label="Back"
								type="button"
								onClick={effectiveOnBack}
							>
								<span className="chevron-icon" aria-hidden="true"></span>
							</button>
						) : null}
						{leadingActions.map(action => {
							const classes = [
								'topbar-nav-button',
								action.className || '',
								action.active ? 'is-active' : '',
								action.engaged ? 'is-engaged' : '',
							]
								.filter(Boolean)
								.join(' ')

							const content =
								action.icon === 'back' ? (
									<span className="chevron-icon" aria-hidden="true"></span>
								) : action.icon ? (
									<span className={`topbar-icon topbar-icon-${action.icon}`} aria-hidden="true"></span>
								) : (
									action.text
								)

							return (
								<button
									key={action.action}
									className={classes}
									type="button"
									data-action={action.action}
									aria-label={action.label}
									disabled={action.disabled || isComposerActionDisabled(action)}
									data-menu-toggle={action.menuToggle ? 'true' : undefined}
									onClick={action.onClick}
									{...Object.fromEntries(
										Object.entries(action.dataAttrs || {}).map(([key, value]) => [
											`data-${key}`,
											`${value}`,
										]),
									)}
								>
									{content}
								</button>
							)
						})}
						{connected && !linkShareAuth ? (
							<button
								className={`topbar-nav-button ${notificationsOpen ? 'is-active' : ''}`.trim()}
								type="button"
								data-action="toggle-notifications"
								data-menu-toggle="true"
								aria-label="Notifications"
								onClick={() => {
									if (!notificationsOpen) {
										void loadNotifications({silent: true})
									}
									toggleNotificationsMenu()
								}}
							>
								<span className="topbar-icon topbar-icon-bell" aria-hidden="true">
									<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
										<path
											d="M12 4.75a4 4 0 0 0-4 4v2.02c0 1.03-.3 2.04-.86 2.9l-1.2 1.83a1 1 0 0 0 .84 1.55h10.44a1 1 0 0 0 .84-1.55l-1.2-1.83a5.3 5.3 0 0 1-.86-2.9V8.75a4 4 0 0 0-4-4Z"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
										<path
											d="M9.8 18.25a2.2 2.2 0 0 0 4.4 0"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
										<path
											d="M12 3.25v1.5"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
										/>
									</svg>
								</span>
								{unreadNotifications > 0 ? (
									<span className="topbar-notification-badge" aria-hidden="true">
										{unreadNotifications > 9 ? '9+' : unreadNotifications}
									</span>
								) : null}
							</button>
						) : null}
						{trailingActions.map(action => {
							const classes = [
								'topbar-nav-button',
								action.className || '',
								action.active ? 'is-active' : '',
								action.engaged ? 'is-engaged' : '',
							]
								.filter(Boolean)
								.join(' ')

							const content =
								action.icon === 'back' ? (
									<span className="chevron-icon" aria-hidden="true"></span>
								) : action.icon ? (
									<span className={`topbar-icon topbar-icon-${action.icon}`} aria-hidden="true"></span>
								) : (
									action.text
								)

							return (
								<button
									key={action.action}
									className={classes}
									type="button"
									data-action={action.action}
									aria-label={action.label}
									disabled={action.disabled || isComposerActionDisabled(action)}
									data-menu-toggle={action.menuToggle ? 'true' : undefined}
									onClick={action.onClick}
									{...Object.fromEntries(
										Object.entries(action.dataAttrs || {}).map(([key, value]) => [
											`data-${key}`,
											`${value}`,
										]),
									)}
								>
									{content}
								</button>
							)
						})}
					</div>
				) : null}
			</div>
			{offlineNotice ? (
				<section
					className="runtime-status-banner runtime-status-banner-warning topbar-runtime-status-banner"
					role="status"
					aria-live="polite"
				>
					{offlineNotice}
				</section>
			) : null}
			{overlayTray ? <div className="overview-tray">{overlayTray}</div> : null}
		</header>
	)
}

function isOverflowMenuAction(action: TopbarAction) {
	return (
		action.label === 'Menu' ||
		action.text === '⋯' ||
		`${action.className || ''}`.split(/\s+/).includes('topbar-overview-menu-button')
	)
}

import Icon from '@/components/common/icons'
import {useAppStore} from '@/store'
import {useLocation, useNavigate} from 'react-router-dom'

function BottomNavButton({
	action,
	label,
	icon = '',
	active = false,
	emphasize = false,
	disabled = false,
	menuToggle = false,
	onClick,
}: {
	action: string
	label: string
	icon?: string
	active?: boolean
	emphasize?: boolean
	disabled?: boolean
	menuToggle?: boolean
	onClick?: () => void
}) {
	return (
		<button
			className={`bottom-nav-button ${active ? 'is-active' : ''} ${emphasize ? 'is-emphasized' : ''}`.trim()}
			data-action={action}
			data-menu-toggle={menuToggle ? 'true' : undefined}
			aria-label={label}
			type="button"
			disabled={disabled}
			onClick={onClick}
		>
			<span className={emphasize ? 'bottom-nav-plus-circle' : 'bottom-nav-icon'} aria-hidden="true">
				{emphasize ? '+' : <Icon name={icon} size={21} />}
			</span>
			<span className="bottom-nav-label">{label}</span>
		</button>
	)
}

export default function BottomNav() {
	const connected = useAppStore(state => state.connected)
	const inboxProjectId = useAppStore(state => state.inboxProjectId)
	const openMenu = useAppStore(state => state.openMenu)
	const setOpenMenu = useAppStore(state => state.setOpenMenu)
	const toggleNavMenu = useAppStore(state => state.toggleNavMenu)
	const openRootComposer = useAppStore(state => state.openRootComposer)
	const openCalendarComposer = useAppStore(state => state.openCalendarComposer)
	const focusedTaskId = useAppStore(state => state.focusedTaskId)
	const openInlineSubtaskComposer = useAppStore(state => state.openInlineSubtaskComposer)
	const closeTaskDetail = useAppStore(state => state.closeTaskDetail)
	const closeProjectDetail = useAppStore(state => state.closeProjectDetail)
	const location = useLocation()
	const navigate = useNavigate()

	if (!connected) {
		return null
	}

	const screen = location.pathname.startsWith('/projects/')
		? 'tasks'
		: location.pathname === '/'
			? 'today'
			: location.pathname.replace(/^\/+/, '') || 'today'
	const projectsActive = screen === 'projects' || screen === 'tasks'

	function goTo(path: string) {
		setOpenMenu(null)
		closeTaskDetail()
		closeProjectDetail()
		navigate(path)
	}

	return (
		<div className="bottom-nav-wrap">
			{openMenu?.kind === 'nav' ? (
				<div className="inline-menu nav-menu" data-menu-root="true">
					<button className={`menu-item ${screen === 'today' ? 'is-active' : ''}`} data-action="go-today" type="button" onClick={() => goTo('/')}>Today</button>
					<button className={`menu-item ${screen === 'calendar' ? 'is-active' : ''}`} data-action="go-calendar" type="button" onClick={() => goTo('/calendar')}>Calendar</button>
					<button className={`menu-item ${screen === 'inbox' ? 'is-active' : ''}`} data-action="go-inbox" type="button" onClick={() => goTo('/inbox')}>Inbox</button>
					<button className={`menu-item ${screen === 'upcoming' ? 'is-active' : ''}`} data-action="go-upcoming" type="button" onClick={() => goTo('/upcoming')}>Upcoming</button>
					<button className={`menu-item ${projectsActive ? 'is-active' : ''}`} data-action="go-projects" type="button" onClick={() => goTo('/projects')}>Projects</button>
					<button className={`menu-item ${screen === 'search' ? 'is-active' : ''}`} data-action="go-search" type="button" onClick={() => goTo('/search')}>Search</button>
					<button className={`menu-item ${screen === 'filters' ? 'is-active' : ''}`} data-action="go-filters" type="button" onClick={() => goTo('/filters')}>Filters</button>
					<button className={`menu-item ${screen === 'labels' ? 'is-active' : ''}`} data-action="open-labels" type="button" onClick={() => goTo('/labels')}>Labels</button>
					<button className={`menu-item ${screen === 'settings' ? 'is-active' : ''}`} data-action="go-settings" type="button" onClick={() => goTo('/settings')}>Settings</button>
				</div>
			) : null}
			<nav className="bottom-nav" aria-label="Primary">
				<BottomNavButton action="go-calendar" label="Calendar" icon="calendar" active={screen === 'calendar'} onClick={() => goTo('/calendar')} />
				<BottomNavButton action="go-inbox" label="Inbox" icon="inbox" active={screen === 'inbox'} onClick={() => goTo('/inbox')} />
				<BottomNavButton
					action="open-root-composer"
					label="Add"
					emphasize={true}
					onClick={() => {
						// On the task focus screen the + adds a subtask (audit H5) — the
						// screen's own empty state points at this button.
						if (focusedTaskId) {
							openInlineSubtaskComposer(focusedTaskId, 'focus')
							return
						}
						if (screen === 'calendar') {
							openCalendarComposer()
							return
						}
						openRootComposer({
							projectId: screen === 'today' ? inboxProjectId : null,
							defaultDueToday: screen === 'today',
						})
					}}
				/>
			<BottomNavButton action="go-projects" label="Projects" icon="projects" active={projectsActive} onClick={() => goTo('/projects')} />
				<BottomNavButton action="toggle-screen-menu" label="Menu" icon="menu" active={openMenu?.kind === 'nav'} menuToggle={true} onClick={toggleNavMenu} />
			</nav>
		</div>
	)
}

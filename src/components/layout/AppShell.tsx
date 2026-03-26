import TaskDetail from '@/components/tasks/TaskDetail'
import ProjectDetail from '@/components/projects/ProjectDetail'
import ShellOverlays from '@/components/layout/ShellOverlays'
import WideSidebar from '@/components/layout/WideSidebar'
import AuthScreen from '@/components/auth/AuthScreen'
import TodayScreen from '@/components/screens/TodayScreen'
import InboxScreen from '@/components/screens/InboxScreen'
import UpcomingScreen from '@/components/screens/UpcomingScreen'
import ProjectsScreen from '@/components/screens/ProjectsScreen'
import ProjectTasksScreen from '@/components/screens/ProjectTasksScreen'
import SearchScreen from '@/components/screens/SearchScreen'
import FiltersScreen from '@/components/screens/FiltersScreen'
import LabelsScreen from '@/components/screens/LabelsScreen'
import SettingsScreen from '@/components/screens/SettingsScreen'
import SharedProjectShell from '@/components/sharing/SharedProjectShell'
import useWideLayout, {useCompactWideLayout} from '@/hooks/useWideLayout'
import {shouldSuppressDragClicks, useSortableBridge} from '@/hooks/useDragAndDrop'
import {getProjectDescendantIds} from '@/store/project-helpers'
import {memo, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {useLocation} from 'react-router-dom'
import {useAppStore} from '@/store'
import type {Screen} from '@/types'
import BottomNav from './BottomNav'

// Freeze: keep AppShell limited to shell layout and routing; move overlays and other non-shell concerns elsewhere.

function screenFromPath(pathname: string): Screen {
	if (pathname === '/') {
		return 'today'
	}
	if (pathname === '/inbox') {
		return 'inbox'
	}
	if (pathname === '/upcoming') {
		return 'upcoming'
	}
	if (pathname === '/projects') {
		return 'projects'
	}
	if (pathname === '/search') {
		return 'search'
	}
	if (pathname === '/filters') {
		return 'filters'
	}
	if (pathname.startsWith('/projects/')) {
		return 'tasks'
	}
	if (pathname === '/labels') {
		return 'labels'
	}
	return 'settings'
}

const DEFAULT_WIDE_SIDEBAR_WIDTH = 304
const DEFAULT_WIDE_INSPECTOR_WIDTH = 432
const MIN_WIDE_PANE_WIDTH = 240
const MAX_WIDE_PANE_WIDTH = 520
const COLLAPSED_WIDE_SIDEBAR_WIDTH = 75
const COLLAPSED_WIDE_INSPECTOR_WIDTH = 46
const MIN_WIDE_WORKSPACE_WIDTH = 440
const DEFAULT_COMPACT_WIDE_SIDEBAR_WIDTH = 272
const DEFAULT_COMPACT_WIDE_INSPECTOR_WIDTH = 360

export default function AppShell() {
	useSortableBridge()
	const init = useAppStore(state => state.init)
	const initialized = useAppStore(state => state.initialized)
	const initializing = useAppStore(state => state.initializing)
	const connected = useAppStore(state => state.connected)
	const account = useAppStore(state => state.account)
	const isOnline = useAppStore(state => state.isOnline)
	const offlineReadOnlyMode = useAppStore(state => state.offlineReadOnlyMode)
	const theme = useAppStore(state => state.theme)
	const taskDetailOpen = useAppStore(state => state.taskDetailOpen)
	const projectDetailOpen = useAppStore(state => state.projectDetailOpen)
	const rootComposerOpen = useAppStore(state => state.rootComposerOpen)
	const rootComposerPlacement = useAppStore(state => state.rootComposerPlacement)
	const projectComposerOpen = useAppStore(state => state.projectComposerOpen)
	const projectComposerPlacement = useAppStore(state => state.projectComposerPlacement)
	const bulkTaskEditorScope = useAppStore(state => state.bulkTaskEditorScope)
	const offlineActionNotice = useAppStore(state => state.offlineActionNotice)
	const focusedTaskStack = useAppStore(state => state.focusedTaskStack)
	const focusedTaskSourceScreen = useAppStore(state => state.focusedTaskSourceScreen)
	const focusedTaskProjectId = useAppStore(state => state.focusedTaskProjectId)
	const projects = useAppStore(state => state.projects)
	const setOpenMenu = useAppStore(state => state.setOpenMenu)
	const setScreen = useAppStore(state => state.setScreen)
	const closeTaskDetail = useAppStore(state => state.closeTaskDetail)
	const closeProjectDetail = useAppStore(state => state.closeProjectDetail)
	const closeFocusedTask = useAppStore(state => state.closeFocusedTask)
	const clearOfflineActionNotice = useAppStore(state => state.clearOfflineActionNotice)
	const loadProjects = useAppStore(state => state.loadProjects)
	const loadTodayTasks = useAppStore(state => state.loadTodayTasks)
	const loadInboxTasks = useAppStore(state => state.loadInboxTasks)
	const loadUpcomingTasks = useAppStore(state => state.loadUpcomingTasks)
	const refreshAppData = useAppStore(state => state.refreshAppData)
	const location = useLocation()
	const didInitRef = useRef(false)
	const didWarmCoreRef = useRef(false)
	const shellRef = useRef<HTMLDivElement | null>(null)
	const isWideLayout = useWideLayout()
	const isCompactWideLayout = useCompactWideLayout()
	const linkShareAuth = account?.linkShareAuth === true
	const showWideShell = isWideLayout && connected
	const showWideSidebar = showWideShell && !linkShareAuth
	const compactWideShell = showWideShell && isCompactWideLayout
	const detailOpen = taskDetailOpen || projectDetailOpen
	const hasMobileComposerSheet =
		!showWideShell &&
		((rootComposerOpen && rootComposerPlacement === 'sheet') ||
			(projectComposerOpen && projectComposerPlacement === 'sheet'))
	const currentScreen = screenFromPath(location.pathname)
	const currentProjectRouteId = currentScreen === 'tasks' ? Number(location.pathname.split('/')[2] || 0) : 0
	const [mountedScreens, setMountedScreens] = useState<Record<Screen, boolean>>({
		today: true,
		inbox: false,
		upcoming: false,
		projects: false,
		tasks: false,
		search: false,
		filters: false,
		labels: false,
		settings: false,
	})
	const [mountedTaskProjectId, setMountedTaskProjectId] = useState(0)
	const [wideSidebarCollapsed, setWideSidebarCollapsed, wideSidebarCollapsedStored] = usePersistentWideShellState(
		'vikunja-mobile-poc:wide-sidebar-collapsed',
		false,
	)
	const [wideInspectorCollapsed, setWideInspectorCollapsed, wideInspectorCollapsedStored] = usePersistentWideShellState(
		'vikunja-mobile-poc:wide-inspector-collapsed',
		false,
	)
	const [wideSidebarWidth, setWideSidebarWidth, wideSidebarWidthStored] = usePersistentWideShellSize(
		'vikunja-mobile-poc:wide-sidebar-width',
		DEFAULT_WIDE_SIDEBAR_WIDTH,
	)
	const [wideInspectorWidth, setWideInspectorWidth, wideInspectorWidthStored] = usePersistentWideShellSize(
		'vikunja-mobile-poc:wide-inspector-width',
		DEFAULT_WIDE_INSPECTOR_WIDTH,
	)
	const [activeResizeHandle, setActiveResizeHandle] = useState<'sidebar' | 'inspector' | null>(null)
	const effectiveWideSidebarCollapsed = showWideSidebar
		? showWideShell && compactWideShell && !wideSidebarCollapsedStored
			? true
			: wideSidebarCollapsed
		: true
	const effectiveWideInspectorCollapsed =
		showWideShell && compactWideShell && !wideInspectorCollapsedStored ? true : wideInspectorCollapsed
	const effectiveWideSidebarWidth = showWideSidebar
		? compactWideShell && !wideSidebarWidthStored
			? DEFAULT_COMPACT_WIDE_SIDEBAR_WIDTH
			: wideSidebarWidth
		: 0
	const effectiveWideInspectorWidth =
		compactWideShell && !wideInspectorWidthStored ? DEFAULT_COMPACT_WIDE_INSPECTOR_WIDTH : wideInspectorWidth

	useEffect(() => {
		if (didInitRef.current) {
			return
		}

		didInitRef.current = true
		void init()
	}, [init])

	useEffect(() => {
		setScreen(screenFromPath(location.pathname))
	}, [location.pathname, setScreen])

	useEffect(() => {
		if (!focusedTaskStack.length || !focusedTaskSourceScreen) {
			return
		}

		if (focusedTaskSourceScreen !== currentScreen) {
			closeFocusedTask()
			return
		}

		if (
			currentScreen === 'tasks' &&
			focusedTaskProjectId &&
			currentProjectRouteId &&
			focusedTaskProjectId !== currentProjectRouteId &&
			!getProjectDescendantIds(currentProjectRouteId, projects).includes(focusedTaskProjectId)
		) {
			closeFocusedTask()
		}
	}, [closeFocusedTask, currentProjectRouteId, currentScreen, focusedTaskProjectId, focusedTaskSourceScreen, focusedTaskStack.length, projects])

	useEffect(() => {
		setMountedScreens(current => {
			if (current[currentScreen]) {
				return current
			}

			return {
				...current,
				[currentScreen]: true,
			}
		})
	}, [currentScreen])

	useEffect(() => {
		if (currentScreen !== 'tasks' || !currentProjectRouteId) {
			return
		}

		setMountedTaskProjectId(current => (current === currentProjectRouteId ? current : currentProjectRouteId))
	}, [currentProjectRouteId, currentScreen])

	useEffect(() => {
		if (!initialized || !connected || linkShareAuth || !isOnline || offlineReadOnlyMode) {
			didWarmCoreRef.current = false
			return
		}

		if (didWarmCoreRef.current) {
			return
		}

		didWarmCoreRef.current = true
		const state = useAppStore.getState()

		if (state.projects.length === 0 && !state.loadingProjects) {
			void loadProjects({silent: true})
		}

		if (state.todayTasks.length === 0 && !state.loadingToday) {
			void loadTodayTasks()
		}

		if (state.inboxTasks.length === 0 && !state.loadingInbox) {
			void loadInboxTasks()
		}

		if (state.upcomingTasks.length === 0 && !state.loadingUpcoming) {
			void loadUpcomingTasks()
		}
	}, [connected, initialized, isOnline, linkShareAuth, loadInboxTasks, loadProjects, loadTodayTasks, loadUpcomingTasks, offlineReadOnlyMode])

	useLayoutEffect(() => {
		const shell = shellRef.current
		if (!shell) {
			return
		}

		function resetMobileGeometry() {
			shell.style.removeProperty('--mobile-sheet-scroll-reserve')
		}

		if (showWideShell) {
			resetMobileGeometry()
			return
		}

		function updateMobileGeometry() {
			const composerSheet = shell.querySelector<HTMLElement>('.composer-backdrop .composer-sheet')
			const bulkDockSheet = shell.querySelector<HTMLElement>('.bulk-task-editor-dock .composer-sheet')
			const activeSheetHeight = Math.max(
				composerSheet ? Math.ceil(composerSheet.getBoundingClientRect().height) : 0,
				bulkDockSheet ? Math.ceil(bulkDockSheet.getBoundingClientRect().height) : 0,
			)
			const sheetReserve = activeSheetHeight > 0 ? activeSheetHeight + 16 : 0

			if (sheetReserve > 0) {
				shell.style.setProperty('--mobile-sheet-scroll-reserve', `${sheetReserve}px`)
			} else {
				shell.style.removeProperty('--mobile-sheet-scroll-reserve')
			}
		}

		let frame = 0
		const scheduleUpdate = () => {
			cancelAnimationFrame(frame)
			frame = window.requestAnimationFrame(updateMobileGeometry)
		}
		const resizeObserver =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver(() => scheduleUpdate())
				: null
		const observed = new Set<Element>()

		const observeIfPresent = (selector: string) => {
			const element = shell.querySelector(selector)
			if (!element || !resizeObserver || observed.has(element)) {
				return
			}

			resizeObserver.observe(element)
			observed.add(element)
		}

		observeIfPresent('.composer-backdrop .composer-sheet')
		observeIfPresent('.bulk-task-editor-dock .composer-sheet')
		scheduleUpdate()
		window.addEventListener('resize', scheduleUpdate)

		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener('resize', scheduleUpdate)
			resizeObserver?.disconnect()
		}
	}, [bulkTaskEditorScope, hasMobileComposerSheet, showWideShell])

	useEffect(() => {
		if (!initialized || !connected || !offlineReadOnlyMode || !isOnline) {
			return
		}

		void refreshAppData()
	}, [connected, initialized, isOnline, offlineReadOnlyMode, refreshAppData])

	useEffect(() => {
		document.documentElement.dataset.theme = theme
		document.documentElement.style.colorScheme = theme
	}, [theme])

	useEffect(() => {
		function handleClickCapture(event: MouseEvent) {
			if (!shouldSuppressDragClicks()) {
				return
			}

			event.preventDefault()
			event.stopPropagation()
		}

		document.addEventListener('click', handleClickCapture, true)
		return () => {
			document.removeEventListener('click', handleClickCapture, true)
		}
	}, [])

	useEffect(() => {
		function handlePointerDown(event: PointerEvent) {
			const target = event.target
			if (!(target instanceof Element)) {
				return
			}

			if (target.closest('[data-menu-root]') || target.closest('[data-menu-toggle="true"]')) {
				return
			}

			setOpenMenu(null)
		}

		document.addEventListener('pointerdown', handlePointerDown)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown)
		}
	}, [setOpenMenu])

	useEffect(() => {
		if (!showWideShell || !detailOpen) {
			return
		}

		setWideInspectorCollapsed(false)
	}, [detailOpen, setWideInspectorCollapsed, showWideShell])

	useEffect(() => {
		if (!showWideShell) {
			return
		}

		function clampPaneWidths() {
			const shell = shellRef.current
			if (!shell) {
				return
			}

			const shellWidth = shell.getBoundingClientRect().width
			const oppositeInspectorWidth = effectiveWideInspectorCollapsed
				? COLLAPSED_WIDE_INSPECTOR_WIDTH
				: effectiveWideInspectorWidth
			const oppositeSidebarWidth = showWideSidebar
				? effectiveWideSidebarCollapsed
					? COLLAPSED_WIDE_SIDEBAR_WIDTH
					: effectiveWideSidebarWidth
				: 0
			const maxSidebarWidth = Math.max(
				MIN_WIDE_PANE_WIDTH,
				Math.min(MAX_WIDE_PANE_WIDTH, shellWidth - oppositeInspectorWidth - MIN_WIDE_WORKSPACE_WIDTH),
			)
			const maxInspectorWidth = Math.max(
				MIN_WIDE_PANE_WIDTH,
				Math.min(MAX_WIDE_PANE_WIDTH, shellWidth - oppositeSidebarWidth - MIN_WIDE_WORKSPACE_WIDTH),
			)

			if (!effectiveWideSidebarCollapsed) {
				const clampedSidebarWidth = Math.min(
					Math.max(effectiveWideSidebarWidth, MIN_WIDE_PANE_WIDTH),
					maxSidebarWidth,
				)
				if (clampedSidebarWidth !== effectiveWideSidebarWidth) {
					setWideSidebarWidth(clampedSidebarWidth)
				}
			}

			if (!effectiveWideInspectorCollapsed) {
				const clampedInspectorWidth = Math.min(
					Math.max(effectiveWideInspectorWidth, MIN_WIDE_PANE_WIDTH),
					maxInspectorWidth,
				)
				if (clampedInspectorWidth !== effectiveWideInspectorWidth) {
					setWideInspectorWidth(clampedInspectorWidth)
				}
			}
		}

		clampPaneWidths()
		window.addEventListener('resize', clampPaneWidths)
		return () => {
			window.removeEventListener('resize', clampPaneWidths)
		}
	}, [
		setWideInspectorWidth,
		setWideSidebarWidth,
		effectiveWideInspectorCollapsed,
		effectiveWideInspectorWidth,
		effectiveWideSidebarCollapsed,
		effectiveWideSidebarWidth,
		showWideShell,
		showWideSidebar,
	])

	function beginPaneResize(kind: 'sidebar' | 'inspector', clientX: number) {
		const shell = shellRef.current
		if (!shell) {
			return
		}

		const shellWidth = shell.getBoundingClientRect().width
		const initialSidebarWidth = effectiveWideSidebarWidth
		const initialInspectorWidth = effectiveWideInspectorWidth
		setActiveResizeHandle(kind)
		document.body.classList.add('shell-resize-active')

		function handlePointerMove(event: PointerEvent) {
			const deltaX = event.clientX - clientX
			if (kind === 'sidebar') {
				if (!showWideSidebar) {
					return
				}

				const maxSidebarWidth = Math.max(
					MIN_WIDE_PANE_WIDTH,
					Math.min(MAX_WIDE_PANE_WIDTH, shellWidth - initialInspectorWidth - MIN_WIDE_WORKSPACE_WIDTH),
				)
				const nextSidebarWidth = Math.min(
					Math.max(initialSidebarWidth + deltaX, MIN_WIDE_PANE_WIDTH),
					maxSidebarWidth,
				)
				setWideSidebarWidth(nextSidebarWidth)
				return
			}

			const maxInspectorWidth = Math.max(
				MIN_WIDE_PANE_WIDTH,
				Math.min(
					MAX_WIDE_PANE_WIDTH,
					shellWidth - (showWideSidebar ? initialSidebarWidth : 0) - MIN_WIDE_WORKSPACE_WIDTH,
				),
			)
			const nextInspectorWidth = Math.min(
				Math.max(initialInspectorWidth - deltaX, MIN_WIDE_PANE_WIDTH),
				maxInspectorWidth,
			)
			setWideInspectorWidth(nextInspectorWidth)
		}

		function finishPointerResize() {
			setActiveResizeHandle(null)
			document.body.classList.remove('shell-resize-active')
			window.removeEventListener('pointermove', handlePointerMove)
			window.removeEventListener('pointerup', finishPointerResize)
			window.removeEventListener('pointercancel', finishPointerResize)
		}

		window.addEventListener('pointermove', handlePointerMove)
		window.addEventListener('pointerup', finishPointerResize)
		window.addEventListener('pointercancel', finishPointerResize)
	}

	if (!initialized && initializing) {
		return (
			<div className="shell">
				<div className="surface">
					<section className="panel screen-card">
						<div className="screen-body">
							<div className="empty-state">Loading app…</div>
						</div>
					</section>
				</div>
			</div>
		)
	}

	if (initialized && !connected) {
		return <AuthScreen />
	}

	if (connected && linkShareAuth) {
		return <SharedProjectShell />
	}

	return (
		<div
			ref={shellRef}
			className={`shell ${showWideShell ? 'shell-wide' : ''} ${compactWideShell ? 'shell-compact-wide' : ''} ${
				showWideShell && linkShareAuth ? 'shell-wide-link-share' : ''
			} ${
				effectiveWideSidebarCollapsed ? 'has-collapsed-sidebar' : ''
			} ${
				showWideShell && effectiveWideInspectorCollapsed ? 'has-collapsed-inspector' : ''
			}`.trim()}
			style={
				showWideShell
					? ({
							'--wide-sidebar-width': `${effectiveWideSidebarWidth}px`,
							'--wide-inspector-width': `${effectiveWideInspectorWidth}px`,
						} as CSSProperties)
					: undefined
			}
		>
			{showWideSidebar ? (
				<WideSidebar
					collapsed={effectiveWideSidebarCollapsed}
					onToggleCollapsed={() => setWideSidebarCollapsed(!effectiveWideSidebarCollapsed)}
				/>
			) : null}
			{showWideSidebar && !effectiveWideSidebarCollapsed ? (
				<div
					className={`shell-resize-handle shell-resize-handle-sidebar ${
						activeResizeHandle === 'sidebar' ? 'is-active' : ''
					}`.trim()}
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize sidebar"
					onPointerDown={event => {
						event.preventDefault()
						beginPaneResize('sidebar', event.clientX)
					}}
				/>
			) : null}
			<div className="shell-workspace">
				<div className="workspace-screen-stack">
					<WorkspaceScreen active={currentScreen === 'today'} mounted={mountedScreens.today}>
						<TodayScreen />
					</WorkspaceScreen>
					<WorkspaceScreen active={currentScreen === 'inbox'} mounted={mountedScreens.inbox}>
						<InboxScreen />
					</WorkspaceScreen>
					<WorkspaceScreen active={currentScreen === 'upcoming'} mounted={mountedScreens.upcoming}>
						<UpcomingScreen />
					</WorkspaceScreen>
					<WorkspaceScreen active={currentScreen === 'projects'} mounted={mountedScreens.projects}>
						<ProjectsScreen />
					</WorkspaceScreen>
					<WorkspaceScreen
						active={currentScreen === 'tasks'}
						mounted={mountedScreens.tasks}
						renderToken={mountedTaskProjectId}
					>
						<ProjectTasksScreen projectId={mountedTaskProjectId} />
					</WorkspaceScreen>
					<WorkspaceScreen active={currentScreen === 'search'} mounted={mountedScreens.search}>
						<SearchScreen />
					</WorkspaceScreen>
					<WorkspaceScreen active={currentScreen === 'filters'} mounted={mountedScreens.filters}>
						<FiltersScreen />
					</WorkspaceScreen>
					<WorkspaceScreen active={currentScreen === 'labels'} mounted={mountedScreens.labels}>
						<LabelsScreen />
					</WorkspaceScreen>
					<WorkspaceScreen active={currentScreen === 'settings'} mounted={mountedScreens.settings}>
						<SettingsScreen />
					</WorkspaceScreen>
				</div>
			</div>
			{showWideShell && !effectiveWideInspectorCollapsed ? (
				<div
					className={`shell-resize-handle shell-resize-handle-inspector ${
						activeResizeHandle === 'inspector' ? 'is-active' : ''
					}`.trim()}
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize detail pane"
					onPointerDown={event => {
						event.preventDefault()
						beginPaneResize('inspector', event.clientX)
					}}
				/>
			) : null}
			{showWideShell ? (
				<aside
					className={`shell-inspector-region ${effectiveWideInspectorCollapsed ? 'is-collapsed' : ''} ${
						detailOpen ? 'has-detail' : 'is-empty'
					}`.trim()}
				>
					<div className="shell-inspector-chrome">
						<button
							className="shell-inspector-toggle"
							type="button"
							aria-label={effectiveWideInspectorCollapsed ? 'Open detail pane' : 'Collapse detail pane'}
							onClick={() => setWideInspectorCollapsed(!effectiveWideInspectorCollapsed)}
						>
							{effectiveWideInspectorCollapsed ? '◂' : '▸'}
						</button>
						{detailOpen && !effectiveWideInspectorCollapsed ? (
							<button
								className="shell-inspector-close"
								type="button"
								aria-label="Close detail"
								onClick={() => {
									if (taskDetailOpen) {
										closeTaskDetail()
										return
									}

									if (projectDetailOpen) {
										closeProjectDetail()
									}
								}}
							>
								×
							</button>
						) : null}
					</div>
					{effectiveWideInspectorCollapsed ? null : (
						<div className="shell-inspector-scroll">
							{detailOpen ? (
								<>
									{projectDetailOpen ? <ProjectDetail mode="inspector" /> : null}
									{taskDetailOpen ? <TaskDetail mode="inspector" /> : null}
								</>
							) : (
								<div className="shell-inspector-empty-state">
									<div className="detail-label">Details</div>
									<div className="empty-state compact">Select a task or project to see details</div>
								</div>
							)}
						</div>
					)}
				</aside>
			) : null}
			{showWideShell || linkShareAuth ? null : <BottomNav />}
			<ShellOverlays
				showWideShell={showWideShell}
				offlineActionNotice={offlineActionNotice}
				onClearOfflineActionNotice={clearOfflineActionNotice}
			/>
		</div>
	)
}

const WorkspaceScreen = memo(
	function WorkspaceScreen({
		active,
		mounted,
		renderToken = null,
		children,
	}: {
		active: boolean
		mounted: boolean
		renderToken?: number | string | null
		children: ReactNode
	}) {
		if (!mounted) {
			return null
		}

		return (
			<div
				className={`workspace-screen ${active ? 'is-active' : 'is-hidden'}`.trim()}
				aria-hidden={active ? undefined : true}
			>
				{children}
			</div>
		)
	},
	(previousProps, nextProps) => {
		if (previousProps.mounted !== nextProps.mounted) {
			return false
		}
		if (previousProps.active !== nextProps.active) {
			return false
		}
		if (nextProps.active && previousProps.renderToken !== nextProps.renderToken) {
			return false
		}

		return true
	},
)

function usePersistentWideShellState(key: string, fallback: boolean) {
	const hasStoredValue = typeof window !== 'undefined' && window.localStorage.getItem(key) !== null
	const [value, setValue] = useState<boolean>(() => {
		if (typeof window === 'undefined') {
			return fallback
		}

		const storedValue = window.localStorage.getItem(key)
		if (storedValue === null) {
			return fallback
		}

		return storedValue === '1'
	})
	const [stored, setStored] = useState(hasStoredValue)

	const setPersistentValue: Dispatch<SetStateAction<boolean>> = nextValue => {
		setStored(true)
		setValue(currentValue =>
			typeof nextValue === 'function' ? (nextValue as (value: boolean) => boolean)(currentValue) : nextValue,
		)
	}

	useEffect(() => {
		if (typeof window === 'undefined') {
			return
		}

		if (!stored) {
			window.localStorage.removeItem(key)
			return
		}

		window.localStorage.setItem(key, value ? '1' : '0')
	}, [key, stored, value])

	return [value, setPersistentValue, stored] as const
}

function usePersistentWideShellSize(key: string, fallback: number) {
	const hasStoredValue = typeof window !== 'undefined' && window.localStorage.getItem(key) !== null
	const [value, setValue] = useState<number>(() => {
		if (typeof window === 'undefined') {
			return fallback
		}

		const storedValue = Number(window.localStorage.getItem(key))
		return Number.isFinite(storedValue) && storedValue > 0 ? storedValue : fallback
	})
	const [stored, setStored] = useState(hasStoredValue)

	const setPersistentValue: Dispatch<SetStateAction<number>> = nextValue => {
		setStored(true)
		setValue(currentValue =>
			typeof nextValue === 'function' ? (nextValue as (value: number) => number)(currentValue) : nextValue,
		)
	}

	useEffect(() => {
		if (typeof window === 'undefined') {
			return
		}

		if (!stored) {
			window.localStorage.removeItem(key)
			return
		}

		window.localStorage.setItem(key, `${Math.round(value)}`)
	}, [key, stored, value])

	return [value, setPersistentValue, stored] as const
}

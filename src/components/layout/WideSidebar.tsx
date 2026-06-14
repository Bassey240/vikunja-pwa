import {getExpandableProjectIds, getVisibleChildProjects, getVisibleRootProjects} from '@/store/project-helpers'
import {useAppStore} from '@/store'
import {calculateMenuPosition, getMenuAnchor} from '@/utils/menuPosition'
import useWideLayout from '@/hooks/useWideLayout'
import UserAvatar from '@/components/common/UserAvatar'
import Caret from '@/components/common/Caret'
import InlineRootProjectComposer from '@/components/projects/InlineRootProjectComposer'
import type {Project} from '@/types'
import {normalizeHexColor} from '@/utils/formatting'
import {buildSavedFilterProject, isSavedFilterProject} from '@/utils/saved-filters'
import type {CSSProperties, ReactNode} from 'react'
import {useEffect, useMemo, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'

interface WideSidebarProps {
	collapsed: boolean
	onToggleCollapsed: () => void
}

interface WideNavItem {
	label: string
	path: string
	short: string
	icon: ReactNode
	match: (pathname: string) => boolean
}

// Nav icons ported verbatim from the redesign prototype (vikunja-data.jsx DICONS).
const NAV_ICONS: Record<string, ReactNode> = {
	today: (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<rect x="3" y="5" width="18" height="16" rx="2" />
			<line x1="16" y1="3" x2="16" y2="7" />
			<line x1="8" y1="3" x2="8" y2="7" />
			<line x1="3" y1="11" x2="21" y2="11" />
			<circle cx="12" cy="16" r="1.5" fill="currentColor" />
		</svg>
	),
	inbox: (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M22 12h-6l-2 3h-4l-2-3H2" />
			<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
		</svg>
	),
	upcoming: (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<polyline points="12 6 12 12 16 14" />
			<circle cx="12" cy="12" r="10" />
		</svg>
	),
	projects: (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
			<rect x="14" y="14" width="7" height="7" rx="1" />
		</svg>
	),
	search: (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="11" cy="11" r="7" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</svg>
	),
	filters: (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<line x1="4" y1="6" x2="14" y2="6" />
			<circle cx="17" cy="6" r="2" />
			<line x1="20" y1="12" x2="10" y2="12" />
			<circle cx="7" cy="12" r="2" />
			<line x1="4" y1="18" x2="14" y2="18" />
			<circle cx="17" cy="18" r="2" />
		</svg>
	),
	labels: (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
			<line x1="7" y1="7" x2="7.01" y2="7" />
		</svg>
	),
	settings: (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<line x1="4" y1="21" x2="4" y2="14" />
			<line x1="4" y1="10" x2="4" y2="3" />
			<line x1="12" y1="21" x2="12" y2="12" />
			<line x1="12" y1="8" x2="12" y2="3" />
			<line x1="20" y1="21" x2="20" y2="16" />
			<line x1="20" y1="12" x2="20" y2="3" />
			<line x1="1" y1="14" x2="7" y2="14" />
			<line x1="9" y1="8" x2="15" y2="8" />
			<line x1="17" y1="16" x2="23" y2="16" />
		</svg>
	),
}

const NAV_ITEMS: WideNavItem[] = [
	{label: 'Today', path: '/', short: 'T', icon: NAV_ICONS.today, match: pathname => pathname === '/'},
	{label: 'Inbox', path: '/inbox', short: 'I', icon: NAV_ICONS.inbox, match: pathname => pathname === '/inbox'},
	{label: 'Upcoming', path: '/upcoming', short: 'U', icon: NAV_ICONS.upcoming, match: pathname => pathname === '/upcoming'},
	{label: 'Projects', path: '/projects', short: 'P', icon: NAV_ICONS.projects, match: pathname => pathname === '/projects' || pathname.startsWith('/projects/')},
	{label: 'Search', path: '/search', short: '/', icon: NAV_ICONS.search, match: pathname => pathname === '/search'},
	{label: 'Filters', path: '/filters', short: 'F', icon: NAV_ICONS.filters, match: pathname => pathname === '/filters'},
	{label: 'Labels', path: '/labels', short: 'L', icon: NAV_ICONS.labels, match: pathname => pathname === '/labels'},
	{label: 'Settings', path: '/settings', short: ',', icon: NAV_ICONS.settings, match: pathname => pathname === '/settings'},
]

export default function WideSidebar({collapsed, onToggleCollapsed}: WideSidebarProps) {
	const navigate = useNavigate()
	const location = useLocation()
	const isWideLayout = useWideLayout()
	const account = useAppStore(state => state.account)
	const connected = useAppStore(state => state.connected)
	const projects = useAppStore(state => state.projects)
	const savedFilters = useAppStore(state => state.savedFilters)
	const selectedProjectId = useAppStore(state => state.selectedProjectId)
	const selectedSavedFilterProjectId = useAppStore(state => state.selectedSavedFilterProjectId)
	const openMenu = useAppStore(state => state.openMenu)
	const setOpenMenu = useAppStore(state => state.setOpenMenu)
	const closeTaskDetail = useAppStore(state => state.closeTaskDetail)
	const closeProjectDetail = useAppStore(state => state.closeProjectDetail)
	const loadProjects = useAppStore(state => state.loadProjects)
	const navigateToProject = useAppStore(state => state.navigateToProject)
	const openProjectDetail = useAppStore(state => state.openProjectDetail)
	const openProjectComposer = useAppStore(state => state.openProjectComposer)
	const loadSavedFilterTasks = useAppStore(state => state.loadSavedFilterTasks)
	const getProjectAncestors = useAppStore(state => state.getProjectAncestors)
	const [expandedProjectIds, setExpandedProjectIds] = useState<Set<number>>(new Set())

	useEffect(() => {
		if (!connected || projects.length > 0) {
			return
		}

		void loadProjects()
	}, [connected, loadProjects, projects.length])

	useEffect(() => {
		if (!selectedProjectId) {
			return
		}

		const ancestorIds = getProjectAncestors(selectedProjectId).map(project => project.id)
		setExpandedProjectIds(current => {
			const next = new Set(current)
			ancestorIds.forEach(projectId => next.add(projectId))
			return next
		})
	}, [getProjectAncestors, selectedProjectId])

	const savedFilterProjects = useMemo(() => savedFilters.map(buildSavedFilterProject), [savedFilters])
	const rootProjects = useMemo(() => [...getVisibleRootProjects(projects), ...savedFilterProjects], [projects, savedFilterProjects])
	const expandableProjectIds = useMemo(() => getExpandableProjectIds(projects), [projects])
	const projectContextActive = location.pathname.startsWith('/projects/')
	const routeProjectId = projectContextActive ? Number(location.pathname.split('/')[2] || 0) || null : null
	const activeSidebarProjectId =
		location.pathname === '/projects'
			? null
			: projectContextActive
				? routeProjectId ?? selectedSavedFilterProjectId ?? selectedProjectId
				: null
	const sidebarProjectsMenu = openMenu?.kind === 'sidebar-projects' ? openMenu : null

	function goTo(path: string) {
		closeTaskDetail()
		closeProjectDetail()
		setOpenMenu(null)
		navigate(path)
	}

	function toggleProject(projectId: number) {
		setExpandedProjectIds(current => {
			const next = new Set(current)
			if (next.has(projectId)) {
				next.delete(projectId)
			} else {
				next.add(projectId)
			}
			return next
		})
	}

	function openProject(projectId: number) {
		if (projectId < 0) {
			void loadSavedFilterTasks(projectId, {silent: true})
			navigate(`/projects/${projectId}`)
			return
		}
		void navigateToProject(projectId)
		navigate(`/projects/${projectId}`)
		if (isWideLayout) {
			void openProjectDetail(projectId)
		}
	}

	function expandAllSidebarProjects() {
		setExpandedProjectIds(new Set(expandableProjectIds))
		setOpenMenu(null)
	}

	function collapseAllSidebarProjects() {
		setExpandedProjectIds(new Set())
		setOpenMenu(null)
	}

	return (
		<aside className={`wide-sidebar ${collapsed ? 'is-collapsed' : ''}`.trim()}>
			<div className="wide-sidebar-user">
				{collapsed ? null : (
					<button
						className="wide-sidebar-user-left"
						type="button"
						aria-label={`${account?.user?.name || account?.user?.username || 'Workspace'} — account & settings`}
						onClick={() => goTo('/settings?section=account')}
					>
						<UserAvatar user={account?.user} size={28} />
						<span className="wide-sidebar-user-name">
							{account?.user?.name || account?.user?.username || 'Workspace'}
						</span>
					</button>
				)}
				<button
					className="wide-sidebar-toggle"
					type="button"
					aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
					onClick={onToggleCollapsed}
				>
					{collapsed ? '▸' : '◂'}
				</button>
			</div>
			{collapsed ? null : (
				<div className="wide-sidebar-search">
					<button
						className="wide-sidebar-search-input"
						type="button"
						onClick={() => goTo('/search')}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
							<path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
						</svg>
						<span>Search or jump to…</span>
					</button>
				</div>
			)}
			<div className="wide-sidebar-body">
				<nav className="wide-sidebar-nav" aria-label="Primary">
					{NAV_ITEMS.map(item => {
						const active = item.match(location.pathname)
						return (
							<button
								key={item.label}
								className={`wide-sidebar-nav-item ${active ? 'is-active' : ''}`.trim()}
								type="button"
								title={collapsed ? item.label : undefined}
								data-active={active ? 'true' : undefined}
								onClick={() => goTo(item.path)}
							>
								<span className="wide-sidebar-nav-icon" aria-hidden="true">
									{item.icon}
								</span>
								{collapsed ? null : (
									<>
										<span className="wide-sidebar-nav-label">{item.label}</span>
										<span className="wide-sidebar-nav-key" aria-hidden="true">
											{item.short}
										</span>
									</>
								)}
							</button>
						)
					})}
				</nav>
				<div className="wide-sidebar-projects">
					<div className="wide-sidebar-projects-head">
						{collapsed ? null : <div className="detail-label">Projects</div>}
						{collapsed ? null : (
							<button
								className="wide-sidebar-projects-menu-button"
								type="button"
								data-menu-toggle="true"
								aria-label="Project tree menu"
								onClick={event =>
									setOpenMenu(
										sidebarProjectsMenu
											? null
											: {
													kind: 'sidebar-projects',
													anchor: getMenuAnchor(event.currentTarget),
											  },
									)
								}
							>
								⋮
							</button>
						)}
					</div>
					{sidebarProjectsMenu ? (
						<div
							className="inline-menu topbar-action-menu"
							data-menu-root="true"
							style={(() => {
								const position = calculateMenuPosition(sidebarProjectsMenu.anchor)
								return {
									position: 'fixed',
									top: `${position.top}px`,
									right: `${position.right}px`,
									zIndex: 130,
								}
							})()}
						>
							<button
								className="menu-item"
								type="button"
								onClick={() => {
									setOpenMenu(null)
									openProjectComposer(null, {placement: 'sidebar'})
								}}
							>
								Add project
							</button>
							<button className="menu-item" type="button" onClick={expandAllSidebarProjects}>
								Expand all
							</button>
							<button className="menu-item" type="button" onClick={collapseAllSidebarProjects}>
								Collapse all
							</button>
						</div>
					) : null}
					{collapsed ? null : (
						<div className="wide-sidebar-project-tree">
							<InlineRootProjectComposer placement="sidebar" />
							{rootProjects.map(project => (
							<SidebarProjectItem
								key={project.id}
								project={project}
								projects={projects}
								selectedProjectId={activeSidebarProjectId}
								expandedProjectIds={expandedProjectIds}
								onToggleProject={toggleProject}
								onOpenProject={projectId => void openProject(projectId)}
									depth={0}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</aside>
	)
}

function SidebarProjectItem({
	project,
	projects,
	selectedProjectId,
	expandedProjectIds,
	onToggleProject,
	onOpenProject,
	depth,
}: {
	project: Project
	projects: Project[]
	selectedProjectId: number | null
	expandedProjectIds: Set<number>
	onToggleProject: (projectId: number) => void
	onOpenProject: (projectId: number) => void
	depth: number
}) {
	const children = getVisibleChildProjects(project.id, projects)
	const savedFilterProject = isSavedFilterProject(project)
	const expanded = expandedProjectIds.has(project.id)
	const active = selectedProjectId === project.id
	const projectColor = savedFilterProject ? '' : normalizeHexColor(project.hex_color)

	return (
		<div className="wide-sidebar-project-item" style={{'--depth': depth} as CSSProperties} data-project-node-id={project.id}>
			<div className={`wide-sidebar-project-row ${active ? 'is-active' : ''}`.trim()}>
				{!savedFilterProject && children.length > 0 ? (
					<button
						className="wide-sidebar-project-toggle"
						type="button"
						aria-label={expanded ? `Collapse ${project.title}` : `Expand ${project.title}`}
						onClick={() => onToggleProject(project.id)}
					>
						<Caret expanded={expanded} />
					</button>
				) : (
					<span className="wide-sidebar-project-toggle-spacer" aria-hidden="true"></span>
				)}
				<button className="wide-sidebar-project-link" type="button" onClick={() => onOpenProject(project.id)}>
					<span
						className={`wide-sidebar-project-dot ${projectColor ? '' : 'is-empty'}`.trim()}
						style={projectColor ? ({backgroundColor: projectColor} as CSSProperties) : undefined}
						aria-hidden="true"
					/>
					<span className="wide-sidebar-project-name">{project.title}</span>
					{savedFilterProject ? <span className="wide-sidebar-project-kind">Filter</span> : null}
				</button>
			</div>
			{!savedFilterProject && expanded && children.length > 0 ? (
				<div className="wide-sidebar-project-children">
					{children.map(child => (
						<SidebarProjectItem
							key={child.id}
							project={child}
							projects={projects}
							selectedProjectId={selectedProjectId}
							expandedProjectIds={expandedProjectIds}
							onToggleProject={onToggleProject}
							onOpenProject={onOpenProject}
							depth={depth + 1}
						/>
					))}
				</div>
			) : null}
		</div>
	)
}

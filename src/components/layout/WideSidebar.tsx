import {getExpandableProjectIds, getVisibleChildProjects, getVisibleRootProjects} from '@/store/project-helpers'
import {useAppStore} from '@/store'
import {calculateMenuPosition, getMenuAnchor} from '@/utils/menuPosition'
import useWideLayout from '@/hooks/useWideLayout'
import InlineRootProjectComposer from '@/components/projects/InlineRootProjectComposer'
import type {Project} from '@/types'
import {buildSavedFilterProject, isSavedFilterProject} from '@/utils/saved-filters'
import type {CSSProperties} from 'react'
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
	match: (pathname: string) => boolean
}

const NAV_ITEMS: WideNavItem[] = [
	{label: 'Today', path: '/', short: 'T', match: pathname => pathname === '/'},
	{label: 'Inbox', path: '/inbox', short: 'I', match: pathname => pathname === '/inbox'},
	{label: 'Upcoming', path: '/upcoming', short: 'U', match: pathname => pathname === '/upcoming'},
	{label: 'Projects', path: '/projects', short: 'P', match: pathname => pathname === '/projects' || pathname.startsWith('/projects/')},
	{label: 'Search', path: '/search', short: 'S', match: pathname => pathname === '/search'},
	{label: 'Filters', path: '/filters', short: 'F', match: pathname => pathname === '/filters'},
	{label: 'Labels', path: '/labels', short: 'L', match: pathname => pathname === '/labels'},
	{label: 'Settings', path: '/settings', short: 'C', match: pathname => pathname === '/settings'},
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
			<div className="wide-sidebar-head">
				{collapsed ? null : (
					<div className="wide-sidebar-account-pill topbar-title-pill">
						<h1>{account?.user?.name || account?.user?.username || 'Workspace'}</h1>
					</div>
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
								onClick={() => goTo(item.path)}
							>
								<span className="wide-sidebar-nav-token" aria-hidden="true">
									{item.short}
								</span>
								{collapsed ? null : <span>{item.label}</span>}
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
								⋯
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
						{expanded ? '▾' : '▸'}
					</button>
				) : (
					<span className="wide-sidebar-project-toggle-spacer" aria-hidden="true"></span>
				)}
				<button className="wide-sidebar-project-link" type="button" onClick={() => onOpenProject(project.id)}>
					<span>{project.title}</span>
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

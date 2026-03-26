import ProjectMenu from './ProjectMenu'
import ProjectPreview from './ProjectPreview'
import InlineProjectComposer from './InlineProjectComposer'
import useWideLayout from '@/hooks/useWideLayout'
import InlineRootTaskComposer from '@/components/tasks/InlineRootTaskComposer'
import TaskTree from '@/components/tasks/TaskTree'
import type {TaskSortBy} from '@/hooks/useFilters'
import {type ProjectAggregateCounts, getVisibleChildProjects} from '@/store/project-helpers'
import {useAppStore} from '@/store'
import {type TaskMatcher} from '@/store/selectors'
import type {Project, Task} from '@/types'
import {isProjectDropTraceTarget, markProjectDropTrace} from '@/utils/dragPerf'
import {getMenuAnchor} from '@/utils/menuPosition'
import {type CSSProperties, useLayoutEffect, useRef} from 'react'
import {useNavigate} from 'react-router-dom'

const emptyPreviewTasks: Task[] = []

interface ProjectNodeProps {
	project: Project
	depth: number
	parentProjectId?: number
	countsByProjectId: Map<number, ProjectAggregateCounts>
	getChildren?: (projectId: number) => Project[]
	previewTaskMatcher?: TaskMatcher
	previewTaskSortBy?: TaskSortBy
	taskDropEnabled?: boolean
	previewTaskBulkMode?: boolean
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
	return `${count} ${count === 1 ? singular : plural}`
}

export default function ProjectNode({
	project,
	depth,
	parentProjectId = 0,
	countsByProjectId,
	getChildren,
	previewTaskMatcher,
	previewTaskSortBy = 'position',
	taskDropEnabled = false,
	previewTaskBulkMode = false,
}: ProjectNodeProps) {
	const navigate = useNavigate()
	const isWideLayout = useWideLayout()
	const projects = useAppStore(state => state.projects)
	const openMenu = useAppStore(state => state.openMenu)
	const expanded = useAppStore(state => state.expandedProjectIds.has(project.id))
	const loadingPreview = useAppStore(state => state.loadingProjectPreviewIds.has(project.id))
	const previewTasks = useAppStore(state => state.projectPreviewTasksById[project.id] || emptyPreviewTasks)
	const subprojectComposerOpen = useAppStore(state => state.projectComposerOpen && state.projectComposerParentId === project.id)
	const inlineTaskComposerOpen = useAppStore(
		state =>
			state.rootComposerOpen &&
			state.rootComposerPlacement === 'project-preview' &&
			state.composerProjectId === project.id &&
			!state.composerParentTaskId,
	)
	const toggleProjectExpanded = useAppStore(state => state.toggleProjectExpanded)
	const toggleProjectMenu = useAppStore(state => state.toggleProjectMenu)
	const navigateToProject = useAppStore(state => state.navigateToProject)
	const openProjectDetail = useAppStore(state => state.openProjectDetail)
	const editProject = useAppStore(state => state.editProject)
	const openProjectComposer = useAppStore(state => state.openProjectComposer)
	const openRootComposer = useAppStore(state => state.openRootComposer)
	const moveProjectToParent = useAppStore(state => state.moveProjectToParent)
	const duplicateProject = useAppStore(state => state.duplicateProject)
	const deleteProject = useAppStore(state => state.deleteProject)
	const rowRef = useRef<HTMLDivElement | null>(null)

	const children = getChildren ? getChildren(project.id) : getVisibleChildProjects(project.id, projects)
	const menuOpen = openMenu?.kind === 'project' && openMenu.id === project.id
	const counts = countsByProjectId.get(project.id) || {
		projectCount: 0,
		taskCount: 0,
		taskCountLoaded: false,
	}
	const summaryParts = [
		formatCountLabel(counts.projectCount, 'project'),
		counts.taskCountLoaded ? formatCountLabel(counts.taskCount, 'task') : 'Task count...',
	]

	useLayoutEffect(() => {
		const trace = isProjectDropTraceTarget(project.id, parentProjectId)
		if (!trace || !rowRef.current) {
			return
		}

		markProjectDropTrace(trace.token, 'destination-row-layout-effect', {
			parentProjectId,
			depth,
		})

		let frameId = requestAnimationFrame(() => {
			frameId = requestAnimationFrame(() => {
				const row = rowRef.current
				if (!row?.isConnected) {
					return
				}

				const rect = row.getBoundingClientRect()
				markProjectDropTrace(trace.token, 'first-destination-paint', {
					parentProjectId,
					depth,
					top: Math.round(rect.top),
					height: Math.round(rect.height),
				})
			})
		})

		return () => {
			cancelAnimationFrame(frameId)
		}
	}, [depth, parentProjectId, project.id, project.parent_project_id, project.position])

	async function handleCreateTask() {
		if (!expanded) {
			await toggleProjectExpanded(project.id)
		}
		openRootComposer({
			projectId: project.id,
			placement: 'project-preview',
		})
	}

	return (
		<div
			className={`project-node ${menuOpen ? 'is-menu-open' : ''}`.trim()}
			style={{'--depth': depth} as CSSProperties}
			data-project-node-id={project.id}
		>
			<div ref={rowRef} className="project-node-row">
				<button
					className="chevron-button"
					data-action="toggle-project"
					data-project-id={project.id}
					type="button"
					onClick={() => void toggleProjectExpanded(project.id)}
				>
					{expanded ? '▾' : '▸'}
				</button>
				<button
					className="project-select"
					data-action="select-project"
					data-project-id={project.id}
					type="button"
					onClick={() => {
						if (isWideLayout) {
							void openProjectDetail(project.id)
						}
						void navigateToProject(project.id)
						navigate(`/projects/${project.id}`)
					}}
				>
					<span className="card-copy">
						<span className="card-title project-card-title">{project.title}</span>
						<span className="card-meta project-card-meta">{summaryParts.join(' · ')}</span>
					</span>
				</button>
				<div
					className="drag-handle project-drag-handle"
					aria-hidden="true"
				>
					<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
						<circle cx="2.5" cy="2.5" r="1.5" />
						<circle cx="7.5" cy="2.5" r="1.5" />
						<circle cx="2.5" cy="8" r="1.5" />
						<circle cx="7.5" cy="8" r="1.5" />
						<circle cx="2.5" cy="13.5" r="1.5" />
						<circle cx="7.5" cy="13.5" r="1.5" />
					</svg>
				</div>
				<button
					className="menu-button"
					data-action="toggle-project-menu"
					data-project-id={project.id}
					data-menu-toggle="true"
					type="button"
					onClick={event => toggleProjectMenu(project.id, getMenuAnchor(event.currentTarget))}
				>
					⋯
				</button>
			</div>
			{menuOpen && openMenu.kind === 'project' ? (
				<ProjectMenu
					project={project}
					anchor={openMenu.anchor}
					onShare={() => void openProjectDetail(project.id)}
					onEdit={() => void editProject(project.id)}
					onCreateTask={() => void handleCreateTask()}
					onCreateSubproject={() => openProjectComposer(project.id)}
					onMoveToRoot={() => void moveProjectToParent(project.id, 0)}
					onDuplicate={() => void duplicateProject(project.id)}
					onDelete={() => void deleteProject(project.id)}
				/>
			) : null}
			{expanded || subprojectComposerOpen || inlineTaskComposerOpen ? (
				<div className="project-preview">
					<InlineProjectComposer parentProjectId={project.id} />
					{loadingPreview ? <div className="empty-state">Loading tasks...</div> : null}
					{!loadingPreview && children.length > 0 ? (
						<ProjectPreview label="Sub-projects" parentProjectId={project.id}>
										{children.map(child => (
								<ProjectNode
									key={child.id}
									project={child}
									depth={depth + 1}
									parentProjectId={project.id}
									countsByProjectId={countsByProjectId}
									getChildren={getChildren}
									previewTaskMatcher={previewTaskMatcher}
									previewTaskSortBy={previewTaskSortBy}
									taskDropEnabled={taskDropEnabled}
									previewTaskBulkMode={previewTaskBulkMode}
								/>
							))}
						</ProjectPreview>
					) : null}
					{!loadingPreview && (inlineTaskComposerOpen || previewTasks.length > 0) ? (
									<ProjectPreview label="Tasks" parentProjectId={project.id}>
										<InlineRootTaskComposer placement="project-preview" projectId={project.id} />
										<TaskTree
											taskList={previewTasks}
											compact={true}
											matcher={previewTaskMatcher}
											sortBy={previewTaskSortBy}
											bulkMode={previewTaskBulkMode}
										/>
									</ProjectPreview>
					) : null}
					{!loadingPreview && inlineTaskComposerOpen && previewTasks.length === 0 ? (
						<InlineRootTaskComposer placement="project-preview" projectId={project.id} />
					) : null}
				</div>
			) : null}
		</div>
	)
}

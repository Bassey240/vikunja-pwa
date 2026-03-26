import ProjectMenu from '@/components/projects/ProjectMenu'
import {getCombinedSearchResults} from '@/hooks/useFilters'
import {useAppStore} from '@/store'
import {getMenuAnchor} from '@/utils/menuPosition'
import {formatShortDate, normalizeTaskDateValue} from '@/utils/formatting'
import {type FormEvent, useState} from 'react'

interface InlineSearchPanelProps {
	onProjectResultSelect: (projectId: number) => void
	onTaskResultSelect: (taskId: number, projectId: number) => void
}

export default function InlineSearchPanel({
	onProjectResultSelect,
	onTaskResultSelect,
}: InlineSearchPanelProps) {
	const projects = useAppStore(state => state.projects)
	const searchTasks = useAppStore(state => state.searchTasks)
	const searchQuery = useAppStore(state => state.searchQuery)
	const searchHasRun = useAppStore(state => state.searchHasRun)
	const loadingSearch = useAppStore(state => state.loadingSearch)
	const loadSearchTasks = useAppStore(state => state.loadSearchTasks)
	const setSearchQuery = useAppStore(state => state.setSearchQuery)
	const clearSearchState = useAppStore(state => state.clearSearchState)
	const getProjectAncestors = useAppStore(state => state.getProjectAncestors)
	const openMenu = useAppStore(state => state.openMenu)
	const toggleProjectMenu = useAppStore(state => state.toggleProjectMenu)
	const openProjectDetail = useAppStore(state => state.openProjectDetail)
	const editProject = useAppStore(state => state.editProject)
	const openProjectComposer = useAppStore(state => state.openProjectComposer)
	const openRootComposer = useAppStore(state => state.openRootComposer)
	const moveProjectToParent = useAppStore(state => state.moveProjectToParent)
	const duplicateProject = useAppStore(state => state.duplicateProject)
	const deleteProject = useAppStore(state => state.deleteProject)
	const [showCompleted, setShowCompleted] = useState(true)

	const allResults = getCombinedSearchResults(projects, searchTasks, searchQuery)
	const results = showCompleted
		? allResults
		: allResults.filter(result => result.kind === 'project' || !result.task.done)

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		await loadSearchTasks(searchQuery)
	}

	return (
		<section className="overview-search-panel">
			<form className="topbar-search-form" data-form="global-search" onSubmit={handleSubmit}>
				<input
					className="detail-input topbar-search-input"
					data-search-input
					type="search"
					placeholder="Search projects and tasks"
					value={searchQuery}
					onChange={event => setSearchQuery(event.currentTarget.value)}
				/>
				<button className="pill-button subtle topbar-search-submit" type="submit" disabled={loadingSearch}>
					{loadingSearch ? '...' : 'Find'}
				</button>
				{searchQuery ? (
					<button
						className="pill-button subtle topbar-search-clear"
						data-action="clear-search"
						type="button"
						onClick={clearSearchState}
					>
						Clear
					</button>
				) : null}
			</form>
			<label className="gantt-checkbox-field">
				<input
					type="checkbox"
					checked={showCompleted}
					onChange={event => setShowCompleted(event.currentTarget.checked)}
				/>
				<span>Show completed</span>
			</label>

			<div className="topbar-search-results">
				{searchHasRun && !searchQuery ? <div className="empty-state compact">Search by project name or task text.</div> : null}
				{loadingSearch ? <div className="empty-state compact">Searching projects and tasks...</div> : null}
				{!loadingSearch && searchQuery && results.length === 0 ? <div className="empty-state compact">No projects or tasks matched this search.</div> : null}
				{!loadingSearch && searchQuery && results.length > 0 ? (
					<div className="search-result-list">
						{results.map(result =>
							result.kind === 'project' ? (
								<div key={`project-${result.project.id}`} className="search-result-card-shell">
									<div className="search-result-card search-result-card-project">
										<button
											className="search-result-card-main"
											data-action="open-search-project-result"
											data-project-id={result.project.id}
											type="button"
											onClick={() => onProjectResultSelect(result.project.id)}
										>
											<div className="search-result-head">
												<div className="search-result-title">{result.project.title}</div>
												<span className="meta-chip">Project</span>
											</div>
											<div className="search-result-meta">
												{getProjectAncestors(result.project.id).map(project => project.title).join(' / ')}
											</div>
										</button>
										<button
											className="menu-button search-result-menu-button"
											data-action="toggle-project-menu"
											data-project-id={result.project.id}
											data-menu-toggle="true"
											type="button"
											onClick={event => toggleProjectMenu(result.project.id, getMenuAnchor(event.currentTarget))}
										>
											⋯
										</button>
									</div>
									{openMenu?.kind === 'project' && openMenu.id === result.project.id ? (
										<ProjectMenu
											project={result.project}
											anchor={openMenu.anchor}
											onShare={() => void openProjectDetail(result.project.id)}
											onEdit={() => void editProject(result.project.id)}
											onCreateTask={() => {
												onProjectResultSelect(result.project.id)
												openRootComposer({
													projectId: result.project.id,
													placement: 'sheet',
												})
											}}
											onCreateSubproject={() => openProjectComposer(result.project.id)}
											onMoveToRoot={() => void moveProjectToParent(result.project.id, 0)}
											onDuplicate={() => void duplicateProject(result.project.id)}
											onDelete={() => void deleteProject(result.project.id)}
										/>
									) : null}
								</div>
							) : (
								<button
									key={`task-${result.task.id}`}
									className="search-result-card"
									data-action="open-search-task-result"
									data-task-id={result.task.id}
									data-project-id={result.task.project_id}
									type="button"
									onClick={() => onTaskResultSelect(result.task.id, result.task.project_id)}
								>
									<div className="search-result-head">
										<div className="search-result-title">{result.task.title}</div>
										<span className="meta-chip">Task</span>
									</div>
									<div className="search-result-meta">
										{[
											projects.find(project => project.id === result.task.project_id)?.title || 'Unknown project',
											normalizeTaskDateValue(result.task.due_date || null)
												? formatShortDate(normalizeTaskDateValue(result.task.due_date || null)!)
												: '',
										]
											.filter(Boolean)
											.join(' · ')}
									</div>
								</button>
							),
						)}
					</div>
				) : null}
			</div>
		</section>
	)
}

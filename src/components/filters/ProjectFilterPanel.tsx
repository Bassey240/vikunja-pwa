import SavedFilterPicker from './SavedFilterPicker'
import {
	getUniqueFilterValues,
	taskSortFieldOptions,
	taskSortOrderOptions,
	type ProjectFilters,
} from '@/hooks/useFilters'
import {useAppStore} from '@/store'
import type {Task} from '@/types'

interface ProjectFilterPanelProps {
	onApply: () => void
	onReset: () => void
	projectFilterTasks: Task[]
	onSavedFilterSelect: (projectId: number | null) => void
	onManageFilters: () => void
}

export default function ProjectFilterPanel({
	onApply,
	onReset,
	projectFilterTasks,
	onSavedFilterSelect,
	onManageFilters,
}: ProjectFilterPanelProps) {
	const projectFilterDraft = useAppStore(state => state.projectFilterDraft)
	const projects = useAppStore(state => state.projects)
	const labels = useAppStore(state => state.labels)
	const loadingLabels = useAppStore(state => state.loadingLabels)
	const loadingProjectFilterTasks = useAppStore(state => state.loadingProjectFilterTasks)
	const savedFilters = useAppStore(state => state.savedFilters)
	const selectedSavedFilterProjectId = useAppStore(state => state.selectedSavedFilterProjectId)
	const setProjectFilterField = useAppStore(state => state.setProjectFilterField)

	const filterState = projectFilterDraft as ProjectFilters
	const titleOptions = getUniqueFilterValues(projects.map(project => project?.title || ''))
	const descriptionOptions = getUniqueFilterValues(projects.map(project => project?.description || ''))
	const identifierOptions = getUniqueFilterValues(projects.map(project => project?.identifier || ''))
	const taskTitleOptions = getUniqueFilterValues(projectFilterTasks.map(task => task?.title || ''))
	const taskDescriptionOptions = getUniqueFilterValues(projectFilterTasks.map(task => task?.description || ''))

	return (
		<section className="overview-search-panel overview-filter-panel">
			<div className="filter-panel-head">
				<div className="filter-panel-toolbar">
					<SavedFilterPicker
						savedFilters={savedFilters}
						selectedProjectId={selectedSavedFilterProjectId}
						onSelect={onSavedFilterSelect}
					/>
					<div className="panel-action-row filter-panel-actions">
						<button className="pill-button subtle" data-action="go-filters" type="button" onClick={onManageFilters}>
							Open filters
						</button>
						<button className="pill-button subtle" data-action="reset-project-filter-draft" type="button" onClick={onReset}>
							Reset
						</button>
						<button className="pill-button subtle" data-action="apply-project-filters" type="button" onClick={onApply}>
							Apply
						</button>
					</div>
				</div>
			</div>
			<div className="filter-group-card">
				<div className="panel-label">Sort</div>
				<div className="filter-group-grid">
					<label className="task-filter-field">
						<div className="detail-label">Task mode</div>
						<select className="detail-input" data-project-filter-field="taskSortBy" value={filterState.taskSortBy} onChange={event => setProjectFilterField('taskSortBy', event.currentTarget.value)}>
							{taskSortFieldOptions.map(option => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Task order</div>
						<select
							className="detail-input"
							data-project-filter-field="taskSortOrder"
							value={filterState.taskSortOrder}
							disabled={filterState.taskSortBy === 'position'}
							onChange={event => setProjectFilterField('taskSortOrder', event.currentTarget.value)}
						>
							{taskSortOrderOptions.map(option => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
				</div>
			</div>
			<div className="filter-group-card">
				<div className="panel-label">Filters</div>
				<div className="task-filter-grid">
					<label className="task-filter-field">
						<div className="detail-label">Favorites</div>
						<select className="detail-input" data-project-filter-field="favorite" value={filterState.favorite} onChange={event => setProjectFilterField('favorite', event.currentTarget.value)}>
							<option value="any">Any project</option>
							<option value="only">Favorites only</option>
							<option value="exclude">Hide favorites</option>
						</select>
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Project name</div>
						<input className="detail-input" data-project-filter-field="title" type="text" list="project-filter-title-options" value={filterState.title} onChange={event => setProjectFilterField('title', event.currentTarget.value)} />
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Description</div>
						<input className="detail-input" data-project-filter-field="description" type="text" list="project-filter-description-options" value={filterState.description} onChange={event => setProjectFilterField('description', event.currentTarget.value)} />
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Identifier</div>
						<input className="detail-input" data-project-filter-field="identifier" type="text" list="project-filter-identifier-options" value={filterState.identifier} onChange={event => setProjectFilterField('identifier', event.currentTarget.value)} />
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Task status</div>
						<select className="detail-input" data-project-filter-field="taskStatus" value={filterState.taskStatus} onChange={event => setProjectFilterField('taskStatus', event.currentTarget.value)}>
							<option value="any">All statuses</option>
							<option value="open">Open only</option>
							<option value="done">Done only</option>
						</select>
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Task label</div>
						<select className="detail-input" data-project-filter-field="taskLabelId" value={filterState.taskLabelId} disabled={loadingLabels} onChange={event => setProjectFilterField('taskLabelId', event.currentTarget.value)}>
							<option value="0">Any label</option>
							{labels
								.slice()
								.sort((a, b) => `${a.title || ''}`.localeCompare(`${b.title || ''}`))
								.map(label => (
									<option key={label.id} value={label.id}>
										{label.title}
									</option>
								))}
						</select>
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Task priority</div>
						<select className="detail-input" data-project-filter-field="taskPriority" value={filterState.taskPriority} onChange={event => setProjectFilterField('taskPriority', event.currentTarget.value)}>
							<option value="any">Any priority</option>
							<option value="0">Unset</option>
							<option value="1">Priority 1</option>
							<option value="2">Priority 2</option>
							<option value="3">Priority 3</option>
							<option value="4">Priority 4</option>
							<option value="5">Priority 5</option>
						</select>
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Task due</div>
						<select className="detail-input" data-project-filter-field="taskDue" value={filterState.taskDue} onChange={event => setProjectFilterField('taskDue', event.currentTarget.value)}>
							<option value="any">Any due date</option>
							<option value="none">No due date</option>
							<option value="overdue">Overdue</option>
							<option value="today">Due today</option>
							<option value="next7">Next 7 days</option>
						</select>
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Task name</div>
						<input className="detail-input" data-project-filter-field="taskTitle" type="text" list="project-task-filter-title-options" value={filterState.taskTitle} onChange={event => setProjectFilterField('taskTitle', event.currentTarget.value)} />
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Task description</div>
						<input className="detail-input" data-project-filter-field="taskDescription" type="text" list="project-task-filter-description-options" value={filterState.taskDescription} onChange={event => setProjectFilterField('taskDescription', event.currentTarget.value)} />
					</label>
				</div>
			</div>
			{titleOptions.length > 0 ? <datalist id="project-filter-title-options">{titleOptions.map(value => <option key={value} value={value}></option>)}</datalist> : null}
			{descriptionOptions.length > 0 ? <datalist id="project-filter-description-options">{descriptionOptions.map(value => <option key={value} value={value}></option>)}</datalist> : null}
			{identifierOptions.length > 0 ? <datalist id="project-filter-identifier-options">{identifierOptions.map(value => <option key={value} value={value}></option>)}</datalist> : null}
			{taskTitleOptions.length > 0 ? <datalist id="project-task-filter-title-options">{taskTitleOptions.map(value => <option key={value} value={value}></option>)}</datalist> : null}
			{taskDescriptionOptions.length > 0 ? <datalist id="project-task-filter-description-options">{taskDescriptionOptions.map(value => <option key={value} value={value}></option>)}</datalist> : null}
			{loadingProjectFilterTasks ? <div className="empty-state compact">Loading task data for project filtering…</div> : null}
			{loadingLabels ? <div className="empty-state compact">Loading labels…</div> : null}
		</section>
	)
}

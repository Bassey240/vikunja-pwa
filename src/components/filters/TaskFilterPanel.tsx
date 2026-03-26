import SavedFilterPicker from './SavedFilterPicker'
import {
	getTaskFilterProjectOptions,
	getUniqueFilterValues,
	taskSortFieldOptions,
	taskSortOrderOptions,
	type TaskFilters,
} from '@/hooks/useFilters'
import {useAppStore} from '@/store'
import type {Screen} from '@/types'

interface TaskFilterPanelProps {
	screen: Screen
	allowProject: boolean
	visibleTaskList: ReturnType<typeof useAppStore.getState>['tasks']
	onApply: () => void
	onReset: () => void
	onSavedFilterSelect: (projectId: number | null) => void
	onManageFilters: () => void
	showSavedFilters?: boolean
	showManageFilters?: boolean
}

export default function TaskFilterPanel({
	screen,
	allowProject,
	visibleTaskList,
	onApply,
	onReset,
	onSavedFilterSelect,
	onManageFilters,
	showSavedFilters = true,
	showManageFilters = true,
}: TaskFilterPanelProps) {
	const taskFilterDraft = useAppStore(state => state.taskFilterDraft)
	const projects = useAppStore(state => state.projects)
	const labels = useAppStore(state => state.labels)
	const loadingLabels = useAppStore(state => state.loadingLabels)
	const savedFilters = useAppStore(state => state.savedFilters)
	const selectedSavedFilterProjectId = useAppStore(state => state.selectedSavedFilterProjectId)
	const setTaskFilterField = useAppStore(state => state.setTaskFilterField)
	const getProjectAncestors = useAppStore(state => state.getProjectAncestors)

	const filterState = taskFilterDraft as TaskFilters
	const projectOptions = getTaskFilterProjectOptions(projects, getProjectAncestors)
	const titleOptions = getUniqueFilterValues(visibleTaskList.map(task => task?.title || ''))
	const descriptionOptions = getUniqueFilterValues(visibleTaskList.map(task => task?.description || ''))

	return (
		<section className="overview-search-panel overview-filter-panel">
			<div className="filter-panel-head">
				<div className="filter-panel-toolbar">
					{showSavedFilters ? (
						<SavedFilterPicker
							savedFilters={savedFilters}
							selectedProjectId={selectedSavedFilterProjectId}
							onSelect={onSavedFilterSelect}
						/>
					) : null}
					<div className="panel-action-row filter-panel-actions">
						{showManageFilters ? (
							<button className="pill-button subtle" data-action="go-filters" type="button" onClick={onManageFilters}>
								Open filters
							</button>
						) : null}
						<button className="pill-button subtle" data-action="reset-task-filter-draft" type="button" onClick={onReset}>
							Reset
						</button>
						<button className="pill-button subtle" data-action="apply-task-filters" type="button" onClick={onApply}>
							Apply
						</button>
					</div>
				</div>
			</div>
			<div className="filter-group-card">
				<div className="panel-label">Sort</div>
				<div className="filter-group-grid">
					<label className="task-filter-field">
						<div className="detail-label">Mode</div>
						<select className="detail-input" data-task-filter-field="sortBy" value={filterState.sortBy} onChange={event => setTaskFilterField('sortBy', event.currentTarget.value, allowProject)}>
							{taskSortFieldOptions.map(option => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Order</div>
						<select
							className="detail-input"
							data-task-filter-field="sortOrder"
							value={filterState.sortOrder}
							disabled={filterState.sortBy === 'position'}
							onChange={event => setTaskFilterField('sortOrder', event.currentTarget.value, allowProject)}
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
						<div className="detail-label">Status</div>
						<select className="detail-input" data-task-filter-field="status" value={filterState.status} onChange={event => setTaskFilterField('status', event.currentTarget.value, allowProject)}>
							<option value="open">Open only</option>
							<option value="all">Include finished</option>
							<option value="done">Done only</option>
						</select>
					</label>
					{allowProject ? (
						<label className="task-filter-field">
							<div className="detail-label">Project</div>
							<select className="detail-input" data-task-filter-field="projectId" value={filterState.projectId} onChange={event => setTaskFilterField('projectId', event.currentTarget.value, allowProject)}>
								<option value="0">All projects</option>
								{projectOptions.map(project => (
									<option key={project.id} value={project.id}>
										{project.path}
									</option>
								))}
							</select>
						</label>
					) : null}
					<label className="task-filter-field">
						<div className="detail-label">Label</div>
						<select className="detail-input" data-task-filter-field="labelId" value={filterState.labelId} disabled={loadingLabels} onChange={event => setTaskFilterField('labelId', event.currentTarget.value, allowProject)}>
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
						<div className="detail-label">Priority</div>
						<select className="detail-input" data-task-filter-field="priority" value={filterState.priority} onChange={event => setTaskFilterField('priority', event.currentTarget.value, allowProject)}>
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
						<div className="detail-label">Due</div>
						<select className="detail-input" data-task-filter-field="due" value={filterState.due} onChange={event => setTaskFilterField('due', event.currentTarget.value, allowProject)}>
							<option value="any">Any due date</option>
							<option value="none">No due date</option>
							<option value="overdue">Overdue</option>
							<option value="today">Due today</option>
							<option value="next7">Next 7 days</option>
						</select>
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Name</div>
						<input className="detail-input" data-task-filter-field="title" type="text" list={`task-filter-title-options-${screen}`} value={filterState.title} onChange={event => setTaskFilterField('title', event.currentTarget.value, allowProject)} />
					</label>
					<label className="task-filter-field">
						<div className="detail-label">Description</div>
						<input className="detail-input" data-task-filter-field="description" type="text" list={`task-filter-description-options-${screen}`} value={filterState.description} onChange={event => setTaskFilterField('description', event.currentTarget.value, allowProject)} />
					</label>
				</div>
			</div>
			{titleOptions.length > 0 ? (
				<datalist id={`task-filter-title-options-${screen}`}>
					{titleOptions.map(value => (
						<option key={value} value={value}></option>
					))}
				</datalist>
			) : null}
			{descriptionOptions.length > 0 ? (
				<datalist id={`task-filter-description-options-${screen}`}>
					{descriptionOptions.map(value => (
						<option key={value} value={value}></option>
					))}
				</datalist>
			) : null}
			{loadingLabels ? <div className="empty-state compact">Loading labels…</div> : null}
		</section>
	)
}

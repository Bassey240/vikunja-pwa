import SavedFilterCard from '@/components/search/SavedFilterCard'
import StatusCards from '@/components/layout/StatusCards'
import Topbar from '@/components/layout/Topbar'
import TaskFocusScreen from '@/components/tasks/TaskFocusScreen'
import {api} from '@/api'
import {
	defaultTaskFilters,
	hasActiveTaskFilters,
	setTaskFilterField,
	type TaskFilterField,
	type TaskFilters,
} from '@/hooks/useFilters'
import {useAppStore} from '@/store'
import {buildTaskCollectionPath} from '@/store/selectors'
import type {SavedFilter, Task} from '@/types'
import {formatError} from '@/utils/formatting'
import {
	buildSavedFilterQuery,
	defaultSavedFilterOrderBy,
	defaultSavedFilterSortBy,
	extractTaskFiltersFromSavedFilterQuery,
	getSavedFilterProjectOptions,
	normalizeSavedFilter,
	normalizeSavedFilterSortSettings,
} from '@/utils/saved-filters'
import {useEffect, useMemo, useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'

interface SavedFilterEditorDraft {
	id: number | null
	projectId: number | null
	title: string
	description: string
	isFavorite: boolean
	filterIncludeNulls: boolean
	taskFilters: TaskFilters
	advancedQuery: string
	searchText: string
	sortBy: string[]
	orderBy: string[]
}

export default function FiltersScreen() {
	const navigate = useNavigate()
	const [searchParams, setSearchParams] = useSearchParams()
	const savedFilters = useAppStore(state => state.savedFilters)
	const taskFilterDraft = useAppStore(state => state.taskFilterDraft)
	const projects = useAppStore(state => state.projects)
	const labels = useAppStore(state => state.labels)
	const focusedTaskId = useAppStore(state => state.focusedTaskId)
	const focusedTaskSourceScreen = useAppStore(state => state.focusedTaskSourceScreen)
	const loadSavedFilterTasks = useAppStore(state => state.loadSavedFilterTasks)
	const loadProjects = useAppStore(state => state.loadProjects)
	const ensureLabelsLoaded = useAppStore(state => state.ensureLabelsLoaded)
	const setError = useAppStore(state => state.setError)
	const clearError = useAppStore(state => state.clearError)

	const [editorDraft, setEditorDraft] = useState<SavedFilterEditorDraft | null>(null)
	const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null)
	const [editorLoading, setEditorLoading] = useState(false)
	const [editorSubmitting, setEditorSubmitting] = useState(false)
	const [deleteSubmittingId, setDeleteSubmittingId] = useState<number | null>(null)
	const [previewTaskCount, setPreviewTaskCount] = useState<number | null>(null)
	const [previewLoading, setPreviewLoading] = useState(false)
	const [previewError, setPreviewError] = useState('')
	const showFocusedTask = Boolean(focusedTaskId && focusedTaskSourceScreen === 'filters')
	const taskFilterProjectOptions = useMemo(() => getSavedFilterProjectOptions(projects), [projects])
	const currentTaskDraftActive = hasActiveTaskFilters(taskFilterDraft)
	const requestedEditFilterId = Number(searchParams.get('edit') || 0) || null
	const requestedCreateEditor = searchParams.get('create') === '1'
	const currentEditingFilter = requestedEditFilterId
		? savedFilters.find(filter => filter.id === requestedEditFilterId) || null
		: null
	const queryPreview = editorDraft
		? buildSavedFilterQuery(editorDraft.taskFilters, editorDraft.advancedQuery) || 'done = false'
		: 'done = false'

	useEffect(() => {
		if (!editorDraft || editorLoading) {
			setPreviewTaskCount(null)
			setPreviewLoading(false)
			setPreviewError('')
			return
		}

		const previewFilter = buildSavedFilterQuery(editorDraft.taskFilters, editorDraft.advancedQuery) || 'done = false'
		let cancelled = false
		const timer = window.setTimeout(async () => {
			setPreviewLoading(true)
			setPreviewError('')
			try {
				const previewTasks = await api<Task[]>(buildTaskCollectionPath({
					search: previewFilter ? '' : editorDraft.searchText,
					filter: previewFilter,
				}))
				if (!cancelled) {
					setPreviewTaskCount(countTasksInTree(previewTasks))
				}
			} catch (error) {
				if (!cancelled) {
					setPreviewTaskCount(null)
					setPreviewError(formatError(error as Error))
				}
			} finally {
				if (!cancelled) {
					setPreviewLoading(false)
				}
			}
		}, 350)

		return () => {
			cancelled = true
			window.clearTimeout(timer)
		}
	}, [
		editorDraft,
		editorLoading,
		editorDraft?.advancedQuery,
		editorDraft?.filterIncludeNulls,
		editorDraft?.searchText,
		editorDraft?.taskFilters.description,
		editorDraft?.taskFilters.due,
		editorDraft?.taskFilters.labelId,
		editorDraft?.taskFilters.priority,
		editorDraft?.taskFilters.projectId,
		editorDraft?.taskFilters.status,
		editorDraft?.taskFilters.title,
	])

	useEffect(() => {
		let cancelled = false

		async function syncEditorFromRoute() {
			if (requestedCreateEditor) {
				clearError()
				setEditorLoading(false)
				setEditorSubmitting(false)
				setPreviewTaskCount(null)
				setPreviewLoading(false)
				setPreviewError('')
				setEditorMode(current => current || 'create')
				setEditorDraft(current => (
					current && current.id === null
						? current
						: buildSavedFilterEditorDraft(null, taskFilterDraft)
				))
				return
			}

			if (requestedEditFilterId) {
				if (editorMode === 'edit' && editorDraft?.id === requestedEditFilterId) {
					return
				}

				clearError()
				setEditorLoading(true)
				setPreviewTaskCount(null)
				setPreviewLoading(false)
				setPreviewError('')

				try {
					await ensureLabelsLoaded()
					const payload = await api<{filter?: unknown} | unknown>(`/api/filters/${requestedEditFilterId}`)
					if (cancelled) {
						return
					}
					const detail = normalizeSavedFilter(isFilterEnvelope(payload) ? payload.filter : payload)
					setEditorDraft(buildSavedFilterEditorDraft(detail, taskFilterDraft, useAppStore.getState().labels))
					setEditorMode('edit')
				} catch (error) {
					if (!cancelled) {
						setError(error instanceof Error ? error.message : 'Could not load this saved filter.')
						setSearchParams({}, {replace: true})
					}
				} finally {
					if (!cancelled) {
						setEditorLoading(false)
					}
				}
				return
			}

			if (editorMode || editorDraft || editorLoading || editorSubmitting) {
				setEditorDraft(null)
				setEditorMode(null)
				setEditorLoading(false)
				setEditorSubmitting(false)
				setPreviewTaskCount(null)
				setPreviewLoading(false)
				setPreviewError('')
			}
		}

		void syncEditorFromRoute()

		return () => {
			cancelled = true
		}
	}, [
		clearError,
		editorDraft,
		editorLoading,
		editorMode,
		editorSubmitting,
		ensureLabelsLoaded,
		requestedCreateEditor,
		requestedEditFilterId,
		setError,
		setSearchParams,
		taskFilterDraft,
	])

	if (showFocusedTask) {
		return <TaskFocusScreen sourceScreen="filters" />
	}

	function goBack() {
		if (window.history.length > 1) {
			navigate(-1)
			return
		}

		navigate('/projects')
	}

	function openCreateEditor() {
		clearError()
		setSearchParams({create: '1'})
	}

	function openEditEditor(filter: SavedFilter) {
		clearError()
		setSearchParams({edit: `${filter.id}`})
	}

	function closeEditor() {
		setSearchParams({}, {replace: true})
	}

	function setDraftField<K extends keyof SavedFilterEditorDraft>(field: K, value: SavedFilterEditorDraft[K]) {
		setEditorDraft(current => (current ? {...current, [field]: value} : current))
	}

	function setDraftTaskFilterField(field: TaskFilterField, value: string) {
		setEditorDraft(current => {
			if (!current) {
				return current
			}
			return {
				...current,
				taskFilters: setTaskFilterField(current.taskFilters, field, value),
			}
		})
	}

	function seedFromCurrentTaskDraft() {
		setEditorDraft(current => {
			if (!current) {
				return current
			}
			return {
				...current,
				taskFilters: {
					...defaultTaskFilters,
					...taskFilterDraft,
				},
			}
		})
	}

	async function submitEditor() {
		if (!editorDraft || !editorMode) {
			return
		}

		const title = `${editorDraft.title || ''}`.trim()
		if (!title) {
			setError('Filter title is required.')
			return
		}
		if (title.length > 250) {
			setError('Filter title must be 250 characters or fewer.')
			return
		}

		clearError()
		setEditorSubmitting(true)

		try {
			const filter = buildSavedFilterQuery(editorDraft.taskFilters, editorDraft.advancedQuery) || 'done = false'
			const payload = {
				title,
				description: `${editorDraft.description || ''}`.trim(),
				is_favorite: editorDraft.isFavorite,
				filters: {
					filter,
					filter_include_nulls: editorDraft.filterIncludeNulls,
					sort_by: editorDraft.sortBy,
					order_by: editorDraft.orderBy,
					filter_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
					s: editorDraft.searchText || undefined,
				},
			}
			const path = editorMode === 'edit' && editorDraft.id
				? `/api/filters/${editorDraft.id}`
				: '/api/filters'
			const response = await api<{filter?: unknown}, typeof payload>(path, {
				method: 'POST',
				body: payload,
			})
			normalizeSavedFilter(response.filter ?? response)
			await loadProjects({silent: true})
			closeEditor()
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Could not save this filter.')
		} finally {
			setEditorSubmitting(false)
		}
	}

	async function deleteSavedFilter(filter: SavedFilter) {
		if (!window.confirm(`Delete the "${filter.title}" saved filter?`)) {
			return
		}

		clearError()
		setDeleteSubmittingId(filter.id)
		try {
			await api(`/api/filters/${filter.id}`, {
				method: 'DELETE',
			})
			await loadProjects({silent: true})
			if (editorDraft?.id === filter.id) {
				closeEditor()
			}
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Could not delete this filter.')
		} finally {
			setDeleteSubmittingId(null)
		}
	}

	function openSavedFilterProject(projectId: number) {
		void loadSavedFilterTasks(projectId, {silent: true})
		navigate(`/projects/${projectId}`)
	}

	return (
		<div className="surface">
			<Topbar
				backAction="go-back"
				onBack={goBack}
				desktopHeadingTitle="Filters"
				desktopHeadingCount={savedFilters.length}
				primaryAction={{
					action: 'open-saved-filter-create',
					label: 'New filter',
					text: '+',
					className: 'topbar-primary-add-button',
					onClick: openCreateEditor,
				}}
				actions={[
					{
						action: 'go-search',
						label: 'Search',
						icon: 'search',
						onClick: () => navigate('/search'),
					},
				]}
			/>
			<div className="surface-content">
				<StatusCards />
				<section className="panel screen-card">
					<div className="panel-head desktop-promoted-panel-head">
						<div className="panel-heading-inline">
							<h2 className="panel-title">Filters</h2>
							<div className="count-chip">{savedFilters.length}</div>
						</div>
						<div className="panel-action-row">
							<button className="pill-button subtle" data-action="reload-filters" type="button" onClick={() => void loadProjects({silent: true})}>
								Reload
							</button>
							<button className="pill-button" data-action="open-saved-filter-create" type="button" onClick={openCreateEditor}>
								New filter
							</button>
						</div>
					</div>
					<div className="screen-body">
						{editorMode ? (
							<section className="saved-filter-editor-focus">
								<div className="saved-filter-editor-toolbar">
									<button className="pill-button subtle" data-action="close-saved-filter-editor" type="button" onClick={closeEditor}>
										Back to filters
									</button>
									{editorMode === 'edit' && editorDraft?.projectId ? (
										<button className="pill-button subtle" data-action="goto-saved-filter-project" type="button" onClick={() => openSavedFilterProject(editorDraft.projectId)}>
											Go to filter
										</button>
									) : null}
								</div>
								{editorLoading && !editorDraft ? <div className="empty-state">Loading this saved filter…</div> : null}
								{!editorLoading && editorDraft ? (
									<section className="detail-item detail-field saved-filter-builder-card" data-form="saved-filter-builder">
										<div className="saved-filter-builder-head">
											<div className="saved-filter-editor-heading">
												<div className="detail-label">{editorMode === 'create' ? 'New saved filter' : 'Editing saved filter'}</div>
												<div className="saved-filter-editor-title">
													{editorMode === 'create'
														? 'Create filter'
														: editorDraft.title || currentEditingFilter?.title || 'Untitled filter'}
												</div>
												<div className="detail-helper-text">
													{editorMode === 'create'
														? 'Build the saved filter here, then open it in the project workspace.'
														: 'You are editing this specific saved filter. Save to return to the filter management list.'}
												</div>
											</div>
											<div className="panel-action-row">
												<button
													className="pill-button subtle"
													data-action="use-current-task-filter-draft"
													type="button"
													disabled={editorSubmitting}
													onClick={seedFromCurrentTaskDraft}
												>
													Use current task filters
												</button>
											</div>
										</div>
										<div className="saved-filter-builder-grid">
											<label className="task-filter-field">
												<div className="detail-label">Title</div>
												<input
													className="detail-input"
													data-saved-filter-field="title"
													type="text"
													value={editorDraft.title}
													onChange={event => setDraftField('title', event.currentTarget.value)}
												/>
											</label>
											<label className="task-filter-field">
												<div className="detail-label">Favorite</div>
												<span className="saved-filter-toggle-row">
													<input
														data-saved-filter-field="favorite"
														type="checkbox"
														checked={Boolean(editorDraft.isFavorite)}
														onChange={event => setDraftField('isFavorite', event.currentTarget.checked)}
													/>
													<span>Show in Favorites</span>
												</span>
											</label>
											<label className="task-filter-field saved-filter-builder-span">
												<div className="detail-label">Description</div>
												<textarea
													className="detail-input detail-textarea"
													data-saved-filter-field="description"
													rows={3}
													value={editorDraft.description}
													onChange={event => setDraftField('description', event.currentTarget.value)}
												/>
											</label>
										</div>
										<div className="filter-group-card">
											<div className="panel-label">Structured filters</div>
											<div className="task-filter-grid">
												<label className="task-filter-field">
													<div className="detail-label">Status</div>
													<select className="detail-input" data-task-filter-field="status" value={editorDraft.taskFilters.status || defaultTaskFilters.status} onChange={event => setDraftTaskFilterField('status', event.currentTarget.value)}>
														<option value="open">Open only</option>
														<option value="all">Include finished</option>
														<option value="done">Done only</option>
													</select>
												</label>
												<label className="task-filter-field">
													<div className="detail-label">Project</div>
													<select className="detail-input" data-task-filter-field="projectId" value={editorDraft.taskFilters.projectId || 0} onChange={event => setDraftTaskFilterField('projectId', event.currentTarget.value)}>
														<option value="0">All projects</option>
														{taskFilterProjectOptions.map(project => (
															<option key={project.id} value={project.id}>
																{project.path}
															</option>
														))}
													</select>
												</label>
												<label className="task-filter-field">
													<div className="detail-label">Label</div>
													<select className="detail-input" data-task-filter-field="labelId" value={editorDraft.taskFilters.labelId || 0} onChange={event => setDraftTaskFilterField('labelId', event.currentTarget.value)}>
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
													<select className="detail-input" data-task-filter-field="priority" value={editorDraft.taskFilters.priority || defaultTaskFilters.priority} onChange={event => setDraftTaskFilterField('priority', event.currentTarget.value)}>
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
													<select className="detail-input" data-task-filter-field="due" value={editorDraft.taskFilters.due || defaultTaskFilters.due} onChange={event => setDraftTaskFilterField('due', event.currentTarget.value)}>
														<option value="any">Any due date</option>
														<option value="none">No due date</option>
														<option value="overdue">Overdue</option>
														<option value="today">Due today</option>
														<option value="next7">Next 7 days</option>
													</select>
												</label>
												<label className="task-filter-field">
													<div className="detail-label">Name</div>
													<input className="detail-input" data-task-filter-field="title" type="text" value={editorDraft.taskFilters.title || ''} onChange={event => setDraftTaskFilterField('title', event.currentTarget.value)} />
												</label>
												<label className="task-filter-field">
													<div className="detail-label">Description</div>
													<input className="detail-input" data-task-filter-field="description" type="text" value={editorDraft.taskFilters.description || ''} onChange={event => setDraftTaskFilterField('description', event.currentTarget.value)} />
												</label>
											</div>
										</div>
										<div className="filter-group-card">
											<div className="panel-label">Advanced</div>
											<div className="saved-filter-builder-grid">
												<label className="task-filter-field saved-filter-builder-span">
													<div className="detail-label">Additional raw query clauses</div>
													<textarea
														className="detail-input detail-textarea"
														data-saved-filter-field="advancedQuery"
														rows={3}
														placeholder='Example: assignees in 1 && reminders != 0'
														value={editorDraft.advancedQuery}
														onChange={event => setDraftField('advancedQuery', event.currentTarget.value)}
													/>
												</label>
												<label className="task-filter-field saved-filter-builder-span">
													<span className="saved-filter-toggle-row">
														<input
															data-saved-filter-field="filterIncludeNulls"
															type="checkbox"
															checked={Boolean(editorDraft.filterIncludeNulls)}
															onChange={event => setDraftField('filterIncludeNulls', event.currentTarget.checked)}
														/>
														<span>Include null values for advanced field comparisons</span>
													</span>
												</label>
												{editorDraft.searchText ? (
													<div className="detail-helper-text">
														This filter also preserves simple search text from Vikunja: <code>{editorDraft.searchText}</code>
													</div>
												) : null}
												{currentTaskDraftActive ? (
													<div className="detail-helper-text">
														The current task filter draft is available here. Use <strong>Use current task filters</strong> to seed this builder from the filters you already configured elsewhere in the app.
													</div>
												) : null}
												<div className="detail-helper-text">
													Generated filter query: <code>{queryPreview}</code>
												</div>
												<div className="detail-helper-text saved-filter-preview-status" data-saved-filter-preview>
													{previewLoading
														? 'Checking how many tasks match this filter…'
														: previewError
															? `Preview unavailable: ${previewError}`
															: `Matching tasks right now: ${previewTaskCount ?? 0}`}
												</div>
											</div>
										</div>
										<div className="saved-filter-builder-actions">
											<button className="ghost-button" data-action="cancel-saved-filter" type="button" onClick={closeEditor}>
												Cancel
											</button>
											<button className="composer-submit" data-action="submit-saved-filter" type="button" disabled={editorSubmitting || editorLoading} onClick={() => void submitEditor()}>
												{editorSubmitting ? 'Saving…' : editorMode === 'create' ? 'Create filter' : 'Save filter'}
											</button>
										</div>
									</section>
								) : null}
							</section>
						) : savedFilters.length === 0 ? (
							<div className="empty-state">
								No saved filters returned by this account yet.
								<div className="saved-filter-empty-actions">
									<button className="pill-button" data-action="open-saved-filter-create" type="button" onClick={openCreateEditor}>
										Create your first saved filter
									</button>
								</div>
							</div>
						) : (
							<>
								<div className="saved-filter-list">
									{savedFilters.map(filter => (
										<div key={filter.projectId} className="saved-filter-card-stack">
											<SavedFilterCard
												filter={filter}
												active={false}
												onOpen={() => openSavedFilterProject(filter.projectId)}
											/>
											<div className="saved-filter-card-actions">
												<button className="pill-button subtle" data-action="goto-saved-filter-project" type="button" onClick={() => openSavedFilterProject(filter.projectId)}>
													Go to filter
												</button>
												<button className="pill-button subtle" data-action="open-saved-filter-edit" type="button" disabled={editorLoading} onClick={() => openEditEditor(filter)}>
													Edit
												</button>
												<button className="pill-button subtle danger" data-action="delete-saved-filter" type="button" disabled={deleteSubmittingId === filter.id} onClick={() => void deleteSavedFilter(filter)}>
													{deleteSubmittingId === filter.id ? 'Deleting…' : 'Delete'}
												</button>
											</div>
										</div>
									))}
								</div>
								<div className="detail-helper-text saved-filter-management-note">
									Saved filters now open in the normal project workspace as filter projects. Use this screen to create, edit, delete, and jump to them.
								</div>
							</>
						)}
					</div>
				</section>
			</div>
		</div>
	)
}

function buildSavedFilterEditorDraft(
	savedFilter: SavedFilter | null,
	taskFilterDraft: TaskFilters,
	labels: ReturnType<typeof useAppStore.getState>['labels'] = [],
): SavedFilterEditorDraft {
	if (!savedFilter) {
		return {
			id: null,
			projectId: null,
			title: '',
			description: '',
			isFavorite: false,
			filterIncludeNulls: true,
			taskFilters: {
				...defaultTaskFilters,
				...taskFilterDraft,
			},
			advancedQuery: '',
			searchText: '',
			sortBy: defaultSavedFilterSortBy.slice(),
			orderBy: defaultSavedFilterOrderBy.slice(),
		}
	}

	const normalizedQuery = savedFilter.filters?.filter || 'done = false'
	const {taskFilters, advancedQuery} = extractTaskFiltersFromSavedFilterQuery(normalizedQuery, labels)
	const {sortBy, orderBy} = normalizeSavedFilterSortSettings(savedFilter.filters?.sortBy, savedFilter.filters?.orderBy)

	return {
		id: savedFilter.id,
		projectId: savedFilter.projectId,
		title: savedFilter.title,
		description: savedFilter.description,
		isFavorite: savedFilter.isFavorite,
		filterIncludeNulls: Boolean(savedFilter.filters?.filterIncludeNulls),
		taskFilters,
		advancedQuery,
		searchText: `${savedFilter.filters?.searchText || ''}`.trim(),
		sortBy,
		orderBy,
	}
}

function isFilterEnvelope(value: unknown): value is {filter?: unknown} {
	return Boolean(value) && typeof value === 'object' && 'filter' in (value as Record<string, unknown>)
}

function countTasksInTree(tasks: Task[]) {
	let count = 0

	function visit(taskList: Task[]) {
		for (const task of taskList) {
			count += 1
			const subtasks = Array.isArray(task.related_tasks?.subtask) ? (task.related_tasks.subtask as Task[]) : []
			if (subtasks.length > 0) {
				visit(subtasks)
			}
		}
	}

	visit(Array.isArray(tasks) ? tasks : [])
	return count
}

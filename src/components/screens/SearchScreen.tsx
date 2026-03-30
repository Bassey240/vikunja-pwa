import StatusCards from '@/components/layout/StatusCards'
import Topbar from '@/components/layout/Topbar'
import InlineRootTaskComposer from '@/components/tasks/InlineRootTaskComposer'
import TaskFocusScreen from '@/components/tasks/TaskFocusScreen'
import TaskTree from '@/components/tasks/TaskTree'
import {useAppStore} from '@/store'
import {type FormEvent, useState} from 'react'

export default function SearchScreen() {
	const searchTasks = useAppStore(state => state.searchTasks)
	const searchQuery = useAppStore(state => state.searchQuery)
	const searchHasRun = useAppStore(state => state.searchHasRun)
	const loadingSearch = useAppStore(state => state.loadingSearch)
	const taskFilters = useAppStore(state => state.taskFilters)
	const focusedTaskId = useAppStore(state => state.focusedTaskId)
	const focusedTaskSourceScreen = useAppStore(state => state.focusedTaskSourceScreen)
	const loadSearchTasks = useAppStore(state => state.loadSearchTasks)
	const setSearchQuery = useAppStore(state => state.setSearchQuery)
	const clearSearchState = useAppStore(state => state.clearSearchState)
	const openRootComposer = useAppStore(state => state.openRootComposer)
	const [showCompleted, setShowCompleted] = useState(true)

	const filteredSearchTasks = showCompleted
		? searchTasks
		: searchTasks.filter(task => !task.done)

	const searchMatcher = showCompleted ? () => true : (task: {done: boolean}) => !task.done

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		await loadSearchTasks(searchQuery)
	}

	const showFocusedTask = Boolean(focusedTaskId && focusedTaskSourceScreen === 'search')

	if (showFocusedTask) {
		return <TaskFocusScreen sourceScreen="search" />
	}

	return (
		<div className="surface">
			<Topbar
				includeBackButton={false}
				desktopHeadingTitle="Search"
				desktopHeadingCount={filteredSearchTasks.length}
				primaryAction={{
					action: 'open-root-composer',
					label: 'Add task',
					text: '+',
					className: 'topbar-primary-add-button',
					onClick: () => openRootComposer({placement: 'center'}),
				}}
			/>
			<div className="surface-content">
				<StatusCards />
				<section className="panel screen-card">
					<div className="panel-head desktop-promoted-panel-head">
						<div className="panel-heading-inline">
							<h2 className="panel-title">Search</h2>
							<div className="count-chip">{filteredSearchTasks.length}</div>
						</div>
					</div>
					<div className="screen-body">
						<InlineRootTaskComposer />
						<form className="detail-inline-form search-form" data-form="global-search" onSubmit={handleSubmit}>
							<input
								className="detail-input"
								data-search-input
								type="search"
								placeholder="Search task titles and descriptions"
								value={searchQuery}
								onChange={event => setSearchQuery(event.currentTarget.value)}
							/>
							<button className="composer-submit" type="submit" disabled={loadingSearch}>
								{loadingSearch ? 'Searching...' : 'Search'}
							</button>
						</form>
						<label className="gantt-checkbox-field">
							<input
								type="checkbox"
								checked={showCompleted}
								onChange={event => setShowCompleted(event.currentTarget.checked)}
							/>
							<span>Show completed</span>
						</label>
						{searchHasRun && searchQuery ? (
							<div className="search-toolbar">
								<div className="empty-state compact">Results for "{searchQuery}"</div>
								<button className="pill-button subtle" data-action="clear-search" type="button" onClick={clearSearchState}>
									Clear
								</button>
							</div>
						) : null}
						{searchHasRun && !searchQuery ? <div className="empty-state">Enter a search term to see matching tasks.</div> : null}
						{searchHasRun && searchQuery && filteredSearchTasks.length > 0 ? (
							<TaskTree taskList={filteredSearchTasks} compact={true} matcher={searchMatcher} sortBy={taskFilters.sortBy} />
						) : null}
						{searchHasRun && searchQuery && !loadingSearch && filteredSearchTasks.length === 0 ? <div className="empty-state">No tasks matched this search.</div> : null}
					</div>
				</section>
			</div>
		</div>
	)
}

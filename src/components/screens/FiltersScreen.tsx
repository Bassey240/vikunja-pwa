import SavedFilterCard from '@/components/search/SavedFilterCard'
import StatusCards from '@/components/layout/StatusCards'
import Topbar from '@/components/layout/Topbar'
import InlineRootTaskComposer from '@/components/tasks/InlineRootTaskComposer'
import TaskFocusScreen from '@/components/tasks/TaskFocusScreen'
import TaskTree from '@/components/tasks/TaskTree'
import {useAppStore} from '@/store'
import {useNavigate} from 'react-router-dom'

export default function FiltersScreen() {
	const navigate = useNavigate()
	const savedFilters = useAppStore(state => state.savedFilters)
	const selectedSavedFilterProjectId = useAppStore(state => state.selectedSavedFilterProjectId)
	const savedFilterTasks = useAppStore(state => state.savedFilterTasks)
	const loadingSavedFilterTasks = useAppStore(state => state.loadingSavedFilterTasks)
	const focusedTaskId = useAppStore(state => state.focusedTaskId)
	const focusedTaskSourceScreen = useAppStore(state => state.focusedTaskSourceScreen)
	const loadSavedFilterTasks = useAppStore(state => state.loadSavedFilterTasks)
	const openRootComposer = useAppStore(state => state.openRootComposer)

	const selectedSavedFilter = savedFilters.find(filter => filter.projectId === selectedSavedFilterProjectId) || null
	const showFocusedTask = Boolean(focusedTaskId && focusedTaskSourceScreen === 'filters')

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

	return (
		<div className="surface">
			<Topbar
				backAction="go-back"
				onBack={goBack}
				desktopHeadingTitle="Filters"
				desktopHeadingCount={savedFilters.length}
				primaryAction={{
					action: 'open-root-composer',
					label: 'Add task',
					text: '+',
					className: 'topbar-primary-add-button',
					onClick: () => openRootComposer({placement: 'center'}),
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
					</div>
					<div className="screen-body">
						<InlineRootTaskComposer />
						{savedFilters.length === 0 ? <div className="empty-state">No saved filters returned by this account yet.</div> : null}
						{savedFilters.length > 0 ? (
							<div className="saved-filter-list">
								{savedFilters.map(filter => (
									<div key={filter.projectId} className="saved-filter-card-stack">
										<SavedFilterCard
											filter={filter}
											active={selectedSavedFilterProjectId === filter.projectId}
											onOpen={() => void loadSavedFilterTasks(selectedSavedFilterProjectId === filter.projectId ? null : filter.projectId)}
										/>
										{selectedSavedFilterProjectId === filter.projectId ? (
											<div className="saved-filter-card-actions">
												<button className="pill-button subtle" data-action="clear-saved-filter" type="button" onClick={() => void loadSavedFilterTasks(null)}>
													Close
												</button>
											</div>
										) : null}
									</div>
								))}
							</div>
						) : null}
						{selectedSavedFilter ? (
							<section className="saved-filter-results">
								{loadingSavedFilterTasks && savedFilterTasks.length === 0 ? <div className="empty-state">Loading saved filter tasks...</div> : null}
								{savedFilterTasks.length > 0 ? <TaskTree taskList={savedFilterTasks} compact={true} /> : null}
								{!loadingSavedFilterTasks && savedFilterTasks.length === 0 ? <div className="empty-state">This saved filter does not currently return any open root tasks.</div> : null}
							</section>
						) : null}
					</div>
				</section>
			</div>
		</div>
	)
}

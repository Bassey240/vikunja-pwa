import Topbar from '@/components/layout/Topbar'
import DatePickerOverlay from '@/components/common/DatePickerOverlay'
import InlineRootTaskComposer from '@/components/tasks/InlineRootTaskComposer'
import useWideLayout from '@/hooks/useWideLayout'
import MonthGrid from '@/components/calendar/MonthGrid'
import TimeGrid from '@/components/calendar/TimeGrid'
import TaskFilterPanel from '@/components/filters/TaskFilterPanel'
import BulkTaskEditor from '@/components/tasks/BulkTaskEditor'
import TaskTree from '@/components/tasks/TaskTree'
import {getTaskFilterUiConfig, hasActiveTaskFilters, taskMatchesFilters} from '@/hooks/useFilters'
import {useShowCompletedTaskFilter} from '@/hooks/useShowCompleted'
import {useAppStore} from '@/store'
import type {Task} from '@/types'
import {placeTask, placementDayKeys} from '@/utils/calendar-placement'
import {DAY_MS, isoWeekNumber, localDayKey, prefetchRange, rangeForZoom, shiftAnchor} from '@/utils/calendar-window'
import {getMenuAnchor} from '@/utils/menuPosition'
import {ScreenActiveContext} from '@/components/layout/ScreenActiveContext'
import useGlobalShortcuts from '@/hooks/useGlobalShortcuts'
import {useContext, useEffect, useMemo, useState} from 'react'
import type {MouseEvent} from 'react'

const MONTH_TITLE = new Intl.DateTimeFormat(undefined, {month: 'long', year: 'numeric'})
const DAY_TITLE = new Intl.DateTimeFormat(undefined, {weekday: 'long', day: 'numeric', month: 'long'})
// Narrow header: "Monday 13 July" ellipsized to "Mond…" next to the zoom
// segment, so phones get the short forms instead (audit H7).
const DAY_TITLE_COMPACT = new Intl.DateTimeFormat(undefined, {weekday: 'short', day: 'numeric', month: 'short'})
const WEEK_END_TITLE = new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short'})

// Bulk edit acts on the selected-day list, which only renders in month zoom.
const BULK_SCOPE = 'calendar'

function anchorMsOf(iso: string): number {
	const ms = new Date(iso).getTime()
	return Number.isNaN(ms) ? Date.now() : ms
}

// Week header spans the visible Mon–Sun range with its ISO week number, e.g.
// "15 Jun – 21 Jun · W25".
function weekTitle(startMs: number, endMs: number): string {
	return `${WEEK_END_TITLE.format(startMs)} – ${WEEK_END_TITLE.format(endMs - DAY_MS)} · W${isoWeekNumber(startMs)}`
}

// Local noon of a "YYYY-MM-DD" key — anchors on the right day regardless of DST.
function dayKeyToMs(dayKey: string): number {
	const [year, month, day] = dayKey.split('-').map(Number)
	return new Date(year, month - 1, day, 12).getTime()
}

export default function CalendarScreen() {
	const connected = useAppStore(state => state.connected)
	const calendarZoom = useAppStore(state => state.calendarZoom)
	const setCalendarZoom = useAppStore(state => state.setCalendarZoom)
	const calendarAnchorIso = useAppStore(state => state.calendarAnchorIso)
	const setCalendarAnchorIso = useAppStore(state => state.setCalendarAnchorIso)
	const calendarTasks = useAppStore(state => state.calendarTasks)
	const loadingCalendar = useAppStore(state => state.loadingCalendar)
	const loadCalendarTasks = useAppStore(state => state.loadCalendarTasks)
	const openCalendarComposer = useAppStore(state => state.openCalendarComposer)
	const selectedDayKey = useAppStore(state => state.calendarSelectedDayKey)
	const selectedDayMs = useAppStore(state => state.calendarSelectedDayMs)
	const setCalendarSelectedDay = useAppStore(state => state.setCalendarSelectedDay)
	const openCalendarComposerAt = useAppStore(state => state.openCalendarComposerAt)
	const moveTaskToDay = useAppStore(state => state.moveTaskToDay)
	const taskFilters = useAppStore(state => state.taskFilters)
	const applyTaskFilterDraft = useAppStore(state => state.applyTaskFilterDraft)
	const resetTaskFilterDraft = useAppStore(state => state.resetTaskFilterDraft)
	const syncTaskFilterDraftFromActive = useAppStore(state => state.syncTaskFilterDraftFromActive)
	const ensureLabelsLoaded = useAppStore(state => state.ensureLabelsLoaded)
	const openBulkTaskEditor = useAppStore(state => state.openBulkTaskEditor)
	const bulkMode = useAppStore(state => state.bulkTaskEditorScope === BULK_SCOPE)
	const {showingCompleted, label: completedLabel, toggle: toggleShowCompleted} = useShowCompletedTaskFilter(true)
	const [panelAnchor, setPanelAnchor] = useState<ReturnType<typeof getMenuAnchor> | null>(null)
	const [filterOpen, setFilterOpen] = useState(false)
	const [datePickerOpen, setDatePickerOpen] = useState(false)
	const [moveDateTaskId, setMoveDateTaskId] = useState<number | null>(null)
	const taskFilterConfig = getTaskFilterUiConfig('calendar')

	const isWideLayout = useWideLayout()
	// The wide shell renders the composer inline (embedded below); mobile uses
	// the sheet. 'sheet' placement never renders on the wide shell — the old
	// hardcoded default left every desktop calendar add-path dead.
	const composerPlacement = isWideLayout ? ('center' as const) : ('sheet' as const)

	const anchorMs = anchorMsOf(calendarAnchorIso)
	const range = useMemo(() => rangeForZoom(calendarZoom, anchorMs), [calendarZoom, anchorMs])

	// One windowed fetch per visible window, widened to the neighbouring windows
	// so prev/next is instant.
	useEffect(() => {
		if (connected) {
			void loadCalendarTasks(prefetchRange(range))
		}
	}, [connected, loadCalendarTasks, range])

	const visibleTasks = useMemo(
		() => calendarTasks.filter(task => taskMatchesFilters(task, taskFilters)),
		[calendarTasks, taskFilters],
	)

	const selectedDayTasks = useMemo(() => {
		const result: Task[] = []
		for (const task of visibleTasks) {
			const placement = placeTask(task)
			if (placement && placementDayKeys(placement).includes(selectedDayKey)) {
				result.push(task)
			}
		}
		return result
	}, [visibleTasks, selectedDayKey])

	function navigate(direction: -1 | 1) {
		setCalendarAnchorIso(new Date(shiftAnchor(calendarZoom, anchorMs, direction)).toISOString())
	}

	function goToToday() {
		const now = Date.now()
		setCalendarAnchorIso(new Date(now).toISOString())
		setCalendarSelectedDay(localDayKey(now), now)
	}

	// Tapping a day header in the week grid drills into that day's time grid.
	function focusDay(dayKey: string, dayMs: number) {
		setCalendarSelectedDay(dayKey, dayMs)
		setCalendarAnchorIso(new Date(dayMs).toISOString())
		setCalendarZoom('day')
	}

	// Go-to-date (title button, every zoom): jump the anchor + selection there.
	function pickDay(dayKey: string) {
		if (!dayKey) {
			return
		}
		const dayMs = dayKeyToMs(dayKey)
		setCalendarSelectedDay(dayKey, dayMs)
		setCalendarAnchorIso(new Date(dayMs).toISOString())
	}

	const title =
		calendarZoom === 'month'
			? MONTH_TITLE.format(anchorMs)
			: calendarZoom === 'week'
				? weekTitle(range.startMs, range.endMs)
				: (isWideLayout ? DAY_TITLE : DAY_TITLE_COMPACT).format(anchorMs)

	// Week/Day pin the controls + day-head row and scroll only the timeline; Month
	// keeps the whole page scrolling (grid + selected-day list run long).
	const timelineMode = calendarZoom !== 'month'

	// Single-key map (audit A1): T today, M/W/D zoom, ←/→ page, N new task.
	// Active-screen only, and paused while any calendar overlay is up (typing
	// contexts are guarded inside the hook).
	const screenActive = useContext(ScreenActiveContext)
	const rootComposerOpen = useAppStore(state => state.rootComposerOpen)
	const openMenu = useAppStore(state => state.openMenu)
	const shortcuts = useMemo(() => ({
		t: goToToday,
		m: () => setCalendarZoom('month'),
		w: () => setCalendarZoom('week'),
		d: () => setCalendarZoom('day'),
		ArrowLeft: () => navigate(-1),
		ArrowRight: () => navigate(1),
		n: () => openCalendarComposer(undefined, composerPlacement),
		// Deps cover everything the closures read (navigate: zoom + anchor).
	}), [calendarZoom, anchorMs, composerPlacement])
	useGlobalShortcuts(
		shortcuts,
		screenActive && !rootComposerOpen && !datePickerOpen && openMenu == null && moveDateTaskId == null,
	)

	return (
		<div
			className={`surface calendar-surface ${timelineMode ? 'calendar-timeline-surface' : ''}`.trim()}
			data-calendar-view={calendarZoom}
		>
			<Topbar
				desktopHeadingTitle="Calendar"
				onDismissTray={() => {
					setPanelAnchor(null)
				}}
				primaryAction={{
					action: 'open-root-composer',
					label: 'Add task',
					text: '+',
					className: 'topbar-primary-add-button',
					onClick: () => openCalendarComposer(undefined, composerPlacement),
				}}
				tray={
					panelAnchor ? (
						<div className="inline-menu topbar-action-menu" data-menu-root="true">
							{calendarZoom === 'month' ? (
								<button
									className="menu-item"
									data-action="open-bulk-task-editor"
									type="button"
									onClick={() => {
										setPanelAnchor(null)
										openBulkTaskEditor(BULK_SCOPE)
									}}
								>
									Bulk edit
								</button>
							) : null}
							<button
								className={`menu-item ${showingCompleted ? 'is-active' : ''}`.trim()}
								data-action="toggle-show-completed"
								type="button"
								onClick={() => {
									toggleShowCompleted()
									setPanelAnchor(null)
								}}
							>
								{completedLabel}
							</button>
						</div>
					) : null
				}
				actions={[
					{
						action: 'toggle-task-filters',
						label: 'Filters',
						icon: 'filter',
						active: filterOpen || hasActiveTaskFilters(taskFilters),
						onClick: () => {
							const opening = !filterOpen
							setPanelAnchor(null)
							setFilterOpen(open => !open)
							if (opening) {
								syncTaskFilterDraftFromActive(taskFilterConfig.allowProject)
								void ensureLabelsLoaded()
							}
						},
					},
					{
						action: 'open-calendar-menu',
						label: 'Menu',
						text: '⋮',
						className: 'topbar-overview-menu-button',
						active: Boolean(panelAnchor),
						menuToggle: true,
						onClick: (event: MouseEvent<HTMLButtonElement>) => {
							const anchor = getMenuAnchor(event.currentTarget)
							setFilterOpen(false)
							setPanelAnchor(current => (current ? null : anchor))
						},
					},
				]}
			/>
			<div className="surface-content">
				<header className="calendar-header">
					<div className="calendar-nav">
						<button className="calendar-nav-button" type="button" aria-label="Previous" onClick={() => navigate(-1)}>‹</button>
						<button className="calendar-today-button" type="button" onClick={goToToday}>Today</button>
						<button className="calendar-nav-button" type="button" aria-label="Next" onClick={() => navigate(1)}>›</button>
					</div>
					<button
						className="calendar-title-button"
						type="button"
						data-action="open-calendar-date-picker"
						aria-label={`${title} — go to date`}
						onClick={() => setDatePickerOpen(true)}
					>
						<h1 className="calendar-title">{title}</h1>
					</button>
					<div className="calendar-zoom-segment" role="group" aria-label="Calendar view">
						{(['month', 'week', 'day'] as const).map(zoom => (
							<button
								key={zoom}
								className={`calendar-zoom-option ${calendarZoom === zoom ? 'is-active' : ''}`.trim()}
								data-action="set-calendar-zoom"
								data-calendar-zoom={zoom}
								type="button"
								aria-pressed={calendarZoom === zoom}
								onClick={() => setCalendarZoom(zoom)}
							>
								<span className="calendar-zoom-full">{zoom[0].toUpperCase() + zoom.slice(1)}</span>
								<span className="calendar-zoom-letter" aria-hidden="true">{zoom[0].toUpperCase()}</span>
							</button>
						))}
					</div>
				</header>
				{filterOpen ? (
					<div className="calendar-filter-panel">
						<TaskFilterPanel
							screen="calendar"
							allowProject={taskFilterConfig.allowProject}
							visibleTaskList={calendarTasks}
							showSavedFilters={false}
							showManageFilters={false}
							onApply={() => {
								void applyTaskFilterDraft(taskFilterConfig.allowProject)
								setFilterOpen(false)
							}}
							onReset={() => {
								resetTaskFilterDraft()
								void applyTaskFilterDraft(taskFilterConfig.allowProject)
							}}
							onSavedFilterSelect={() => undefined}
							onManageFilters={() => undefined}
						/>
					</div>
				) : null}
				<div className="calendar-body" data-calendar-view={calendarZoom}>
					{calendarZoom === 'month' ? (
						<>
							<MonthGrid
								tasks={visibleTasks}
								range={range}
								anchorMs={anchorMs}
								selectedDayKey={selectedDayKey}
								onSelectDay={(dayKey, dayMs) => {
									// Second click on the selected day drills into its Day view — the
									// action lands where the pointer already is (audit D4).
									if (dayKey === selectedDayKey) {
										focusDay(dayKey, dayMs)
										return
									}
									setCalendarSelectedDay(dayKey, dayMs)
								}}
							/>
							<section className="calendar-day-list" aria-label="Selected day tasks">
								<header className="calendar-day-list-header">
									<h2 className="calendar-day-list-title">{DAY_TITLE.format(selectedDayMs)}</h2>
									<div className="calendar-day-list-actions">
										<button
											className="calendar-day-add"
											type="button"
											data-action="add-calendar-task"
											onClick={() => openCalendarComposer(undefined, composerPlacement)}
										>
											+ Add task
										</button>
									</div>
								</header>
								<BulkTaskEditor scopeKey={BULK_SCOPE} />
								<InlineRootTaskComposer />
								{selectedDayTasks.length > 0 ? (
									<TaskTree
										taskList={selectedDayTasks}
										compact={true}
										matcher={task => taskMatchesFilters(task, taskFilters)}
										sortBy={taskFilters.sortBy}
										bulkMode={bulkMode}
										flat={true}
										onMoveToDate={task => setMoveDateTaskId(task.id)}
									/>
								) : (
									<p className="calendar-day-list-empty">
										{loadingCalendar ? 'Loading…' : 'No tasks on this day.'}
									</p>
								)}
							</section>
						</>
					) : (
						<>
							<InlineRootTaskComposer />
							<TimeGrid
								tasks={visibleTasks}
								range={range}
								zoom={calendarZoom === 'week' ? 'week' : 'day'}
								onSelectSlot={ms => openCalendarComposerAt(ms, composerPlacement)}
								onSelectDay={focusDay}
							/>
						</>
					)}
				</div>
			</div>
			{datePickerOpen ? (
				<DatePickerOverlay
					title="Go to date"
					value={localDayKey(anchorMs)}
					onCommit={dayKey => {
						pickDay(dayKey)
						setDatePickerOpen(false)
					}}
					onClose={() => setDatePickerOpen(false)}
				/>
			) : null}
			{moveDateTaskId != null ? (() => {
				const pickerTask = calendarTasks.find(task => task.id === moveDateTaskId) || null
				const startKey = pickerTask ? (placeTask(pickerTask)?.startDayKey ?? '') : ''
				return (
					<DatePickerOverlay
						title="Move to date"
						value={startKey}
						onCommit={dayKey => {
							void moveTaskToDay(moveDateTaskId, dayKey)
							setMoveDateTaskId(null)
						}}
						onClose={() => setMoveDateTaskId(null)}
					/>
				)
			})() : null}
		</div>
	)
}

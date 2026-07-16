import DatePickerOverlay from '@/components/common/DatePickerOverlay'
import TaskCard from '@/components/tasks/TaskCard'
import TaskMenu from '@/components/tasks/TaskMenu'
import useWideLayout from '@/hooks/useWideLayout'
import {useAppStore} from '@/store'
import {getSubtasksFor} from '@/store/selectors'
import type {Task} from '@/types'
import {placeTask} from '@/utils/calendar-placement'
import {buildReschedulePatch} from '@/utils/calendar-reschedule'
import {buildTimeGridDays, type TimedTaskBlock} from '@/utils/calendar-timegrid'
import {normalizeLabelColor} from '@/utils/color-helpers'
import {enumerateDays, HOUR_MS, localDayKey, prefetchRange, type CalendarRange} from '@/utils/calendar-window'
import {getMenuAnchor} from '@/utils/menuPosition'
import {ScreenActiveContext} from '@/components/layout/ScreenActiveContext'
import {useContext, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import type {PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent} from 'react'
import {useCalendarBoardDrag} from './useCalendarBoardDrag'

interface TimeGridProps {
	tasks: Task[]
	range: CalendarRange
	zoom: 'week' | 'day'
	onSelectSlot: (ms: number) => void
	onSelectDay: (dayKey: string, dayMs: number) => void
}

const HOURS = Array.from({length: 24}, (_, hour) => hour)
const HOUR_LABEL = new Intl.DateTimeFormat(undefined, {hour: 'numeric'})
const SLOT_TIME = new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'})
const LANE_WEEKDAY = new Intl.DateTimeFormat(undefined, {weekday: 'short'})

const DRAG_HANDLE = (
	<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
		<circle cx="2.5" cy="2.5" r="1.5" />
		<circle cx="7.5" cy="2.5" r="1.5" />
		<circle cx="2.5" cy="8" r="1.5" />
		<circle cx="7.5" cy="8" r="1.5" />
		<circle cx="2.5" cy="13.5" r="1.5" />
		<circle cx="7.5" cy="13.5" r="1.5" />
	</svg>
)

function percent(fraction: number): string {
	return `${fraction * 100}%`
}

// A lane = one day rendered as a kanban column: header, an all-day card band,
// then an hour-rail timeline with timed tasks placed by start time. Every task
// uses the same frame as the kanban board — checkbox, card, drag handle, menu.
export default function TimeGrid({tasks, range, zoom, onSelectSlot, onSelectDay}: TimeGridProps) {
	const isWideLayout = useWideLayout()
	const screen = useAppStore(state => state.screen)
	const openMenu = useAppStore(state => state.openMenu)
	const setOpenMenu = useAppStore(state => state.setOpenMenu)
	const toggleTaskMenu = useAppStore(state => state.toggleTaskMenu)
	const toggleTaskDone = useAppStore(state => state.toggleTaskDone)
	const openTaskDetail = useAppStore(state => state.openTaskDetail)
	const openFocusedTask = useAppStore(state => state.openFocusedTask)
	const duplicateTask = useAppStore(state => state.duplicateTask)
	const deleteTask = useAppStore(state => state.deleteTask)
	const loadCalendarTasks = useAppStore(state => state.loadCalendarTasks)
	const rescheduleCalendarTask = useAppStore(state => state.rescheduleCalendarTask)
	const moveTaskToDay = useAppStore(state => state.moveTaskToDay)
	const screenActive = useContext(ScreenActiveContext)
	const [moveDateTaskId, setMoveDateTaskId] = useState<number | null>(null)
	// Tap-to-focus: a tapped card pops to full width on top so a crowded cascade
	// stays usable; tapping the timeline (the catcher) restores the overlap.
	const [focusedId, setFocusedId] = useState<number | null>(null)
	const lanesRef = useRef<HTMLDivElement | null>(null)
	// The day-head row lives outside the scroller (grouped with the date controls);
	// it scrolls only horizontally, mirrored from the timeline body below.
	const headsRef = useRef<HTMLDivElement | null>(null)
	// Per-touch axis lock for the week scroller: the lanes scroll on both axes, so a
	// mandatory horizontal snap fires on the slightest sideways drift during a
	// vertical swipe. We pick one axis once the finger commits and hide the other so
	// only a distinctly horizontal gesture pages the day; anything else scrolls hours.
	const touchStartRef = useRef<{x: number; y: number} | null>(null)
	const gestureAxisRef = useRef<'x' | 'y' | null>(null)
	// Remembers which window we've already auto-scrolled, and whether that scroll
	// landed on a real task (vs the 9am fallback) so a late task load can re-snap.
	const autoScrollRef = useRef<{key: string; toTask: boolean}>({key: '', toTask: false})

	const {preview, begin} = useCalendarBoardDrag((taskId, mode, startMs, endMs) => {
		void rescheduleCalendarTask(taskId, mode, startMs, endMs)
	})

	const days = useMemo(() => enumerateDays(range), [range])
	// While dragging, apply the in-flight patch to the dragged task so the grid
	// re-buckets it into the right lane/slot live (same builder the commit uses).
	const effectiveTasks = useMemo(() => {
		if (!preview) {
			return tasks
		}
		return tasks.map(task => {
			if (task.id !== preview.taskId) {
				return task
			}
			const patch = buildReschedulePatch(task, preview.mode, preview.startMs, preview.endMs)
			return patch ? {...task, ...patch} : task
		})
	}, [tasks, preview])
	const grid = useMemo(() => buildTimeGridDays(effectiveTasks, days), [effectiveTasks, days])

	// First task of the visible window as a 0–1 fraction of the day, so we can
	// land the timeline on real work instead of the small hours.
	const earliestFraction = useMemo(() => {
		let min = Infinity
		for (const day of grid) {
			for (const block of day.timed) {
				if (block.top < min) {
					min = block.top
				}
			}
		}
		return min
	}, [grid])

	// On entering a week/day window, scroll the timeline to the first task (or 9am
	// when the window has none) so you never open onto night-time. Re-runs once if
	// the window's first task only loads after we'd defaulted to 9am.
	useLayoutEffect(() => {
		const lanes = lanesRef.current
		if (!lanes) {
			return
		}
		const key = `${zoom}:${range.startMs}`
		const hasTask = Number.isFinite(earliestFraction)
		const prev = autoScrollRef.current
		if (prev.key === key && (prev.toTask || !hasTask)) {
			return
		}
		const track = lanes.querySelector<HTMLElement>('.calendar-board-track')
		if (!track) {
			return
		}
		const fraction = hasTask ? earliestFraction : 9 / 24
		const lanesTop = lanes.getBoundingClientRect().top
		const trackRect = track.getBoundingClientRect()
		const trackTopInScroll = trackRect.top - lanesTop + lanes.scrollTop
		lanes.scrollTop = Math.max(0, trackTopInScroll + fraction * trackRect.height - 8)
		autoScrollRef.current = {key, toTask: hasTask}
	}, [zoom, range.startMs, earliestFraction])

	// Changing the visible window (paging or switching zoom) drops any focus.
	useEffect(() => {
		setFocusedId(null)
	}, [zoom, range.startMs])

	// The lanes' vertical scrollbar consumes width the heads row doesn't lose; in
	// fluid week mode the two rows would divide different totals and drift ~2px
	// per column. Mirror the scrollbar as end-padding on the heads row (0 with
	// overlay scrollbars).
	useLayoutEffect(() => {
		const lanes = lanesRef.current
		const heads = headsRef.current
		if (!lanes || !heads) {
			return
		}
		const sync = () => {
			heads.style.paddingInlineEnd = `${lanes.offsetWidth - lanes.clientWidth}px`
		}
		sync()
		const observer = new ResizeObserver(sync)
		observer.observe(lanes)
		return () => observer.disconnect()
	}, [zoom])

	const now = new Date()
	const todayKey = localDayKey(now.getTime())
	const nowFraction = (now.getHours() * 60 + now.getMinutes()) / (24 * 60)

	function openTask(task: Task) {
		setOpenMenu(null)
		if (isWideLayout) {
			void openTaskDetail(task.id)
		}
		openFocusedTask(task.id, task.project_id, screen)
	}

	// Duplicate adds a task the current window fetch hasn't seen yet, so reload it.
	function refreshCalendar() {
		void loadCalendarTasks(prefetchRange(range))
	}

	// The head row sits above the scroller; mirror the body's horizontal scroll so
	// the day cards track their columns in week view.
	function syncHeads() {
		const lanes = lanesRef.current
		const heads = headsRef.current
		if (lanes && heads) {
			heads.scrollLeft = lanes.scrollLeft
		}
	}

	// Distance the finger must travel before we commit to an axis, and how much a
	// gesture must favour horizontal to count as a day-page rather than a scroll.
	const AXIS_COMMIT_PX = 8
	const HORIZONTAL_BIAS = 1.4

	// Week lanes scroll vertically only (native); horizontal day-paging is JS-driven
	// so a vertical swipe can never drift sideways. Step one day in the swipe direction.
	function pageWeekDay(direction: 1 | -1) {
		const lanes = lanesRef.current
		if (!lanes) {
			return
		}
		const cols = Array.from(lanes.querySelectorAll<HTMLElement>('.calendar-board-lane'))
		if (cols.length === 0) {
			return
		}
		const pad = Number.parseFloat(getComputedStyle(lanes).scrollPaddingInlineStart) || 0
		const lanesLeft = lanes.getBoundingClientRect().left
		const colLefts = cols.map(col => Math.max(0, col.getBoundingClientRect().left - lanesLeft + lanes.scrollLeft - pad))
		let current = 0
		let bestDist = Infinity
		colLefts.forEach((left, index) => {
			const dist = Math.abs(left - lanes.scrollLeft)
			if (dist < bestDist) {
				bestDist = dist
				current = index
			}
		})
		const next = Math.min(cols.length - 1, Math.max(0, current + direction))
		lanes.scrollTo({left: colLefts[next], behavior: 'smooth'})
	}

	function onLanesTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
		gestureAxisRef.current = null
		touchStartRef.current = null
		// A timed card carries its own drag gesture; never hijack it for scroll-lock.
		if (event.touches.length !== 1 || (event.target as HTMLElement).closest('.calendar-board-card')) {
			return
		}
		touchStartRef.current = {x: event.touches[0].clientX, y: event.touches[0].clientY}
	}

	function onLanesTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
		const start = touchStartRef.current
		if (!start || gestureAxisRef.current) {
			return
		}
		const dx = event.touches[0].clientX - start.x
		const dy = event.touches[0].clientY - start.y
		if (Math.abs(dx) < AXIS_COMMIT_PX && Math.abs(dy) < AXIS_COMMIT_PX) {
			return
		}
		gestureAxisRef.current = Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS ? 'x' : 'y'
	}

	function onLanesTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
		const start = touchStartRef.current
		if (zoom === 'week' && gestureAxisRef.current === 'x' && start) {
			const dx = event.changedTouches[0].clientX - start.x
			if (Math.abs(dx) >= AXIS_COMMIT_PX) {
				pageWeekDay(dx < 0 ? 1 : -1)
			}
		}
		gestureAxisRef.current = null
		touchStartRef.current = null
	}

	function renderHead(day: (typeof grid)[number]) {
		const isToday = day.dayKey === todayKey
		const count = day.allDay.length + day.timed.length
		const headClass = `kanban-lane-head calendar-board-head ${isToday ? 'is-today' : ''}`.trim()
		const heading = (
			<>
				<div className="kanban-lane-heading">
					<div className="kanban-lane-title">{LANE_WEEKDAY.format(day.ms)}</div>
					<div className="kanban-lane-meta">
						<span className="calendar-board-date">{new Date(day.ms).getDate()}</span>
					</div>
				</div>
				<div className="kanban-lane-actions">
					<div className="count-chip compact">{count}</div>
				</div>
			</>
		)
		return zoom === 'week' ? (
			<button
				key={day.dayKey}
				type="button"
				className={headClass}
				data-action="select-calendar-day"
				data-day-key={day.dayKey}
				aria-label={`Open ${LANE_WEEKDAY.format(day.ms)} ${new Date(day.ms).getDate()}`}
				onClick={() => onSelectDay(day.dayKey, day.ms)}
			>
				{heading}
			</button>
		) : (
			<div key={day.dayKey} className={headClass}>{heading}</div>
		)
	}

	// A narrow overlapped card: just the name, start time, and label colour dots —
	// enough to recognise it at a glance; tapping pops it to the full frame.
	function renderChip(block: TimedTaskBlock) {
		const labels = Array.isArray(block.task.labels) ? block.task.labels.filter(label => label?.id) : []
		return (
			<div className={`calendar-board-chip ${block.task.done ? 'is-done' : ''}`.trim()}>
				<span className="calendar-board-chip-title">{block.task.title}</span>
				<span className="calendar-board-chip-time">{SLOT_TIME.format(new Date(block.startMs))}</span>
				{labels.length > 0 ? (
					<span className="calendar-board-chip-labels">
						{labels.slice(0, 5).map(label => (
							<span
								key={label.id}
								className="calendar-board-chip-label"
								style={{background: normalizeLabelColor(label.hex_color || label.hexColor || '')}}
								title={label.title}
							/>
						))}
					</span>
				) : null}
			</div>
		)
	}

	function renderFrame(task: Task, handleProps?: {onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void}, timeLabel?: string) {
		const childCount = getSubtasksFor(task, tasks, undefined, 'position').length
		const menuOpen = screenActive && openMenu?.kind === 'task' && openMenu.id === task.id
		return (
			<div className="kanban-task-item calendar-board-task" data-task-row-id={task.id}>
				<div className="kanban-task-frame">
					<div className="task-leading kanban-task-leading">
						<button
							className={`checkbox-button ${task.done ? 'is-checked' : ''}`.trim()}
							data-action="toggle-done"
							data-task-id={task.id}
							aria-checked={task.done ? 'true' : 'false'}
							role="checkbox"
							type="button"
							onClick={() => void toggleTaskDone(task.id)}
						>
							{task.done ? '✓' : ''}
						</button>
					</div>
					<button
						className="task-main kanban-task-main"
						type="button"
						data-action="open-task-focus"
						data-task-id={task.id}
						onClick={() => openTask(task)}
					>
						<TaskCard task={task} childCount={childCount} compact={true} hideDueDate={true} timeLabel={timeLabel} />
					</button>
					<div
						className={`drag-handle kanban-drag-handle ${handleProps ? 'calendar-board-grab' : ''}`.trim()}
						aria-hidden="true"
						{...handleProps}
					>
						{DRAG_HANDLE}
					</div>
					<button
						className="menu-button"
						data-action="toggle-task-menu"
						data-task-id={task.id}
						data-menu-toggle="true"
						type="button"
						onClick={event => toggleTaskMenu(task.id, getMenuAnchor(event.currentTarget))}
					>
						⋮
					</button>
				</div>
				{menuOpen && openMenu.kind === 'task' ? (
					<TaskMenu
						task={task}
						anchor={openMenu.anchor}
						extraItems={[{
							action: 'move-task-to-date',
							label: 'Move to date',
							onClick: () => {
								setOpenMenu(null)
								setMoveDateTaskId(task.id)
							},
						}]}
						onEdit={() => {
							setOpenMenu(null)
							void openTaskDetail(task.id)
						}}
						onDuplicate={() => {
							setOpenMenu(null)
							void duplicateTask(task.id).then(refreshCalendar)
						}}
						onDelete={() => {
							setOpenMenu(null)
							void deleteTask(task.id)
						}}
					/>
				) : null}
			</div>
		)
	}

	return (
		<div className="calendar-board" data-calendar-zoom={zoom}>
			<div className="calendar-board-heads" ref={headsRef}>
				{grid.map(renderHead)}
			</div>
			<div
				className="calendar-board-lanes kanban-lanes"
				data-kanban-board="true"
				ref={lanesRef}
				onScroll={syncHeads}
				onTouchStart={onLanesTouchStart}
				onTouchMove={onLanesTouchMove}
				onTouchEnd={onLanesTouchEnd}
				onTouchCancel={onLanesTouchEnd}
			>
				{grid.map(day => {
					const isToday = day.dayKey === todayKey
					return (
						<section key={day.dayKey} className="kanban-lane calendar-board-lane">
							{day.allDay.length > 0 ? (
								<div className="calendar-board-allday">
									{day.allDay.map(task => (
										<div key={task.id} className="calendar-board-allday-item">{renderFrame(task)}</div>
									))}
								</div>
							) : null}
							<div className="calendar-board-timeline">
								<div className="calendar-board-gutter" aria-hidden="true">
									{HOURS.map(hour => (
										<div key={hour} className="calendar-board-hour-label">
											{hour === 0 ? '' : HOUR_LABEL.format(new Date(2000, 0, 1, hour))}
										</div>
									))}
								</div>
								<div
									className="calendar-board-track"
									data-day-ms={day.ms}
									// A tap off the focused card frame restores the cascade. Capture-phase so it
									// beats the slot add-task; contains() rejects the portaled menu (React-tree
									// propagation from document.body) so its Edit item survives.
									onClickCapture={focusedId != null ? event => {
										const target = event.target as HTMLElement
										if (!event.currentTarget.contains(target)) {
											return
										}
										// Keep focus only on the focused card frame/resize; target === the card box is
										// its empty span padding, which dismisses like any off-card tap.
										const focusedCard = target.closest('.calendar-board-card.is-focused')
										if (focusedCard && target !== focusedCard) {
											return
										}
										setFocusedId(null)
										// Swallow a bare-slot add-task; let another card own tap open it.
										if (!target.closest('.calendar-board-card')) {
											event.preventDefault()
											event.stopPropagation()
										}
									} : undefined}
								>
									{HOURS.map(hour => (
										<button
											key={hour}
											type="button"
											className="calendar-board-slot"
											data-action="add-calendar-task-at"
											aria-label={`Add task at ${SLOT_TIME.format(new Date(day.ms + hour * HOUR_MS))}`}
											onClick={() => onSelectSlot(day.ms + hour * HOUR_MS)}
										/>
									))}
									{isToday ? (
										<div className="calendar-now-line" style={{top: percent(nowFraction)}} aria-hidden="true" />
									) : null}
									{day.timed.map(block => {
										const isFocused = focusedId === block.task.id
										// Overlap == compact: a narrow (sub-full-width) card shows only a
										// small-font name + time, no controls, until a tap pops it full width.
										const isCompact = !isFocused && block.width < 1
										const isSpan = placeTask(block.task)?.source === 'span'
										const classNames = ['calendar-board-card', isFocused && 'is-focused', isCompact && 'is-compact'].filter(Boolean).join(' ')
										return (
											<div
												key={block.task.id}
												className={classNames}
												style={{
													top: percent(block.top),
													height: percent(block.height),
													left: isFocused ? 0 : percent(block.left),
													width: isFocused ? '100%' : percent(block.width),
													zIndex: isFocused ? 40 : block.zIndex,
												}}
												// A compact card's first tap pops it to full width and swallows the
												// tap, so its controls only act once it's focused.
												onClickCapture={isCompact ? event => {
													event.preventDefault()
													event.stopPropagation()
													setFocusedId(block.task.id)
												} : undefined}
											>
												{isCompact ? renderChip(block) : (
													<>
														{isSpan ? (
															<div
																className="calendar-board-resize is-start"
																aria-hidden="true"
																onPointerDown={event => begin(event, 'resize-start', block.task.id, block.startMs, block.endMs)}
															/>
														) : null}
														{renderFrame(block.task, {
															onPointerDown: event => begin(event, 'move', block.task.id, block.startMs, block.endMs),
														}, SLOT_TIME.format(new Date(block.startMs)))}
														{isSpan ? (
															<div
																className="calendar-board-resize is-end"
																aria-hidden="true"
																onPointerDown={event => begin(event, 'resize-end', block.task.id, block.startMs, block.endMs)}
															/>
														) : null}
													</>
												)}
											</div>
										)
									})}
								</div>
							</div>
						</section>
					)
				})}
			</div>
			{moveDateTaskId != null ? (() => {
				const pickerTask = tasks.find(task => task.id === moveDateTaskId) || null
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

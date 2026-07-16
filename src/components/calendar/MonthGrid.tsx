import {placeTask, placementDayKeys} from '@/utils/calendar-placement'
import {enumerateDays, isoWeekNumber, localDayKey, type CalendarDay, type CalendarRange, type WeekStart} from '@/utils/calendar-window'
import type {Task} from '@/types'
import {Fragment, useMemo} from 'react'

interface MonthGridProps {
	tasks: Task[]
	range: CalendarRange
	anchorMs: number
	selectedDayKey: string
	weekStartsOn?: WeekStart
	maxLinesPerCell?: number
	onSelectDay: (dayKey: string, dayMs: number) => void
}

interface CellTask {
	task: Task
	allDay: boolean
	startMs: number
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function weekdayHeader(weekStartsOn: WeekStart): string[] {
	return Array.from({length: 7}, (_, index) => WEEKDAY_LABELS[(weekStartsOn + index) % 7])
}

export default function MonthGrid({
	tasks,
	range,
	anchorMs,
	selectedDayKey,
	weekStartsOn = 1,
	maxLinesPerCell = 3,
	onSelectDay,
}: MonthGridProps) {
	const days = useMemo(() => enumerateDays(range), [range])
	// Split the flat 42-day grid into calendar weeks so each row can carry its own
	// week-number cell in the leading column.
	const weeks = useMemo(() => {
		const rows: CalendarDay[][] = []
		for (let index = 0; index < days.length; index += 7) {
			rows.push(days.slice(index, index + 7))
		}
		return rows
	}, [days])

	// Bucket every task onto each day its placement touches, sorted all-day first
	// then by start time — the order tasks stack in a cell.
	const tasksByDay = useMemo(() => {
		const buckets = new Map<string, CellTask[]>()
		for (const task of tasks) {
			const placement = placeTask(task)
			if (!placement) {
				continue
			}
			const entry: CellTask = {task, allDay: placement.allDay, startMs: placement.startMs}
			for (const dayKey of placementDayKeys(placement)) {
				const bucket = buckets.get(dayKey)
				if (bucket) {
					bucket.push(entry)
				} else {
					buckets.set(dayKey, [entry])
				}
			}
		}
		for (const bucket of buckets.values()) {
			bucket.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMs - b.startMs)
		}
		return buckets
	}, [tasks])

	const anchorMonth = new Date(anchorMs).getMonth()
	const todayKey = localDayKey(Date.now())

	return (
		<div className="calendar-month" role="grid" aria-label="Month">
			<div className="calendar-month-weekdays" role="row">
				<div className="calendar-weekday calendar-weeknum-head" role="columnheader" aria-label="Week" />
				{weekdayHeader(weekStartsOn).map(label => (
					<div key={label} className="calendar-weekday" role="columnheader">
						{label}
					</div>
				))}
			</div>
			<div className="calendar-month-grid">
				{weeks.map(week => (
					<Fragment key={week[0].dayKey}>
						<div className="calendar-weeknum" role="rowheader">{isoWeekNumber(week[0].ms)}</div>
						{week.map(day => {
							const cellTasks = tasksByDay.get(day.dayKey) ?? []
							const visible = cellTasks.slice(0, maxLinesPerCell)
							const overflow = cellTasks.length - visible.length
							const outsideMonth = new Date(day.ms).getMonth() !== anchorMonth
							const classNames = [
								'calendar-day-cell',
								outsideMonth ? 'is-outside-month' : '',
								day.dayKey === todayKey ? 'is-today' : '',
								day.dayKey === selectedDayKey ? 'is-selected' : '',
							].filter(Boolean).join(' ')

							return (
								<button
									key={day.dayKey}
									type="button"
									className={classNames}
									role="gridcell"
									aria-selected={day.dayKey === selectedDayKey}
									data-action="select-calendar-day"
									data-day-key={day.dayKey}
									data-outside-month={outsideMonth ? 'true' : undefined}
									onClick={() => onSelectDay(day.dayKey, day.ms)}
								>
									<span className="calendar-day-number">{new Date(day.ms).getDate()}</span>
									<span className="calendar-day-tasks">
										{visible.map(({task, allDay}) => (
											<span
												key={task.id}
												className={[
													'calendar-day-task',
													allDay ? 'is-all-day' : 'is-timed',
													task.done ? 'is-done' : '',
												].filter(Boolean).join(' ')}
												title={task.title}
											>
												{task.title}
											</span>
										))}
										{overflow > 0 ? <span className="calendar-day-more">+{overflow}</span> : null}
									</span>
								</button>
								)
					})}
					</Fragment>
				))}
			</div>
		</div>
	)
}

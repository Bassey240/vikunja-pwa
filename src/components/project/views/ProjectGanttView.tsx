import {api} from '@/api'
import CompactDatePicker from '@/components/common/CompactDatePicker'
import {useAppStore} from '@/store'
import type {Task} from '@/types'
import {formatShortDate, normalizeTaskDateValue} from '@/utils/formatting'
import {Fragment, useEffect, useMemo, useState} from 'react'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_TIMELINE_DAYS = 120

export default function ProjectGanttView({
	projectId,
	tasks,
}: {
	projectId: number
	tasks: Task[]
}) {
	const offlineReadOnlyMode = useAppStore(state => state.offlineReadOnlyMode)
	const openFocusedTask = useAppStore(state => state.openFocusedTask)
	const openTaskDetail = useAppStore(state => state.openTaskDetail)
	const refreshCurrentCollections = useAppStore(state => state.refreshCurrentCollections)
	const setError = useAppStore(state => state.setError)
	const setOfflineActionNotice = useAppStore(state => state.setOfflineActionNotice)
	const [showTasksWithoutDates, setShowTasksWithoutDates] = useState(false)
	const [composerOpen, setComposerOpen] = useState(false)
	const [title, setTitle] = useState('')
	const [submitting, setSubmitting] = useState(false)

	const datedTasks = useMemo(() => {
		return tasks
			.map(task => {
				const startValue =
					normalizeTaskDateValue(task.start_date || null) ||
					normalizeTaskDateValue(task.due_date || null) ||
					normalizeTaskDateValue(task.end_date || null) ||
					null
				const endValue =
					normalizeTaskDateValue(task.end_date || null) ||
					normalizeTaskDateValue(task.due_date || null) ||
					normalizeTaskDateValue(task.start_date || null) ||
					null
				if (!startValue || !endValue) {
					return null
				}

				const start = startOfDay(startValue)
				const end = startOfDay(endValue)
				if (!start || !end) {
					return null
				}

				return {
					task,
					start,
					end: end >= start ? end : start,
				}
			})
			.filter(Boolean)
			.sort((left, right) => left.start.getTime() - right.start.getTime()) as Array<{
				task: Task
				start: Date
				end: Date
			}>
	}, [tasks])

	const undatedTasks = useMemo(
		() => tasks.filter(task =>
			!normalizeTaskDateValue(task.start_date || null) &&
			!normalizeTaskDateValue(task.due_date || null) &&
			!normalizeTaskDateValue(task.end_date || null),
		),
		[tasks],
	)

	const defaultRange = useMemo(() => {
		if (datedTasks.length === 0) {
			const today = startOfDay(new Date().toISOString()) || new Date()
			const nextWeek = new Date(today.getTime() + 7 * DAY_MS)
			return {
				from: toDateInputValue(today),
				to: toDateInputValue(nextWeek),
			}
		}

		const minStart = datedTasks[0].start
		const maxEnd = datedTasks.reduce((latest, entry) => (entry.end > latest ? entry.end : latest), datedTasks[0].end)
		return {
			from: toDateInputValue(minStart),
			to: toDateInputValue(maxEnd),
		}
	}, [datedTasks])

	const [rangeFrom, setRangeFrom] = useState(defaultRange.from)
	const [rangeTo, setRangeTo] = useState(defaultRange.to)

	useEffect(() => {
		setRangeFrom(defaultRange.from)
		setRangeTo(defaultRange.to)
	}, [defaultRange.from, defaultRange.to])

	const rangeFromDate = useMemo(() => fromDateInputValue(rangeFrom), [rangeFrom])
	const rangeToDate = useMemo(() => fromDateInputValue(rangeTo), [rangeTo])
	const normalizedRange = useMemo(() => {
		if (!rangeFromDate || !rangeToDate) {
			return {from: null, to: null, clamped: false}
		}

		const from = rangeFromDate <= rangeToDate ? rangeFromDate : rangeToDate
		const rawTo = rangeFromDate <= rangeToDate ? rangeToDate : rangeFromDate
		const maxTo = new Date(from.getTime() + (MAX_TIMELINE_DAYS - 1) * DAY_MS)
		const to = rawTo > maxTo ? maxTo : rawTo
		return {
			from,
			to,
			clamped: rawTo > maxTo,
		}
	}, [rangeFromDate, rangeToDate])

	const visibleDatedTasks = useMemo(() => {
		return datedTasks.filter(entry => {
			if (!normalizedRange.from || !normalizedRange.to) {
				return true
			}

			return entry.end >= normalizedRange.from && entry.start <= normalizedRange.to
		})
	}, [datedTasks, normalizedRange.from, normalizedRange.to])

	const timeline = useMemo(() => {
		if (!normalizedRange.from || !normalizedRange.to) {
			return []
		}

		const days: Date[] = []
		for (let cursor = normalizedRange.from.getTime(); cursor <= normalizedRange.to.getTime(); cursor += DAY_MS) {
			days.push(new Date(cursor))
		}
		return days
	}, [normalizedRange.from, normalizedRange.to])

	const presets = useMemo(() => buildGanttPresets(), [])

	async function handleCreateTask() {
		const trimmedTitle = title.trim()
		if (!trimmedTitle || !projectId || submitting) {
			return
		}

		if (offlineReadOnlyMode) {
			setError(null)
			setOfflineActionNotice("You're offline. Reconnect to create tasks.")
			return
		}

		setSubmitting(true)
		try {
			await api(`/api/projects/${projectId}/tasks`, {
				method: 'POST',
				body: {
					title: trimmedTitle,
					start_date: rangeFromDate ? rangeFromDate.toISOString() : null,
					end_date: rangeToDate ? endOfDay(rangeToDate).toISOString() : null,
					due_date: rangeToDate ? endOfDay(rangeToDate).toISOString() : null,
				},
			})
			setTitle('')
			setComposerOpen(false)
			await refreshCurrentCollections()
		} finally {
			setSubmitting(false)
		}
	}

	if (datedTasks.length === 0 && !showTasksWithoutDates && undatedTasks.length === 0) {
		return <div className="empty-state">No dated tasks in this Gantt view yet.</div>
	}

	return (
		<div className="project-gantt-view">
			<div className="project-gantt-toolbar">
				<div className="project-gantt-range-pickers">
					<CompactDatePicker label="From" value={rangeFrom} onChange={setRangeFrom} />
					<CompactDatePicker label="To" value={rangeTo} onChange={setRangeTo} />
				</div>
				<div className="project-gantt-toolbar-actions">
					<label className="gantt-checkbox-field">
						<input type="checkbox" checked={showTasksWithoutDates} onChange={event => setShowTasksWithoutDates(event.currentTarget.checked)} />
						<span>Show tasks without dates</span>
					</label>
					<button className="pill-button subtle" type="button" onClick={() => {
						setRangeFrom(defaultRange.from)
						setRangeTo(defaultRange.to)
					}}>
						Reset
					</button>
					<button className={`pill-button subtle ${composerOpen ? 'is-active' : ''}`.trim()} type="button" onClick={() => setComposerOpen(open => !open)}>
						Add task
					</button>
				</div>
			</div>
			<div className="project-gantt-presets">
				{presets.map(preset => (
					<button
						key={preset.label}
						className="pill-button subtle"
						type="button"
						onClick={() => {
							setRangeFrom(preset.from)
							setRangeTo(preset.to)
						}}
					>
						{preset.label}
					</button>
				))}
			</div>
			{composerOpen ? (
				<form
					className="project-gantt-composer"
					onSubmit={event => {
						event.preventDefault()
						void handleCreateTask()
					}}
				>
					<input
						className="detail-input"
						type="text"
						placeholder="Task name"
						value={title}
						onChange={event => setTitle(event.currentTarget.value)}
					/>
					<div className="inline-composer-helper">
						New tasks default to {rangeFrom} through {rangeTo}
					</div>
					<div className="inline-composer-actions">
						<button className="composer-submit" type="submit" disabled={submitting}>
							{submitting ? 'Saving…' : 'Create task'}
						</button>
						<button className="ghost-button" type="button" onClick={() => setComposerOpen(false)}>
							Done
						</button>
					</div>
				</form>
			) : null}
			{normalizedRange.clamped ? (
				<div className="inline-composer-helper">
					Gantt rendering is limited to the first {MAX_TIMELINE_DAYS} days of the selected range.
				</div>
			) : null}
			<div className="project-gantt-scroll">
				<div className="project-gantt-grid" style={{gridTemplateColumns: `280px repeat(${Math.max(1, timeline.length)}, minmax(42px, 1fr))`}}>
					<div className="project-gantt-corner">Task</div>
					{timeline.map(day => (
						<div key={day.toISOString()} className="project-gantt-day">
							{formatShortDate(day.toISOString())}
						</div>
					))}
					{visibleDatedTasks.map(entry => {
						const startIndex = timeline.findIndex(day => day.getTime() === entry.start.getTime())
						const endIndex = timeline.findIndex(day => day.getTime() === entry.end.getTime())
						const gridColumnStart = Math.max(2, startIndex + 2)
						const gridColumnEnd = Math.max(gridColumnStart + 1, endIndex + 3)
						return (
							<Fragment key={entry.task.id}>
								<button
									className="project-gantt-task-label"
									type="button"
									onClick={() => {
										void openTaskDetail(entry.task.id)
										openFocusedTask(entry.task.id, entry.task.project_id, 'tasks')
									}}
								>
									<span>{entry.task.title}</span>
								</button>
								<div className="project-gantt-task-track">
									<div
										className="project-gantt-task-bar"
										style={{
											gridColumnStart,
											gridColumnEnd,
										}}
									>
										{entry.task.title}
									</div>
								</div>
							</Fragment>
						)
					})}
				</div>
			</div>
			{showTasksWithoutDates && undatedTasks.length > 0 ? (
				<section className="project-gantt-undated">
					<div className="project-preview-label">Tasks without dates</div>
					<div className="project-gantt-undated-list">
						{undatedTasks.map(task => (
							<button
								key={task.id}
								className="project-gantt-undated-item"
								type="button"
								onClick={() => {
									void openTaskDetail(task.id)
									openFocusedTask(task.id, task.project_id, 'tasks')
								}}
							>
								{task.title}
							</button>
						))}
					</div>
				</section>
			) : null}
		</div>
	)
}

function startOfDay(value: string) {
	const normalized = normalizeTaskDateValue(value)
	if (!normalized) {
		return null
	}

	const date = new Date(normalized)
	if (Number.isNaN(date.getTime())) {
		return null
	}

	date.setHours(0, 0, 0, 0)
	return date
}

function endOfDay(date: Date) {
	const nextDate = new Date(date.getTime())
	nextDate.setHours(23, 59, 0, 0)
	return nextDate
}

function toDateInputValue(date: Date) {
	return date.toISOString().slice(0, 10)
}

function fromDateInputValue(value: string) {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null
	}

	const [year, month, day] = value.split('-').map(Number)
	const parsed = new Date(year, month - 1, day)
	if (Number.isNaN(parsed.getTime())) {
		return null
	}
	parsed.setHours(0, 0, 0, 0)
	return parsed
}

function buildGanttPresets() {
	const today = startOfDay(new Date().toISOString()) || new Date()
	const startOfThisWeek = startOfWeek(today)
	const endOfThisWeek = new Date(startOfThisWeek.getTime() + 6 * DAY_MS)
	const startOfNextWeek = new Date(startOfThisWeek.getTime() + 7 * DAY_MS)
	const endOfNextWeek = new Date(startOfNextWeek.getTime() + 6 * DAY_MS)
	const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * DAY_MS)
	const endOfLastWeek = new Date(startOfThisWeek.getTime() - DAY_MS)
	const startOfMonthDate = new Date(today.getFullYear(), today.getMonth(), 1)
	const endOfMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
	const startOfNextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
	const endOfNextMonthDate = new Date(today.getFullYear(), today.getMonth() + 2, 0)
	const startOfThisYearDate = new Date(today.getFullYear(), 0, 1)
	const endOfThisYearDate = new Date(today.getFullYear(), 11, 31)
	const startOfLastYearDate = new Date(today.getFullYear() - 1, 0, 1)
	const endOfLastYearDate = new Date(today.getFullYear() - 1, 11, 31)
	const startOfNextYearDate = new Date(today.getFullYear() + 1, 0, 1)
	const endOfNextYearDate = new Date(today.getFullYear() + 1, 11, 31)

	return [
		{label: 'Today', from: toDateInputValue(today), to: toDateInputValue(today)},
		{label: 'This week', from: toDateInputValue(startOfThisWeek), to: toDateInputValue(endOfThisWeek)},
		{label: 'Next week', from: toDateInputValue(startOfNextWeek), to: toDateInputValue(endOfNextWeek)},
		{label: 'Last week', from: toDateInputValue(startOfLastWeek), to: toDateInputValue(endOfLastWeek)},
		{label: 'This month', from: toDateInputValue(startOfMonthDate), to: toDateInputValue(endOfMonthDate)},
		{label: 'Next month', from: toDateInputValue(startOfNextMonthDate), to: toDateInputValue(endOfNextMonthDate)},
		{label: 'Last year', from: toDateInputValue(startOfLastYearDate), to: toDateInputValue(endOfLastYearDate)},
		{label: 'This year', from: toDateInputValue(startOfThisYearDate), to: toDateInputValue(endOfThisYearDate)},
		{label: 'Next year', from: toDateInputValue(startOfNextYearDate), to: toDateInputValue(endOfNextYearDate)},
	]
}

function startOfWeek(date: Date) {
	const nextDate = new Date(date.getTime())
	const day = nextDate.getDay()
	const normalizedDay = day === 0 ? 7 : day
	nextDate.setDate(nextDate.getDate() - normalizedDay + 1)
	nextDate.setHours(0, 0, 0, 0)
	return nextDate
}

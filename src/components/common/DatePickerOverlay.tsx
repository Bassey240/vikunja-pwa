import {useMemo, useState} from 'react'
import {createPortal} from 'react-dom'

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

interface DatePickerOverlayProps {
	title: string
	// Selected day as "YYYY-MM-DD" (empty for none).
	value: string
	onCommit: (dayKey: string) => void
	onClose: () => void
}

interface OverlayDay {
	key: string
	date: Date
	value: string
	inCurrentMonth: boolean
}

// A large, centred date overlay filling the space between the masthead and the
// bottom nav. Deliberately undismissable by scroll or an outside tap — it closes
// only via its ✕ or Done — so it never slips off-screen the way a card-anchored
// popover did. Intended to become the app's single date-picker surface.
export default function DatePickerOverlay({title, value, onCommit, onClose}: DatePickerOverlayProps) {
	const [selected, setSelected] = useState(value)
	const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseDayKey(value) ?? new Date()))
	const days = useMemo(() => buildDays(visibleMonth), [visibleMonth])
	const todayKey = toDayKey(new Date())

	return createPortal(
		<div className="date-overlay-backdrop" role="dialog" aria-modal="true" aria-label={title} data-menu-root="true">
			<div className="date-overlay-panel">
				<header className="date-overlay-head">
					<h2 className="date-overlay-title">{title}</h2>
					<button className="date-overlay-close" type="button" aria-label="Close" data-action="close-date-overlay" onClick={onClose}>✕</button>
				</header>
				<div className="date-overlay-monthnav">
					<button className="date-overlay-nav" type="button" aria-label="Previous month" onClick={() => setVisibleMonth(current => shiftMonth(current, -1))}>‹</button>
					<div className="date-overlay-month">{MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}</div>
					<button className="date-overlay-nav" type="button" aria-label="Next month" onClick={() => setVisibleMonth(current => shiftMonth(current, 1))}>›</button>
				</div>
				<div className="date-overlay-weekdays">
					{WEEKDAY_LABELS.map(dayLabel => (
						<div key={dayLabel} className="date-overlay-weekday">{dayLabel}</div>
					))}
				</div>
				<div className="date-overlay-grid">
					{days.map(day => (
						<button
							key={day.key}
							type="button"
							className={[
								'date-overlay-day',
								day.inCurrentMonth ? '' : 'is-muted',
								day.value === todayKey ? 'is-today' : '',
								day.value === selected ? 'is-selected' : '',
							].filter(Boolean).join(' ')}
							data-day-key={day.value}
							onClick={() => setSelected(day.value)}
						>
							{day.date.getDate()}
						</button>
					))}
				</div>
				<footer className="date-overlay-actions">
					<button
						className="date-overlay-today"
						type="button"
						onClick={() => {
							setSelected(todayKey)
							setVisibleMonth(startOfMonth(new Date()))
						}}
					>
						Today
					</button>
					<button
						className="date-overlay-done"
						type="button"
						data-action="commit-date-overlay"
						disabled={!selected}
						onClick={() => {
							if (selected) {
								onCommit(selected)
							}
						}}
					>
						Done
					</button>
				</footer>
			</div>
		</div>,
		document.body,
	)
}

function pad2(value: number): string {
	return `${value}`.padStart(2, '0')
}

function toDayKey(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseDayKey(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null
	}
	const [year, month, day] = value.split('-').map(Number)
	const parsed = new Date(year, month - 1, day)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonth(date: Date, offset: number): Date {
	return new Date(date.getFullYear(), date.getMonth() + offset, 1)
}

// 6×7 grid backed up to the Monday on/before the first of the visible month.
function buildDays(visibleMonth: Date): OverlayDay[] {
	const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
	const firstWeekday = (firstDay.getDay() + 6) % 7
	const calendarStart = new Date(firstDay)
	calendarStart.setDate(firstDay.getDate() - firstWeekday)

	return Array.from({length: 42}, (_, index) => {
		const date = new Date(calendarStart)
		date.setDate(calendarStart.getDate() + index)
		return {
			key: toDayKey(date),
			date,
			value: toDayKey(date),
			inCurrentMonth: date.getMonth() === visibleMonth.getMonth(),
		}
	})
}

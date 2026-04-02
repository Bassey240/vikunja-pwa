import {type InputHTMLAttributes, useEffect, useMemo, useRef, useState} from 'react'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export default function CompactDatePicker({
	label,
	value,
	onChange,
	mode = 'date',
	allowEmpty = false,
	placeholder,
	showLabel = true,
	inputProps,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	mode?: 'date' | 'datetime'
	allowEmpty?: boolean
	placeholder?: string
	showLabel?: boolean
	inputProps?: Omit<
		InputHTMLAttributes<HTMLInputElement>,
		'type' | 'value' | 'onChange' | 'onFocus' | 'onClick' | 'onPaste' | 'onBlur' | 'onKeyDown' | 'placeholder'
	>
}) {
	const rootRef = useRef<HTMLDivElement | null>(null)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const focusRestoreValueRef = useRef('')
	const editedSinceFocusRef = useRef(false)
	const [open, setOpen] = useState(false)
	const normalizedValue = normalizeValue(value, mode)
	const fallbackValue = mode === 'date' ? toDateValue(new Date()) : `${toDateValue(new Date())}T12:00`
	const effectiveValue = normalizedValue || (allowEmpty ? '' : fallbackValue)
	const [draft, setDraft] = useState(() => formatDisplayValue(effectiveValue, mode))
	const [timeValue, setTimeValue] = useState(() => extractTimeValue(effectiveValue, mode))
	const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseDisplayBaseDate(effectiveValue, mode) || new Date()))

	useEffect(() => {
		const nextValue = normalizeValue(value, mode) || (allowEmpty ? '' : fallbackValue)
		setDraft(formatDisplayValue(nextValue, mode))
		setTimeValue(extractTimeValue(nextValue, mode))
		setVisibleMonth(startOfMonth(parseDisplayBaseDate(nextValue, mode) || new Date()))
		focusRestoreValueRef.current = formatDisplayValue(nextValue, mode)
		editedSinceFocusRef.current = false
	}, [allowEmpty, fallbackValue, mode, value])

	useEffect(() => {
		if (!open) {
			return
		}

		function handlePointerDown(event: PointerEvent) {
			const target = event.target
			if (!(target instanceof Node)) {
				return
			}

			if (rootRef.current?.contains(target)) {
				return
			}

			setOpen(false)
			commitDraft()
		}

		document.addEventListener('pointerdown', handlePointerDown, true)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown, true)
		}
	}, [open, draft, effectiveValue, mode, timeValue])

	const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth])

	function commitDraft() {
		if (!editedSinceFocusRef.current && !`${draft}`.trim()) {
			setDraft(focusRestoreValueRef.current)
			setTimeValue(extractTimeValue(normalizeValue(value, mode) || (allowEmpty ? '' : fallbackValue), mode))
			return
		}

		if (allowEmpty && !`${draft}`.trim()) {
			onChange('')
			setDraft('')
			return
		}

		const parsed = parseDisplayValue(draft, mode, timeValue)
		if (parsed) {
			onChange(parsed)
			setDraft(formatDisplayValue(parsed, mode))
			setTimeValue(extractTimeValue(parsed, mode))
			setVisibleMonth(startOfMonth(parseDisplayBaseDate(parsed, mode) || new Date()))
			return
		}

		setDraft(formatDisplayValue(effectiveValue, mode))
		setTimeValue(extractTimeValue(effectiveValue, mode))
	}

	return (
		<div className="task-filter-field compact-date-picker" ref={rootRef}>
			{showLabel ? <div className="detail-label">{label}</div> : null}
			<div className={`compact-date-picker-control ${open ? 'is-open' : ''}`.trim()}>
				<input
					ref={inputRef}
					className="detail-input compact-date-picker-input"
					type="text"
					inputMode="numeric"
					placeholder={placeholder || (mode === 'datetime' ? 'DD/MM/YYYY HH:MM' : 'DD/MM/YYYY')}
					{...inputProps}
					value={draft}
					onChange={event => {
						const nextValue = event.currentTarget.value
						if (!hasOnlyMaskedCharacters(nextValue)) {
							return
						}
						editedSinceFocusRef.current = true
						setDraft(nextValue)
					}}
					onFocus={event => {
						focusRestoreValueRef.current = draft
						editedSinceFocusRef.current = false
						const current = event.currentTarget
						window.requestAnimationFrame(() => {
							if (document.activeElement !== current) {
								return
							}
							const start = current.selectionStart ?? 0
							const end = current.selectionEnd ?? start
							if (start === end && start === current.value.length) {
								setCursorPosition(current, firstEditableIndex(mode))
							}
						})
					}}
					onClick={event => {
						const current = event.currentTarget
						window.requestAnimationFrame(() => {
							if (document.activeElement !== current) {
								return
							}
							const cursor = current.selectionStart ?? 0
							const nextCursor = normalizeCursorPosition(cursor, mode, 'forward')
							if (nextCursor !== cursor) {
								setCursorPosition(current, nextCursor)
							}
						})
					}}
					onPaste={event => {
						const pastedText = event.clipboardData.getData('text')
						const nextDraft = mergeDigitsIntoDraft(
							draft || maskTemplate(mode),
							extractDisplayDigits(pastedText),
							event.currentTarget.selectionStart ?? 0,
							mode,
						)
						if (!nextDraft) {
							return
						}
						event.preventDefault()
						editedSinceFocusRef.current = true
						setDraft(nextDraft.value)
						window.requestAnimationFrame(() => {
							if (inputRef.current) {
								setCursorPosition(inputRef.current, nextDraft.cursor)
							}
						})
					}}
					onBlur={() => {
						commitDraft()
						editedSinceFocusRef.current = false
					}}
					onKeyDown={event => {
						const current = event.currentTarget
						if (/^\d$/.test(event.key)) {
							event.preventDefault()
							const nextDraft = mergeDigitsIntoDraft(
								draft || maskTemplate(mode),
								event.key,
								current.selectionStart ?? 0,
								mode,
							)
							if (!nextDraft) {
								return
							}
							editedSinceFocusRef.current = true
							setDraft(nextDraft.value)
							window.requestAnimationFrame(() => {
								if (inputRef.current) {
									setCursorPosition(inputRef.current, nextDraft.cursor)
								}
							})
							return
						}

						if (event.key === 'Backspace' || event.key === 'Delete') {
							event.preventDefault()
							const nextDraft = clearDigitAtSelection(
								draft || maskTemplate(mode),
								current.selectionStart ?? 0,
								current.selectionEnd ?? current.selectionStart ?? 0,
								mode,
								event.key === 'Backspace' ? 'backward' : 'forward',
							)
							if (!nextDraft) {
								return
							}
							editedSinceFocusRef.current = true
							setDraft(nextDraft.value)
							window.requestAnimationFrame(() => {
								if (inputRef.current) {
									setCursorPosition(inputRef.current, nextDraft.cursor)
								}
							})
							return
						}

						if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
							event.preventDefault()
							const direction = event.key === 'ArrowLeft' ? 'backward' : 'forward'
							const nextCursor = normalizeCursorPosition(
								current.selectionStart ?? 0,
								mode,
								direction,
							)
							window.requestAnimationFrame(() => {
								if (inputRef.current) {
									setCursorPosition(inputRef.current, nextCursor)
								}
							})
							return
						}

						if (event.key === 'Enter') {
							event.preventDefault()
							commitDraft()
							editedSinceFocusRef.current = false
							setOpen(false)
							return
						}

						if (event.key === 'Tab') {
							return
						}

						if (event.key.length === 1) {
							event.preventDefault()
						}
					}}
				/>
				<button
					className="compact-date-picker-toggle"
					type="button"
					aria-label={`Open ${label} calendar`}
					onClick={() => setOpen(current => !current)}
				>
					▾
				</button>
			</div>
			{open ? (
				<div className="compact-date-picker-popover" data-menu-root="true">
					<div className="compact-date-picker-head">
						<button
							className="compact-date-picker-nav"
							type="button"
							onClick={() => setVisibleMonth(current => shiftMonth(current, -1))}
						>
							‹
						</button>
						<div className="compact-date-picker-title">
							{MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
						</div>
						<button
							className="compact-date-picker-nav"
							type="button"
							onClick={() => setVisibleMonth(current => shiftMonth(current, 1))}
						>
							›
						</button>
					</div>
					<div className="compact-date-picker-grid compact-date-picker-weekdays">
						{WEEKDAY_LABELS.map(dayLabel => (
							<div key={dayLabel} className="compact-date-picker-weekday">
								{dayLabel}
							</div>
						))}
					</div>
					<div className="compact-date-picker-grid">
						{calendarDays.map(day => {
							const selected = day.value === extractDateValue(effectiveValue, mode)
							const today = day.value === toDateValue(new Date())
							return (
								<button
									key={day.key}
									className={`compact-date-picker-day ${day.inCurrentMonth ? '' : 'is-muted'} ${today ? 'is-today' : ''} ${selected ? 'is-selected' : ''}`.trim()}
									type="button"
									onClick={() => {
										const nextValue = mode === 'datetime'
											? `${day.value}T${timeValue || '12:00'}`
											: day.value
										onChange(nextValue)
										setDraft(formatDisplayValue(nextValue, mode))
										setOpen(false)
									}}
								>
									{day.date.getDate()}
								</button>
							)
						})}
					</div>
					{mode === 'datetime' ? (
						<div className="compact-date-picker-time-row">
							<div className="compact-date-picker-time-label">Time</div>
							<input
								className="detail-input compact-date-picker-time-input"
								type="time"
								value={timeValue}
								onChange={event => {
									const nextTimeValue = event.currentTarget.value || '12:00'
									setTimeValue(nextTimeValue)
									const dateValue = extractDateValue(effectiveValue || fallbackValue, mode) || toDateValue(new Date())
									const nextValue = `${dateValue}T${nextTimeValue}`
									onChange(nextValue)
									setDraft(formatDisplayValue(nextValue, mode))
								}}
							/>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	)
}

function hasOnlyMaskedCharacters(value: string) {
	return /^[\d/:\s.-]*$/.test(value)
}

function maskTemplate(mode: 'date' | 'datetime') {
	return mode === 'datetime' ? '__/__/____ __:__' : '__/__/____'
}

function editableIndexes(mode: 'date' | 'datetime') {
	return mode === 'datetime' ? [0, 1, 3, 4, 6, 7, 8, 9, 11, 12, 14, 15] : [0, 1, 3, 4, 6, 7, 8, 9]
}

function firstEditableIndex(mode: 'date' | 'datetime') {
	return editableIndexes(mode)[0] ?? 0
}

function lastEditableIndex(mode: 'date' | 'datetime') {
	return editableIndexes(mode).at(-1) ?? 0
}

function normalizeCursorPosition(
	position: number,
	mode: 'date' | 'datetime',
	direction: 'forward' | 'backward',
) {
	const indexes = editableIndexes(mode)
	if (!indexes.length) {
		return 0
	}

	if (direction === 'forward') {
		for (const index of indexes) {
			if (index >= position) {
				return index
			}
		}
		return indexes[indexes.length - 1] + 1
	}

	for (let i = indexes.length - 1; i >= 0; i -= 1) {
		if (indexes[i] < position) {
			return indexes[i]
		}
	}
	return indexes[0]
}

function setCursorPosition(input: HTMLInputElement, position: number) {
	input.setSelectionRange(position, position)
}

function replaceChar(value: string, index: number, nextChar: string) {
	return `${value.slice(0, index)}${nextChar}${value.slice(index + 1)}`
}

function extractDisplayDigits(value: string) {
	return `${value || ''}`.replace(/\D/g, '')
}

function mergeDigitsIntoDraft(
	currentDraft: string,
	digits: string,
	startPosition: number,
	mode: 'date' | 'datetime',
) {
	const normalizedDraft = ensureMaskedDraft(currentDraft, mode)
	const indexes = editableIndexes(mode)
	let cursor = normalizeCursorPosition(startPosition, mode, 'forward')
	let nextDraft = normalizedDraft

	for (const digit of digits) {
		const targetIndex = indexes.find(index => index >= cursor)
		if (targetIndex === undefined) {
			break
		}
		nextDraft = replaceChar(nextDraft, targetIndex, digit)
		cursor = normalizeCursorPosition(targetIndex + 1, mode, 'forward')
	}

	return {
		value: nextDraft,
		cursor,
	}
}

function ensureMaskedDraft(value: string, mode: 'date' | 'datetime') {
	const template = maskTemplate(mode)
	if (!value) {
		return template
	}

	let nextValue = template
	for (let index = 0; index < Math.min(value.length, template.length); index += 1) {
		const char = value[index]
		if (/\d/.test(char) || template[index] === char) {
			nextValue = replaceChar(nextValue, index, char)
		}
	}
	return nextValue
}

function clearDigitAtSelection(
	currentDraft: string,
	start: number,
	end: number,
	mode: 'date' | 'datetime',
	direction: 'forward' | 'backward',
) {
	const normalizedDraft = ensureMaskedDraft(currentDraft, mode)
	const template = maskTemplate(mode)
	const indexes = editableIndexes(mode)
	let nextDraft = normalizedDraft
	let cursor = start

	if (start !== end) {
		for (const index of indexes) {
			if (index >= start && index < end) {
				nextDraft = replaceChar(nextDraft, index, template[index])
			}
		}
		cursor = normalizeCursorPosition(start, mode, 'forward')
		return {
			value: nextDraft,
			cursor,
		}
	}

	const targetIndex =
		direction === 'backward'
			? [...indexes].reverse().find(index => index < start)
			: indexes.find(index => index >= start)

	if (targetIndex === undefined) {
		return {
			value: nextDraft,
			cursor: normalizeCursorPosition(start, mode, direction),
		}
	}

	nextDraft = replaceChar(nextDraft, targetIndex, template[targetIndex])
	cursor = direction === 'backward' ? targetIndex : normalizeCursorPosition(targetIndex, mode, 'forward')
	return {
		value: nextDraft,
		cursor,
	}
}

function normalizeValue(value: string, mode: 'date' | 'datetime') {
	return mode === 'datetime' ? normalizeDateTimeValue(value) : normalizeDateValue(value)
}

function normalizeDateValue(value: string) {
	return parseDateValue(value) ? value : ''
}

function parseDateValue(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null
	}

	const [year, month, day] = value.split('-').map(Number)
	if (!year || year <= 1901) {
		return null
	}

	const parsed = new Date(year, month - 1, day)
	if (Number.isNaN(parsed.getTime())) {
		return null
	}

	if (
		parsed.getFullYear() !== year ||
		parsed.getMonth() !== month - 1 ||
		parsed.getDate() !== day
	) {
		return null
	}

	return parsed
}

function normalizeDateTimeValue(value: string) {
	if (!value) {
		return ''
	}

	const parsed = new Date(value)
	if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() <= 1901) {
		return ''
	}

	return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, '0')}-${`${parsed.getDate()}`.padStart(2, '0')}T${`${parsed.getHours()}`.padStart(2, '0')}:${`${parsed.getMinutes()}`.padStart(2, '0')}`
}

function parseDisplayDate(value: string) {
	const normalized = `${value || ''}`.trim()
	const compactMatch = normalized.match(/^(\d{2})(\d{2})(\d{4})$/)
	if (compactMatch) {
		return parseDisplayParts(compactMatch[1], compactMatch[2], compactMatch[3])
	}

	const match = normalized.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
	if (!match) {
		return null
	}

	return parseDisplayParts(match[1], match[2], match[3])
}

function parseDisplayParts(dayPart: string, monthPart: string, yearPart: string) {
	const day = Number(dayPart)
	const month = Number(monthPart)
	const year = Number(yearPart)
	if (!year || year <= 1901) {
		return null
	}

	const parsed = new Date(year, month - 1, day)
	if (Number.isNaN(parsed.getTime())) {
		return null
	}

	if (
		parsed.getFullYear() !== year ||
		parsed.getMonth() !== month - 1 ||
		parsed.getDate() !== day
	) {
		return null
	}

	return toDateValue(parsed)
}

function parseDisplayValue(value: string, mode: 'date' | 'datetime', timeValue: string) {
	if (mode === 'datetime') {
		const match = `${value || ''}`.trim().match(/^(.+?)\s+(\d{1,2}):(\d{2})$/)
		if (match) {
			const dateValue = parseDisplayDate(match[1])
			if (!dateValue) {
				return null
			}
			return `${dateValue}T${`${Number(match[2])}`.padStart(2, '0')}:${match[3]}`
		}

		const dateValue = parseDisplayDate(value)
		if (!dateValue) {
			return null
		}
		return `${dateValue}T${timeValue || '12:00'}`
	}

	return parseDisplayDate(value)
}

function formatDateDisplay(value: string) {
	const date = parseDateValue(value)
	if (!date) {
		return ''
	}

	return `${`${date.getDate()}`.padStart(2, '0')}/${`${date.getMonth() + 1}`.padStart(2, '0')}/${date.getFullYear()}`
}

function formatDisplayValue(value: string, mode: 'date' | 'datetime') {
	if (!value) {
		return ''
	}

	if (mode === 'datetime') {
		const normalized = normalizeDateTimeValue(value)
		if (!normalized) {
			return ''
		}
		const [datePart, timePart] = normalized.split('T')
		return `${formatDateDisplay(datePart)} ${timePart}`
	}

	return formatDateDisplay(value)
}

function extractDateValue(value: string, mode: 'date' | 'datetime') {
	if (!value) {
		return ''
	}

	if (mode === 'datetime') {
		return normalizeDateTimeValue(value).split('T')[0] || ''
	}

	return normalizeDateValue(value)
}

function extractTimeValue(value: string, mode: 'date' | 'datetime') {
	if (mode !== 'datetime') {
		return ''
	}

	const normalized = normalizeDateTimeValue(value)
	return normalized ? normalized.split('T')[1] || '12:00' : '12:00'
}

function parseDisplayBaseDate(value: string, mode: 'date' | 'datetime') {
	return parseDateValue(extractDateValue(value, mode))
}

function startOfMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonth(date: Date, offset: number) {
	return new Date(date.getFullYear(), date.getMonth() + offset, 1)
}

function toDateValue(date: Date) {
	return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}

function buildCalendarDays(visibleMonth: Date) {
	const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
	const firstWeekday = (firstDay.getDay() + 6) % 7
	const calendarStart = new Date(firstDay)
	calendarStart.setDate(firstDay.getDate() - firstWeekday)

	return Array.from({length: 42}, (_, index) => {
		const date = new Date(calendarStart)
		date.setDate(calendarStart.getDate() + index)
		return {
			key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
			date,
			value: toDateValue(date),
			inCurrentMonth: date.getMonth() === visibleMonth.getMonth(),
		}
	})
}

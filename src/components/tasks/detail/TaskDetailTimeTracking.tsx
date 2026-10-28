import {useEffect, useMemo, useState} from 'react'
import type {TimeEntry} from '@/types'
import {formatLongDate} from '@/utils/formatting'
import type {TaskDetailSection} from '@/utils/task-detail-helpers'
import CollapsibleSection from './CollapsibleSection'
import {
	formatTimerClock,
	formatTrackedDuration,
	fromLocalDateTimeInputValue,
	getTimeEntryDurationSeconds,
	isRunningTimeEntry,
	sumTimeEntryDurationSeconds,
	toLocalDateTimeInputValue,
} from '@/utils/time-tracking'

interface TimeEntryDraft {
	startTime: string
	endTime: string
	comment: string
}

const EMPTY_DRAFT: TimeEntryDraft = {startTime: '', endTime: '', comment: ''}

export default function TaskDetailTimeTracking({
	open,
	onToggle,
	taskId,
	entries,
	loading,
	mutating,
	runningEntry,
	disabled,
	onStart,
	onStop,
	onCreate,
	onUpdate,
	onDelete,
}: {
	open: boolean
	onToggle: (section: TaskDetailSection) => void
	taskId: number
	entries: TimeEntry[]
	loading: boolean
	mutating: boolean
	runningEntry: TimeEntry | null
	disabled: boolean
	onStart: () => void
	onStop: () => void
	onCreate: (input: {startTime: string; endTime: string; comment: string}) => void
	onUpdate: (entryId: number, input: {startTime: string; endTime: string | null; comment: string}) => void
	onDelete: (entryId: number) => void
}) {
	const [now, setNow] = useState(() => Date.now())
	const [addOpen, setAddOpen] = useState(false)
	const [addDraft, setAddDraft] = useState<TimeEntryDraft>(EMPTY_DRAFT)
	const [editingEntryId, setEditingEntryId] = useState(0)
	const [editDraft, setEditDraft] = useState<TimeEntryDraft>(EMPTY_DRAFT)

	const runsHere = isRunningTimeEntry(runningEntry) && runningEntry?.task_id === taskId
	const runsElsewhere = isRunningTimeEntry(runningEntry) && runningEntry?.task_id !== taskId

	// The clock only ticks while something is actually running on this task;
	// the section header carries the running total, so a collapsed section ticks too.
	useEffect(() => {
		if (!runsHere) {
			return
		}

		const timer = window.setInterval(() => setNow(Date.now()), 1000)
		return () => window.clearInterval(timer)
	}, [runsHere])

	const totalSeconds = useMemo(() => sumTimeEntryDurationSeconds(entries, now), [entries, now])

	return (
		<CollapsibleSection
			title={totalSeconds > 0 ? `Time tracking · ${formatTrackedDuration(totalSeconds)}` : 'Time tracking'}
			section="timeTracking"
			open={open}
			onToggle={onToggle}
		>
			<div className="detail-time-card">
				<div className="detail-inline-actions">
					{runsHere ? (
						<button
							className="composer-submit"
							type="button"
							data-action="stop-task-timer"
							disabled={disabled || mutating}
							onClick={onStop}
						>
							Stop timer
						</button>
					) : (
						<button
							className="composer-submit"
							type="button"
							data-action="start-task-timer"
							disabled={disabled || mutating}
							onClick={onStart}
						>
							Start timer
						</button>
					)}
					<button
						className="ghost-button detail-comment-action"
						type="button"
						data-action="toggle-time-entry-form"
						disabled={disabled || mutating}
						onClick={() => {
							setAddDraft(EMPTY_DRAFT)
							setAddOpen(current => !current)
						}}
					>
						{addOpen ? 'Cancel' : 'Add entry'}
					</button>
				</div>
				{runsElsewhere ? (
					<div className="detail-meta" data-time-tracking-notice>
						Starting a timer here stops the one running on another task.
					</div>
				) : null}
				{addOpen ? (
					<TimeEntryFields
						draft={addDraft}
						onChange={setAddDraft}
						submitLabel="Save entry"
						disabled={disabled || mutating}
						action="create-time-entry"
						onSubmit={() => {
							onCreate({
								startTime: fromLocalDateTimeInputValue(addDraft.startTime),
								endTime: fromLocalDateTimeInputValue(addDraft.endTime),
								comment: addDraft.comment,
							})
							setAddOpen(false)
							setAddDraft(EMPTY_DRAFT)
						}}
					/>
				) : null}
				<div className="detail-time-list">
					{entries.length > 0 ? entries.map(entry => {
						const running = isRunningTimeEntry(entry)
						const seconds = getTimeEntryDurationSeconds(entry, now)
						if (editingEntryId === entry.id) {
							return (
								<div key={entry.id} className="detail-time-row" data-time-entry={entry.id}>
									<TimeEntryFields
										draft={editDraft}
										onChange={setEditDraft}
										submitLabel="Save"
										disabled={disabled || mutating}
										action="save-time-entry"
										onCancel={() => setEditingEntryId(0)}
										onSubmit={() => {
											onUpdate(entry.id, {
												startTime: fromLocalDateTimeInputValue(editDraft.startTime),
												// An ended entry cannot be reopened, so a cleared end stays null
												// only for the entry that is still running.
												endTime: fromLocalDateTimeInputValue(editDraft.endTime) || null,
												comment: editDraft.comment,
											})
											setEditingEntryId(0)
										}}
									/>
								</div>
							)
						}

						return (
							<div key={entry.id} className="detail-time-row" data-time-entry={entry.id}>
								<div className="detail-time-copy">
									<div className={`detail-time-duration ${running ? 'is-running' : ''}`.trim()} data-time-entry-duration>
										{running ? formatTimerClock(seconds) : formatTrackedDuration(seconds)}
									</div>
									<div className="detail-meta">
										{formatLongDate(entry.start_time)}
										{running ? ' · running' : ''}
									</div>
									{entry.comment ? <div className="detail-time-comment">{entry.comment}</div> : null}
								</div>
								<div className="detail-time-actions">
									<button
										className="ghost-button detail-comment-action"
										type="button"
										data-action="edit-time-entry"
										disabled={disabled || mutating}
										onClick={() => {
											setEditingEntryId(entry.id)
											setEditDraft({
												startTime: toLocalDateTimeInputValue(entry.start_time),
												endTime: toLocalDateTimeInputValue(entry.end_time),
												comment: entry.comment || '',
											})
										}}
									>
										Edit
									</button>
									<button
										className="ghost-button detail-comment-action"
										type="button"
										data-action="delete-time-entry"
										disabled={disabled || mutating}
										onClick={() => onDelete(entry.id)}
									>
										Delete
									</button>
								</div>
							</div>
						)
					}) : (
						<div className="detail-meta">{loading ? 'Loading time entries…' : 'No time tracked yet.'}</div>
					)}
				</div>
			</div>
		</CollapsibleSection>
	)
}

function TimeEntryFields({
	draft,
	onChange,
	submitLabel,
	action,
	disabled,
	onSubmit,
	onCancel,
}: {
	draft: TimeEntryDraft
	onChange: (draft: TimeEntryDraft) => void
	submitLabel: string
	action: string
	disabled: boolean
	onSubmit: () => void
	onCancel?: () => void
}) {
	return (
		<div className="detail-time-form">
			<label className="detail-field">
				<span className="detail-label">Start</span>
				<input
					className="detail-input"
					type="datetime-local"
					data-time-entry-start
					value={draft.startTime}
					onChange={event => onChange({...draft, startTime: event.target.value})}
				/>
			</label>
			<label className="detail-field">
				<span className="detail-label">End</span>
				<input
					className="detail-input"
					type="datetime-local"
					data-time-entry-end
					value={draft.endTime}
					onChange={event => onChange({...draft, endTime: event.target.value})}
				/>
			</label>
			<label className="detail-field">
				<span className="detail-label">Comment</span>
				<input
					className="detail-input"
					type="text"
					data-time-entry-comment
					value={draft.comment}
					onChange={event => onChange({...draft, comment: event.target.value})}
				/>
			</label>
			<div className="detail-inline-actions">
				<button
					className="composer-submit"
					type="button"
					data-action={action}
					disabled={disabled || !draft.startTime}
					onClick={onSubmit}
				>
					{submitLabel}
				</button>
				{onCancel ? (
					<button className="ghost-button detail-comment-action" type="button" onClick={onCancel}>
						Cancel
					</button>
				) : null}
			</div>
		</div>
	)
}

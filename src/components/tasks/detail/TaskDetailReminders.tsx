import CompactDatePicker from '@/components/common/CompactDatePicker'
import type {TaskReminder} from '@/types'
import {formatReminderLabel, formatReminderMeta} from '@/utils/formatting'
import {REMINDER_PRESETS, type TaskDetailSection} from '@/utils/task-detail-helpers'
import type {FormEvent} from 'react'
import CollapsibleSection from './CollapsibleSection'

export default function TaskDetailReminders({
	open,
	onToggle,
	quickReminderOptions,
	dueDateValue,
	selectedRelativeReminder,
	onSelectedRelativeReminderChange,
	reminders,
	reminderInput,
	onReminderInputChange,
	onAddQuickReminder,
	onAddSelectedRelativeReminder,
	onAddAbsoluteReminder,
	onRemoveReminder,
}: {
	open: boolean
	onToggle: (section: TaskDetailSection) => void
	quickReminderOptions: Array<{label: string; value: string; shortLabel: string}>
	dueDateValue: string | null
	selectedRelativeReminder: string
	onSelectedRelativeReminderChange: (value: string) => void
	reminders: TaskReminder[]
	reminderInput: string
	onReminderInputChange: (value: string) => void
	onAddQuickReminder: (value: string) => void
	onAddSelectedRelativeReminder: (event: FormEvent<HTMLFormElement>) => void
	onAddAbsoluteReminder: (event: FormEvent<HTMLFormElement>) => void
	onRemoveReminder: (index: number) => void
}) {
	return (
		<CollapsibleSection title="Reminders" section="reminders" open={open} onToggle={onToggle}>
			<div className="detail-reminders-card">
				<div className="detail-reminder-block">
					<div className="detail-label">Quick options</div>
					<div className="detail-reminder-quick-list">
						{quickReminderOptions.map(option => (
							<button
								key={option.value}
								className="detail-reminder-quick-option"
								data-action="add-quick-reminder"
								data-reminder-option={option.value}
								type="button"
								onClick={() => void onAddQuickReminder(option.value)}
							>
								<span className="detail-reminder-quick-label">{option.label}</span>
								<span className="detail-reminder-quick-date">{option.shortLabel}</span>
							</button>
						))}
					</div>
				</div>
				<div className="detail-reminder-block">
					<div className="detail-label">Due-date presets</div>
					<form className="detail-inline-form detail-reminder-form" data-form="add-relative-reminder" onSubmit={onAddSelectedRelativeReminder}>
						<select
							className="detail-input"
							data-detail-relative-reminder-select
							value={selectedRelativeReminder}
							disabled={!dueDateValue}
							onChange={event => onSelectedRelativeReminderChange(event.currentTarget.value)}
						>
							<option value="">{dueDateValue ? 'Choose due-date preset' : 'Set a due date first'}</option>
							{REMINDER_PRESETS.map(preset => (
								<option key={preset.label} value={preset.relativePeriod}>
									{preset.label}
								</option>
							))}
						</select>
						<button className="composer-submit" type="submit" disabled={!dueDateValue || !selectedRelativeReminder}>
							Add
						</button>
					</form>
				</div>
				<div className="detail-reminder-block">
					<div className="detail-label">Current reminders</div>
					<div className="detail-reminder-list">
						{reminders.length > 0 ? reminders.map((reminder, index) => (
							<div
								key={`${reminder.reminder}:${reminder.relative_to || ''}:${reminder.relative_period || 0}:${index}`}
								className="detail-reminder-row"
							>
								<div className="detail-reminder-copy">
									<div className="detail-reminder-title" data-task-reminder={index}>
										{formatReminderLabel(reminder)}
									</div>
									<div className="detail-meta">{formatReminderMeta(reminder)}</div>
								</div>
								<button
									className="menu-button detail-reminder-remove"
									data-action="remove-task-reminder"
									data-task-reminder-index={index}
									type="button"
									aria-label="Remove reminder"
									onClick={() => void onRemoveReminder(index)}
								>
									×
								</button>
							</div>
						)) : <div className="detail-helper-text">No reminders yet.</div>}
					</div>
				</div>
				<div className="detail-reminder-block">
					<div className="detail-label">Custom reminder</div>
					<form className="detail-inline-form detail-reminder-form" data-form="add-reminder" onSubmit={onAddAbsoluteReminder}>
						<CompactDatePicker
							label="Custom reminder"
							value={reminderInput}
							onChange={onReminderInputChange}
							mode="datetime"
							allowEmpty={true}
							showLabel={false}
							placeholder="DD/MM/YYYY HH:MM"
						/>
						<button className="composer-submit" type="submit" disabled={!reminderInput}>
							Add
						</button>
					</form>
				</div>
			</div>
		</CollapsibleSection>
	)
}

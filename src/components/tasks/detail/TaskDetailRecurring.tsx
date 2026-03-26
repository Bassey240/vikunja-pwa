import {formatRepeatInterval} from '@/utils/formatting'
import {REPEAT_PRESETS, type RepeatUnit, type TaskDetailSection} from '@/utils/task-detail-helpers'
import type {FormEvent} from 'react'
import CollapsibleSection from './CollapsibleSection'

export default function TaskDetailRecurring({
	open,
	onToggle,
	repeatSummary,
	repeatAfterValue,
	repeatEveryValue,
	repeatEveryUnit,
	repeatFromCurrentDate,
	onRecurringPreset,
	onRepeatEveryValueChange,
	onRepeatEveryUnitChange,
	onRecurringSubmit,
	onRepeatOriginToggle,
	onClearRecurring,
}: {
	open: boolean
	onToggle: (section: TaskDetailSection) => void
	repeatSummary: string
	repeatAfterValue: number
	repeatEveryValue: string
	repeatEveryUnit: RepeatUnit
	repeatFromCurrentDate: boolean
	onRecurringPreset: (value: number, unit: RepeatUnit) => void
	onRepeatEveryValueChange: (value: string) => void
	onRepeatEveryUnitChange: (unit: RepeatUnit) => void
	onRecurringSubmit: (event: FormEvent<HTMLFormElement>) => void
	onRepeatOriginToggle: (value: boolean) => void
	onClearRecurring: () => void
}) {
	return (
		<CollapsibleSection title="Recurring" section="recurring" open={open} onToggle={onToggle}>
			<div className="detail-recurring-card">
				<div className="detail-recurring-summary">
					<div className="detail-label">Current schedule</div>
					<div className="detail-value" data-task-repeat-summary>
						{repeatSummary || 'Does not repeat'}
					</div>
				</div>
				<div className="detail-recurring-block">
					<div className="detail-label">Presets</div>
					<div className="detail-recurring-preset-list">
						{REPEAT_PRESETS.map(preset => (
							<button
								key={preset.label}
								className="detail-recurring-preset"
								data-action="set-repeat-preset"
								data-repeat-preset={preset.unit}
								type="button"
								onClick={() => void onRecurringPreset(preset.value, preset.unit)}
							>
								{preset.label}
							</button>
						))}
					</div>
				</div>
				<div className="detail-recurring-block">
					<div className="detail-label">Repeat every</div>
					<form className="detail-inline-form detail-recurring-form" data-form="save-repeat" onSubmit={onRecurringSubmit}>
						<input
							className="detail-input detail-input-small"
							data-detail-repeat-value
							type="number"
							min="1"
							step="1"
							inputMode="numeric"
							value={repeatEveryValue}
							onChange={event => onRepeatEveryValueChange(event.currentTarget.value)}
						/>
						<select
							className="detail-input"
							data-detail-repeat-unit
							value={repeatEveryUnit}
							onChange={event => onRepeatEveryUnitChange(event.currentTarget.value as RepeatUnit)}
						>
							<option value="hours">Hours</option>
							<option value="days">Days</option>
							<option value="weeks">Weeks</option>
							<option value="months">Months</option>
						</select>
						<button className="composer-submit" type="submit" disabled={Number(repeatEveryValue || 0) <= 0}>
							Save
						</button>
					</form>
				</div>
				<div className="detail-recurring-block">
					<div className="detail-label">Repeat from</div>
					<div className="detail-recurring-origin-row">
						<button
							className="detail-done-toggle"
							data-action="toggle-repeat-origin"
							type="button"
							onClick={() => void onRepeatOriginToggle(!repeatFromCurrentDate)}
						>
							<span className={`checkbox-button ${repeatFromCurrentDate ? 'is-checked' : ''}`.trim()}>
								{repeatFromCurrentDate ? '✓' : ''}
							</span>
							<span>{repeatFromCurrentDate ? 'Completion' : 'Due date'}</span>
						</button>
						<div className="detail-helper-text">
							{repeatFromCurrentDate
								? 'Next repeat is based on when you complete the task.'
								: 'Next repeat is based on the task due date.'}
						</div>
					</div>
				</div>
				<div className="detail-recurring-actions">
					<button
						className="ghost-button"
						data-action="clear-repeat"
						type="button"
						disabled={!repeatAfterValue}
						onClick={() => void onClearRecurring()}
					>
						Clear repeat
					</button>
					{repeatAfterValue ? (
						<div className="detail-meta" data-task-repeat-meta>
							{`Every ${formatRepeatInterval(repeatAfterValue)}`}
						</div>
					) : null}
				</div>
			</div>
		</CollapsibleSection>
	)
}

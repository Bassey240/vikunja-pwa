import CompactDatePicker from '@/components/common/CompactDatePicker'
import {useAppStore} from '@/store'
import {normalizeTaskDateValue} from '@/utils/formatting'
import type {TaskDateField} from '@/utils/task-detail-helpers'

export default function TaskDateControl({
	field,
	label,
	task,
	onClear,
	onChange,
}: {
	field: TaskDateField
	label: string
	task: {due_date?: string | null; start_date?: string | null; end_date?: string | null}
	onClear: (field: TaskDateField) => void
	onChange: (field: TaskDateField, value: string) => Promise<void>
}) {
	const defaultDueTime = useAppStore(state => state.account?.user?.settings?.frontend_settings?.default_due_time)
	const value = normalizeTaskDateValue(task[field] || null)
	const inputValue = value
		? new Date(value).toISOString()
		: ''

	return (
		<div className="detail-item detail-field">
			<div className="detail-label">{label}</div>
			<div className="detail-date-row">
				<CompactDatePicker
					label={label}
					value={inputValue}
					mode="datetime"
					defaultTime={field === 'due_date' ? defaultDueTime || undefined : undefined}
					allowEmpty={true}
					placeholder="DD/MM/YYYY HH:MM"
					showLabel={false}
					onChange={nextValue => void onChange(field, nextValue)}
				/>
				{inputValue ? (
					<button
						className="menu-button detail-date-clear"
						data-action="clear-detail-date"
						data-detail-date={field}
						type="button"
						aria-label={`Clear ${label} date`}
						onClick={() => void onClear(field)}
					>
						×
					</button>
				) : null}
			</div>
		</div>
	)
}

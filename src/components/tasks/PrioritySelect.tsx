interface PrioritySelectProps {
	value: number
	disabled?: boolean
	onChange: (value: number) => void
}

const priorityOptions = [
	{value: 0, label: 'Unset'},
	{value: 1, label: 'Priority 1'},
	{value: 2, label: 'Priority 2'},
	{value: 3, label: 'Priority 3'},
	{value: 4, label: 'Priority 4'},
	{value: 5, label: 'Priority 5'},
]

export default function PrioritySelect({value, disabled = false, onChange}: PrioritySelectProps) {
	return (
		<select
			className="detail-input"
			data-detail-priority
			disabled={disabled}
			value={value}
			onChange={event => onChange(Number(event.currentTarget.value))}
		>
			{priorityOptions.map(option => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	)
}

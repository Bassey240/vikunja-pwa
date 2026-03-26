import type {SavedFilter} from '@/types'

interface SavedFilterPickerProps {
	savedFilters: SavedFilter[]
	selectedProjectId: number | null
	onSelect: (projectId: number | null) => void
}

export default function SavedFilterPicker({
	savedFilters,
	selectedProjectId,
	onSelect,
}: SavedFilterPickerProps) {
	return (
		<select
			className="detail-input saved-filter-select"
			data-saved-filter-select
			value={selectedProjectId || 0}
			onChange={event => onSelect(Number(event.currentTarget.value) || null)}
		>
			<option value="0">Open saved filter</option>
			{savedFilters.map(filter => (
				<option key={filter.projectId} value={filter.projectId}>
					{filter.title}
				</option>
			))}
		</select>
	)
}

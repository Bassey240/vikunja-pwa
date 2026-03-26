import type {SavedFilter} from '@/types'

interface SavedFilterCardProps {
	filter: SavedFilter
	active: boolean
	onOpen: () => void
}

export default function SavedFilterCard({filter, active, onOpen}: SavedFilterCardProps) {
	return (
		<button
			className={`saved-filter-card ${active ? 'is-active' : ''}`.trim()}
			data-action="open-saved-filter"
			data-project-id={filter.projectId}
			type="button"
			onClick={onOpen}
		>
			<div className="saved-filter-card-head">
				<div className="saved-filter-card-title">{filter.title}</div>
				{filter.isFavorite ? <span className="meta-chip">Fav</span> : null}
			</div>
			<div className="saved-filter-card-meta">{filter.description || 'Cross-project saved filter'}</div>
		</button>
	)
}

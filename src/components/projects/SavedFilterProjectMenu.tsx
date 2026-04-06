import ContextMenu from '@/components/common/ContextMenu'
import type {MenuAnchor, SavedFilter} from '@/types'

interface SavedFilterProjectMenuProps {
	filter: SavedFilter
	anchor: MenuAnchor
	onOpen: () => void
	onEdit: () => void
	onDelete: () => void
}

export default function SavedFilterProjectMenu({
	filter,
	anchor,
	onOpen,
	onEdit,
	onDelete,
}: SavedFilterProjectMenuProps) {
	return (
		<ContextMenu anchor={anchor}>
			<button className="menu-item" data-action="open-saved-filter-project" data-project-id={filter.projectId} type="button" onClick={onOpen}>
				Open filter
			</button>
			<button className="menu-item" data-action="edit-saved-filter-project" data-saved-filter-id={filter.id} type="button" onClick={onEdit}>
				Edit filter
			</button>
			<button className="menu-item danger" data-action="delete-saved-filter-project" data-saved-filter-id={filter.id} type="button" onClick={onDelete}>
				Delete filter
			</button>
		</ContextMenu>
	)
}

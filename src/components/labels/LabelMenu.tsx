import ContextMenu from '@/components/common/ContextMenu'
import type {Label, MenuAnchor} from '@/types'

interface LabelMenuProps {
	label: Label
	anchor: MenuAnchor
	onEdit: () => void
	onDelete: () => void
}

export default function LabelMenu({label, anchor, onEdit, onDelete}: LabelMenuProps) {
	return (
		<ContextMenu anchor={anchor}>
			<button className="menu-item" data-action="edit-label" data-label-id={label.id} type="button" onClick={onEdit}>
				Edit label
			</button>
			<button className="menu-item danger" data-action="delete-label" data-label-id={label.id} type="button" onClick={onDelete}>
				Delete label
			</button>
		</ContextMenu>
	)
}

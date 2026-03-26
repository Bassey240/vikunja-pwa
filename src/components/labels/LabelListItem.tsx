import LabelBadge from './LabelBadge'
import LabelMenu from './LabelMenu'
import {useAppStore} from '@/store'
import type {Label} from '@/types'
import {getMenuAnchor} from '@/utils/menuPosition'

export default function LabelListItem({label}: {label: Label}) {
	const openMenu = useAppStore(state => state.openMenu)
	const toggleLabelMenu = useAppStore(state => state.toggleLabelMenu)
	const editLabel = useAppStore(state => state.editLabel)
	const deleteLabel = useAppStore(state => state.deleteLabel)

	const menuOpen = openMenu?.kind === 'label' && openMenu.id === label.id

	return (
		<div className={`label-list-item-wrap ${menuOpen ? 'is-menu-open' : ''}`.trim()}>
			<div className="label-list-item">
				<LabelBadge label={label} />
				<button
					className="menu-button"
					data-action="toggle-label-menu"
					data-label-id={label.id}
					data-menu-toggle="true"
					type="button"
					onClick={event => toggleLabelMenu(label.id, getMenuAnchor(event.currentTarget))}
				>
					⋯
				</button>
			</div>
			{menuOpen && openMenu.kind === 'label' ? (
				<LabelMenu
					label={label}
					anchor={openMenu.anchor}
					onEdit={() => void editLabel(label.id)}
					onDelete={() => void deleteLabel(label.id)}
				/>
			) : null}
		</div>
	)
}

import ContextMenu from '@/components/common/ContextMenu'
import type {MenuAnchor, Task} from '@/types'

interface TaskMenuProps {
	task: Task
	anchor: MenuAnchor
	showAddSubtask?: boolean
	onAddSubtask?: () => void
	extraItems?: Array<{
		action: string
		label: string
		onClick: () => void
	}>
	onEdit: () => void
	onDuplicate: () => void
	onDelete: () => void
}

export default function TaskMenu({
	task,
	anchor,
	showAddSubtask = false,
	onAddSubtask,
	extraItems = [],
	onEdit,
	onDuplicate,
	onDelete,
}: TaskMenuProps) {
	return (
		<ContextMenu anchor={anchor}>
			<button className="menu-item" data-action="edit-task" data-task-id={task.id} type="button" onClick={onEdit}>
				Edit task
			</button>
			{showAddSubtask && onAddSubtask ? (
				<button className="menu-item" data-action="open-subtask" data-task-id={task.id} type="button" onClick={onAddSubtask}>
					Add subtask
				</button>
			) : null}
			{extraItems.map(item => (
				<button
					key={item.action}
					className="menu-item"
					data-action={item.action}
					data-task-id={task.id}
					type="button"
					onClick={item.onClick}
				>
					{item.label}
				</button>
			))}
			<button className="menu-item" data-action="duplicate-task" data-task-id={task.id} type="button" onClick={onDuplicate}>
				Duplicate task
			</button>
			<button className="menu-item danger" data-action="delete-task" data-task-id={task.id} type="button" onClick={onDelete}>
				Delete task
			</button>
		</ContextMenu>
	)
}

import ContextMenu from '@/components/common/ContextMenu'
import type {MenuAnchor, Project} from '@/types'

interface ProjectMenuProps {
	project: Project
	anchor: MenuAnchor
	onShare: () => void
	onEdit: () => void
	onCreateTask: () => void
	onCreateSubproject: () => void
	onMoveToRoot: () => void
	onDuplicate: () => void
	onDelete: () => void
}

export default function ProjectMenu({
	project,
	anchor,
	onShare,
	onEdit,
	onCreateTask,
	onCreateSubproject,
	onMoveToRoot,
	onDuplicate,
	onDelete,
}: ProjectMenuProps) {
	const hasParent = Boolean(project.parent_project_id)

	return (
		<ContextMenu anchor={anchor}>
			<button className="menu-item" data-action="share-project" data-project-id={project.id} type="button" onClick={onShare}>
				Share project
			</button>
			<button className="menu-item" data-action="edit-project" data-project-id={project.id} type="button" onClick={onEdit}>
				Edit project
			</button>
			<button className="menu-item" data-action="open-root-composer" data-project-id={project.id} type="button" onClick={onCreateTask}>
				Add task
			</button>
			<button
				className="menu-item"
				data-action="open-project-composer"
				data-parent-project-id={project.id}
				type="button"
				onClick={onCreateSubproject}
			>
				Add sub-project
			</button>
			{hasParent ? (
				<button
					className="menu-item"
					data-action="move-project-to-root"
					data-project-id={project.id}
					type="button"
					onClick={onMoveToRoot}
				>
					Move to root level
				</button>
			) : null}
			<button className="menu-item" data-action="duplicate-project" data-project-id={project.id} type="button" onClick={onDuplicate}>
				Duplicate project
			</button>
			<button className="menu-item danger" data-action="delete-project" data-project-id={project.id} type="button" onClick={onDelete}>
				Delete project
			</button>
		</ContextMenu>
	)
}

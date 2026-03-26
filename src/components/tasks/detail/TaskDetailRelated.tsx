import DetailRelationComposer from '@/components/tasks/DetailRelationComposer'
import type {Task, TaskRelationKind, TaskRelationRef} from '@/types'
import {TASK_RELATION_LABELS} from '@/utils/taskRelations'
import type {ReactNode} from 'react'
import type {TaskDetailSection} from '@/utils/task-detail-helpers'
import CollapsibleSection from './CollapsibleSection'

export default function TaskDetailRelated({
	open,
	onToggle,
	taskId,
	projectId,
	parentTasks,
	subtasks,
	relationComposerOpen,
	onToggleRelationComposer,
	recentlyCompletedTaskIds,
	togglingTaskIds,
	onOpenRelatedTask,
	onToggleTaskDone,
	onRemoveTaskRelation,
	extraRelationKinds,
	relatedTasksByKind,
}: {
	open: boolean
	onToggle: (section: TaskDetailSection) => void
	taskId: number
	projectId: number
	parentTasks: TaskRelationRef[]
	subtasks: Task[]
	relationComposerOpen: boolean
	onToggleRelationComposer: () => void
	recentlyCompletedTaskIds: Set<number>
	togglingTaskIds: Set<number>
	onOpenRelatedTask: (taskRef: TaskRelationRef) => void
	onToggleTaskDone: (taskId: number) => void
	onRemoveTaskRelation: (relationKind: TaskRelationKind, otherTaskId: number) => void
	extraRelationKinds: TaskRelationKind[]
	relatedTasksByKind: Partial<Record<TaskRelationKind, TaskRelationRef[]>>
}) {
	function renderRelationRows(
		relationKind: TaskRelationKind,
		relationTasks: TaskRelationRef[],
		emptyLabel: ReactNode = 'None',
	) {
		if (relationTasks.length === 0) {
			return <div className="detail-value">{emptyLabel}</div>
		}

		return (
			<div className="detail-subtasks">
				{relationTasks.map(relationTask => (
					<div key={`${relationKind}-${relationTask.id}`} className="detail-subtask-row detail-relation-row">
						<div className="detail-relation-title-wrap">
							<button className="detail-subtask-title" type="button" onClick={() => onOpenRelatedTask(relationTask)}>
								{relationTask.title}
							</button>
						</div>
						<button
							className="ghost-button detail-relation-remove"
							type="button"
							onClick={() => void onRemoveTaskRelation(relationKind, relationTask.id)}
						>
							Remove
						</button>
					</div>
				))}
			</div>
		)
	}

	const extraRelationGroups = extraRelationKinds
		.map(relationKind => ({
			relationKind,
			label: TASK_RELATION_LABELS[relationKind],
			tasks: relatedTasksByKind[relationKind] || [],
		}))
		.filter(group => group.tasks.length > 0)

	return (
		<CollapsibleSection title="Related" section="related" open={open} onToggle={onToggle}>
			<div className="detail-item detail-field">
				<div className="detail-section-head">
					<div className="detail-label">Parent</div>
				</div>
				{renderRelationRows('parenttask', parentTasks)}
			</div>
			<div className="detail-item detail-field">
				<div className="detail-section-head">
					<div className="detail-label">Subtasks</div>
					<button
						className="mini-fab"
						data-action="open-detail-relation-composer"
						type="button"
						aria-label="Add relation"
						onClick={onToggleRelationComposer}
					>
						+
					</button>
				</div>
				{relationComposerOpen ? (
					<DetailRelationComposer
						taskId={taskId}
						projectId={projectId}
						defaultRelationKind="subtask"
						onDone={onToggleRelationComposer}
					/>
				) : null}
				<div className="detail-subtasks">
					{subtasks.length > 0 ? subtasks.map(subtask => (
						<div key={subtask.id} className={`detail-subtask-row ${recentlyCompletedTaskIds.has(subtask.id) ? 'is-completing' : ''}`.trim()}>
							<button
								className={`checkbox-button ${subtask.done ? 'is-checked' : ''}`.trim()}
								data-action="toggle-done"
								data-task-id={subtask.id}
								aria-checked={subtask.done ? 'true' : 'false'}
								role="checkbox"
								disabled={togglingTaskIds.has(subtask.id)}
								type="button"
								onClick={() => void onToggleTaskDone(subtask.id)}
							>
								{subtask.done ? '✓' : ''}
							</button>
							<button
								className="detail-subtask-title"
								data-action="open-task-detail"
								data-task-id={subtask.id}
								type="button"
								onClick={() => onOpenRelatedTask(subtask)}
							>
								{subtask.title}
							</button>
							<button
								className="ghost-button detail-relation-remove"
								type="button"
								onClick={() => void onRemoveTaskRelation('subtask', subtask.id)}
							>
								Remove
							</button>
						</div>
					)) : <div className="detail-value">No subtasks</div>}
				</div>
			</div>
			{extraRelationGroups.map(group => (
				<div key={group.relationKind} className="detail-item detail-field">
					<div className="detail-section-head">
						<div className="detail-label">{group.label}</div>
					</div>
					{renderRelationRows(group.relationKind, group.tasks)}
				</div>
			))}
		</CollapsibleSection>
	)
}

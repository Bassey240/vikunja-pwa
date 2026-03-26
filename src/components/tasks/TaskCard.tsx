import {Fragment} from 'react'
import type {Task} from '@/types'
import {
	formatRepeatInterval,
	formatShortDate,
	getUserDisplayName,
	getUserInitials,
	normalizePercentDone,
	normalizeRepeatAfter,
	normalizeTaskDateValue,
} from '@/utils/formatting'

interface TaskCardProps {
	task: Task
	childCount: number
	compact?: boolean
}

export default function TaskCard({task, childCount, compact = false}: TaskCardProps) {
	const dueDateValue = normalizeTaskDateValue(task.due_date || null)
	const dueDate = dueDateValue ? formatShortDate(dueDateValue) : ''
	const percentDone = normalizePercentDone(task.percent_done)
	const repeatAfter = normalizeRepeatAfter(task.repeat_after)
	const repeatLabel = repeatAfter ? `Repeats every ${formatRepeatInterval(repeatAfter)}` : ''
	const commentCount = Math.max(0, Number(task.comment_count || 0))
	const metaParts = [
		percentDone > 0
			? {
				key: 'progress',
				label: `${percentDone}%`,
				attribute: {'data-task-percent-done': 'true'},
			}
			: null,
		dueDate
			? {
				key: 'due',
				label: dueDate,
				attribute: {'data-task-due-date': 'true'},
			}
			: null,
		repeatLabel
			? {
				key: 'repeat',
				label: repeatLabel,
				attribute: {'data-task-repeat': 'true'},
			}
			: null,
		childCount > 0
			? {
				key: 'subtasks',
				label: `${childCount} ${childCount === 1 ? 'subtask' : 'subtasks'}`,
				attribute: {'data-task-subtask-count': 'true'},
			}
			: null,
		commentCount > 0
			? {
				key: 'comments',
				label: `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`,
				attribute: {'data-task-comment-count': 'true'},
			}
			: null,
	].filter(Boolean)
	const labels = Array.isArray(task.labels) ? task.labels.filter(label => label?.id) : []
	const visibleLabels = labels.slice(0, compact ? 2 : 3)
	const overflowCount = labels.length - visibleLabels.length
	const assignees = Array.isArray(task.assignees) ? task.assignees.filter(assignee => assignee?.id) : []
	const visibleAssignees = assignees.slice(0, compact ? 2 : 3)
	const assigneeOverflowCount = assignees.length - visibleAssignees.length
	const hasIdentityRow = visibleLabels.length > 0 || visibleAssignees.length > 0 || overflowCount > 0 || assigneeOverflowCount > 0

	return (
		<div className="card-copy">
			<div className="card-title task-title">{task.title}</div>
			{metaParts.length > 0 ? (
				<div className="card-meta task-card-meta">
					{metaParts.map((part, index) => (
						<Fragment key={part.key}>
							{index > 0 ? <span aria-hidden="true"> · </span> : null}
							<span {...part.attribute}>{part.label}</span>
						</Fragment>
					))}
				</div>
			) : null}
			{hasIdentityRow ? (
				<div className="task-label-row">
					{visibleLabels.map(label => {
						const hex = label.hex_color || label.hexColor || ''
						const background = hex ? (hex.startsWith('#') ? hex : `#${hex}`) : '#dbe8ff'
						return (
							<span
								key={label.id}
								className="task-label-chip"
								style={{
									background,
									color: pickLabelTextColor(background),
								}}
							>
								{label.title}
							</span>
						)
					})}
					{overflowCount > 0 ? (
						<span className="task-label-chip task-label-chip-overflow">+{overflowCount}</span>
					) : null}
					{visibleAssignees.map(assignee => (
						<span
							key={assignee.id}
							className="task-assignee-chip"
							title={getUserDisplayName(assignee)}
							data-task-assignee-pill={assignee.id}
						>
							{getUserInitials(assignee)}
						</span>
					))}
					{assigneeOverflowCount > 0 ? (
						<span className="task-assignee-chip task-assignee-chip-overflow">+{assigneeOverflowCount}</span>
					) : null}
				</div>
			) : null}
		</div>
	)
}

function pickLabelTextColor(hex: string) {
	const normalized = hex.replace('#', '')
	if (normalized.length !== 6) {
		return '#170f0d'
	}

	const red = parseInt(normalized.slice(0, 2), 16)
	const green = parseInt(normalized.slice(2, 4), 16)
	const blue = parseInt(normalized.slice(4, 6), 16)
	const brightness = (red * 299 + green * 587 + blue * 114) / 1000

	return brightness > 170 ? '#170f0d' : '#fff7f1'
}

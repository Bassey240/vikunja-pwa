import type {Task} from '@/types'
import {formatShortDate, getUserDisplayName, normalizePercentDone} from '@/utils/formatting'

const PRIORITY_LABELS = ['Unset', 'Low', 'Low', 'Medium', 'High', 'Very high', 'Urgent']

export default function GanttBarTooltip({
	task,
	startDate,
	endDate,
}: {
	task: Task
	startDate: Date
	endDate: Date
}) {
	const percentDone = normalizePercentDone(task.percent_done)
	const assignees = Array.isArray(task.assignees) ? task.assignees.filter(assignee => assignee?.id) : []
	const priority = Number(task.priority || 0)
	const priorityLabel = PRIORITY_LABELS[priority] || PRIORITY_LABELS[0]

	return (
		<div className="gantt-hover-tooltip">
			<div className="gantt-tooltip-title">{task.title}</div>
			<div className="gantt-tooltip-row">
				{formatShortDate(startDate)} — {formatShortDate(endDate)}
			</div>
			<div className="gantt-tooltip-row">Progress: {percentDone}%</div>
			<div className="gantt-tooltip-row">Priority: {priorityLabel}</div>
			{assignees.length > 0 ? (
				<div className="gantt-tooltip-row">
					Assignees: {assignees.map(assignee => getUserDisplayName(assignee)).join(', ')}
				</div>
			) : null}
		</div>
	)
}

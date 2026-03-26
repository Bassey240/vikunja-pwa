import type {Task} from '@/types'
import PrioritySelect from '@/components/tasks/PrioritySelect'
import {normalizePercentDone} from '@/utils/formatting'
import type {TaskDateField, TaskDetailSection} from '@/utils/task-detail-helpers'
import CollapsibleSection from './CollapsibleSection'
import TaskDateControl from './TaskDateControl'

export default function TaskDetailPlanning({
	open,
	onToggle,
	task,
	percentDone,
	onPriorityChange,
	onPercentDoneChange,
	onPercentDoneCommit,
	onClearDate,
	onDateChange,
}: {
	open: boolean
	onToggle: (section: TaskDetailSection) => void
	task: Task
	percentDone: number
	onPriorityChange: (value: number) => void
	onPercentDoneChange: (value: number) => void
	onPercentDoneCommit: (value: number) => void
	onClearDate: (field: TaskDateField) => void
	onDateChange: (field: TaskDateField, value: string) => Promise<void>
}) {
	return (
		<CollapsibleSection title="Planning" section="planning" open={open} onToggle={onToggle}>
			<div className="detail-planning-card">
				<div className="detail-grid detail-grid-nested detail-grid-tight">
					<label className="detail-item detail-field">
						<div className="detail-label">Priority</div>
						<PrioritySelect value={Number(task.priority || 0)} onChange={value => void onPriorityChange(value)} />
					</label>
					<label className="detail-item detail-item-full detail-field">
						<div className="detail-section-head">
							<div className="detail-label">Progress</div>
							<div className="detail-meta" data-detail-percent-done-value>
								{percentDone}%
							</div>
						</div>
						<div className="detail-range-row">
							<input
								className="detail-range-input"
								data-detail-percent-done
								type="range"
								min="0"
								max="100"
								step="1"
								value={percentDone}
								onChange={event => onPercentDoneChange(normalizePercentDone(event.currentTarget.value))}
								onPointerUp={event => onPercentDoneCommit(normalizePercentDone(event.currentTarget.value))}
								onBlur={event => onPercentDoneCommit(normalizePercentDone(event.currentTarget.value))}
							/>
							<div className="detail-range-scale" aria-hidden="true">
								<span>0%</span>
								<span>100%</span>
							</div>
						</div>
					</label>
					<TaskDateControl field="due_date" label="Due" task={task} onClear={onClearDate} onChange={onDateChange} />
					<TaskDateControl field="start_date" label="Start" task={task} onClear={onClearDate} onChange={onDateChange} />
					<TaskDateControl field="end_date" label="End" task={task} onClear={onClearDate} onChange={onDateChange} />
				</div>
			</div>
		</CollapsibleSection>
	)
}

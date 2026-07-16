import TaskBranch from './TaskBranch'
import type {TaskSortBy} from '@/hooks/useFilters'
import {getVisibleRootTasksFor, type TaskMatcher} from '@/store/selectors'
import type {Task} from '@/types'

interface TaskTreeProps {
	taskList: Task[]
	compact?: boolean
	matcher?: TaskMatcher
	sortBy?: TaskSortBy
	bulkMode?: boolean
	rootParentTaskId?: number | null
	focusProjectIdOverride?: number | null
	savedFilterProjectId?: number | null
	onMoveToDate?: (task: Task) => void
	// Flat mode renders every matched task as its own root with no subtask
	// nesting — used by the calendar's selected-day list so it matches the grid,
	// where each dated task (parent or subtask) stands on its own.
	flat?: boolean
}

export default function TaskTree({
	taskList,
	compact = false,
	matcher,
	sortBy = 'position',
	bulkMode = false,
	rootParentTaskId = null,
	focusProjectIdOverride = null,
	savedFilterProjectId = null,
	onMoveToDate,
	flat = false,
}: TaskTreeProps) {
	const matchedFlat = flat
		? taskList.filter(task => (matcher ? matcher(task) : !task.done))
		: []
	const rootTasks = flat ? matchedFlat : getVisibleRootTasksFor(taskList, matcher, sortBy)

	return (
		<div
			className="task-tree"
			data-root-parent-task-id={rootParentTaskId || undefined}
			data-saved-filter-project-id={savedFilterProjectId || undefined}
		>
			{rootTasks.map(task => (
				<TaskBranch
					key={task.id}
					task={task}
					depth={0}
					taskList={taskList}
					parentTaskId={null}
					compact={compact}
					matcher={matcher}
					sortBy={sortBy}
					bulkMode={bulkMode}
					flat={flat}
					onMoveToDate={onMoveToDate}
					focusProjectIdOverride={focusProjectIdOverride}
				/>
			))}
		</div>
	)
}

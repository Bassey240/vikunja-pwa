import DatePickerOverlay from '@/components/common/DatePickerOverlay'
import {useAppStore} from '@/store'
import type {Task} from '@/types'
import {placeTask} from '@/utils/calendar-placement'

// "Move to date" for project/list rows — the same large date overlay the calendar
// uses, seeded with the task's current day. Picking a day shifts the anchor through
// moveTaskToDay (keeping time-of-day and all-day-ness).
export default function MoveToDateField({task, onClose}: {task: Task; onClose: () => void}) {
	const moveTaskToDay = useAppStore(state => state.moveTaskToDay)
	const startKey = placeTask(task)?.startDayKey ?? ''

	return (
		<DatePickerOverlay
			title="Move to date"
			value={startKey}
			onCommit={dayKey => {
				void moveTaskToDay(task.id, dayKey)
				onClose()
			}}
			onClose={onClose}
		/>
	)
}

import {useEffect, useState} from 'react'
import {useAppStore} from '@/store'
import {findTaskInAnyContext} from '@/store/selectors'
import {getTaskCollections} from '@/store/task-helpers'
import {isTimeTrackingAvailable} from '@/store/slices/time-tracking'
import {formatTimerClock, getTimeEntryDurationSeconds, isRunningTimeEntry} from '@/utils/time-tracking'

export default function RunningTimerBar() {
	const available = useAppStore(isTimeTrackingAvailable)
	const runningTimeEntry = useAppStore(state => state.runningTimeEntry)
	const timeTrackingMutating = useAppStore(state => state.timeTrackingMutating)
	const stopRunningTimer = useAppStore(state => state.stopRunningTimer)
	const openTaskDetail = useAppStore(state => state.openTaskDetail)
	const runningTaskId = Number(runningTimeEntry?.task_id || 0)
	const runningTaskTitle = useAppStore(state => (
		runningTaskId > 0 ? findTaskInAnyContext(runningTaskId, getTaskCollections(state))?.title : ''
	))
	const running = isRunningTimeEntry(runningTimeEntry)
	const [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		if (!running) {
			return
		}

		const timer = window.setInterval(() => setNow(Date.now()), 1000)
		return () => window.clearInterval(timer)
	}, [running])

	if (!available || !running || !runningTimeEntry) {
		return null
	}

	return (
		<div className="running-timer-bar" data-running-timer-bar role="status" aria-live="off">
			<div className="running-timer-bar-copy">
				<div className="running-timer-bar-clock" data-running-timer-clock>
					{formatTimerClock(getTimeEntryDurationSeconds(runningTimeEntry, now))}
				</div>
				<div className="running-timer-bar-title">{runningTaskTitle || 'Timer running'}</div>
			</div>
			{runningTaskId > 0 ? (
				<button
					className="pill-button subtle"
					type="button"
					data-action="open-running-timer-task"
					onClick={() => {
						void openTaskDetail(runningTaskId)
					}}
				>
					Open
				</button>
			) : null}
			<button
				className="ghost-button subtle"
				type="button"
				data-action="stop-running-timer"
				disabled={timeTrackingMutating}
				onClick={() => {
					void stopRunningTimer()
				}}
			>
				Stop
			</button>
		</div>
	)
}

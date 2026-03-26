import CollectionScreen from '@/components/screens/CollectionScreen'
import {useAppStore} from '@/store'
import {useEffect} from 'react'

export default function TodayScreen() {
	const connected = useAppStore(state => state.connected)
	const inboxProjectId = useAppStore(state => state.inboxProjectId)
	const todayTasks = useAppStore(state => state.todayTasks)
	const loadingToday = useAppStore(state => state.loadingToday)
	const loadTodayTasks = useAppStore(state => state.loadTodayTasks)
	const openRootComposer = useAppStore(state => state.openRootComposer)

	useEffect(() => {
		if (connected) {
			void loadTodayTasks()
		}
	}, [connected, loadTodayTasks])

	return (
		<CollectionScreen
			bulkScopeKey="today"
			compact={true}
			emptyMessage="No tasks due today."
			loading={loadingToday}
			loadingMessage="Loading today's tasks..."
			menuAction="toggle-today-menu"
			sourceScreen="today"
			taskList={todayTasks}
			title="Today"
			onOpenComposer={() => openRootComposer({
				placement: 'center',
				projectId: inboxProjectId,
				defaultDueToday: true,
			})}
		/>
	)
}

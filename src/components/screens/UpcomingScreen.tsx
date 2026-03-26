import CollectionScreen from '@/components/screens/CollectionScreen'
import {useAppStore} from '@/store'
import {useEffect} from 'react'

export default function UpcomingScreen() {
	const connected = useAppStore(state => state.connected)
	const upcomingTasks = useAppStore(state => state.upcomingTasks)
	const loadingUpcoming = useAppStore(state => state.loadingUpcoming)
	const loadUpcomingTasks = useAppStore(state => state.loadUpcomingTasks)
	const openRootComposer = useAppStore(state => state.openRootComposer)

	useEffect(() => {
		if (connected) {
			void loadUpcomingTasks()
		}
	}, [connected, loadUpcomingTasks])

	return (
		<CollectionScreen
			bulkScopeKey="upcoming"
			compact={true}
			emptyMessage="No upcoming due tasks."
			loading={loadingUpcoming}
			loadingMessage="Loading upcoming tasks..."
			menuAction="toggle-upcoming-menu"
			sourceScreen="upcoming"
			taskList={upcomingTasks}
			title="Upcoming"
			onOpenComposer={() => openRootComposer({placement: 'center'})}
		/>
	)
}

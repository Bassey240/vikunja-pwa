import CollectionScreen from '@/components/screens/CollectionScreen'
import {useAppStore} from '@/store'
import {useEffect} from 'react'
import {useSearchParams} from 'react-router-dom'

export default function InboxScreen() {
	const connected = useAppStore(state => state.connected)
	const projects = useAppStore(state => state.projects)
	const defaultProjectId = useAppStore(state => state.defaultProjectId)
	const inboxProjectId = useAppStore(state => state.inboxProjectId)
	const inboxTasks = useAppStore(state => state.inboxTasks)
	const loadingInbox = useAppStore(state => state.loadingInbox)
	const loadInboxTasks = useAppStore(state => state.loadInboxTasks)
	const openRootComposer = useAppStore(state => state.openRootComposer)
	const [searchParams, setSearchParams] = useSearchParams()

	useEffect(() => {
		if (connected) {
			void loadInboxTasks()
		}
	}, [connected, defaultProjectId, loadInboxTasks, projects.length])

	useEffect(() => {
		if (!connected) {
			return
		}
		const compose = searchParams.get('compose')
		if (!compose) {
			return
		}
		const title = searchParams.get('title') || ''
		openRootComposer({placement: 'sheet', initialTitle: title})
		// Drop the query params so back-navigation or refresh doesn't re-fire.
		const next = new URLSearchParams(searchParams)
		next.delete('compose')
		next.delete('title')
		setSearchParams(next, {replace: true})
	}, [connected, openRootComposer, searchParams, setSearchParams])

	const inboxProject = projects.find(project => project.id === inboxProjectId) || null

	return (
		<CollectionScreen
			bulkScopeKey="inbox"
			emptyMessage="No open tasks in this inbox right now."
			loading={loadingInbox}
			loadingMessage="Loading inbox tasks..."
			menuAction="toggle-inbox-menu"
			sourceScreen="inbox"
			taskList={inboxTasks}
			taskListEnabled={Boolean(inboxProject)}
			title="Inbox"
			unavailableMessage={inboxProject ? null : 'No default or Inbox project is available on this account yet.'}
			onOpenComposer={() => openRootComposer({placement: 'center'})}
		/>
	)
}

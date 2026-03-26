import useWideLayout from '@/hooks/useWideLayout'
import {useAppStore} from '@/store'

export default function StatusCards() {
	const isWideLayout = useWideLayout()
	const connected = useAppStore(state => state.connected)
	const account = useAppStore(state => state.account)
	const isOnline = useAppStore(state => state.isOnline)
	const offlineReadOnlyMode = useAppStore(state => state.offlineReadOnlyMode)
	const error = useAppStore(state => state.error)
	const linkShareAuth = account?.linkShareAuth === true
	const offlineNotice =
		isWideLayout && connected && !linkShareAuth && !isOnline
			? offlineReadOnlyMode
				? 'You’re offline. The last known signed-in state is restored in read-only mode until the connection returns.'
				: 'You’re offline. Cached screens stay available, but syncing and edits may fail until the connection returns.'
			: null

	if (!offlineNotice && !error) {
		return null
	}

	return (
		<>
			{offlineNotice ? (
				<section className="runtime-status-banner runtime-status-banner-warning desktop-runtime-status-card" role="status" aria-live="polite">
					{offlineNotice}
				</section>
			) : null}
			{error ? <section className="status-card danger">{error}</section> : null}
		</>
	)
}

import useWideLayout from '@/hooks/useWideLayout'
import {useAppStore} from '@/store'
import {normalizeVikunjaDateValue} from '@/utils/formatting'

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
				? 'You’re offline. Changes you make here are saved locally and will sync when the connection returns.'
				: 'You’re offline. Cached screens stay available, and offline changes queue until the connection returns.'
			: null
	const deletionNotice = buildDeletionNotice(account?.user?.deletionScheduledAt)

	if (!offlineNotice && !deletionNotice && !error) {
		return null
	}

	return (
		<>
			{offlineNotice ? (
				<section className="runtime-status-banner runtime-status-banner-warning desktop-runtime-status-card" role="status" aria-live="polite">
					{offlineNotice}
				</section>
			) : null}
			{deletionNotice ? <section className="status-card warning">{deletionNotice}</section> : null}
			{error ? <section className="status-card danger">{error}</section> : null}
		</>
	)
}

function buildDeletionNotice(value: string | null | undefined) {
	const normalized = normalizeVikunjaDateValue(value)
	if (!normalized) {
		return null
	}

	const scheduledAt = new Date(normalized)
	if (Number.isNaN(scheduledAt.getTime())) {
		return 'Your account is scheduled for deletion. Open Settings > Account to review or cancel it.'
	}

	const diffMs = scheduledAt.getTime() - Date.now()
	const diffDays = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)))
	const relative =
		diffDays <= 0
			? 'today'
			: diffDays === 1
				? 'tomorrow'
				: `in ${diffDays} days`

	return `Your account is scheduled for deletion ${relative}. Open Settings > Account to review or cancel it.`
}

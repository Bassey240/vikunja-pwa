import type {OfflineMutationEntry} from '@/store/offline-queue'
import {
	isAppleMobileWeb,
	type SettingsSectionId,
} from '@/utils/settings-helpers'
import {useEffect, useState} from 'react'
import SettingsSection from './SettingsSection'

export default function SettingsOfflineSection({
	open,
	onToggle,
	isOnline,
	serviceWorkerSupported,
	serviceWorkerRegistered,
	serviceWorkerUpdateAvailable,
	serviceWorkerError,
	isSecureContext,
	standaloneWebApp,
	offlineQueueCount,
	offlineQueueFailedCount,
	offlineSyncInProgress,
	onRefreshOfflineQueueCounts,
	onApplyServiceWorkerUpdate,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	isOnline: boolean
	serviceWorkerSupported: boolean
	serviceWorkerRegistered: boolean
	serviceWorkerUpdateAvailable: boolean
	serviceWorkerError: string | null
	isSecureContext: boolean
	standaloneWebApp: boolean
	offlineQueueCount: number
	offlineQueueFailedCount: number
	offlineSyncInProgress: boolean
	onRefreshOfflineQueueCounts: () => Promise<void>
	onApplyServiceWorkerUpdate: () => void
}) {
	const appleMobileWeb = isAppleMobileWeb()
	const [queueEntries, setQueueEntries] = useState<OfflineMutationEntry[]>([])
	const offlineShellStatusLabel = !serviceWorkerSupported
		? 'Unsupported'
		: serviceWorkerRegistered
			? serviceWorkerUpdateAvailable
				? 'Update ready'
				: 'Ready'
			: 'Preparing'
	const offlineSupportMessage = !serviceWorkerSupported
		? appleMobileWeb
			? isSecureContext
				? 'Offline shell is unavailable in this browser context. On iPhone and iPad, install the HTTPS app to the Home Screen to use the real PWA runtime.'
				: standaloneWebApp
					? 'The installed iPhone/iPad app is detected, but this origin is not secure. Offline support still requires the app to be served over trusted HTTPS.'
					: 'Offline shell is unavailable here because this page is not running in a secure HTTPS context. On phone, offline support requires HTTPS.'
			: isSecureContext
				? 'This browser context does not expose service workers, so the app shell cannot be cached here.'
				: 'Offline shell is unavailable because this page is not running in a secure context. Use HTTPS to enable service workers.'
		: 'Offline mode keeps the app shell, cached browse state, and previously loaded project/task screens available after one successful online load.'

	useEffect(() => {
		if (!open) {
			return
		}

		void loadQueue()
	}, [offlineQueueCount, offlineQueueFailedCount, open])

	async function loadQueue() {
		const {getAllMutations} = await import('@/store/offline-queue')
		setQueueEntries(await getAllMutations())
	}

	async function handleCancel(id: string) {
		const {removeMutation} = await import('@/store/offline-queue')
		await removeMutation(id)
		await loadQueue()
		await onRefreshOfflineQueueCounts()
	}

	async function handleRetry(id: string) {
		const {retryMutation} = await import('@/store/offline-queue')
		await retryMutation(id)
		await loadQueue()
		await onRefreshOfflineQueueCounts()
	}

	return (
		<SettingsSection title="Offline" section="offline" open={open} onToggle={onToggle}>
			<div className="detail-grid">
				<div className="detail-item detail-field">
					<div className="detail-label">Connection</div>
					<div className="detail-value">{isOnline ? 'Online' : 'Offline'}</div>
				</div>
				<div className="detail-item detail-field">
					<div className="detail-label">Offline shell</div>
					<div className="detail-value">{offlineShellStatusLabel}</div>
				</div>
				<div className="detail-item detail-field">
					<div className="detail-label">Cache updates</div>
					<div className="detail-value">{serviceWorkerUpdateAvailable ? 'Waiting to apply' : 'Current'}</div>
				</div>
				<div className="detail-item detail-field">
					<div className="detail-label">Queued changes</div>
					<div className="detail-value">{offlineQueueCount}</div>
				</div>
				<div className="detail-item detail-field">
					<div className="detail-label">Failed syncs</div>
					<div className="detail-value">{offlineQueueFailedCount}</div>
				</div>
			</div>
			<div className="settings-action-row">
				{serviceWorkerUpdateAvailable ? (
					<button className="pill-button subtle" type="button" onClick={onApplyServiceWorkerUpdate}>
						Apply cached update
					</button>
				) : null}
			</div>
			<div className="empty-state compact">
				{offlineSupportMessage} Changes made offline are saved locally and sync automatically when
				you reconnect. File uploads and sharing changes still require a connection.
			</div>
			{!isOnline ? (
				<div className="empty-state compact">
					You are currently offline. Cached screens stay available and supported edits queue until
					the connection returns.
				</div>
			) : null}
			<section className="settings-section">
				<h3>Pending offline changes</h3>
				{offlineSyncInProgress ? <p className="detail-helper-text">Syncing queued changes…</p> : null}
				{queueEntries.length === 0 ? (
					<p className="text-muted">No pending changes.</p>
				) : (
					<ul className="offline-queue-list">
						{queueEntries.map(entry => (
							<li key={entry.id} className={`offline-queue-item is-${entry.status}`}>
								<div className="offline-queue-description">{entry.metadata.description}</div>
								<div className="offline-queue-meta">
									<span className="offline-queue-status">{entry.status}</span>
									{entry.lastError ? <span className="offline-queue-error">{entry.lastError}</span> : null}
								</div>
								<div className="offline-queue-actions">
									{entry.status === 'failed' ? (
										<button className="pill-button subtle" type="button" onClick={() => {
											void handleRetry(entry.id)
										}}>
											Retry
										</button>
									) : null}
									{entry.status !== 'syncing' ? (
										<button className="pill-button subtle danger" type="button" onClick={() => {
											void handleCancel(entry.id)
										}}>
											Cancel
										</button>
									) : null}
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
			{serviceWorkerError ? <div className="detail-helper-text">{serviceWorkerError}</div> : null}
		</SettingsSection>
	)
}

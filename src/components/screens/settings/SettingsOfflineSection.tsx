import {
	isAppleMobileWeb,
	type SettingsSectionId,
} from '@/utils/settings-helpers'
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
	onApplyServiceWorkerUpdate: () => void
}) {
	const appleMobileWeb = isAppleMobileWeb()
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
		: 'Offline mode currently keeps the app shell, cached browse state, and previously loaded project/task screens available after one successful online load. Writes and live sync still require a connection.'

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
			</div>
			<div className="settings-action-row">
				{serviceWorkerUpdateAvailable ? (
					<button className="pill-button subtle" type="button" onClick={onApplyServiceWorkerUpdate}>
						Apply cached update
					</button>
				) : null}
			</div>
			<div className="empty-state compact">{offlineSupportMessage}</div>
			{!isOnline ? (
				<div className="empty-state compact">
					You are currently offline. Cached screens stay available in read-only mode until the
					connection returns.
				</div>
			) : null}
			{serviceWorkerError ? <div className="detail-helper-text">{serviceWorkerError}</div> : null}
		</SettingsSection>
	)
}

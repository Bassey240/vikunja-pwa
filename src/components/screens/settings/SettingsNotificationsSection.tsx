import {type FormEvent, useEffect, useState} from 'react'
import type {
	NotificationSettingsForm,
	UserFrontendSettings,
} from '@/types'
import {
	defaultNotificationPreferences,
	normalizeNotificationPreferences,
	notificationPreferenceDefinitions,
} from '@/utils/notificationPreferences'
import {
	compareVersions,
	getIosVersion,
	isAppleMobileWeb,
	type SettingsSectionId,
} from '@/utils/settings-helpers'
import SettingsSection from './SettingsSection'

export default function SettingsNotificationsSection({
	open,
	onToggle,
	frontendSettings,
	emailDeliveryAvailable,
	emailRemindersEnabled,
	overdueTasksRemindersEnabled,
	accountIsAdmin,
	pushManagerSupported,
	isSecureContext,
	standaloneWebApp,
	browserNotificationsSupported,
	browserNotificationPermission,
	notificationPermissionRequesting,
	notificationPreferencesSubmitting,
	onRefreshRuntimeState,
	onRequestBrowserNotificationPermission,
	onSendTestBrowserNotification,
	onSubmit,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	frontendSettings: UserFrontendSettings | null | undefined
	emailDeliveryAvailable: boolean
	emailRemindersEnabled: boolean
	overdueTasksRemindersEnabled: boolean
	accountIsAdmin: boolean
	pushManagerSupported: boolean
	isSecureContext: boolean
	standaloneWebApp: boolean
	browserNotificationsSupported: boolean
	browserNotificationPermission: NotificationPermission | 'unsupported'
	notificationPermissionRequesting: boolean
	notificationPreferencesSubmitting: boolean
	onRefreshRuntimeState: () => void
	onRequestBrowserNotificationPermission: () => void
	onSendTestBrowserNotification: () => void
	onSubmit: (settings: NotificationSettingsForm) => Promise<boolean>
}) {
	const [notificationPreferencesForm, setNotificationPreferencesForm] = useState(defaultNotificationPreferences)
	const [emailRemindersEnabledForm, setEmailRemindersEnabledForm] = useState(false)
	const [overdueTasksRemindersEnabledForm, setOverdueTasksRemindersEnabledForm] = useState(false)

	useEffect(() => {
		setNotificationPreferencesForm(normalizeNotificationPreferences(frontendSettings))
		setEmailRemindersEnabledForm(emailRemindersEnabled)
		setOverdueTasksRemindersEnabledForm(overdueTasksRemindersEnabled)
	}, [emailRemindersEnabled, frontendSettings, overdueTasksRemindersEnabled])

	const appleMobileWeb = isAppleMobileWeb()
	const iosVersion = getIosVersion()
	const browserNotificationStatusLabel =
		browserNotificationPermission === 'granted'
			? 'Enabled'
			: browserNotificationPermission === 'denied'
				? 'Blocked'
				: browserNotificationPermission === 'default'
					? 'Not enabled'
					: 'Unsupported'
	const browserNotificationMessage =
		browserNotificationPermission === 'denied'
			? appleMobileWeb
				? standaloneWebApp
					? isSecureContext
						? 'Browser notifications are blocked for this installed app. Re-enable them in iPhone Settings or Safari site settings to use alerts here.'
						: 'The installed iPhone/iPad app is detected, but this origin is not secure. Notifications still require the app to be served over trusted HTTPS.'
					: 'Notifications are blocked in this browser context. On iPhone and iPad, notifications work from the installed HTTPS app opened from the Home Screen.'
				: 'Browser notifications are blocked for this site. Re-enable them in the browser site settings to use alerts here.'
			: browserNotificationPermission === 'default'
				? appleMobileWeb
					? standaloneWebApp
						? isSecureContext
							? 'Notifications can be enabled from this installed app.'
							: 'The installed iPhone/iPad app is detected, but this origin is not secure. Notifications still require trusted HTTPS.'
						: 'Notifications can only be enabled from the installed HTTPS app on iPhone and iPad. If you are testing in Safari on a phone, add the app to the Home Screen first.'
					: 'Browser notifications are available here, but permission has not been granted yet.'
				: !browserNotificationsSupported
					? 'This browser does not expose the Notifications API, so only the in-app notification tray is available.'
					: browserNotificationPermission === 'granted'
						? appleMobileWeb && !standaloneWebApp
							? 'Notifications are allowed, but reliable mobile web alerts on iPhone and iPad still expect the installed HTTPS app.'
							: appleMobileWeb && standaloneWebApp && !isSecureContext
								? 'Notifications are allowed in principle, but this installed iPhone/iPad app is still running on an insecure origin. Use trusted HTTPS for reliable alerts.'
								: 'Browser notifications are enabled for this device.'
						: ''
	const mobileSupportMessage =
		appleMobileWeb && isSecureContext && standaloneWebApp && !browserNotificationsSupported
			? iosVersion && compareVersions(iosVersion, '16.4') < 0
				? `This iPhone/iPad appears to be on iOS ${iosVersion}. Home Screen web notifications require iOS 16.4 or newer.`
				: 'This installed iPhone/iPad app is secure, but the Notifications API is still unavailable in this runtime. That usually points to iOS/Safari capability limits rather than this app configuration.'
			: ''

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		await onSubmit({
			centerPreferences: notificationPreferencesForm,
			emailRemindersEnabled: emailRemindersEnabledForm,
			overdueTasksRemindersEnabled: overdueTasksRemindersEnabledForm,
		})
	}

	return (
		<SettingsSection
			title="Notifications"
			section="notifications"
			open={open}
			onToggle={onToggle}
			actions={
				<button className="pill-button subtle" type="button" onClick={onRefreshRuntimeState}>
					Refresh
				</button>
			}
		>
			<div className="empty-state compact">
				Choose which Vikunja notification categories appear in the in-app notification center.
				Browser permission, device support, and test alerts are managed here too. Your own
				actions stay hidden automatically.
			</div>
			<div className="detail-grid">
				<div className="detail-item detail-field">
					<div className="detail-label">Browser notifications</div>
					<div className="detail-value">{browserNotificationStatusLabel}</div>
				</div>
				<div className="detail-item detail-field">
					<div className="detail-label">Push API</div>
					<div className="detail-value">{pushManagerSupported ? 'Supported' : 'Unavailable'}</div>
				</div>
				<div className="detail-item detail-field">
					<div className="detail-label">Secure context</div>
					<div className="detail-value">{isSecureContext ? 'Yes' : 'No'}</div>
				</div>
				<div className="detail-item detail-field">
					<div className="detail-label">Installed app mode</div>
					<div className="detail-value">{standaloneWebApp ? 'Yes' : 'No'}</div>
				</div>
			</div>
			<div className="settings-action-row">
				{browserNotificationsSupported && browserNotificationPermission === 'default' ? (
					<button
						className="pill-button subtle"
						type="button"
						disabled={notificationPermissionRequesting}
						onClick={onRequestBrowserNotificationPermission}
					>
						{notificationPermissionRequesting ? 'Waiting…' : 'Enable notifications'}
					</button>
				) : null}
				{browserNotificationsSupported && browserNotificationPermission === 'granted' ? (
					<button className="pill-button subtle" type="button" onClick={onSendTestBrowserNotification}>
						Send test notification
					</button>
				) : null}
			</div>
			{browserNotificationMessage ? <div className="empty-state compact">{browserNotificationMessage}</div> : null}
			{mobileSupportMessage ? <div className="empty-state compact">{mobileSupportMessage}</div> : null}
			<form className="detail-grid settings-form" data-form="notification-preferences" onSubmit={handleSubmit}>
				{notificationPreferenceDefinitions.map(definition => (
					<div key={definition.category} className="detail-item detail-item-full detail-field settings-checkbox-field">
						<div className="detail-label">{definition.title}</div>
						<label className="settings-checkbox-row">
							<input
								data-setting-field={`notification-${definition.category}-center`}
								type="checkbox"
								checked={notificationPreferencesForm[definition.category].center}
								disabled={notificationPreferencesSubmitting}
								onChange={event => {
									const checked = event.currentTarget.checked
									setNotificationPreferencesForm(state => ({
										...state,
										[definition.category]: {
											...state[definition.category],
											center: checked,
										},
									}))
								}}
							/>
							<span>{definition.description}</span>
						</label>
					</div>
				))}
				<div className="detail-item detail-item-full detail-field settings-checkbox-field">
					<div className="detail-label">Email notifications</div>
					{!emailDeliveryAvailable ? (
						<div className="detail-helper-text">
							Email delivery is not configured on this instance.
							{accountIsAdmin ? ' Configure SMTP in the Admin section below.' : ''}
						</div>
					) : (
						<>
							<label className="settings-checkbox-row">
								<input
									data-setting-field="email-reminders-enabled"
									type="checkbox"
									checked={emailRemindersEnabledForm}
									disabled={notificationPreferencesSubmitting}
									onChange={event => {
										setEmailRemindersEnabledForm(event.currentTarget.checked)
									}}
								/>
								<span>Task reminder emails.</span>
							</label>
							<label className="settings-checkbox-row">
								<input
									data-setting-field="overdue-tasks-reminders-enabled"
									type="checkbox"
									checked={overdueTasksRemindersEnabledForm}
									disabled={notificationPreferencesSubmitting}
									onChange={event => {
										setOverdueTasksRemindersEnabledForm(event.currentTarget.checked)
									}}
								/>
								<span>Daily overdue task summary emails.</span>
							</label>
						</>
					)}
				</div>
				<div className="detail-item detail-item-full detail-field">
					<button className="composer-submit" type="submit" disabled={notificationPreferencesSubmitting}>
						{notificationPreferencesSubmitting ? 'Saving…' : 'Save notification preferences'}
					</button>
				</div>
			</form>
		</SettingsSection>
	)
}

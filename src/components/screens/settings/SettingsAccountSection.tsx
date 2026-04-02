import {type ChangeEvent, type FormEvent, useState} from 'react'
import UserAvatar from '@/components/common/UserAvatar'
import type {Account, AccountForm, AvatarProvider, Session} from '@/types'
import {formatSessionTimestamp, normalizeVikunjaDateValue} from '@/utils/formatting'
import type {SettingsSectionId} from '@/utils/settings-helpers'
import SettingsSection from './SettingsSection'

const avatarProviderOptions: Array<{
	id: AvatarProvider
	label: string
	description: string
}> = [
	{id: 'default', label: 'Default avatar', description: 'Use the standard Vikunja avatar.'},
	{id: 'initials', label: 'Initials', description: 'Render initials instead of an image.'},
	{id: 'gravatar', label: 'Gravatar', description: 'Use the Gravatar linked to your email address.'},
	{id: 'marble', label: 'Marble', description: 'Generate a patterned avatar from your account.'},
	{id: 'upload', label: 'Upload', description: 'Use your custom uploaded avatar image.'},
]

export default function SettingsAccountSection({
	open,
	onToggle,
	account,
	accountForm,
	settingsSubmitting,
	accountSessionsLoading,
	accountSessions,
	changePasswordForm,
	passwordChangeSubmitting,
	changeEmailForm,
	changeEmailSubmitting,
	changeEmailNotice,
	dataExportStatus,
	dataExportStatusLoading,
	dataExportRequesting,
	dataExportDownloading,
	dataExportNotice,
	accountDeletionForm,
	accountDeletionNotice,
	accountDeletionRequesting,
	accountDeletionCancelling,
	currentTimezone,
	showPasswordForm,
	canChangePassword,
	canLogout,
	avatarProvider,
	avatarProviderLoaded,
	avatarProviderLoading,
	avatarProviderSubmitting,
	avatarUploadSubmitting,
	onDisconnect,
	onLogout,
	onSetAccountAuthMode,
	onSetAccountField,
	onSubmit,
	onReloadSessions,
	onRevokeAccountSession,
	onSetChangePasswordField,
	onPasswordChange,
	onSetChangeEmailField,
	onChangeEmail,
	onRequestExport,
	onDownloadExport,
	onSetAccountDeletionField,
	onRequestDeletion,
	onCancelDeletion,
	onReloadAvatarProvider,
	onUpdateAvatarProvider,
	onUploadAvatar,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	account: Account | null
	accountForm: AccountForm
	settingsSubmitting: boolean
	accountSessionsLoading: boolean
	accountSessions: Session[]
	changePasswordForm: {
		oldPassword: string
		newPassword: string
		confirmPassword: string
	}
	passwordChangeSubmitting: boolean
	changeEmailForm: {
		password: string
		newEmail: string
	}
	changeEmailSubmitting: boolean
	changeEmailNotice: string | null
	dataExportStatus: {
		status: 'pending' | 'ready' | null
		createdAt: string | null
	} | null
	dataExportStatusLoading: boolean
	dataExportRequesting: boolean
	dataExportDownloading: boolean
	dataExportNotice: string | null
	accountDeletionForm: {
		password: string
		confirmText: string
	}
	accountDeletionNotice: string | null
	accountDeletionRequesting: boolean
	accountDeletionCancelling: boolean
	currentTimezone: string
	showPasswordForm: boolean
	canChangePassword: boolean
	canLogout: boolean
	avatarProvider: AvatarProvider | null
	avatarProviderLoaded: boolean
	avatarProviderLoading: boolean
	avatarProviderSubmitting: boolean
	avatarUploadSubmitting: boolean
	onDisconnect: () => void
	onLogout: () => void
	onSetAccountAuthMode: (mode: AccountForm['authMode']) => void
	onSetAccountField: (field: keyof AccountForm, value: string) => void
	onSubmit: (event: FormEvent<HTMLFormElement>) => void
	onReloadSessions: () => void
	onRevokeAccountSession: (sessionId: string) => void
	onSetChangePasswordField: (field: 'oldPassword' | 'newPassword' | 'confirmPassword', value: string) => void
	onPasswordChange: (event: FormEvent<HTMLFormElement>) => void
	onSetChangeEmailField: (field: 'password' | 'newEmail', value: string) => void
	onChangeEmail: () => void
	onRequestExport: (password: string) => void
	onDownloadExport: (password: string) => void
	onSetAccountDeletionField: (field: 'password' | 'confirmText', value: string) => void
	onRequestDeletion: () => void
	onCancelDeletion: () => void
	onReloadAvatarProvider: () => void
	onUpdateAvatarProvider: (provider: AvatarProvider) => void
	onUploadAvatar: (file: File) => void
}) {
	const sessionCount = accountSessions.length
	const avatarBusy = avatarProviderSubmitting || avatarUploadSubmitting
	const currentAvatarLabel = getAvatarProviderLabel(avatarProvider)
	const [exportRequestPassword, setExportRequestPassword] = useState('')
	const [exportDownloadPassword, setExportDownloadPassword] = useState('')
	const deletionScheduledAt = normalizeDeletionScheduledAt(account?.user?.deletionScheduledAt)
	const accountDeletionRequiresPassword = account?.user?.isLocalUser !== false

	function handleAvatarUploadChange(event: ChangeEvent<HTMLInputElement>) {
		const [file] = Array.from(event.currentTarget.files || [])
		if (file) {
			onUploadAvatar(file)
		}
		event.currentTarget.value = ''
	}

	return (
		<SettingsSection
			title="Account"
			section="account"
			open={open}
			onToggle={onToggle}
			actions={
				account ? (
					<>
						<button className="pill-button subtle" data-action="disconnect-account" type="button" onClick={onDisconnect}>
							Disconnect
						</button>
						{canLogout ? (
							<button className="pill-button subtle" data-action="logout-account" type="button" onClick={onLogout}>
								Log out
							</button>
						) : null}
					</>
				) : undefined
			}
		>
			<div className="detail-section-list">
				{account ? (
					<div className="detail-core-card settings-subsection">
						<div className="panel-label">Current connection</div>
						<div className="detail-grid">
							<div className="detail-item detail-field">
								<div className="detail-label">Server</div>
								<div className="detail-value">{account.baseUrl}</div>
							</div>
							<div className="detail-item detail-field">
								<div className="detail-label">Sign-in mode</div>
								<div className="detail-value">{account.authMode === 'password' ? 'Session login' : 'API token'}</div>
							</div>
							<div className="detail-item detail-field">
								<div className="detail-label">Session source</div>
								<div className="detail-value">{account.source === 'legacy' ? 'Server-managed fallback' : 'Account session'}</div>
							</div>
							<div className="detail-item detail-field">
								<div className="detail-label">Signed-in user</div>
								<div className="detail-value">{account.user?.name || account.user?.username || 'Unknown user'}</div>
							</div>
							<div className="detail-item detail-field">
								<div className="detail-label">Timezone</div>
								<div className="detail-value">{currentTimezone || 'Not set'}</div>
							</div>
						</div>
						<div className="empty-state compact">
							Disconnect returns to the sign-in screen while keeping this server setup. {canLogout ? 'Log out also ends the current Vikunja session.' : ''}
						</div>
					</div>
				) : null}
				{account?.user ? (
					<div className="detail-core-card settings-subsection">
						<div className="settings-subsection-header">
							<div className="panel-label">Avatar</div>
							<button className="pill-button subtle" data-action="reload-avatar-provider" type="button" onClick={onReloadAvatarProvider}>
								Reload
							</button>
						</div>
						<div className="settings-avatar-row">
							<UserAvatar user={account.user} size={56} preferInitials={avatarProvider === 'initials'} />
							<div className="settings-avatar-copy">
								<div className="detail-value">{account.user.name || account.user.username || 'Current user'}</div>
								<div className="detail-meta">
									Current provider: {currentAvatarLabel}
									{avatarProvider === 'ldap' ? ' (managed by LDAP)' : ''}
									{avatarProvider === 'openid' ? ' (managed by OpenID)' : ''}
								</div>
							</div>
						</div>
						{avatarProviderLoading && !avatarProviderLoaded ? <div className="empty-state">Loading avatar settings…</div> : null}
						<div className="settings-avatar-provider-grid" role="group" aria-label="Avatar provider">
							{avatarProviderOptions.map(option => {
								const active = avatarProvider === option.id
								return (
									<button
										key={option.id}
										className={`pill-button settings-avatar-provider-button ${active ? '' : 'subtle'}`.trim()}
										data-action="select-avatar-provider"
										data-avatar-provider-option={option.id}
										type="button"
										aria-pressed={active}
										disabled={!avatarProviderLoaded || avatarBusy}
										onClick={() => onUpdateAvatarProvider(option.id)}
									>
										{option.label}
									</button>
								)
							})}
						</div>
						<div className="detail-helper-text">
							{avatarProviderOptions.find(option => option.id === avatarProvider)?.description || 'Choose how Vikunja should render your avatar across the app.'}
						</div>
						<div className="detail-inline-actions settings-avatar-upload-row">
							<input
								className="detail-attachment-input"
								data-avatar-upload-input
								type="file"
								accept="image/*"
								onChange={handleAvatarUploadChange}
							/>
							<button
								className="composer-submit"
								data-action="open-avatar-upload"
								type="button"
								disabled={avatarBusy}
								onClick={event => {
									const input = event.currentTarget.parentElement?.querySelector('[data-avatar-upload-input]')
									if (input instanceof HTMLInputElement) {
										input.click()
									}
								}}
							>
								{avatarUploadSubmitting ? 'Uploading…' : 'Upload image'}
							</button>
							<div className="settings-avatar-upload-copy detail-helper-text">
								Upload or replace a custom avatar, then switch to <strong>Upload</strong> if needed.
							</div>
						</div>
					</div>
				) : null}
				<div className="detail-core-card settings-subsection">
					<div className="panel-label">{account ? 'Sign in with another account' : 'Sign in'}</div>
					{account ? (
						<div className="empty-state compact">
							Use this to replace the current Vikunja connection with another account, server, or sign-in method.
						</div>
					) : null}
					<div className="settings-toggle-row">
						<button
							className={`pill-button ${showPasswordForm ? '' : 'subtle'}`.trim()}
							data-action="set-account-auth-mode"
							data-auth-mode="password"
							type="button"
							onClick={() => onSetAccountAuthMode('password')}
						>
							Password
						</button>
						<button
							className={`pill-button ${showPasswordForm ? 'subtle' : ''}`.trim()}
							data-action="set-account-auth-mode"
							data-auth-mode="apiToken"
							type="button"
							onClick={() => onSetAccountAuthMode('apiToken')}
						>
							API Token
						</button>
					</div>
					<form className="detail-grid settings-form" data-form="account-login" onSubmit={onSubmit}>
						<label className="detail-item detail-item-full detail-field">
							<div className="detail-label">Server URL</div>
							<input
								className="detail-input"
								data-account-field="baseUrl"
								name="baseUrl"
								type="url"
								inputMode="url"
								autoComplete="url"
								spellCheck={false}
								placeholder="https://vikunja.example.com"
								value={accountForm.baseUrl}
								disabled={settingsSubmitting}
								onChange={event => onSetAccountField('baseUrl', event.currentTarget.value)}
							/>
						</label>
						{showPasswordForm ? (
							<>
								<label className="detail-item detail-field">
									<div className="detail-label">Username</div>
									<input
										className="detail-input"
										data-account-field="username"
										name="username"
										type="text"
										autoComplete="username"
										autoCapitalize="none"
										spellCheck={false}
										value={accountForm.username}
										disabled={settingsSubmitting}
										onChange={event => onSetAccountField('username', event.currentTarget.value)}
									/>
								</label>
								<label className="detail-item detail-field">
									<div className="detail-label">Password</div>
									<input
										className="detail-input"
										data-account-field="password"
										name="password"
										type="password"
										autoComplete="current-password"
										value={accountForm.password}
										disabled={settingsSubmitting}
										onChange={event => onSetAccountField('password', event.currentTarget.value)}
									/>
								</label>
							</>
						) : (
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">API token</div>
								<input
									className="detail-input"
									data-account-field="apiToken"
									name="apiToken"
									type="password"
									autoComplete="off"
									autoCapitalize="none"
									spellCheck={false}
									value={accountForm.apiToken}
									disabled={settingsSubmitting}
									onChange={event => onSetAccountField('apiToken', event.currentTarget.value)}
								/>
							</label>
						)}
						<div className="detail-item detail-item-full detail-field">
							<button className="composer-submit" type="submit" disabled={settingsSubmitting}>
								{settingsSubmitting ? 'Connecting…' : 'Connect'}
							</button>
						</div>
					</form>
					<div className="empty-state compact">
						Password login is recommended for self-hosted Vikunja. API tokens are sent only to this backend and are never stored in browser storage.
					</div>
				</div>
				{account?.sessionsSupported ? (
					<div className="detail-core-card settings-subsection">
						<div className="settings-subsection-header">
							<div className="panel-label">Active sessions</div>
							<button className="pill-button subtle" data-action="reload-account-sessions" type="button" onClick={onReloadSessions}>
								Reload
							</button>
						</div>
						{accountSessionsLoading ? <div className="empty-state">Loading sessions…</div> : null}
						{!accountSessionsLoading && sessionCount === 0 ? <div className="empty-state">No active sessions returned by Vikunja.</div> : null}
						{!accountSessionsLoading && sessionCount > 0 ? (
							<div className="settings-session-list">
								{accountSessions.map(session => (
									<div key={session.id} className="settings-session-row">
										<div>
											<div className="detail-value">{session.device_info || 'Unknown device'}</div>
											<div className="detail-meta">{session.ip_address || 'Unknown IP'} · {formatSessionTimestamp(session.last_active || session.created)}</div>
										</div>
										<button
											className="pill-button subtle"
											data-action="revoke-account-session"
											data-session-id={session.id}
											type="button"
											onClick={() => onRevokeAccountSession(session.id)}
										>
											Revoke
										</button>
									</div>
								))}
							</div>
						) : null}
					</div>
				) : null}
				{canChangePassword ? (
					<div className="detail-core-card settings-subsection">
						<div className="panel-label">Change password</div>
						<div className="empty-state compact">Changing your password signs this app out and invalidates other sessions.</div>
						<form className="detail-grid settings-form" data-form="change-password" onSubmit={onPasswordChange}>
							<label className="detail-item detail-field">
								<div className="detail-label">Current password</div>
								<input
									className="detail-input"
									data-password-field="oldPassword"
									type="password"
									value={changePasswordForm.oldPassword}
									disabled={passwordChangeSubmitting}
									onChange={event => onSetChangePasswordField('oldPassword', event.currentTarget.value)}
								/>
							</label>
							<label className="detail-item detail-field">
								<div className="detail-label">New password</div>
								<input
									className="detail-input"
									data-password-field="newPassword"
									type="password"
									value={changePasswordForm.newPassword}
									disabled={passwordChangeSubmitting}
									onChange={event => onSetChangePasswordField('newPassword', event.currentTarget.value)}
								/>
							</label>
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">Confirm new password</div>
								<input
									className="detail-input"
									data-password-field="confirmPassword"
									type="password"
									value={changePasswordForm.confirmPassword}
									disabled={passwordChangeSubmitting}
									onChange={event => onSetChangePasswordField('confirmPassword', event.currentTarget.value)}
								/>
							</label>
							<div className="detail-item detail-item-full detail-field">
								<button className="composer-submit" type="submit" disabled={passwordChangeSubmitting}>
									{passwordChangeSubmitting ? 'Updating…' : 'Change password'}
								</button>
							</div>
						</form>
					</div>
				) : null}
				{canChangePassword ? (
					<div className="detail-core-card settings-subsection">
						<div className="panel-label">Change email address</div>
						<div className="empty-state compact">Vikunja will send a confirmation email to the new address.</div>
						{changeEmailNotice ? (
							<div className="status-card success" data-change-email-notice>
								{changeEmailNotice}
							</div>
						) : null}
						<form
							className="detail-grid settings-form"
							data-form="change-email"
							onSubmit={event => {
								event.preventDefault()
								onChangeEmail()
							}}
						>
							<label className="detail-item detail-field">
								<div className="detail-label">Current password</div>
								<input
									className="detail-input"
									data-email-field="password"
									type="password"
									value={changeEmailForm.password}
									disabled={changeEmailSubmitting}
									onChange={event => onSetChangeEmailField('password', event.currentTarget.value)}
								/>
							</label>
							<label className="detail-item detail-field">
								<div className="detail-label">New email</div>
								<input
									className="detail-input"
									data-email-field="newEmail"
									type="email"
									autoComplete="email"
									value={changeEmailForm.newEmail}
									disabled={changeEmailSubmitting}
									onChange={event => onSetChangeEmailField('newEmail', event.currentTarget.value)}
								/>
							</label>
							<div className="detail-item detail-item-full detail-field">
								<button className="composer-submit" type="submit" disabled={changeEmailSubmitting}>
									{changeEmailSubmitting ? 'Updating…' : 'Update email'}
								</button>
							</div>
						</form>
					</div>
				) : null}
				{canChangePassword ? (
					<div className="detail-core-card settings-subsection">
						<div className="panel-label">Export my data</div>
						<div className="empty-state compact">Generates a ZIP of all your tasks, projects, and comments.</div>
						{dataExportNotice ? (
							<div className="status-card success" data-data-export-notice>
								{dataExportNotice}
							</div>
						) : null}
						{dataExportStatusLoading ? <div className="empty-state compact">Checking export status…</div> : null}
						{dataExportStatus?.status === 'ready' ? (
							<>
								<div className="status-card success">Your export is ready to download.</div>
								<form
									className="detail-grid settings-form"
									data-form="download-export"
									onSubmit={event => {
										event.preventDefault()
										onDownloadExport(exportDownloadPassword)
										setExportDownloadPassword('')
									}}
								>
									<label className="detail-item detail-item-full detail-field">
										<div className="detail-label">Password (to authorise download)</div>
										<input
											className="detail-input"
											type="password"
											value={exportDownloadPassword}
											disabled={dataExportDownloading}
											onChange={event => setExportDownloadPassword(event.currentTarget.value)}
										/>
									</label>
									<div className="detail-item detail-item-full detail-field">
										<button className="composer-submit" type="submit" disabled={dataExportDownloading}>
											{dataExportDownloading ? 'Downloading…' : 'Download ZIP'}
										</button>
									</div>
								</form>
							</>
						) : (
							<form
								className="detail-grid settings-form"
								data-form="request-export"
								onSubmit={event => {
									event.preventDefault()
									onRequestExport(exportRequestPassword)
									setExportRequestPassword('')
								}}
							>
								<label className="detail-item detail-item-full detail-field">
									<div className="detail-label">Password</div>
									<input
										className="detail-input"
										type="password"
										value={exportRequestPassword}
										disabled={dataExportRequesting}
										onChange={event => setExportRequestPassword(event.currentTarget.value)}
									/>
								</label>
								<div className="detail-item detail-item-full detail-field">
									<button className="composer-submit" type="submit" disabled={dataExportRequesting}>
										{dataExportRequesting ? 'Requesting…' : 'Request export'}
									</button>
								</div>
							</form>
						)}
					</div>
				) : null}
				{canChangePassword ? (
					<div className="detail-core-card settings-subsection settings-danger-zone">
						<div className="panel-label">Delete account</div>
						<div className="status-card warning">
							This permanently deletes your account and all data. Vikunja first emails a confirmation link. Only after that link is opened does the three-day deletion countdown begin.
						</div>
						{accountDeletionNotice ? (
							<div className="status-card success" data-account-deletion-notice>
								{accountDeletionNotice}
							</div>
						) : null}
						{deletionScheduledAt ? (
							<>
								<div className="empty-state compact">
									Vikunja has scheduled this account for deletion on {formatDeletionSchedule(deletionScheduledAt)}.
								</div>
								<form
									className="detail-grid settings-form"
									data-form="cancel-deletion"
									onSubmit={event => {
										event.preventDefault()
										onCancelDeletion()
									}}
								>
									{accountDeletionRequiresPassword ? (
										<label className="detail-item detail-item-full detail-field">
											<div className="detail-label">Password</div>
											<input
												className="detail-input"
												type="password"
												value={accountDeletionForm.password}
												disabled={accountDeletionCancelling}
												onChange={event => onSetAccountDeletionField('password', event.currentTarget.value)}
											/>
										</label>
									) : (
										<div className="detail-item detail-item-full detail-field">
											<div className="detail-helper-text">
												This account signs in through an external provider, so Vikunja only needs a cancel action here.
											</div>
										</div>
									)}
									<div className="detail-item detail-item-full detail-field">
										<button className="composer-submit danger" type="submit" disabled={accountDeletionCancelling}>
											{accountDeletionCancelling ? 'Cancelling…' : 'Cancel scheduled deletion'}
										</button>
									</div>
								</form>
							</>
						) : (
							<form
								className="detail-grid settings-form"
								data-form="request-deletion"
								onSubmit={event => {
									event.preventDefault()
									onRequestDeletion()
								}}
							>
								<label className="detail-item detail-item-full detail-field">
									<div className="detail-label">Type DELETE to confirm</div>
									<input
										className="detail-input"
										type="text"
										autoCapitalize="none"
										value={accountDeletionForm.confirmText}
										onChange={event => onSetAccountDeletionField('confirmText', event.currentTarget.value)}
									/>
								</label>
								{accountDeletionRequiresPassword ? (
									<label className="detail-item detail-item-full detail-field">
										<div className="detail-label">Password</div>
										<input
											className="detail-input"
											type="password"
											value={accountDeletionForm.password}
											onChange={event => onSetAccountDeletionField('password', event.currentTarget.value)}
										/>
									</label>
								) : (
									<div className="detail-item detail-item-full detail-field">
										<div className="detail-helper-text">
											Vikunja will send a confirmation link by email. Because this account uses an external provider, no password is required for the request step.
										</div>
									</div>
								)}
								<div className="detail-item detail-item-full detail-field">
									<button
										className="composer-submit danger"
										type="submit"
										disabled={accountDeletionRequesting || accountDeletionForm.confirmText !== 'DELETE'}
									>
										{accountDeletionRequesting ? 'Requesting…' : 'Send deletion confirmation email'}
									</button>
								</div>
							</form>
						)}
					</div>
				) : null}
			</div>
		</SettingsSection>
	)
}

function getAvatarProviderLabel(provider: AvatarProvider | null) {
	switch (provider) {
		case 'default':
			return 'Default avatar'
		case 'initials':
			return 'Initials'
		case 'gravatar':
			return 'Gravatar'
		case 'marble':
			return 'Marble'
		case 'upload':
			return 'Upload'
		case 'ldap':
			return 'LDAP'
		case 'openid':
			return 'OpenID'
		default:
			return 'Unknown'
	}
}

function normalizeDeletionScheduledAt(value: string | null | undefined) {
	return normalizeVikunjaDateValue(value) || null
}

function formatDeletionSchedule(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return value
	}

	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(date)
}

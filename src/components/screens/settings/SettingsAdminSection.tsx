import DetailSheet from '@/components/common/DetailSheet'
import type {
	AdminMailDiagnosticsResult,
	AdminMigration,
	AdminRepairResult,
	AdminRuntimeHealth,
	AdminUser,
	MailerCapabilityReasonCode,
	MailerConfig,
	MailerConfigField,
	MailerConfigInput,
} from '@/types'
import {
	getProtectedAdminUserMessage,
	isCurrentAdminUser,
	type SettingsSectionId,
} from '@/utils/settings-helpers'
import {type FormEvent, useEffect, useState} from 'react'
import SettingsSection from './SettingsSection'

const knownMailerAuthTypes = ['plain', 'login', 'cram-md5']
const REPAIR_COMMANDS = [
	{id: 'file-mime-types', label: 'Fix file MIME types'},
	{id: 'orphan-positions', label: 'Fix orphaned positions'},
	{id: 'projects', label: 'Repair projects'},
	{id: 'task-positions', label: 'Fix task positions'},
]

const defaultMailerConfigForm: MailerConfigInput = {
	enabled: false,
	host: '',
	port: 587,
	authType: 'plain',
	username: '',
	password: '',
	skipTlsVerify: false,
	fromEmail: '',
	forceSsl: false,
}

export default function SettingsAdminSection({
	open,
	onToggle,
	accountUser,
	accountIsAdmin,
	adminBridgeConfigured,
	canManageUsers,
	adminUsers,
	adminUsersLoading,
	adminUsersLoaded,
	adminUserSubmitting,
	adminRuntimeHealth,
	adminBridgeFailedChecks,
	adminRuntimeHealthLoading,
	adminMigrations,
	adminMigrationsLoading,
	adminMigrationsLoaded,
	adminMigrateSubmitting,
	adminDumpSubmitting,
	adminRestoreSubmitting,
	adminRepairSubmitting,
	adminRepairResults,
	mailDiagnosticsSubmitting,
	mailDiagnosticsResult,
	mailerConfig,
	mailerConfigLoadAttempted,
	mailerConfigLoading,
	mailerConfigSubmitting,
	mailerConfigRestarting,
	onReloadRuntimeHealth,
	onReloadUsers,
	onLoadMigrations,
	onRunMigrate,
	onRollbackMigration,
	onCreateDump,
	onRunRestore,
	onRunRepair,
	onCreateAdminUser,
	onUpdateAdminUser,
	onSetAdminUserEnabled,
	onResetAdminUserPassword,
	onDeleteAdminUser,
	onSendTestmail,
	onLoadMailerConfig,
	onSaveMailerConfig,
	onApplyMailerConfig,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	accountUser: {
		id?: number | null
		username?: string | null
		email?: string | null
	} | null | undefined
	accountIsAdmin: boolean
	adminBridgeConfigured: boolean
	canManageUsers: boolean
	adminUsers: AdminUser[]
	adminUsersLoading: boolean
	adminUsersLoaded: boolean
	adminUserSubmitting: boolean
	adminRuntimeHealth: AdminRuntimeHealth | null
	adminBridgeFailedChecks: string[]
	adminRuntimeHealthLoading: boolean
	adminMigrations: AdminMigration[]
	adminMigrationsLoading: boolean
	adminMigrationsLoaded: boolean
	adminMigrateSubmitting: boolean
	adminDumpSubmitting: boolean
	adminRestoreSubmitting: boolean
	adminRepairSubmitting: boolean
	adminRepairResults: Record<string, AdminRepairResult>
	mailDiagnosticsSubmitting: boolean
	mailDiagnosticsResult: AdminMailDiagnosticsResult | null
	mailerConfig: MailerConfig | null
	mailerConfigLoadAttempted: boolean
	mailerConfigLoading: boolean
	mailerConfigSubmitting: boolean
	mailerConfigRestarting: boolean
	onReloadRuntimeHealth: () => void
	onReloadUsers: () => void
	onLoadMigrations: () => Promise<void>
	onRunMigrate: () => Promise<boolean>
	onRollbackMigration: (name: string) => Promise<boolean>
	onCreateDump: () => Promise<boolean>
	onRunRestore: (file: File) => Promise<boolean>
	onRunRepair: (command: string) => Promise<boolean>
	onCreateAdminUser: (payload: {username: string; email: string; password: string}) => Promise<boolean>
	onUpdateAdminUser: (identifier: number | string, payload: {username: string; email: string}) => Promise<boolean>
	onSetAdminUserEnabled: (identifier: number | string, enabled: boolean) => Promise<boolean>
	onResetAdminUserPassword: (identifier: number | string, password: string) => Promise<boolean>
	onDeleteAdminUser: (identifier: number | string) => Promise<boolean>
	onSendTestmail: (email: string) => Promise<boolean>
	onLoadMailerConfig: () => Promise<void>
	onSaveMailerConfig: (settings: MailerConfigInput) => Promise<boolean>
	onApplyMailerConfig: () => Promise<boolean>
}) {
	const [userDialogMode, setUserDialogMode] = useState<'create' | 'edit' | null>(null)
	const [userDialogForm, setUserDialogForm] = useState({
		id: 0,
		username: '',
		email: '',
		password: '',
	})
	const [selectedAdminUserId, setSelectedAdminUserId] = useState<number | null>(null)
	const [smtpForm, setSmtpForm] = useState<MailerConfigInput>(defaultMailerConfigForm)
	const [smtpFormDirty, setSmtpFormDirty] = useState(false)
	const [testmailEmail, setTestmailEmail] = useState('')

	const adminBridgeReady = Boolean(
		adminRuntimeHealth?.dockerReachable &&
		adminRuntimeHealth?.vikunjaContainerFound &&
		adminRuntimeHealth?.vikunjaCliReachable,
	)
	const showBridgeHealthLoading = !accountIsAdmin && adminBridgeConfigured && adminRuntimeHealthLoading
	const showBridgeUnavailableMessage = !accountIsAdmin && (
		!adminBridgeConfigured ||
		Boolean(adminRuntimeHealth && !adminBridgeReady)
	)
	const showUnauthorizedOperatorMessage = !accountIsAdmin &&
		adminBridgeConfigured &&
		!adminRuntimeHealthLoading &&
		(!adminRuntimeHealth || adminBridgeReady)
	const showAdminUserFallback = canManageUsers && !adminBridgeReady && Boolean(accountUser)
	const userDialogOpen = userDialogMode !== null
	const selectedAdminUser = selectedAdminUserId
		? adminUsers.find(user => user.id === selectedAdminUserId) || null
		: null
	const selectedAdminUserIsCurrent = selectedAdminUser
		? isCurrentAdminUser(accountUser, selectedAdminUser.id, selectedAdminUser.username, selectedAdminUser.email)
		: false
	const selectedAdminUserProtectedMessage = selectedAdminUser
		? getProtectedAdminUserMessage(selectedAdminUserIsCurrent)
		: ''
	const mailerCapabilities = mailerConfig?.capabilities || {
		canInspect: false,
		canWrite: false,
		canApply: false,
		reasonCode: null,
	}
	const mailerEnvOverrides = new Set<MailerConfigField>(mailerConfig?.envOverrides || [])
	const showCustomAuthType = smtpForm.authType && !knownMailerAuthTypes.includes(smtpForm.authType)
	const showMailerConfigForm = Boolean(mailerConfig) && !mailerConfigLoading && mailerCapabilities.canInspect
	const mailerUnavailableMessage = getMailerCapabilityMessage(mailerCapabilities.reasonCode, 'inspect')
	const mailerReadOnlyMessage = !mailerCapabilities.canWrite
		? getMailerCapabilityMessage(mailerCapabilities.reasonCode, 'write')
		: ''
	const mailerApplyBlockedMessage = mailerCapabilities.canWrite && !mailerCapabilities.canApply
		? getMailerCapabilityMessage(mailerCapabilities.reasonCode, 'apply')
		: ''

	useEffect(() => {
		if (!mailerConfig) {
			return
		}

		setSmtpForm({
			enabled: mailerConfig.enabled,
			host: mailerConfig.host,
			port: mailerConfig.port,
			authType: mailerConfig.authType,
			username: mailerConfig.username,
			password: '',
			skipTlsVerify: mailerConfig.skipTlsVerify,
			fromEmail: mailerConfig.fromEmail,
			forceSsl: mailerConfig.forceSsl,
		})
		setSmtpFormDirty(false)
	}, [mailerConfig])

	useEffect(() => {
		if (!open || !canManageUsers || mailerConfigLoadAttempted || mailerConfig || mailerConfigLoading) {
			return
		}

		void onLoadMailerConfig()
	}, [canManageUsers, mailerConfig, mailerConfigLoadAttempted, mailerConfigLoading, onLoadMailerConfig, open])

	useEffect(() => {
		if (!open || !canManageUsers || !adminBridgeReady || adminMigrationsLoaded || adminMigrationsLoading) {
			return
		}

		void onLoadMigrations()
	}, [adminBridgeReady, adminMigrationsLoaded, adminMigrationsLoading, canManageUsers, onLoadMigrations, open])

	function openCreateUserDialog() {
		setSelectedAdminUserId(null)
		setUserDialogForm({
			id: 0,
			username: '',
			email: '',
			password: '',
		})
		setUserDialogMode('create')
	}

	function openEditAdminUserDialog(userId: number, currentUsername: string, currentEmail: string) {
		setSelectedAdminUserId(null)
		setUserDialogForm({
			id: userId,
			username: currentUsername,
			email: currentEmail,
			password: '',
		})
		setUserDialogMode('edit')
	}

	function closeUserDialog() {
		if (adminUserSubmitting) {
			return
		}

		setUserDialogMode(null)
	}

	function closeAdminUserDetail() {
		if (adminUserSubmitting) {
			return
		}

		setSelectedAdminUserId(null)
	}

	async function handleSubmitUserDialog(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (userDialogMode === 'create') {
			const success = await onCreateAdminUser({
				username: userDialogForm.username,
				email: userDialogForm.email,
				password: userDialogForm.password,
			})
			if (success) {
				closeUserDialog()
			}
			return
		}

		if (userDialogMode === 'edit') {
			const success = await onUpdateAdminUser(userDialogForm.id, {
				username: userDialogForm.username,
				email: userDialogForm.email,
			})
			if (success) {
				closeUserDialog()
			}
		}
	}

	async function handleResetAdminUserPassword(userId: number, username: string) {
		const password = window.prompt(`Set a new password for ${username}`)
		if (password === null) {
			return
		}

		await onResetAdminUserPassword(userId, password)
	}

	async function handleSubmitTestmail(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		await onSendTestmail(testmailEmail)
	}

	function updateMailerField<K extends keyof MailerConfigInput>(field: K, value: MailerConfigInput[K]) {
		if (!mailerCapabilities.canWrite) {
			return
		}

		setSmtpForm(state => ({
			...state,
			[field]: value,
		}))
		setSmtpFormDirty(true)
	}

	function isMailerFieldOverridden(field: MailerConfigField) {
		return mailerEnvOverrides.has(field)
	}

	async function handleSubmitMailerConfig(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await onSaveMailerConfig(smtpForm)
		if (success) {
			setSmtpFormDirty(false)
		}
	}

	async function handleApplyMailerConfig() {
		const success = await onApplyMailerConfig()
		if (success) {
			setSmtpFormDirty(false)
		}
	}

	return (
		<>
			<SettingsSection
				title="User Administration"
				section="userAdministration"
				open={open}
				onToggle={onToggle}
				actions={
					<>
						<button
							className="pill-button subtle"
							data-action="reload-admin-users"
							type="button"
							disabled={!canManageUsers}
							onClick={() => {
								onReloadRuntimeHealth()
								if (adminBridgeReady) {
									onReloadUsers()
								}
								void onLoadMailerConfig()
							}}
						>
							Reload
						</button>
						<button
							className="pill-button"
							data-action="open-create-user"
							type="button"
							disabled={!canManageUsers || !adminBridgeReady}
							title={!adminBridgeReady ? 'Unavailable until this backend can reach the configured Vikunja container and CLI.' : undefined}
							onClick={openCreateUserDialog}
						>
							Create user
						</button>
					</>
				}
			>
				{showBridgeUnavailableMessage ? (
					<div className="empty-state compact">
						User administration requires the Vikunja CLI bridge to be configured and reachable on the server.
					</div>
				) : null}
				{showBridgeHealthLoading ? (
					<div className="empty-state compact">Checking bridge health…</div>
				) : null}
				{showUnauthorizedOperatorMessage ? (
					<div className="empty-state compact">
						Only authorized operator accounts can manage instance users from the PWA app.
					</div>
				) : null}
				{canManageUsers ? (
					<>
						{adminRuntimeHealthLoading ? <div className="empty-state compact">Checking bridge health…</div> : null}
						{adminRuntimeHealth ? (
							<div className="detail-grid detail-grid-tight">
								<div className="detail-item detail-field">
									<div className="detail-label">Docker</div>
									<div className="detail-value">{adminRuntimeHealth.dockerReachable ? 'Reachable' : 'Unavailable'}</div>
								</div>
								<div className="detail-item detail-field">
									<div className="detail-label">Vikunja container</div>
									<div className="detail-value">{adminRuntimeHealth.vikunjaContainerFound ? 'Found' : 'Missing'}</div>
								</div>
								<div className="detail-item detail-field">
									<div className="detail-label">Vikunja CLI</div>
									<div className="detail-value">{adminRuntimeHealth.vikunjaCliReachable ? 'Reachable' : 'Unavailable'}</div>
								</div>
							</div>
						) : null}
						{adminRuntimeHealth?.errors?.length ? (
							<div className="empty-state compact">{adminRuntimeHealth.errors.join(' ')}</div>
						) : null}
						<div className="detail-core-card settings-subsection">
							<div className="panel-label">Backup & Restore</div>
							<div className="detail-inline-actions">
								<button
									className="composer-submit"
									type="button"
									disabled={!adminBridgeReady || adminDumpSubmitting}
									onClick={() => {
										void onCreateDump()
									}}
								>
									{adminDumpSubmitting ? 'Creating dump…' : 'Download backup (ZIP)'}
								</button>
							</div>
							<div className="empty-state compact">
								Downloads a full Vikunja backup ZIP including all data and attachments.
							</div>
							<div className="settings-subsection-header">
								<div className="detail-label">Restore from backup</div>
							</div>
							<div className="status-card warning">
								Restoring overwrites all data. Restart Vikunja after restore completes.
							</div>
							<input
								type="file"
								accept=".zip"
								data-restore-input
								onChange={event => {
									const [file] = Array.from(event.currentTarget.files || [])
									if (file) {
										void onRunRestore(file)
									}
									event.currentTarget.value = ''
								}}
							/>
							<button
								type="button"
								className="composer-submit"
								disabled={!adminBridgeReady || adminRestoreSubmitting}
								onClick={event => {
									const input = event.currentTarget.previousElementSibling
									if (input instanceof HTMLInputElement) {
										input.click()
									}
								}}
							>
								{adminRestoreSubmitting ? 'Restoring…' : 'Upload & restore backup'}
							</button>
						</div>
						<div className="detail-core-card settings-subsection">
							<div className="settings-subsection-header">
								<div className="panel-label">Database Migrations</div>
								<button className="pill-button subtle" type="button" onClick={() => void onLoadMigrations()}>
									Reload
								</button>
							</div>
							{adminMigrationsLoading ? <div className="empty-state">Loading…</div> : null}
							{!adminMigrationsLoading && adminMigrationsLoaded ? (
								<div className="settings-session-list">
									{adminMigrations.map(migration => (
										<div key={migration.name} className="settings-session-row">
											<div>
												<div className="detail-value">{migration.name}</div>
												<div className="detail-meta">{migration.applied ? 'Applied' : 'Pending'}</div>
											</div>
											{migration.applied ? (
												<button
													className="pill-button subtle"
													type="button"
													disabled={!adminBridgeReady || adminMigrateSubmitting}
													onClick={() => {
														void onRollbackMigration(migration.name)
													}}
												>
													Rollback
												</button>
											) : null}
										</div>
									))}
								</div>
							) : null}
							<button
								className="composer-submit"
								type="button"
								disabled={!adminBridgeReady || adminMigrateSubmitting}
								onClick={() => {
									void onRunMigrate()
								}}
							>
								{adminMigrateSubmitting ? 'Running…' : 'Run pending migrations'}
							</button>
						</div>
						<div className="detail-core-card settings-subsection">
							<div className="panel-label">Data Repair</div>
							{REPAIR_COMMANDS.map(command => {
								const result = adminRepairResults[command.id]
								return (
									<div key={command.id} className="settings-session-row">
										<div>
											<div className="detail-value">{command.label}</div>
											{result ? (
												<div className={`detail-meta ${result.success ? '' : 'color-error'}`.trim()}>
													{result.success ? 'Completed' : 'Failed'}
													{result.stderr ? ` — ${result.stderr}` : ''}
												</div>
											) : null}
										</div>
										<button
											className="pill-button subtle"
											type="button"
											disabled={!adminBridgeReady || adminRepairSubmitting}
											onClick={() => {
												void onRunRepair(command.id)
											}}
										>
											Run
										</button>
									</div>
								)
							})}
						</div>
						{!adminBridgeReady ? (
							<div className="empty-state compact">
								Admin user management requires the Vikunja CLI bridge. Configure it via environment
								variables on the server.
								{adminBridgeFailedChecks.length ? ` Checks failed: ${adminBridgeFailedChecks.join(', ')}.` : ''}
							</div>
						) : null}
						{showAdminUserFallback ? (
							<div className="settings-session-list">
								<div className="settings-admin-user-row">
									<div className="settings-admin-user-copy">
										<div className="detail-value">{accountUser?.username || 'Unknown user'}</div>
										<div className="detail-meta">
											{accountUser?.email || 'No email'} · Connected operator account
										</div>
									</div>
									<div className="settings-admin-user-actions">
										<div className="settings-status-chip is-active">Connected</div>
									</div>
								</div>
							</div>
						) : null}
						{adminBridgeReady && adminUsersLoading ? <div className="empty-state compact">Loading users…</div> : null}
						{adminBridgeReady && !adminUsersLoading && adminUsers.length === 0 && adminUsersLoaded ? (
							<div className="empty-state compact">No users were returned by the admin bridge.</div>
						) : null}
						{adminBridgeReady && adminUsers.length > 0 ? (
							<div className="settings-session-list">
								{adminUsers.map(user => {
									const isCurrentUser = isCurrentAdminUser(accountUser, user.id, user.username, user.email)
									const protectedMessage = getProtectedAdminUserMessage(isCurrentUser)

									return (
										<div key={user.id} className="settings-admin-user-row">
											<div className="settings-admin-user-copy">
												<div className="detail-value">{user.username}</div>
												<div className="detail-meta">
													{user.email || 'No email'}
													{isCurrentUser ? ' · Current account' : ''}
													{protectedMessage ? ' · Protected' : ''}
												</div>
											</div>
											<div className="settings-admin-user-actions">
												<div className={`settings-status-chip ${user.enabled ? 'is-active' : 'is-disabled'}`.trim()}>
													{user.enabled ? 'Active' : 'Disabled'}
												</div>
												<button
													className="menu-button settings-admin-user-overflow"
													type="button"
													aria-label={`Manage ${user.username}`}
													onClick={() => setSelectedAdminUserId(user.id)}
												>
													⋯
												</button>
											</div>
										</div>
									)
								})}
							</div>
						) : null}
						<div className="detail-core-card settings-subsection">
							<div className="panel-label">SMTP configuration</div>
							<div className="empty-state compact">
								Configure email delivery for this Vikunja instance when a writable admin-config
								source is configured on the server.
							</div>
							{mailerConfig?.envOverrides?.length ? (
								<div className="detail-helper-text">
									Some fields are overridden by environment variables and stay read-only here.
									Update them in docker-compose if you need to change the effective value.
								</div>
							) : null}
							{mailerConfigLoadAttempted && !mailerConfigLoading && mailerConfig && !mailerCapabilities.canInspect ? (
								<div className="detail-helper-text">
									{mailerUnavailableMessage}
								</div>
							) : null}
							{mailerConfigLoading ? (
								<div className="empty-state compact">Loading SMTP configuration…</div>
							) : null}
							{mailerConfigLoadAttempted && !mailerConfigLoading && !mailerConfig ? (
								<div className="detail-helper-text">
									SMTP configuration could not be loaded. Use Reload after fixing bridge access or config-file access.
								</div>
							) : null}
							{showMailerConfigForm ? (
								<form className="detail-grid settings-form" data-form="mailer-config" onSubmit={handleSubmitMailerConfig}>
									{mailerReadOnlyMessage ? (
										<div className="detail-item detail-item-full detail-helper-text">
											{mailerReadOnlyMessage}
										</div>
									) : null}
									<div className="detail-item detail-item-full detail-field settings-checkbox-field">
										<div className="detail-label">Email delivery</div>
										<label className="settings-checkbox-row">
											<input
												data-mailer-field="enabled"
												type="checkbox"
												checked={smtpForm.enabled}
												disabled={mailerConfigSubmitting || mailerConfigRestarting || !mailerCapabilities.canWrite || isMailerFieldOverridden('enabled')}
												onChange={event => updateMailerField('enabled', event.currentTarget.checked)}
											/>
											<span>Enable SMTP delivery for this Vikunja instance.</span>
										</label>
										{isMailerFieldOverridden('enabled') ? (
											<div className="detail-helper-text">
												Set via environment variable. Change it in docker-compose to edit the
												effective value.
											</div>
										) : null}
									</div>
									<label className="detail-item detail-field">
										<div className="detail-label">SMTP host</div>
										<input
											className="detail-input"
											data-mailer-field="host"
											type="text"
											value={smtpForm.host}
											disabled={mailerConfigSubmitting || mailerConfigRestarting || !mailerCapabilities.canWrite || isMailerFieldOverridden('host')}
											placeholder="smtp.example.com"
											onChange={event => updateMailerField('host', event.currentTarget.value)}
										/>
										{isMailerFieldOverridden('host') ? (
											<div className="detail-helper-text">Overridden by environment variable.</div>
										) : null}
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Port</div>
										<input
											className="detail-input"
											data-mailer-field="port"
											type="number"
											min="1"
											value={smtpForm.port}
											disabled={mailerConfigSubmitting || mailerConfigRestarting || !mailerCapabilities.canWrite || isMailerFieldOverridden('port')}
											onChange={event => updateMailerField('port', Number(event.currentTarget.value) || 0)}
										/>
										{isMailerFieldOverridden('port') ? (
											<div className="detail-helper-text">Overridden by environment variable.</div>
										) : null}
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Auth type</div>
										<select
											className="detail-input"
											data-mailer-field="authType"
											value={smtpForm.authType}
											disabled={mailerConfigSubmitting || mailerConfigRestarting || !mailerCapabilities.canWrite || isMailerFieldOverridden('authType')}
											onChange={event => updateMailerField('authType', event.currentTarget.value)}
										>
											{showCustomAuthType ? (
												<option value={smtpForm.authType}>{smtpForm.authType.toUpperCase()}</option>
											) : null}
											{knownMailerAuthTypes.map(option => (
												<option key={option} value={option}>{option.toUpperCase()}</option>
											))}
										</select>
										{isMailerFieldOverridden('authType') ? (
											<div className="detail-helper-text">Overridden by environment variable.</div>
										) : null}
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Username</div>
										<input
											className="detail-input"
											data-mailer-field="username"
											type="text"
											value={smtpForm.username}
											disabled={mailerConfigSubmitting || mailerConfigRestarting || !mailerCapabilities.canWrite || isMailerFieldOverridden('username')}
											onChange={event => updateMailerField('username', event.currentTarget.value)}
										/>
										{isMailerFieldOverridden('username') ? (
											<div className="detail-helper-text">Overridden by environment variable.</div>
										) : null}
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Password</div>
										<input
											className="detail-input"
											data-mailer-field="password"
											type="password"
											value={smtpForm.password}
											disabled={mailerConfigSubmitting || mailerConfigRestarting || !mailerCapabilities.canWrite || isMailerFieldOverridden('password')}
											placeholder={mailerConfig?.passwordConfigured ? 'Configured already. Leave blank to keep it.' : 'Optional if your SMTP relay requires it.'}
											onChange={event => updateMailerField('password', event.currentTarget.value)}
										/>
										{isMailerFieldOverridden('password') ? (
											<div className="detail-helper-text">Overridden by environment variable.</div>
										) : null}
									</label>
									<label className="detail-item detail-item-full detail-field">
										<div className="detail-label">From email</div>
										<input
											className="detail-input"
											data-mailer-field="fromEmail"
											type="email"
											value={smtpForm.fromEmail}
											disabled={mailerConfigSubmitting || mailerConfigRestarting || !mailerCapabilities.canWrite || isMailerFieldOverridden('fromEmail')}
											placeholder="vikunja@example.com"
											onChange={event => updateMailerField('fromEmail', event.currentTarget.value)}
										/>
										{isMailerFieldOverridden('fromEmail') ? (
											<div className="detail-helper-text">Overridden by environment variable.</div>
										) : null}
									</label>
									<div className="detail-item detail-item-full detail-field settings-checkbox-field">
										<div className="detail-label">TLS & transport</div>
										<label className="settings-checkbox-row">
											<input
												data-mailer-field="forceSsl"
												type="checkbox"
												checked={smtpForm.forceSsl}
												disabled={mailerConfigSubmitting || mailerConfigRestarting || !mailerCapabilities.canWrite || isMailerFieldOverridden('forceSsl')}
												onChange={event => updateMailerField('forceSsl', event.currentTarget.checked)}
											/>
											<span>Force SSL for SMTP connections.</span>
										</label>
										{isMailerFieldOverridden('forceSsl') ? (
											<div className="detail-helper-text">Overridden by environment variable.</div>
										) : null}
										<label className="settings-checkbox-row">
											<input
												data-mailer-field="skipTlsVerify"
												type="checkbox"
												checked={smtpForm.skipTlsVerify}
												disabled={mailerConfigSubmitting || mailerConfigRestarting || !mailerCapabilities.canWrite || isMailerFieldOverridden('skipTlsVerify')}
												onChange={event => updateMailerField('skipTlsVerify', event.currentTarget.checked)}
											/>
											<span>Skip TLS certificate verification.</span>
										</label>
										{isMailerFieldOverridden('skipTlsVerify') ? (
											<div className="detail-helper-text">Overridden by environment variable.</div>
										) : null}
									</div>
									<div className="detail-item detail-item-full detail-field">
										<div className="settings-action-row">
											{mailerCapabilities.canWrite ? (
												<button
													className="composer-submit"
													data-action="save-mailer-config"
													type="submit"
													disabled={mailerConfigSubmitting || mailerConfigRestarting || !smtpFormDirty}
												>
													{mailerConfigSubmitting ? 'Saving…' : 'Save'}
												</button>
											) : null}
											{mailerCapabilities.canWrite ? (
												<button
													className="pill-button subtle"
													data-action="apply-mailer-config"
													type="button"
													disabled={mailerConfigSubmitting || mailerConfigRestarting || !mailerCapabilities.canApply || smtpFormDirty}
													onClick={() => {
														void handleApplyMailerConfig()
													}}
												>
													{mailerConfigRestarting ? 'Restarting Vikunja…' : 'Apply & Restart'}
												</button>
											) : null}
										</div>
										{mailerApplyBlockedMessage ? (
											<div className="detail-helper-text">{mailerApplyBlockedMessage}</div>
										) : null}
									</div>
								</form>
							) : null}
						</div>
						<div className="detail-core-card settings-subsection">
							<div className="panel-label">Mail diagnostics</div>
							<div className="empty-state compact">
								Send a test email to verify that this Vikunja instance can deliver mail.
								SMTP must be configured on the server first.
							</div>
							<form className="detail-grid settings-form" data-form="admin-testmail" onSubmit={handleSubmitTestmail}>
								<label className="detail-item detail-item-full detail-field">
									<div className="detail-label">Recipient email</div>
									<input
										className="detail-input"
										data-admin-field="testmail-email"
										type="email"
										value={testmailEmail}
										disabled={mailDiagnosticsSubmitting || mailerConfigRestarting || !adminBridgeReady}
										placeholder="recipient@example.com"
										onChange={event => {
											setTestmailEmail(event.currentTarget.value)
										}}
									/>
								</label>
								<div className="detail-item detail-item-full detail-field">
									<button
										className="composer-submit"
										data-action="send-testmail"
										type="submit"
										disabled={mailDiagnosticsSubmitting || mailerConfigRestarting || !adminBridgeReady || !testmailEmail.trim()}
										title={!adminBridgeReady ? 'Unavailable until this backend can reach the configured Vikunja container and CLI.' : undefined}
									>
										{mailDiagnosticsSubmitting ? 'Sending…' : 'Send test mail'}
									</button>
								</div>
							</form>
							{!adminBridgeReady ? (
								<div className="detail-helper-text">
									Mail diagnostics require the Vikunja CLI bridge to be available first.
								</div>
							) : null}
							{mailDiagnosticsResult ? (
								<div className="settings-mail-diagnostics-result">
									<div className={`settings-status-chip ${mailDiagnosticsResult.success ? 'is-active' : 'is-disabled'}`.trim()}>
										{mailDiagnosticsResult.success ? 'Mail sent successfully' : 'Mail delivery failed'}
									</div>
									{mailDiagnosticsResult.stdout ? (
										<pre className="settings-mail-diagnostics-output">{mailDiagnosticsResult.stdout}</pre>
									) : null}
									{mailDiagnosticsResult.stderr ? (
										<pre className="settings-mail-diagnostics-output is-error">{mailDiagnosticsResult.stderr}</pre>
									) : null}
								</div>
							) : null}
						</div>
					</>
				) : null}
			</SettingsSection>
			<DetailSheet
				open={userDialogOpen}
				closeAction="close-user-dialog"
				onClose={closeUserDialog}
			>
				<div className="sheet-head">
					<div>
						<div className="panel-label">User Administration</div>
						<div className="panel-title">{userDialogMode === 'create' ? 'Create User' : 'Edit User'}</div>
					</div>
				</div>
				<form className="detail-core-card settings-user-dialog" data-form="admin-user-dialog" onSubmit={handleSubmitUserDialog}>
					<div className="detail-grid detail-grid-tight">
						<label className="detail-item detail-field">
							<div className="detail-label">Username</div>
							<input
								className="detail-input"
								data-admin-user-field="username"
								type="text"
								value={userDialogForm.username}
								disabled={adminUserSubmitting}
								onChange={event => {
									const value = event.currentTarget.value
									setUserDialogForm(state => ({
										...state,
										username: value,
									}))
								}}
							/>
						</label>
						<label className="detail-item detail-field">
							<div className="detail-label">Email</div>
							<input
								className="detail-input"
								data-admin-user-field="email"
								type="email"
								value={userDialogForm.email}
								disabled={adminUserSubmitting}
								onChange={event => {
									const value = event.currentTarget.value
									setUserDialogForm(state => ({
										...state,
										email: value,
									}))
								}}
							/>
						</label>
						{userDialogMode === 'create' ? (
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">Password</div>
								<input
									className="detail-input"
									data-admin-user-field="password"
									type="password"
									value={userDialogForm.password}
									disabled={adminUserSubmitting}
									onChange={event => {
										const value = event.currentTarget.value
										setUserDialogForm(state => ({
											...state,
											password: value,
										}))
									}}
								/>
							</label>
						) : null}
					</div>
					<div className="settings-dialog-actions">
						<button className="ghost-button" type="button" disabled={adminUserSubmitting} onClick={closeUserDialog}>
							Cancel
						</button>
						<button className="composer-submit" type="submit" disabled={adminUserSubmitting}>
							{adminUserSubmitting
								? 'Working…'
								: userDialogMode === 'create'
									? 'Create user'
									: 'Save user'}
						</button>
					</div>
				</form>
			</DetailSheet>
			<DetailSheet
				open={Boolean(selectedAdminUser)}
				closeAction="close-admin-user-detail"
				onClose={closeAdminUserDetail}
			>
				{selectedAdminUser ? (
					<>
						<div className="sheet-head">
							<div>
								<div className="panel-label">User Administration</div>
								<div className="panel-title">{selectedAdminUser.username}</div>
							</div>
						</div>
						<div className="detail-core-card settings-admin-user-sheet">
							<div className="settings-admin-user-summary">
								<div className="settings-admin-user-sheet-copy">
									<div className="detail-label">Email</div>
									<div className="detail-value">{selectedAdminUser.email || 'No email'}</div>
									{selectedAdminUserProtectedMessage ? (
										<div className="detail-meta">
											Protected account
											{selectedAdminUserIsCurrent ? ' · Current signed-in account' : ''}
										</div>
									) : null}
								</div>
								<div className={`settings-status-chip ${selectedAdminUser.enabled ? 'is-active' : 'is-disabled'}`.trim()}>
									{selectedAdminUser.enabled ? 'Active' : 'Disabled'}
								</div>
							</div>
							{selectedAdminUserProtectedMessage ? (
								<div className="detail-helper-text settings-admin-user-protection-note">{selectedAdminUserProtectedMessage}</div>
							) : null}
							<div className="settings-action-row settings-admin-user-sheet-actions">
								<button
									className="pill-button subtle"
									type="button"
									onClick={() =>
										openEditAdminUserDialog(
											selectedAdminUser.id,
											selectedAdminUser.username,
											selectedAdminUser.email,
										)
									}
								>
									Edit
								</button>
								<button
									className="pill-button subtle"
									type="button"
									onClick={() => void handleResetAdminUserPassword(selectedAdminUser.id, selectedAdminUser.username)}
								>
									Reset password
								</button>
								{selectedAdminUserProtectedMessage ? null : (
									<>
										<button
											className="pill-button subtle"
											type="button"
											onClick={() => void onSetAdminUserEnabled(selectedAdminUser.id, !selectedAdminUser.enabled)}
										>
											{selectedAdminUser.enabled ? 'Disable' : 'Enable'}
										</button>
										<button
											className="pill-button subtle"
											type="button"
											onClick={async () => {
												const success = await onDeleteAdminUser(selectedAdminUser.id)
												if (success) {
													closeAdminUserDetail()
												}
											}}
										>
											Delete
										</button>
									</>
								)}
							</div>
						</div>
					</>
				) : null}
			</DetailSheet>
		</>
	)
}

function getMailerCapabilityMessage(
	reasonCode: MailerCapabilityReasonCode | null,
	context: 'inspect' | 'write' | 'apply',
) {
	switch (reasonCode) {
		case 'no_bridge':
			return context === 'apply'
				? 'Apply & Restart requires the Vikunja admin bridge to be configured and reachable.'
				: 'SMTP inspection requires the Vikunja admin bridge to be configured and reachable.'
		case 'no_config_path':
			return 'SMTP settings are read-only because no writable deployment config source is configured on the server.'
		case 'unsupported_source_mode':
			return 'SMTP settings are unavailable because the configured admin-config source is incomplete.'
		case 'not_authorized':
			return 'This account is not allowed to manage SMTP settings.'
		default:
			return ''
	}
}

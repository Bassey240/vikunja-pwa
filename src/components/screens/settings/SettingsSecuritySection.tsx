import type {ApiRouteGroups, ApiToken, CalDavToken, TotpSettings, VikunjaInfo} from '@/types'
import CompactDatePicker from '@/components/common/CompactDatePicker'
import {formatLongDate} from '@/utils/formatting'
import type {SettingsSectionId} from '@/utils/settings-helpers'
import {type FormEvent, type ReactNode, useEffect, useMemo, useState} from 'react'
import DetailSheet from '@/components/common/DetailSheet'
import SettingsSection from './SettingsSection'

type SecuritySubsectionId = 'totp' | 'caldav' | 'apiTokens'

export default function SettingsSecuritySection({
	open,
	onToggle,
	currentBaseUrl,
	currentUsername,
	vikunjaInfo,
	vikunjaInfoLoading,
	totpSettings,
	totpSettingsLoading,
	totpSettingsSubmitting,
	totpQrCodeUrl,
	totpEnrolling,
	onLoadTotpStatus,
	onEnrollTotp,
	onEnableTotp,
	onDisableTotp,
	caldavTokens,
	caldavTokensLoading,
	caldavTokenSubmitting,
	newCaldavToken,
	onLoadCaldavTokens,
	onCreateCaldavToken,
	onClearNewCaldavToken,
	onDeleteCaldavToken,
	apiTokens,
	apiTokensLoading,
	apiTokenSubmitting,
	newApiToken,
	availableRoutes,
	availableRoutesLoaded,
	onLoadApiTokens,
	onLoadAvailableRoutes,
	onCreateApiToken,
	onClearNewApiToken,
	onDeleteApiToken,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	currentBaseUrl: string
	currentUsername: string
	vikunjaInfo: VikunjaInfo | null
	vikunjaInfoLoading: boolean
	totpSettings: TotpSettings | null
	totpSettingsLoading: boolean
	totpSettingsSubmitting: boolean
	totpQrCodeUrl: string | null
	totpEnrolling: boolean
	onLoadTotpStatus: () => void
	onEnrollTotp: () => void
	onEnableTotp: (passcode: string) => void
	onDisableTotp: (password: string) => void
	caldavTokens: CalDavToken[]
	caldavTokensLoading: boolean
	caldavTokenSubmitting: boolean
	newCaldavToken: string | null
	onLoadCaldavTokens: () => void
	onCreateCaldavToken: () => void
	onClearNewCaldavToken: () => void
	onDeleteCaldavToken: (id: number) => void
	apiTokens: ApiToken[]
	apiTokensLoading: boolean
	apiTokenSubmitting: boolean
	newApiToken: string | null
	availableRoutes: ApiRouteGroups
	availableRoutesLoaded: boolean
	onLoadApiTokens: () => void
	onLoadAvailableRoutes: () => void
	onCreateApiToken: (title: string, permissions: Record<string, string[]>, expiresAt: string | null) => Promise<boolean>
	onClearNewApiToken: () => void
	onDeleteApiToken: (id: number) => void
}) {
	const [totpPasscode, setTotpPasscode] = useState('')
	const [totpDisablePassword, setTotpDisablePassword] = useState('')
	const [apiTokenTitle, setApiTokenTitle] = useState('')
	const [apiTokenExpiry, setApiTokenExpiry] = useState('')
	const [apiTokenPermissions, setApiTokenPermissions] = useState<Record<string, string[]>>({})
	const [apiTokenDialogOpen, setApiTokenDialogOpen] = useState(false)
	const [copiedField, setCopiedField] = useState<string | null>(null)
	const [openSubsections, setOpenSubsections] = useState<Record<SecuritySubsectionId, boolean>>({
		totp: false,
		caldav: false,
		apiTokens: false,
	})

	useEffect(() => {
		if (!open) {
			return
		}

		onLoadTotpStatus()
		onLoadCaldavTokens()
		onLoadApiTokens()
		onLoadAvailableRoutes()
	}, [onLoadApiTokens, onLoadAvailableRoutes, onLoadCaldavTokens, onLoadTotpStatus, open])

	const routeGroups = useMemo(() => {
		return Object.entries(availableRoutes)
			.map(([resource, permissions]) => ({
				resource,
				permissions: Object.entries(permissions)
					.map(([permission]) => permission)
					.sort((left, right) => left.localeCompare(right)),
			}))
			.filter(group => group.permissions.length > 0)
			.sort((left, right) => {
				if (left.resource === 'other') {
					return 1
				}
				if (right.resource === 'other') {
					return -1
				}
				return left.resource.localeCompare(right.resource)
			})
	}, [availableRoutes])
	const caldavDetails = useMemo(
		() => buildCaldavConnectionDetails(currentBaseUrl, currentUsername),
		[currentBaseUrl, currentUsername],
	)
	const caldavEnabled = vikunjaInfo?.caldav_enabled
	const caldavConnectionReady = Boolean(caldavDetails.baseUrl && caldavDetails.discoveryUrl && caldavDetails.username)
	const hasSelectedApiPermissions = useMemo(
		() => Object.values(apiTokenPermissions).some(values => values.length > 0),
		[apiTokenPermissions],
	)

	async function handleEnableTotp(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		onEnableTotp(totpPasscode)
		setTotpPasscode('')
	}

	async function handleDisableTotp(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		onDisableTotp(totpDisablePassword)
		setTotpPasscode('')
		setTotpDisablePassword('')
	}

	async function handleCreateApiToken(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!apiTokenTitle.trim() || !apiTokenExpiry.trim() || !hasSelectedApiPermissions) {
			return
		}

		const permissions = Object.fromEntries(
			Object.entries(apiTokenPermissions)
				.map(([resource, values]) => [resource, values.filter(Boolean)])
				.filter(([, values]) => values.length > 0),
		)
		const success = await onCreateApiToken(apiTokenTitle, permissions, toExpiryTimestamp(apiTokenExpiry))
		if (!success) {
			return
		}
		closeApiTokenDialog()
	}

	function openApiTokenDialog() {
		setApiTokenDialogOpen(true)
	}

	function closeApiTokenDialog() {
		setApiTokenTitle('')
		setApiTokenExpiry('')
		setApiTokenPermissions({})
		setApiTokenDialogOpen(false)
	}

	function selectAllApiPermissions() {
		setApiTokenPermissions(
			Object.fromEntries(
				routeGroups
					.filter(group => group.permissions.length > 0)
					.map(group => [group.resource, [...group.permissions]]),
			),
		)
	}

	function togglePermission(resource: string, permission: string, enabled: boolean) {
		setApiTokenPermissions(state => {
			const current = new Set(state[resource] || [])
			if (enabled) {
				current.add(permission)
			} else {
				current.delete(permission)
			}

			return {
				...state,
				[resource]: [...current].sort((left, right) => left.localeCompare(right)),
			}
		})
	}

	function toggleSubsection(section: SecuritySubsectionId) {
		setOpenSubsections(state => ({
			totp: false,
			caldav: false,
			apiTokens: false,
			[section]: !state[section],
		}))
	}

	async function copyValue(value: string | null, field: string) {
		if (!value) {
			return
		}

		try {
			await navigator.clipboard.writeText(value)
			setCopiedField(field)
			window.setTimeout(() => {
				setCopiedField(current => (current === field ? null : current))
			}, 1600)
		} catch {
			window.prompt('Copy this value', value)
		}
	}

	return (
		<SettingsSection title="Security" section="security" open={open} onToggle={onToggle}>
			<div className="detail-section-list">
				<SecuritySubsection
					title="Two-Factor Authentication"
					section="totp"
					open={openSubsections.totp}
					onToggle={toggleSubsection}
				>
					{totpSettingsLoading ? <div className="empty-state compact">Loading 2FA status…</div> : null}
					{totpSettings?.enabled ? (
						<>
							<div className="status-card success">2FA is active for this Vikunja account.</div>
							<form className="detail-grid settings-form" data-form="disable-totp" onSubmit={handleDisableTotp}>
								<label className="detail-item detail-item-full detail-field">
									<div className="detail-label">Password</div>
									<input
										className="detail-input"
										data-totp-field="password"
										type="password"
										value={totpDisablePassword}
										disabled={totpSettingsSubmitting}
										onChange={event => setTotpDisablePassword(event.currentTarget.value)}
									/>
								</label>
								<div className="detail-item detail-item-full detail-field">
									<button className="composer-submit danger" type="submit" disabled={totpSettingsSubmitting}>
										{totpSettingsSubmitting ? 'Disabling…' : 'Disable 2FA'}
									</button>
								</div>
							</form>
						</>
					) : totpEnrolling ? (
						<>
							<div className="empty-state compact">
								Scan the QR code in your authenticator app, or use the manual setup fields below, then enter the generated passcode.
							</div>
							{totpQrCodeUrl ? <img src={totpQrCodeUrl} alt="TOTP QR code" className="settings-totp-qr" /> : null}
							{totpSettings?.secret ? (
								<CopyableField
									label="Manual setup secret"
									value={totpSettings.secret}
									outputId="totp-secret"
									copyField="totp-secret"
									copiedField={copiedField}
									onCopy={copyValue}
								/>
							) : null}
							{totpSettings?.totpUrl ? (
								<CopyableField
									label="Manual setup URL"
									value={totpSettings.totpUrl}
									outputId="totp-url"
									copyField="totp-url"
									copiedField={copiedField}
									onCopy={copyValue}
								/>
							) : null}
							<form className="detail-grid settings-form" data-form="enable-totp" onSubmit={handleEnableTotp}>
								<label className="detail-item detail-item-full detail-field">
									<div className="detail-label">Passcode</div>
									<input
										className="detail-input"
										data-totp-field="passcode"
										type="text"
										inputMode="numeric"
										autoComplete="one-time-code"
										value={totpPasscode}
										disabled={totpSettingsSubmitting}
										onChange={event => setTotpPasscode(event.currentTarget.value)}
									/>
								</label>
								<div className="detail-item detail-item-full detail-field">
									<button className="composer-submit" type="submit" disabled={totpSettingsSubmitting || !totpPasscode.trim()}>
										{totpSettingsSubmitting ? 'Activating…' : 'Activate 2FA'}
									</button>
								</div>
							</form>
							<form className="detail-grid settings-form" data-form="cancel-totp-enrollment" onSubmit={handleDisableTotp}>
								<label className="detail-item detail-item-full detail-field">
									<div className="detail-label">Password</div>
									<input
										className="detail-input"
										data-totp-field="cancel-password"
										type="password"
										value={totpDisablePassword}
										disabled={totpSettingsSubmitting}
										onChange={event => setTotpDisablePassword(event.currentTarget.value)}
									/>
								</label>
								<div className="detail-item detail-item-full detail-field">
									<button
										className="composer-submit danger"
										data-action="cancel-totp-enrollment"
										type="submit"
										disabled={totpSettingsSubmitting || !totpDisablePassword}
									>
										{totpSettingsSubmitting ? 'Cancelling…' : 'Cancel setup'}
									</button>
								</div>
							</form>
						</>
					) : (
						<div className="settings-action-row">
							<button
								className="composer-submit"
								data-action="enroll-totp"
								type="button"
								disabled={totpSettingsSubmitting}
								onClick={onEnrollTotp}
							>
								{totpSettingsSubmitting ? 'Starting…' : 'Enable two-factor authentication'}
							</button>
						</div>
					)}
				</SecuritySubsection>

				<SecuritySubsection
					title="CalDAV"
					section="caldav"
					open={openSubsections.caldav}
					onToggle={toggleSubsection}
				>
					{vikunjaInfoLoading ? <div className="empty-state compact">Loading CalDAV availability…</div> : null}
					{caldavEnabled === false ? (
						<div className="status-card warning">CalDAV is disabled on this Vikunja instance.</div>
					) : (
						<>
							<div className="empty-state compact">
								Generated CalDAV tokens are shown once. Copy and save them before clearing this panel.
							</div>
							{caldavConnectionReady ? (
								<div className="detail-grid settings-form">
									<CopyableField
										label="CalDAV base URL"
										value={caldavDetails.baseUrl || ''}
										outputId="caldav-base-url"
										copyField="caldav-base-url"
										copiedField={copiedField}
										onCopy={copyValue}
									/>
									<CopyableField
										label="Discovery URL"
										value={caldavDetails.discoveryUrl || ''}
										outputId="caldav-discovery-url"
										copyField="caldav-discovery-url"
										copiedField={copiedField}
										onCopy={copyValue}
									/>
									<CopyableField
										label="Username"
										value={caldavDetails.username || ''}
										outputId="caldav-username"
										copyField="caldav-username"
										copiedField={copiedField}
										onCopy={copyValue}
										fullWidth={false}
									/>
								</div>
							) : (
								<div className="empty-state compact">
									CalDAV connection details will appear after the app knows your connected server URL and username.
								</div>
							)}
							<div className="settings-subsection-header">
								<div className="panel-label">CalDAV Tokens</div>
								<button
									className="pill-button subtle"
									data-action="create-caldav-token"
									type="button"
									disabled={caldavTokenSubmitting}
									onClick={onCreateCaldavToken}
								>
									{caldavTokenSubmitting ? 'Generating…' : 'Generate token'}
								</button>
							</div>
							{newCaldavToken ? (
								<div className="detail-grid settings-form">
									<CopyableField
										label="New token"
										value={newCaldavToken}
										outputId="new-caldav-token"
										copyField="new-caldav-token"
										copiedField={copiedField}
										onCopy={copyValue}
									/>
									<div className="detail-item detail-item-full detail-field">
										<button className="pill-button subtle" data-action="clear-caldav-token" type="button" onClick={onClearNewCaldavToken}>
											I&apos;ve copied this
										</button>
									</div>
								</div>
							) : null}
							{caldavTokensLoading ? <div className="empty-state compact">Loading CalDAV tokens…</div> : null}
							{!caldavTokensLoading && caldavTokens.length === 0 ? (
								<div className="empty-state compact">No CalDAV tokens yet.</div>
							) : null}
							{caldavTokens.length > 0 ? (
								<div className="settings-session-list">
									{caldavTokens.map(token => (
										<div key={token.id} className="settings-session-row">
											<div>
												<div className="detail-value">Token #{token.id}</div>
												<div className="detail-meta">{token.created ? formatLongDate(token.created) : 'Unknown creation time'}</div>
											</div>
											<button
												className="pill-button subtle"
												data-action="delete-caldav-token"
												data-token-id={token.id}
												type="button"
												disabled={caldavTokenSubmitting}
												onClick={() => onDeleteCaldavToken(token.id)}
											>
												Delete
											</button>
										</div>
									))}
								</div>
							) : null}
						</>
					)}
				</SecuritySubsection>

				<SecuritySubsection
					title="API Tokens"
					section="apiTokens"
					open={openSubsections.apiTokens}
					onToggle={toggleSubsection}
				>
					<div className="settings-action-row">
						<button
							className="pill-button subtle"
							data-action="open-api-token-dialog"
							type="button"
							disabled={apiTokenSubmitting}
							onClick={openApiTokenDialog}
						>
							Generate API token
						</button>
					</div>
					{newApiToken ? (
						<div className="detail-grid settings-form">
							<CopyableField
								label="New API token"
								value={newApiToken}
								outputId="new-api-token"
								copyField="new-api-token"
								copiedField={copiedField}
								onCopy={copyValue}
							/>
							<div className="detail-item detail-item-full detail-field">
								<button className="pill-button subtle" data-action="clear-api-token" type="button" onClick={onClearNewApiToken}>
									I&apos;ve copied this
								</button>
							</div>
						</div>
					) : null}
					{apiTokensLoading ? <div className="empty-state compact">Loading API tokens…</div> : null}
					{!apiTokensLoading && apiTokens.length === 0 ? <div className="empty-state compact">No API tokens yet.</div> : null}
					{apiTokens.length > 0 ? (
						<div className="settings-session-list">
							{apiTokens.map(token => (
								<div key={token.id} className="settings-session-row">
									<div>
										<div className="detail-value">{token.title || `Token #${token.id}`}</div>
										<div className="detail-meta">
											Created {token.created ? formatLongDate(token.created) : 'Unknown'}
											{token.expires_at ? ` · Expires ${formatLongDate(token.expires_at)}` : ' · No expiry'}
										</div>
									</div>
									<button
										className="pill-button subtle"
										data-action="delete-api-token"
										data-token-id={token.id}
										type="button"
										disabled={apiTokenSubmitting}
										onClick={() => onDeleteApiToken(token.id)}
									>
										Delete
									</button>
								</div>
							))}
						</div>
					) : null}
				</SecuritySubsection>
			</div>
			<DetailSheet
				open={apiTokenDialogOpen}
				closeAction="close-api-token-dialog"
				onClose={closeApiTokenDialog}
			>
				<div className="sheet-head">
					<div>
						<div className="panel-label">API Tokens</div>
						<div className="panel-title">Create API token</div>
					</div>
				</div>
				<form className="detail-core-card settings-user-dialog" data-form="create-api-token-sheet" onSubmit={handleCreateApiToken}>
					<div className="detail-grid detail-grid-tight">
						<label className="detail-item detail-field">
							<div className="detail-label">Title</div>
							<input
								className="detail-input"
								data-api-token-field="title"
								type="text"
								value={apiTokenTitle}
								disabled={apiTokenSubmitting}
								onChange={event => setApiTokenTitle(event.currentTarget.value)}
							/>
						</label>
						<div className="detail-item detail-field">
							<div className="detail-label">Expiry date</div>
							<CompactDatePicker
								label="Expiry date"
								value={apiTokenExpiry}
								onChange={setApiTokenExpiry}
								allowEmpty={true}
								showLabel={false}
								inputProps={{
									'data-api-token-field': 'expiry',
									disabled: apiTokenSubmitting,
								}}
							/>
						</div>
						<div className="detail-item detail-item-full detail-field">
							<div className="settings-subsection-header">
								<div className="detail-label">Permissions</div>
								<button
									className="pill-button subtle"
									data-action="select-all-api-token-permissions"
									type="button"
									disabled={apiTokenSubmitting || !availableRoutesLoaded || routeGroups.length === 0}
									onClick={selectAllApiPermissions}
								>
									Select all
								</button>
							</div>
							{!availableRoutesLoaded ? <div className="empty-state compact">Loading available route permissions…</div> : null}
							{availableRoutesLoaded && routeGroups.length === 0 ? (
								<div className="empty-state compact">No token routes were returned by Vikunja.</div>
							) : null}
							{routeGroups.map(group => (
								<div key={group.resource} className="detail-core-card settings-subsection">
									<div className="detail-value">{group.resource}</div>
									<div className="detail-grid detail-grid-tight">
										{group.permissions.map(permission => {
											const checked = (apiTokenPermissions[group.resource] || []).includes(permission)
											return (
												<label key={permission} className="detail-item detail-field settings-checkbox-row">
													<input
														data-api-token-permission={`${group.resource}:${permission}`}
														type="checkbox"
														checked={checked}
														disabled={apiTokenSubmitting}
														onChange={event => togglePermission(group.resource, permission, event.currentTarget.checked)}
													/>
													<span>{permission}</span>
												</label>
											)
										})}
									</div>
								</div>
							))}
						</div>
					</div>
					<div className="settings-dialog-actions">
						<button className="ghost-button" type="button" disabled={apiTokenSubmitting} onClick={closeApiTokenDialog}>
							Cancel
						</button>
						<button
							className="composer-submit"
							type="submit"
							disabled={apiTokenSubmitting || !apiTokenTitle.trim() || !apiTokenExpiry.trim() || !hasSelectedApiPermissions}
						>
							{apiTokenSubmitting ? 'Creating…' : 'Create API token'}
						</button>
					</div>
				</form>
			</DetailSheet>
		</SettingsSection>
	)
}

function SecuritySubsection({
	title,
	section,
	open,
	onToggle,
	children,
}: {
	title: string
	section: SecuritySubsectionId
	open: boolean
	onToggle: (section: SecuritySubsectionId) => void
	children: ReactNode
}) {
	return (
		<div className="detail-core-card settings-subsection" data-settings-subsection={section}>
			<button
				className="settings-section-title"
				data-action="toggle-settings-subsection"
				data-settings-subsection-toggle={section}
				type="button"
				aria-expanded={open ? 'true' : 'false'}
				onClick={() => onToggle(section)}
			>
				<div className="settings-subsection-header">
					<span className="panel-label">{title}</span>
					<span className="detail-section-chevron" aria-hidden="true">
						{open ? '▾' : '▸'}
					</span>
				</div>
			</button>
			{open ? children : null}
		</div>
	)
}

function CopyableField({
	label,
	value,
	outputId,
	copyField,
	copiedField,
	onCopy,
	fullWidth = true,
}: {
	label: string
	value: string
	outputId: string
	copyField: string
	copiedField: string | null
	onCopy: (value: string | null, field: string) => Promise<void>
	fullWidth?: boolean
}) {
	return (
		<div className={`detail-item detail-field ${fullWidth ? 'detail-item-full' : ''}`.trim()}>
			<div className="detail-label">{label}</div>
			<div className="settings-copy-field-row">
				<input className="detail-input" data-security-output={outputId} type="text" readOnly value={value} />
				<button
					className="pill-button subtle settings-copy-field-button"
					data-action="copy-security-output"
					data-copy-field={copyField}
					type="button"
					onClick={() => void onCopy(value, copyField)}
				>
					{copiedField === copyField ? 'Copied' : 'Copy'}
				</button>
			</div>
		</div>
	)
}


function buildCaldavConnectionDetails(apiBaseUrl: string, username: string) {
	const baseUrl = deriveCaldavBaseUrl(apiBaseUrl)
	const normalizedUsername = `${username || ''}`.trim()

	return {
		baseUrl,
		discoveryUrl:
			baseUrl && normalizedUsername
				? new URL(`principals/${encodeURIComponent(normalizedUsername)}/`, baseUrl).toString()
				: null,
		username: normalizedUsername || null,
	}
}

function deriveCaldavBaseUrl(apiBaseUrl: string) {
	const candidate = `${apiBaseUrl || ''}`.trim()
	if (!candidate) {
		return null
	}

	try {
		const url = new URL(candidate)
		const pathname = url.pathname.replace(/\/+$/, '')
		const rootPath = pathname.endsWith('/api/v1') ? pathname.slice(0, -'/api/v1'.length) : pathname
		url.pathname = joinUrlPath(rootPath, 'dav/')
		url.search = ''
		url.hash = ''
		return url.toString()
	} catch {
		return null
	}
}

function joinUrlPath(basePath: string, suffix: string) {
	const left = `${basePath || ''}`.replace(/\/+$/, '')
	const right = `${suffix || ''}`.replace(/^\/+/, '')
	const combined = [left, right].filter(Boolean).join('/')
	return `/${combined.replace(/^\/+/, '')}`
}

function toExpiryTimestamp(value: string) {
	if (!value) {
		return null
	}

	return new Date(`${value}T23:59:59`).toISOString()
}

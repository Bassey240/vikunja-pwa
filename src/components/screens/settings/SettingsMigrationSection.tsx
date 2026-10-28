import type {MigrationService, MigrationStatus, MigrationStatusValue, PlankaMigrationCredentials} from '@/types'
import {formatLongDate} from '@/utils/formatting'
import type {SettingsSectionId} from '@/utils/settings-helpers'
import {useEffect, useMemo, useState} from 'react'
import SettingsSection from './SettingsSection'

const MIGRATION_SERVICES: Array<{
	service: MigrationService
	label: string
	description: string
	mode: 'oauth' | 'file' | 'csv' | 'credentials'
	accept?: string
}> = [
	{
		service: 'todoist',
		label: 'Todoist',
		description: 'Import projects and tasks from a Todoist account through the Vikunja OAuth-based importer.',
		mode: 'oauth',
	},
	{
		service: 'trello',
		label: 'Trello',
		description: 'Import Trello boards through the Vikunja OAuth-based importer.',
		mode: 'oauth',
	},
	{
		service: 'microsoft-todo',
		label: 'Microsoft To Do',
		description: 'Import Microsoft To Do lists and tasks through the Vikunja OAuth-based importer.',
		mode: 'oauth',
	},
	{
		service: 'planka',
		label: 'Planka',
		description: 'Import projects, boards, cards, labels and comments directly from a Planka 2 server.',
		mode: 'credentials',
	},
	{
		service: 'ticktick',
		label: 'TickTick',
		description: 'Upload a TickTick export file and let Vikunja import it in the background.',
		mode: 'file',
		accept: '.csv,.txt,text/csv,text/plain',
	},
	{
		service: 'wekan',
		label: 'WeKan',
		description: 'Upload a WeKan board export and let Vikunja import projects, tasks, buckets, labels, and attachments.',
		mode: 'file',
		accept: '.json,application/json',
	},
	{
		service: 'csv',
		label: 'CSV',
		description: 'Analyze a CSV file, map columns to Vikunja fields, preview the result, and import tasks in one pass.',
		mode: 'csv',
	},
	{
		service: 'vikunja-file',
		label: 'Vikunja File',
		description: 'Upload a Vikunja export archive and restore it as an import inside your connected account.',
		mode: 'file',
		accept: '.zip,application/zip,application/x-zip-compressed',
	},
]

const MIGRATION_FAILURE_MESSAGES: Record<string, string> = {
	reported: 'Import failed. Check the Vikunja server logs for details.',
	interrupted: 'Import was interrupted before it finished.',
	credentials: 'Import failed because the source credentials were rejected.',
	queue: 'Import could not be queued.',
	upload: 'The uploaded import file could not be read.',
}

export default function SettingsMigrationSection({
	open,
	nativeOnly = false,
	onToggle,
	availableMigrationServices,
	migrationAvailabilityResolved,
	vikunjaInfoLoading,
	publicAppOrigin,
	canManageUsers,
	migrationStatus,
	migrationMessages,
	migrationDetails,
	migrationLoadingServices,
	migrationSubmittingServices,
	onLoadMigrationStatus,
	onGetMigrationAuthUrl,
	onUploadFileMigration,
	onImportPlanka,
	onOpenCsvImporter,
	onOpenMigrationProviderSettings,
}: {
	open: boolean
	nativeOnly?: boolean
	onToggle: (section: SettingsSectionId) => void
	availableMigrationServices: Set<MigrationService> | null
	migrationAvailabilityResolved: boolean
	vikunjaInfoLoading: boolean
	publicAppOrigin: string | null
	canManageUsers: boolean
	migrationStatus: Partial<Record<MigrationService, MigrationStatusValue>>
	migrationMessages: Partial<Record<MigrationService, string | null>>
	migrationDetails: Partial<Record<MigrationService, MigrationStatus>>
	migrationLoadingServices: Set<MigrationService>
	migrationSubmittingServices: Set<MigrationService>
	onLoadMigrationStatus: (service: MigrationService) => void
	onGetMigrationAuthUrl: (service: MigrationService) => Promise<string | null>
	onUploadFileMigration: (service: MigrationService, file: File) => Promise<boolean>
	onImportPlanka: (credentials: PlankaMigrationCredentials) => Promise<boolean>
	onOpenCsvImporter: () => void
	onOpenMigrationProviderSettings: () => void
}) {
	const [selectedFiles, setSelectedFiles] = useState<Partial<Record<MigrationService, File | null>>>({})
	const [plankaUrl, setPlankaUrl] = useState('')
	const [plankaAuth, setPlankaAuth] = useState('token')
	const [plankaToken, setPlankaToken] = useState('')
	const [plankaUsername, setPlankaUsername] = useState('')
	const [plankaPassword, setPlankaPassword] = useState('')
	const enabledServiceEntries = useMemo(
		() => (
			availableMigrationServices
				? MIGRATION_SERVICES.filter(entry => (!nativeOnly || entry.mode !== 'oauth') && availableMigrationServices.has(entry.service))
				: migrationAvailabilityResolved
					? MIGRATION_SERVICES.filter(entry => entry.service !== 'planka' && (!nativeOnly || entry.mode !== 'oauth'))
					: []
		),
		[availableMigrationServices, migrationAvailabilityResolved, nativeOnly],
	)
	const unavailableServiceEntries = useMemo(
		() => (
			!nativeOnly && availableMigrationServices && migrationAvailabilityResolved
				? MIGRATION_SERVICES.filter(entry => entry.service !== 'planka' && !availableMigrationServices.has(entry.service))
				: []
		),
		[availableMigrationServices, migrationAvailabilityResolved, nativeOnly],
	)
	const serviceEntryKey = enabledServiceEntries.map(entry => entry.service).join('|')
	const runningServiceKey = enabledServiceEntries.filter(entry => migrationStatus[entry.service] === 'running').map(entry => entry.service).join('|')
	const appOrigin = `${publicAppOrigin || (typeof window !== 'undefined' ? window.location.origin : '')}`.trim()

	useEffect(() => {
		if (!open) {
			return
		}

		enabledServiceEntries.forEach(entry => {
			onLoadMigrationStatus(entry.service)
		})
	}, [enabledServiceEntries, onLoadMigrationStatus, open, serviceEntryKey])

	useEffect(() => {
		if (!open || !runningServiceKey) return
		const services = runningServiceKey.split('|') as MigrationService[]
		const timer = window.setInterval(() => services.forEach(onLoadMigrationStatus), 3000)
		return () => window.clearInterval(timer)
	}, [onLoadMigrationStatus, open, runningServiceKey])

	return (
		<SettingsSection title="Migration" section="migration" open={open} onToggle={onToggle}>
			<div className="empty-state compact">
				{nativeOnly
					? 'Choose an enabled importer below. Progress updates here while the import runs.'
					: 'Start one-time imports from other services here. OAuth-based imports redirect through the service and then return to the redirect URL configured on the Vikunja server. If that callback still points at the original Vikunja frontend, finish the import there or update the migration provider redirect URL in Administration. CSV imports stay in this PWA and use a detect, preview, and import flow instead.'}
			</div>
			{vikunjaInfoLoading && !migrationAvailabilityResolved ? (
				<div className="empty-state compact">Checking which importers are enabled on this Vikunja instance…</div>
			) : null}
			{!vikunjaInfoLoading && migrationAvailabilityResolved && enabledServiceEntries.length === 0 ? (
				<div className="empty-state compact">No importers are enabled on this Vikunja instance.</div>
			) : null}
			<div className="migration-service-list">
				{enabledServiceEntries.map(entry => {
					const status = migrationStatus[entry.service] || 'idle'
					const details = migrationDetails[entry.service]
					const failureMessage = status === 'error' && details?.error_kind ? MIGRATION_FAILURE_MESSAGES[details.error_kind] : null
					const statusMessage = failureMessage || migrationMessages[entry.service] || (status === 'done' ? 'Import completed.' : null)
					const loading = migrationLoadingServices.has(entry.service)
					const submitting = migrationSubmittingServices.has(entry.service)
					return (
						<div key={entry.service} className="detail-item detail-field migration-service-card" data-migration-service={entry.service}>
							<div className="migration-service-row">
								<div>
									<div className="detail-label">{entry.label}</div>
									<div className="detail-value">{entry.mode === 'oauth' ? 'OAuth import' : entry.mode === 'csv' ? 'Guided CSV import' : entry.mode === 'credentials' ? 'Server import' : 'File import'}</div>
								</div>
								<div className={`count-chip migration-status-chip status-${status}`.trim()} role="status">
									{loading && status === 'idle' ? 'Checking…' : formatMigrationStatus(status)}
								</div>
							</div>
							<div className="detail-meta">{entry.description}</div>
							{statusMessage ? <div className="detail-helper-text">{statusMessage}</div> : null}
							{details?.started_at ? <div className="detail-meta">Started: <time dateTime={details.started_at}>{formatLongDate(details.started_at)}</time></div> : null}
							{details?.finished_at ? <div className="detail-meta">Finished: <time dateTime={details.finished_at}>{formatLongDate(details.finished_at)}</time></div> : null}
							{status === 'running' ? <div className="detail-helper-text">Updates automatically while this section is open.</div> : null}
							{entry.mode === 'credentials' ? (
								<form className="detail-grid" onSubmit={event => {
									event.preventDefault()
									const credentials = plankaAuth === 'token'
										? {url: plankaUrl.trim(), token: plankaToken.trim()}
										: {url: plankaUrl.trim(), username: plankaUsername.trim(), password: plankaPassword}
									void onImportPlanka(credentials).then(success => {
										if (success) {
											setPlankaToken('')
											setPlankaPassword('')
										}
									})
								}}>
									<label className="detail-field detail-item-full">
										<span className="detail-label">Planka server URL</span>
										<input className="detail-input" type="url" required value={plankaUrl} onChange={event => setPlankaUrl(event.currentTarget.value)} placeholder="https://planka.example.com" disabled={submitting} />
									</label>
									<label className="detail-field detail-item-full">
										<span className="detail-label">Sign in with</span>
										<select className="detail-input" value={plankaAuth} onChange={event => setPlankaAuth(event.currentTarget.value)} disabled={submitting}>
											<option value="token">API key</option>
											<option value="password">Username and password</option>
										</select>
									</label>
									{plankaAuth === 'token' ? <label className="detail-field detail-item-full">
										<span className="detail-label">Planka API key</span>
										<input className="detail-input" type="password" autoComplete="off" required value={plankaToken} onChange={event => setPlankaToken(event.currentTarget.value)} disabled={submitting} />
									</label> : <>
										<label className="detail-field">
											<span className="detail-label">Planka username or email</span>
											<input className="detail-input" autoComplete="off" required value={plankaUsername} onChange={event => setPlankaUsername(event.currentTarget.value)} disabled={submitting} />
										</label>
										<label className="detail-field">
											<span className="detail-label">Planka password</span>
											<input className="detail-input" type="password" autoComplete="off" required value={plankaPassword} onChange={event => setPlankaPassword(event.currentTarget.value)} disabled={submitting} />
										</label>
									</>}
									<div className="detail-helper-text detail-item-full">Use an API key created by a Planka administrator, or a local account without two-factor authentication. Credentials are used only for this import.</div>
									<div className="detail-inline-actions detail-item-full">
										<button className="pill-button" type="submit" disabled={submitting || status === 'running'}>{submitting ? 'Starting…' : 'Import from Planka'}</button>
										<button className="pill-button subtle" type="button" disabled={loading} onClick={() => onLoadMigrationStatus(entry.service)}>Refresh status</button>
									</div>
								</form>
							) : entry.mode === 'oauth' ? (
								<>
									{appOrigin ? (
										<div className="detail-helper-text">
											Recommended PWA callback: <code>{`${appOrigin}/migrate/${entry.service}`}</code>
										</div>
									) : null}
									<div className="detail-inline-actions">
										<button
											className="pill-button"
											type="button"
											disabled={submitting}
											onClick={() => {
												void onGetMigrationAuthUrl(entry.service).then(authUrl => {
													if (authUrl) {
														window.location.assign(authUrl)
													}
												})
											}}
										>
											{submitting ? 'Redirecting…' : 'Connect & Import'}
										</button>
										<button
											className="pill-button subtle"
											type="button"
											disabled={loading}
											onClick={() => onLoadMigrationStatus(entry.service)}
										>
											Refresh status
										</button>
									</div>
								</>
							) : entry.mode === 'csv' ? (
								<div className="detail-inline-actions">
									<button
										className="pill-button"
										type="button"
										onClick={onOpenCsvImporter}
									>
										Open CSV Importer
									</button>
									<button
										className="pill-button subtle"
										type="button"
										disabled={loading}
										onClick={() => onLoadMigrationStatus(entry.service)}
									>
										Refresh status
									</button>
								</div>
							) : (
								<div className="detail-inline-actions migration-file-actions">
									<input
										className="detail-input"
										type="file"
										data-migration-file-input={entry.service}
										accept={entry.accept}
										disabled={submitting}
										onChange={event => {
											const file = event.currentTarget.files?.[0] || null
											setSelectedFiles(current => ({
												...current,
												[entry.service]: file,
											}))
										}}
									/>
									<button
										className="pill-button"
										type="button"
										disabled={submitting || !(selectedFiles[entry.service] instanceof File)}
										onClick={() => {
											const file = selectedFiles[entry.service]
											if (file instanceof File) {
												void onUploadFileMigration(entry.service, file)
											}
										}}
									>
										{submitting ? 'Uploading…' : 'Upload & Import'}
									</button>
									<button
										className="pill-button subtle"
										type="button"
										disabled={loading}
										onClick={() => onLoadMigrationStatus(entry.service)}
									>
										Refresh status
									</button>
								</div>
							)}
						</div>
					)
				})}
				{unavailableServiceEntries.map(entry => (
					<div
						key={entry.service}
						className="detail-item detail-field migration-service-card is-unavailable"
						data-migration-service={entry.service}
						data-migration-available="false"
					>
						<div className="migration-service-row">
							<div>
								<div className="detail-label">{entry.label}</div>
								<div className="detail-value">{entry.mode === 'oauth' ? 'OAuth import' : entry.mode === 'csv' ? 'Guided CSV import' : 'File import'}</div>
							</div>
							<div className="count-chip migration-status-chip status-unavailable">
								Not enabled
							</div>
						</div>
						<div className="detail-meta">{entry.description}</div>
						<div className="detail-helper-text">
							{entry.mode === 'oauth'
								? canManageUsers
									? 'This importer is supported but not enabled on this Vikunja instance yet.'
									: 'This importer is supported but not enabled on this Vikunja instance yet. Ask an operator to enable it.'
								: 'This importer is not currently available from the connected Vikunja instance.'}
						</div>
						{entry.mode === 'oauth' && canManageUsers ? (
							<div className="detail-inline-actions">
								<button
									className="pill-button"
									type="button"
									onClick={() => {
										onOpenMigrationProviderSettings()
									}}
								>
									Enable provider
								</button>
							</div>
						) : null}
					</div>
				))}
			</div>
		</SettingsSection>
	)
}

function formatMigrationStatus(status: MigrationStatusValue) {
	switch (status) {
		case 'running':
			return 'Running'
		case 'done':
			return 'Done'
		case 'error':
			return 'Error'
		default:
			return 'Idle'
	}
}

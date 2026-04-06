import type {MigrationService, MigrationStatusValue} from '@/types'
import type {SettingsSectionId} from '@/utils/settings-helpers'
import {useEffect, useMemo, useState} from 'react'
import SettingsSection from './SettingsSection'

const MIGRATION_SERVICES: Array<{
	service: MigrationService
	label: string
	description: string
	mode: 'oauth' | 'file'
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
		service: 'ticktick',
		label: 'TickTick',
		description: 'Upload a TickTick export file and let Vikunja import it in the background.',
		mode: 'file',
	},
	{
		service: 'vikunja-file',
		label: 'Vikunja File',
		description: 'Upload a Vikunja export archive and restore it as an import inside your connected account.',
		mode: 'file',
	},
]

export default function SettingsMigrationSection({
	open,
	onToggle,
	availableMigrationServices,
	migrationAvailabilityResolved,
	vikunjaInfoLoading,
	publicAppOrigin,
	canManageUsers,
	migrationStatus,
	migrationMessages,
	migrationLoadingServices,
	migrationSubmittingServices,
	onLoadMigrationStatus,
	onGetMigrationAuthUrl,
	onUploadFileMigration,
	onOpenMigrationProviderSettings,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	availableMigrationServices: Set<MigrationService> | null
	migrationAvailabilityResolved: boolean
	vikunjaInfoLoading: boolean
	publicAppOrigin: string | null
	canManageUsers: boolean
	migrationStatus: Partial<Record<MigrationService, MigrationStatusValue>>
	migrationMessages: Partial<Record<MigrationService, string | null>>
	migrationLoadingServices: Set<MigrationService>
	migrationSubmittingServices: Set<MigrationService>
	onLoadMigrationStatus: (service: MigrationService) => void
	onGetMigrationAuthUrl: (service: MigrationService) => Promise<string | null>
	onUploadFileMigration: (service: MigrationService, file: File) => Promise<boolean>
	onOpenMigrationProviderSettings: () => void
}) {
	const [selectedFiles, setSelectedFiles] = useState<Partial<Record<MigrationService, File | null>>>({})
	const enabledServiceEntries = useMemo(
		() => (
			availableMigrationServices
				? MIGRATION_SERVICES.filter(entry => availableMigrationServices.has(entry.service))
				: migrationAvailabilityResolved
					? MIGRATION_SERVICES
					: []
		),
		[availableMigrationServices, migrationAvailabilityResolved],
	)
	const unavailableServiceEntries = useMemo(
		() => (
			availableMigrationServices && migrationAvailabilityResolved
				? MIGRATION_SERVICES.filter(entry => !availableMigrationServices.has(entry.service))
				: []
		),
		[availableMigrationServices, migrationAvailabilityResolved],
	)
	const serviceEntryKey = enabledServiceEntries.map(entry => entry.service).join('|')
	const appOrigin = `${publicAppOrigin || (typeof window !== 'undefined' ? window.location.origin : '')}`.trim()

	useEffect(() => {
		if (!open) {
			return
		}

		enabledServiceEntries.forEach(entry => {
			onLoadMigrationStatus(entry.service)
		})
	}, [enabledServiceEntries, onLoadMigrationStatus, open, serviceEntryKey])

	return (
		<SettingsSection title="Migration" section="migration" open={open} onToggle={onToggle}>
			<div className="empty-state compact">
				Start one-time imports from other services here. OAuth-based imports redirect through the service and then return to the redirect URL configured on the Vikunja server.
				If that callback still points at the original Vikunja frontend, finish the import there or update the migration provider redirect URL in Administration.
				The external Todoist, Trello, or Microsoft developer app must also use the same callback URL.
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
					const statusMessage = migrationMessages[entry.service] || null
					const loading = migrationLoadingServices.has(entry.service)
					const submitting = migrationSubmittingServices.has(entry.service)
					return (
						<div key={entry.service} className="detail-item detail-field migration-service-card" data-migration-service={entry.service}>
							<div className="migration-service-row">
								<div>
									<div className="detail-label">{entry.label}</div>
									<div className="detail-value">{entry.mode === 'oauth' ? 'OAuth import' : 'File import'}</div>
								</div>
								<div className={`count-chip migration-status-chip status-${status}`.trim()}>
									{loading ? 'Checking…' : formatMigrationStatus(status)}
								</div>
							</div>
							<div className="detail-meta">{entry.description}</div>
							{statusMessage ? <div className="detail-helper-text">{statusMessage}</div> : null}
							{entry.mode === 'oauth' ? (
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
							) : (
								<div className="detail-inline-actions migration-file-actions">
									<input
										className="detail-input"
										type="file"
										data-migration-file-input={entry.service}
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
								<div className="detail-value">{entry.mode === 'oauth' ? 'OAuth import' : 'File import'}</div>
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

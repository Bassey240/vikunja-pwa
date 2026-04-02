import type {VikunjaInfo} from '@/types'
import type {SettingsSectionId} from '@/utils/settings-helpers'
import SettingsSection from './SettingsSection'

export default function SettingsAppDataSection({
	open,
	onToggle,
	appVersion,
	buildId,
	clientBuildId,
	vikunjaInfo,
	vikunjaInfoLoading,
	onRefreshAppData,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	appVersion: string
	buildId: string
	clientBuildId: string
	vikunjaInfo: VikunjaInfo | null
	vikunjaInfoLoading: boolean
	onRefreshAppData: () => void
}) {
	const oidcProviders = getOidcProviderNames(vikunjaInfo)

	return (
		<SettingsSection title="App Data" section="appData" open={open} onToggle={onToggle}>
			<div className="empty-state compact">Use this when the app looks stale after server-side changes.</div>
			<div className="empty-state compact">App version: {appVersion}</div>
			<div className="empty-state compact">Server build: {buildId}</div>
			<div className="empty-state compact">Client build: {clientBuildId}</div>
			{vikunjaInfoLoading ? <div className="empty-state compact">Loading Vikunja server info…</div> : null}
			{vikunjaInfo ? (
				<>
					<div className="empty-state compact">Vikunja version: {vikunjaInfo.version || 'Unknown'}</div>
					{vikunjaInfo.motd ? <div className="empty-state compact">MOTD: {vikunjaInfo.motd}</div> : null}
					<div className="empty-state compact">
						Background providers: {vikunjaInfo.enabled_background_providers?.length ? vikunjaInfo.enabled_background_providers.join(', ') : 'None'}
					</div>
					<div className="empty-state compact">
						Auth methods:
						{' '}
						Local {vikunjaInfo.auth?.local?.enabled === false ? 'disabled' : 'enabled'}
						{' · '}
						OIDC {oidcProviders.length > 0 ? `enabled (${oidcProviders.join(', ')})` : 'disabled'}
					</div>
				</>
			) : null}
			<div className="settings-action-row">
				<button className="pill-button subtle" data-action="refresh-app-data" type="button" onClick={onRefreshAppData}>
					Refresh app data
				</button>
			</div>
		</SettingsSection>
	)
}

function getOidcProviderNames(info: VikunjaInfo | null) {
	const providers = info?.auth?.openid?.providers || info?.auth?.openid_connect?.providers || []
	return providers
		.map(provider => `${provider?.name || provider?.key || ''}`.trim())
		.filter(Boolean)
}

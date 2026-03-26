import type {SettingsSectionId} from '@/utils/settings-helpers'
import SettingsSection from './SettingsSection'

export default function SettingsAppDataSection({
	open,
	onToggle,
	appVersion,
	buildId,
	clientBuildId,
	onRefreshAppData,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	appVersion: string
	buildId: string
	clientBuildId: string
	onRefreshAppData: () => void
}) {
	return (
		<SettingsSection title="App Data" section="appData" open={open} onToggle={onToggle}>
			<div className="empty-state compact">Use this when the app looks stale after server-side changes.</div>
			<div className="empty-state compact">App version: {appVersion}</div>
			<div className="empty-state compact">Server build: {buildId}</div>
			<div className="empty-state compact">Client build: {clientBuildId}</div>
			<div className="settings-action-row">
				<button className="pill-button subtle" data-action="refresh-app-data" type="button" onClick={onRefreshAppData}>
					Refresh app data
				</button>
			</div>
		</SettingsSection>
	)
}

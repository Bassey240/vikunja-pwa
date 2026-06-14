import type {SettingsSectionId} from '@/utils/settings-helpers'
import {DESKTOP_VIEW_KINDS, MOBILE_VIEW_KINDS, type ProjectViewKind} from '@/store/view-selections'
import SettingsSection from './SettingsSection'

const VIEW_KIND_LABELS: Record<ProjectViewKind, string> = {
	list: 'List',
	kanban: 'Kanban',
	table: 'Table',
	gantt: 'Gantt',
}

export default function SettingsPreferencesSection({
	open,
	onToggle,
	accountAuthMode,
	theme,
	onSetTheme,
	defaultDesktopViewKind,
	defaultMobileViewKind,
	onSetDefaultDesktopViewKind,
	onSetDefaultMobileViewKind,
	timezoneOptionsLoading,
	currentTimezone,
	timezoneSubmitting,
	timezoneNotice,
	timezoneOptions,
	onTimezoneChange,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	accountAuthMode: 'password' | 'apiToken' | null | undefined
	theme: 'dark' | 'light'
	onSetTheme: (theme: 'dark' | 'light') => void
	defaultDesktopViewKind: ProjectViewKind
	defaultMobileViewKind: ProjectViewKind
	onSetDefaultDesktopViewKind: (kind: ProjectViewKind) => void
	onSetDefaultMobileViewKind: (kind: ProjectViewKind) => void
	timezoneOptionsLoading: boolean
	currentTimezone: string
	timezoneSubmitting: boolean
	timezoneNotice: string | null
	timezoneOptions: string[]
	onTimezoneChange: (timezone: string) => void
}) {
	return (
		<SettingsSection title="Preferences" section="preferences" open={open} onToggle={onToggle}>
			<div className="detail-section-list">
				<div className="detail-core-card settings-subsection">
					<div className="panel-label">Appearance</div>
					<div className="settings-toggle-row">
						<button
							className={`pill-button ${theme === 'dark' ? '' : 'subtle'}`.trim()}
							data-action="set-theme"
							data-theme-option="dark"
							type="button"
							onClick={() => onSetTheme('dark')}
						>
							Dark
						</button>
						<button
							className={`pill-button ${theme === 'light' ? '' : 'subtle'}`.trim()}
							data-action="set-theme"
							data-theme-option="light"
							type="button"
							onClick={() => onSetTheme('light')}
						>
							Light
						</button>
					</div>
				</div>
				<div className="detail-core-card settings-subsection">
					<div className="panel-label">Default project view</div>
					<label className="detail-item detail-item-full detail-field">
						<div className="detail-label">Desktop</div>
						<select
							className="detail-input"
							data-setting-field="default-view-desktop"
							value={defaultDesktopViewKind}
							onChange={event => onSetDefaultDesktopViewKind(event.currentTarget.value as ProjectViewKind)}
						>
							{DESKTOP_VIEW_KINDS.map(kind => (
								<option key={kind} value={kind}>{VIEW_KIND_LABELS[kind]}</option>
							))}
						</select>
					</label>
					<label className="detail-item detail-item-full detail-field">
						<div className="detail-label">Mobile</div>
						<select
							className="detail-input"
							data-setting-field="default-view-mobile"
							value={defaultMobileViewKind}
							onChange={event => onSetDefaultMobileViewKind(event.currentTarget.value as ProjectViewKind)}
						>
							{MOBILE_VIEW_KINDS.map(kind => (
								<option key={kind} value={kind}>{VIEW_KIND_LABELS[kind]}</option>
							))}
						</select>
					</label>
				</div>
				{accountAuthMode === 'password' ? (
					<div className="detail-core-card settings-subsection">
						<div className="panel-label">Timezone</div>
						{timezoneNotice ? (
							<div className="status-card success" data-timezone-notice>
								{timezoneNotice}
							</div>
						) : null}
						{timezoneOptionsLoading ? <div className="empty-state compact">Loading timezones…</div> : null}
						{!timezoneOptionsLoading ? (
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">User timezone</div>
								<select
									className="detail-input"
									data-setting-field="timezone"
									value={currentTimezone}
									disabled={timezoneSubmitting || timezoneOptions.length === 0}
									onChange={event => onTimezoneChange(event.currentTarget.value)}
								>
									<option value="" disabled>Select a timezone</option>
									{timezoneOptions.map(timezone => (
										<option key={timezone} value={timezone}>{timezone}</option>
									))}
								</select>
							</label>
						) : null}
					</div>
				) : null}
			</div>
		</SettingsSection>
	)
}

import type {ReactNode} from 'react'
import type {SettingsSectionId} from '@/utils/settings-helpers'

export default function SettingsSection({
	title,
	section,
	open,
	onToggle,
	actions,
	children,
}: {
	title: string
	section: SettingsSectionId
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	actions?: ReactNode
	children: ReactNode
}) {
	return (
		<section className={`settings-section ${open ? 'is-open' : ''}`.trim()} data-settings-section={section}>
			<div className="settings-section-header">
				<button
					className="settings-section-title"
					type="button"
					data-action="toggle-settings-section"
					data-settings-section-toggle={section}
					aria-expanded={open ? 'true' : 'false'}
					onClick={() => onToggle(section)}
				>
					<span className="detail-label">{title}</span>
				</button>
				{open && actions ? <div className="settings-section-header-actions">{actions}</div> : null}
				<button
					className="settings-section-chevron-button"
					type="button"
					data-action="toggle-settings-section"
					data-settings-section-toggle={section}
					aria-expanded={open ? 'true' : 'false'}
					aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
					onClick={() => onToggle(section)}
				>
					<span className="detail-section-chevron" aria-hidden="true">
						{open ? '▾' : '▸'}
					</span>
				</button>
			</div>
			{open ? <div className="settings-section-content">{children}</div> : null}
		</section>
	)
}

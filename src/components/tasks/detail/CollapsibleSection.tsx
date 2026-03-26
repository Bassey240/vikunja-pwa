import type {ReactNode} from 'react'
import type {TaskDetailSection} from '@/utils/task-detail-helpers'

export default function CollapsibleSection({
	title,
	section,
	open,
	onToggle,
	children,
}: {
	title: string
	section: TaskDetailSection
	open: boolean
	onToggle: (section: TaskDetailSection) => void
	children: ReactNode
}) {
	return (
		<section className={`detail-section ${open ? 'is-open' : ''}`.trim()} data-detail-section={section}>
			<button
				className="detail-section-toggle"
				data-action="toggle-detail-section"
				data-detail-section-toggle={section}
				type="button"
				aria-expanded={open ? 'true' : 'false'}
				onClick={() => onToggle(section)}
			>
				<span className="detail-section-toggle-copy">
					<span className="detail-label">{title}</span>
				</span>
				<span className="detail-section-chevron" aria-hidden="true">
					{open ? '▾' : '▸'}
				</span>
			</button>
			{open ? <div className="detail-section-content">{children}</div> : null}
		</section>
	)
}

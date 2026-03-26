import Topbar from '@/components/layout/Topbar'
import StatusCards from '@/components/layout/StatusCards'

interface PlaceholderScreenProps {
	title: string
	label: string
	message: string
}

export default function PlaceholderScreen({title, label, message}: PlaceholderScreenProps) {
	return (
		<div className="surface">
			<Topbar />
			<div className="surface-content">
				<StatusCards />
				<section className="panel screen-card">
					<div className="panel-head">
						<div className="panel-heading-inline">
							<div className="panel-label">{label}</div>
							<h2 className="panel-title">{title}</h2>
						</div>
						<div className="count-chip">Phase 1</div>
					</div>
					<div className="screen-body">
						<div className="empty-state">{message}</div>
					</div>
				</section>
			</div>
		</div>
	)
}

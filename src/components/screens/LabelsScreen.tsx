import Topbar from '@/components/layout/Topbar'
import StatusCards from '@/components/layout/StatusCards'
import LabelDetail from '@/components/labels/LabelDetail'
import LabelListItem from '@/components/labels/LabelListItem'
import InlineRootTaskComposer from '@/components/tasks/InlineRootTaskComposer'
import {useAppStore} from '@/store'
import {type FormEvent, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'

export default function LabelsScreen() {
	const navigate = useNavigate()
	const connected = useAppStore(state => state.connected)
	const labels = useAppStore(state => state.labels)
	const loadingLabels = useAppStore(state => state.loadingLabels)
	const labelSubmitting = useAppStore(state => state.labelSubmitting)
	const loadLabels = useAppStore(state => state.loadLabels)
	const createLabel = useAppStore(state => state.createLabel)
	const openRootComposer = useAppStore(state => state.openRootComposer)
	const [title, setTitle] = useState('')

	useEffect(() => {
		if (connected) {
			void loadLabels()
		}
	}, [connected, loadLabels])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await createLabel(title)
		if (success) {
			setTitle('')
		}
	}

	const sortedLabels = labels
		.slice()
		.sort((a, b) => `${a.title}`.localeCompare(`${b.title}`))

	return (
		<div className="surface">
			<Topbar
				backAction="back-from-labels"
				onBack={() => navigate(-1)}
				desktopHeadingTitle="Manage Labels"
				desktopHeadingCount={labels.length}
				primaryAction={{
					action: 'open-root-composer',
					label: 'Add task',
					text: '+',
					className: 'topbar-primary-add-button',
					onClick: () => openRootComposer({placement: 'center'}),
				}}
			/>
			<div className="surface-content">
				<StatusCards />
				<section className="panel screen-card">
					<div className="panel-head desktop-promoted-panel-head">
						<div className="panel-heading-inline">
							<h2 className="panel-title">Manage Labels</h2>
							<div className="count-chip">{labels.length}</div>
						</div>
					</div>
					<div className="screen-body">
						<InlineRootTaskComposer />
						<form className="detail-inline-form" data-form="create-label" onSubmit={handleSubmit}>
							<input
								className="detail-input"
								data-label-title-input
								type="text"
								placeholder="New label name"
								value={title}
								onChange={event => setTitle(event.currentTarget.value)}
							/>
							<button className="composer-submit" type="submit" disabled={labelSubmitting}>
								{labelSubmitting ? 'Saving…' : 'Add'}
							</button>
						</form>
						{loadingLabels ? <div className="empty-state">Loading labels…</div> : null}
						{!loadingLabels && sortedLabels.length === 0 ? <div className="empty-state">No labels yet.</div> : null}
						{!loadingLabels && sortedLabels.length > 0 ? (
							<div className="label-page-list">
								{sortedLabels.map(label => (
									<LabelListItem key={label.id} label={label} />
								))}
							</div>
						) : null}
					</div>
				</section>
				<LabelDetail />
			</div>
		</div>
	)
}

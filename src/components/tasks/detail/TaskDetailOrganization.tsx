import type {FormEvent} from 'react'
import type {Label, TaskAssignee} from '@/types'
import {getUserDisplayName, getUserInitials} from '@/utils/formatting'
import {pickLabelTextColor, type TaskDetailSection} from '@/utils/task-detail-helpers'
import CollapsibleSection from './CollapsibleSection'

export default function TaskDetailOrganization({
	organizationOpen,
	assigneesOpen,
	onToggle,
	taskLabels,
	availableLabels,
	selectedLabelId,
	onSelectedLabelIdChange,
	onAddLabel,
	onRemoveLabel,
	taskAssignees,
	assigneeQuery,
	assigneeResults,
	assigneeSearchLoading,
	onAssigneeQueryChange,
	onAddAssignee,
	onRemoveAssignee,
}: {
	organizationOpen: boolean
	assigneesOpen: boolean
	onToggle: (section: TaskDetailSection) => void
	taskLabels: Label[]
	availableLabels: Label[]
	selectedLabelId: string
	onSelectedLabelIdChange: (value: string) => void
	onAddLabel: (event: FormEvent<HTMLFormElement>) => void
	onRemoveLabel: (labelId: number) => void
	taskAssignees: TaskAssignee[]
	assigneeQuery: string
	assigneeResults: TaskAssignee[]
	assigneeSearchLoading: boolean
	onAssigneeQueryChange: (value: string) => void
	onAddAssignee: (assignee: TaskAssignee) => void
	onRemoveAssignee: (userId: number) => void
}) {
	return (
		<>
			<CollapsibleSection title="Organization" section="organization" open={organizationOpen} onToggle={onToggle}>
				<div className="detail-item detail-field">
					<div className="detail-section-head">
						<div className="detail-label">Labels</div>
					</div>
					<div className="detail-label-list">
						{taskLabels.length > 0 ? taskLabels.map(label => {
							const hex = label.hex_color || label.hexColor || ''
							const background = hex ? (hex.startsWith('#') ? hex : `#${hex}`) : '#dbe8ff'
							return (
								<div key={label.id} className="label-chip" style={{background, color: pickLabelTextColor(background)}}>
									<span>{label.title}</span>
									<button
										className="label-chip-remove"
										data-action="remove-label"
										data-label-id={label.id}
										type="button"
										aria-label="Remove label"
										onClick={() => void onRemoveLabel(label.id)}
									>
										×
									</button>
								</div>
							)
						}) : <div className="detail-value">No labels</div>}
					</div>
					<form className="detail-inline-form" data-form="add-label" onSubmit={onAddLabel}>
						<select
							className="detail-input"
							data-detail-label-select
							value={selectedLabelId}
							onChange={event => onSelectedLabelIdChange(event.currentTarget.value)}
						>
							<option value="">Choose label</option>
							{availableLabels.map(label => (
								<option key={label.id} value={label.id}>
									{label.title}
								</option>
							))}
						</select>
						<button className="composer-submit" type="submit" disabled={!selectedLabelId || availableLabels.length === 0}>
							Add
						</button>
					</form>
					{availableLabels.length === 0 ? (
						<div className="detail-value">No more labels available. Create more on the Labels page.</div>
					) : null}
				</div>
			</CollapsibleSection>
			<CollapsibleSection title="Assignees" section="assignees" open={assigneesOpen} onToggle={onToggle}>
				<div className="detail-assignees-card">
					<div className="detail-assignee-block">
						<div className="detail-assignee-list">
							{taskAssignees.length > 0 ? taskAssignees.map(assignee => (
								<div key={assignee.id} className="detail-assignee-row">
									<div className="detail-assignee-pill" data-task-assignee={assignee.id}>
										<span className="detail-assignee-pill-token">{getUserInitials(assignee)}</span>
										<span className="detail-assignee-pill-name">{getUserDisplayName(assignee)}</span>
									</div>
									<button
										className="menu-button detail-assignee-remove"
										data-action="remove-task-assignee"
										data-task-assignee-id={assignee.id}
										type="button"
										aria-label={`Remove ${getUserDisplayName(assignee)}`}
										onClick={() => void onRemoveAssignee(assignee.id)}
									>
										×
									</button>
								</div>
							)) : <div className="detail-helper-text">No assignees yet.</div>}
						</div>
					</div>
					<div className="detail-assignee-block">
						<input
							className="detail-input"
							data-detail-assignee-search
							type="search"
							placeholder="Search users"
							value={assigneeQuery}
							onChange={event => onAssigneeQueryChange(event.currentTarget.value)}
						/>
						{assigneeQuery.trim() ? (
							<div className="detail-assignee-search-results">
								{assigneeSearchLoading ? (
									<div className="detail-helper-text">Searching users…</div>
								) : assigneeResults.length > 0 ? assigneeResults.map(assignee => (
									<button
										key={assignee.id}
										className="detail-assignee-search-result"
										data-action="add-task-assignee"
										data-task-assignee-option={assignee.id}
										type="button"
										onClick={() => void onAddAssignee(assignee)}
									>
										<span className="detail-assignee-search-token">{getUserInitials(assignee)}</span>
										<span className="detail-assignee-search-copy">
											<span className="detail-assignee-search-name">{getUserDisplayName(assignee)}</span>
											<span className="detail-meta">{assignee.username}</span>
										</span>
									</button>
								)) : (
									<div className="detail-helper-text">No matching users.</div>
								)}
							</div>
						) : null}
					</div>
				</div>
			</CollapsibleSection>
		</>
	)
}

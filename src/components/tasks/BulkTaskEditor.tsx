import useWideLayout from '@/hooks/useWideLayout'
import {useAppStore} from '@/store'
import {sortProjectsAlphabeticallyByPath} from '@/store/project-helpers'
import type {BulkTaskAction} from '@/types'
import {type FormEvent, useMemo} from 'react'
import PrioritySelect from './PrioritySelect'

const bulkActionOptions: Array<{value: BulkTaskAction; label: string}> = [
	{value: 'complete', label: 'Mark completed'},
	{value: 'reopen', label: 'Mark active'},
	{value: 'move-project', label: 'Move to project'},
	{value: 'set-priority', label: 'Set priority'},
	{value: 'favorite', label: 'Add to favorites'},
	{value: 'unfavorite', label: 'Remove from favorites'},
	{value: 'delete', label: 'Delete selected'},
]

export default function BulkTaskEditor({scopeKey}: {scopeKey: string}) {
	const isWideLayout = useWideLayout()
	const bulkTaskEditorScope = useAppStore(state => state.bulkTaskEditorScope)
	const bulkTaskAction = useAppStore(state => state.bulkTaskAction)
	const bulkTaskTargetProjectId = useAppStore(state => state.bulkTaskTargetProjectId)
	const bulkTaskPriority = useAppStore(state => state.bulkTaskPriority)
	const bulkTaskSubmitting = useAppStore(state => state.bulkTaskSubmitting)
	const bulkSelectedTaskIds = useAppStore(state => state.bulkSelectedTaskIds)
	const projects = useAppStore(state => state.projects)
	const getProjectAncestors = useAppStore(state => state.getProjectAncestors)
	const closeBulkTaskEditor = useAppStore(state => state.closeBulkTaskEditor)
	const setBulkTaskAction = useAppStore(state => state.setBulkTaskAction)
	const setBulkTaskTargetProjectId = useAppStore(state => state.setBulkTaskTargetProjectId)
	const setBulkTaskPriority = useAppStore(state => state.setBulkTaskPriority)
	const applyBulkTaskAction = useAppStore(state => state.applyBulkTaskAction)

	const open = bulkTaskEditorScope === scopeKey
	const selectedTaskCount = bulkSelectedTaskIds.size
	const sortedProjects = useMemo(
		() => sortProjectsAlphabeticallyByPath(projects).filter(project => Number(project.id || 0) > 0),
		[projects],
	)
	const requiresProject = bulkTaskAction === 'move-project'
	const requiresPriority = bulkTaskAction === 'set-priority'
	const canApply =
		selectedTaskCount > 0 &&
		(!requiresProject || Boolean(bulkTaskTargetProjectId)) &&
		!bulkTaskSubmitting

	if (!open) {
		return null
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!canApply) {
			return
		}
		await applyBulkTaskAction()
	}

	const formContent = (
		<form className="sheet-form composer-form bulk-task-editor-form" data-form="bulk-task-editor" onSubmit={handleSubmit}>
			<div className="subtask-context">Bulk edit</div>
			<div className="inline-composer-helper">
				{selectedTaskCount > 0
					? `${selectedTaskCount} task${selectedTaskCount === 1 ? '' : 's'} selected`
					: 'Select task cards to bulk edit.'}
			</div>
			<div className="bulk-task-editor-grid">
				<label className="detail-field bulk-task-editor-field">
					<div className="detail-label">Action</div>
					<select
						className="detail-input"
						data-bulk-task-action
						value={bulkTaskAction}
						onChange={event => setBulkTaskAction(event.currentTarget.value as BulkTaskAction)}
					>
						{bulkActionOptions.map(option => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				{requiresProject ? (
					<label className="detail-field bulk-task-editor-field">
						<div className="detail-label">Target project</div>
						<select
							className="detail-input"
							data-bulk-task-project
							value={bulkTaskTargetProjectId || ''}
							onChange={event => setBulkTaskTargetProjectId(Number(event.currentTarget.value || 0) || null)}
						>
							<option value="">Choose project</option>
							{sortedProjects.map(project => (
								<option key={project.id} value={project.id}>
									{getProjectAncestors(project.id).map(entry => entry.title).join(' / ')}
								</option>
							))}
						</select>
					</label>
				) : null}
				{requiresPriority ? (
					<label className="detail-field bulk-task-editor-field">
						<div className="detail-label">Priority</div>
						<PrioritySelect value={bulkTaskPriority} onChange={setBulkTaskPriority} />
					</label>
				) : null}
			</div>
			<div className="composer-form-actions bulk-task-editor-actions">
				<button className="composer-submit" data-action="bulk-edit-apply" type="submit" disabled={!canApply}>
					{bulkTaskSubmitting ? 'Applying…' : 'Apply'}
				</button>
				<button className="ghost-button" data-action="bulk-edit-cancel" type="button" onClick={closeBulkTaskEditor}>
					Done
				</button>
			</div>
		</form>
	)

	if (isWideLayout) {
		return <section className="subtask-composer root-task-inline-composer bulk-task-inline-editor">{formContent}</section>
	}

	return (
		<div className="bulk-task-editor-dock">
			<aside className="composer-sheet bulk-task-editor-sheet" aria-hidden="false">
				{formContent}
			</aside>
		</div>
	)
}

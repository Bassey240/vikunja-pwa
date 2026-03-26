import useWideLayout from '@/hooks/useWideLayout'
import {useRootComposerState} from '@/hooks/useRootComposerState'
import {useEffect} from 'react'

interface InlineRootTaskComposerProps {
	placement?: 'center' | 'project-preview'
	projectId?: number
}

export default function InlineRootTaskComposer({
	placement = 'center',
	projectId,
}: InlineRootTaskComposerProps) {
	const isWideLayout = useWideLayout()
	const {
		rootComposerOpen,
		rootComposerPlacement,
		rootSubmitting,
		composerProjectId,
		closeRootComposer,
		getProjectAncestors,
		handleSubmit,
		inputRef,
		parentTask,
		setComposerProjectId,
		setTitle,
		sortedProjects,
		title,
	} = useRootComposerState()

	useEffect(() => {
		const shouldFocusInline =
			rootComposerOpen &&
			((placement === 'center' && isWideLayout) || placement === 'project-preview')

		if (!shouldFocusInline) {
			setTitle('')
			return
		}

		inputRef.current?.focus()
	}, [isWideLayout, placement, rootComposerOpen])

	const open =
		rootComposerOpen &&
		rootComposerPlacement === placement &&
		(placement !== 'center' || isWideLayout) &&
		(placement !== 'project-preview' || composerProjectId === projectId)

	if (!open) {
		return null
	}

	return (
		<form className="subtask-composer root-task-inline-composer" data-form="root-task-inline" onSubmit={handleSubmit}>
			<div className="subtask-context">Add task</div>
			{parentTask ? <div className="inline-composer-helper">Parent task: {parentTask.title}</div> : null}
			<div className="root-inline-composer-grid">
				<select
					className="project-picker"
					data-composer-project
					value={composerProjectId || ''}
					onChange={event => setComposerProjectId(Number(event.currentTarget.value))}
				>
					{sortedProjects.map(project => (
							<option key={project.id} value={project.id}>
								{getProjectAncestors(project.id).map(entry => entry.title).join(' / ')}
							</option>
						))}
				</select>
				<input
					ref={inputRef}
					className="subtask-input"
					data-root-input
					type="text"
					placeholder="Task name"
					value={title}
					onChange={event => setTitle(event.currentTarget.value)}
					onKeyDown={event => {
						if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
							event.currentTarget.form?.requestSubmit()
						}
					}}
				/>
				<div className="inline-composer-actions">
					<button className="composer-submit" type="submit" disabled={rootSubmitting || !composerProjectId}>
						{rootSubmitting ? 'Saving…' : 'Add'}
					</button>
					<button className="ghost-button" data-action="close-root-composer-button" type="button" onClick={closeRootComposer}>
						Done
					</button>
				</div>
			</div>
		</form>
	)
}

import HighlightedTaskInput from '@/components/tasks/HighlightedTaskInput'
import {useRootComposerState} from '@/hooks/useRootComposerState'
import useWideLayout from '@/hooks/useWideLayout'
import {useEffect} from 'react'

export default function RootComposer() {
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
		multilineRef,
		multipleTasks,
		setMultipleTasks,
		parentTask,
		setComposerProjectId,
		setTitle,
		sortedProjects,
		title,
	} = useRootComposerState()

	useEffect(() => {
		if (!rootComposerOpen) {
			setTitle('')
			return
		}

		inputRef.current?.focus()
	}, [rootComposerOpen])

	if (!rootComposerOpen) {
		return null
	}

	if (isWideLayout || rootComposerPlacement !== 'sheet') {
		return null
	}

	return (
		<div
			className="sheet-backdrop composer-backdrop is-open"
			data-action="close-root-composer"
			onClick={event => {
				if (event.target === event.currentTarget) {
					closeRootComposer()
				}
			}}
		>
			<aside className="composer-sheet" aria-hidden="false">
				<form className="sheet-form composer-form" data-form="root-task" onSubmit={handleSubmit}>
					<label className="detail-field">
						<div className="detail-label">Project</div>
						<select
							className="detail-input"
							data-composer-project
							value={composerProjectId || ''}
							disabled={rootSubmitting}
							onChange={event => setComposerProjectId(Number(event.currentTarget.value))}
						>
							{sortedProjects.map(project => (
									<option key={project.id} value={project.id}>
										{getProjectAncestors(project.id).map(entry => entry.title).join(' / ')}
									</option>
								))}
						</select>
					</label>
					{parentTask ? (
						<div className="detail-item detail-item-full">
							<div className="detail-label">Parent Task</div>
							<div className="detail-value">{parentTask.title}</div>
						</div>
					) : null}
					<label className="detail-field">
						<div className="detail-label">{multipleTasks ? 'Tasks — one per line (up to 100)' : 'Title'}</div>
						{multipleTasks ? (
							<textarea ref={multilineRef} className="detail-input" data-root-input rows={6} placeholder="One task per line" value={title} disabled={rootSubmitting} onChange={event => setTitle(event.currentTarget.value)} />
						) : <HighlightedTaskInput
							ref={inputRef}
							className="detail-input"
							data-root-input
							type="text"
							placeholder="Task name"
							value={title}
							disabled={rootSubmitting}
							onChange={event => setTitle(event.currentTarget.value)}
							onKeyDown={event => {
								if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
									event.currentTarget.form?.requestSubmit()
								}
							}}
						/>}
					</label>
					<label className="detail-field">
						<span><input type="checkbox" checked={multipleTasks} disabled={rootSubmitting || title.includes('\n')} onChange={event => setMultipleTasks(event.currentTarget.checked)} /> Multiple tasks</span>
					</label>
					<div className="composer-form-actions">
						<button className="composer-submit" type="submit" disabled={rootSubmitting || !composerProjectId} onMouseDown={event => event.preventDefault()}>
							{rootSubmitting ? 'Saving…' : 'Add'}
						</button>
						<button className="ghost-button" data-action="close-root-composer-button" type="button" onClick={closeRootComposer}>
							Done
						</button>
					</div>
				</form>
			</aside>
		</div>
	)
}

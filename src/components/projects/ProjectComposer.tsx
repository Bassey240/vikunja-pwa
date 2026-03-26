import {useAppStore} from '@/store'
import useWideLayout from '@/hooks/useWideLayout'
import {useEffect, useRef, useState, type FormEvent} from 'react'

export default function ProjectComposer() {
	const isWideLayout = useWideLayout()
	const projectComposerOpen = useAppStore(state => state.projectComposerOpen)
	const projectComposerParentId = useAppStore(state => state.projectComposerParentId)
	const projectSubmitting = useAppStore(state => state.projectSubmitting)
	const projects = useAppStore(state => state.projects)
	const closeProjectComposer = useAppStore(state => state.closeProjectComposer)
	const submitProject = useAppStore(state => state.submitProject)
	const [title, setTitle] = useState('')
	const inputRef = useRef<HTMLInputElement | null>(null)

	const parentProject = projects.find(project => project.id === projectComposerParentId) || null

	useEffect(() => {
		if (!projectComposerOpen) {
			setTitle('')
			return
		}

		inputRef.current?.focus()
	}, [projectComposerOpen])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await submitProject(title)
		if (success) {
			setTitle('')
			inputRef.current?.focus()
		}
	}

	if (!projectComposerOpen) {
		return null
	}

	if (isWideLayout || parentProject) {
		return null
	}

	return (
		<div
			className="sheet-backdrop composer-backdrop is-open"
			data-action="close-project-composer"
			onClick={event => {
				if (event.target === event.currentTarget) {
					closeProjectComposer()
				}
			}}
			>
			<aside className="composer-sheet" aria-hidden="false">
				<form className="sheet-form composer-form" data-form="project" onSubmit={handleSubmit}>
					<label className="detail-field">
						<div className="detail-label">Title</div>
						<input
							ref={inputRef}
							className="detail-input"
							data-project-input
							type="text"
							placeholder="Project name"
							disabled={projectSubmitting}
							value={title}
							onChange={event => setTitle(event.currentTarget.value)}
							onKeyDown={event => {
								if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
									event.currentTarget.form?.requestSubmit()
								}
							}}
						/>
					</label>
					<div className="composer-form-actions">
						<button className="composer-submit" type="submit" disabled={projectSubmitting}>
							{projectSubmitting ? 'Saving…' : 'Add'}
						</button>
						<button className="ghost-button" data-action="close-project-composer-button" type="button" onClick={closeProjectComposer}>
							Done
						</button>
					</div>
				</form>
			</aside>
		</div>
	)
}

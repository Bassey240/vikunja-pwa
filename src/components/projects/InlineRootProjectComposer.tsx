import useWideLayout from '@/hooks/useWideLayout'
import {useAppStore} from '@/store'
import {type FormEvent, useEffect, useRef, useState} from 'react'

interface InlineRootProjectComposerProps {
	placement: 'center' | 'sidebar'
}

export default function InlineRootProjectComposer({placement}: InlineRootProjectComposerProps) {
	const isWideLayout = useWideLayout()
	const projectComposerOpen = useAppStore(state => state.projectComposerOpen)
	const projectComposerParentId = useAppStore(state => state.projectComposerParentId)
	const projectComposerPlacement = useAppStore(state => state.projectComposerPlacement)
	const projectSubmitting = useAppStore(state => state.projectSubmitting)
	const closeProjectComposer = useAppStore(state => state.closeProjectComposer)
	const submitProject = useAppStore(state => state.submitProject)
	const [title, setTitle] = useState('')
	const inputRef = useRef<HTMLInputElement | null>(null)

	const open = isWideLayout && projectComposerOpen && !projectComposerParentId && projectComposerPlacement === placement

	useEffect(() => {
		if (!open) {
			setTitle('')
			return
		}

		inputRef.current?.focus()
	}, [open])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await submitProject(title)
		if (success) {
			setTitle('')
			inputRef.current?.focus()
		}
	}

	if (!open) {
		return null
	}

	return (
		<form className="subtask-composer subproject-composer root-project-inline-composer" data-form="project-inline" onSubmit={handleSubmit}>
			<div className="subtask-context">Add project</div>
			<div className="inline-composer-controls">
				<input
					ref={inputRef}
					className="subtask-input"
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
				<div className="inline-composer-actions">
					<button className="composer-submit" type="submit" disabled={projectSubmitting}>
						{projectSubmitting ? 'Saving…' : 'Add'}
					</button>
					<button className="ghost-button" data-action="close-project-composer-button" type="button" onClick={closeProjectComposer}>
						Done
					</button>
				</div>
			</div>
		</form>
	)
}

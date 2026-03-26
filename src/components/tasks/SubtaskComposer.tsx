import {type FormEvent, useEffect, useRef, useState} from 'react'

interface SubtaskComposerProps {
	className?: string
	closeAction?: string
	formDataAttrs?: Record<string, string | number>
	formName: string
	inputDataAttrs?: Record<string, string | number>
	submitting: boolean
	onClose: () => void
	onSubmit: (title: string) => Promise<boolean>
}

export default function SubtaskComposer({
	className = '',
	closeAction,
	formDataAttrs,
	formName,
	inputDataAttrs,
	submitting,
	onClose,
	onSubmit,
}: SubtaskComposerProps) {
	const [title, setTitle] = useState('')
	const inputRef = useRef<HTMLInputElement | null>(null)

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await onSubmit(title)
		if (success) {
			setTitle('')
			inputRef.current?.focus()
		}
	}

	const formProps = formDataAttrs
		? Object.fromEntries(Object.entries(formDataAttrs).map(([key, value]) => [key, `${value}`]))
		: {}
	const inputProps = inputDataAttrs
		? Object.fromEntries(Object.entries(inputDataAttrs).map(([key, value]) => [key, `${value}`]))
		: {}

	return (
		<form
			className={['subtask-composer', className].filter(Boolean).join(' ')}
			data-form={formName}
			onSubmit={handleSubmit}
			{...formProps}
		>
			<div className="subtask-context">Add subtask</div>
			<div className="inline-composer-controls">
				<input
					ref={inputRef}
					className="subtask-input"
					type="text"
					placeholder="Press Enter to keep adding subtasks"
					disabled={submitting}
					value={title}
					onChange={event => setTitle(event.currentTarget.value)}
					{...inputProps}
				/>
				<div className="inline-composer-actions">
					<button className="composer-submit" type="submit" disabled={submitting}>
						{submitting ? 'Saving…' : 'Add'}
					</button>
					<button className="ghost-button" type="button" data-action={closeAction} onClick={onClose}>
						Done
					</button>
				</div>
			</div>
		</form>
	)
}

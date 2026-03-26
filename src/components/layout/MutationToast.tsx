import {useAppStore} from '@/store'

export default function MutationToast() {
	const pendingUndoMutation = useAppStore(state => state.pendingUndoMutation)
	const undoPendingMutation = useAppStore(state => state.undoPendingMutation)
	const dismissPendingMutation = useAppStore(state => state.dismissPendingMutation)

	if (!pendingUndoMutation) {
		return null
	}

	return (
		<div className="task-completion-toast" role="status" aria-live="polite">
			<div className="task-completion-toast-copy">
				<div className="task-completion-toast-title">{pendingUndoMutation.title}</div>
				<div className="task-completion-toast-body">{pendingUndoMutation.body}</div>
			</div>
			<div className="task-completion-toast-actions">
				<button className="ghost-button" type="button" onClick={() => void undoPendingMutation()}>
					{pendingUndoMutation.actionLabel || 'Undo'}
				</button>
				<button
					className="ghost-button subtle"
					type="button"
					aria-label="Dismiss undo"
					onClick={() => void dismissPendingMutation()}
				>
					×
				</button>
			</div>
		</div>
	)
}

import type {TaskComment} from '@/types'
import {formatLongDate, getUserDisplayName, getUserInitials} from '@/utils/formatting'
import type {FormEvent} from 'react'
import type {TaskDetailSection} from '@/utils/task-detail-helpers'
import CollapsibleSection from './CollapsibleSection'

export default function TaskDetailComments({
	open,
	onToggle,
	taskComments,
	currentUserId,
	editingCommentId,
	editingCommentValue,
	onEditingCommentValueChange,
	commentDraft,
	onCommentDraftChange,
	onEditComment,
	onCancelEditComment,
	onSaveEditedComment,
	onDeleteComment,
	onAddComment,
}: {
	open: boolean
	onToggle: (section: TaskDetailSection) => void
	taskComments: TaskComment[]
	currentUserId: number
	editingCommentId: number | null
	editingCommentValue: string
	onEditingCommentValueChange: (value: string) => void
	commentDraft: string
	onCommentDraftChange: (value: string) => void
	onEditComment: (comment: TaskComment) => void
	onCancelEditComment: () => void
	onSaveEditedComment: (commentId: number) => void
	onDeleteComment: (commentId: number) => void
	onAddComment: (event: FormEvent<HTMLFormElement>) => void
}) {
	return (
		<CollapsibleSection title="Comments" section="comments" open={open} onToggle={onToggle}>
			<div className="detail-comments-card">
				<div className="detail-comment-list">
					{taskComments.length > 0 ? taskComments.map(comment => {
						const canManageComment = currentUserId > 0 && Number(comment.author?.id || 0) === currentUserId
						const isEditing = editingCommentId === comment.id
						const createdLabel = comment.created ? formatLongDate(comment.created) : 'Unknown time'
						const wasEdited = Boolean(comment.updated && comment.created && comment.updated !== comment.created)
						return (
							<div key={comment.id} className="detail-comment-row" data-task-comment={comment.id}>
								<div className="detail-comment-head">
									<div className="detail-comment-author">
										<span className="detail-comment-token">{getUserInitials(comment.author)}</span>
										<div className="detail-comment-copy">
											<div className="detail-comment-name">{getUserDisplayName(comment.author)}</div>
											<div className="detail-meta">
												{createdLabel}
												{wasEdited ? ' · Edited' : ''}
											</div>
										</div>
									</div>
									{canManageComment ? (
										<div className="detail-comment-actions">
											{isEditing ? null : (
												<button
													className="ghost-button detail-comment-action"
													type="button"
													data-action="edit-task-comment"
													data-task-comment-id={comment.id}
													onClick={() => onEditComment(comment)}
												>
													Edit
												</button>
											)}
											<button
												className="ghost-button detail-comment-action"
												type="button"
												data-action="delete-task-comment"
												data-task-comment-id={comment.id}
												onClick={() => void onDeleteComment(comment.id)}
											>
												Delete
											</button>
										</div>
									) : null}
								</div>
								{isEditing ? (
									<div className="detail-comment-editor">
										<textarea
											className="detail-textarea detail-comment-textarea"
											data-detail-edit-comment={comment.id}
											value={editingCommentValue}
											onChange={event => onEditingCommentValueChange(event.currentTarget.value)}
										/>
										<div className="detail-inline-actions">
											<button
												className="composer-submit"
												type="button"
												data-action="save-task-comment"
												data-task-comment-id={comment.id}
												disabled={!editingCommentValue.trim()}
												onClick={() => void onSaveEditedComment(comment.id)}
											>
												Save
											</button>
											<button className="ghost-button" type="button" onClick={onCancelEditComment}>
												Cancel
											</button>
										</div>
									</div>
								) : (
									<div className="detail-comment-body">
										{comment.comment || 'No comment text'}
									</div>
								)}
							</div>
						)
					}) : <div className="detail-helper-text">No comments yet.</div>}
				</div>
				<form className="detail-comment-form" data-form="add-comment" onSubmit={onAddComment}>
					<textarea
						className="detail-textarea detail-comment-textarea"
						data-detail-comment-input
						placeholder="Add comment"
						value={commentDraft}
						onChange={event => onCommentDraftChange(event.currentTarget.value)}
					/>
					<div className="detail-inline-actions">
						<button className="composer-submit" type="submit" disabled={!commentDraft.trim()}>
							Add comment
						</button>
					</div>
				</form>
			</div>
		</CollapsibleSection>
	)
}

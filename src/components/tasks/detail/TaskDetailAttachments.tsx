import type {FormEvent, RefObject} from 'react'
import AttachmentDownloadLink from '@/components/common/AttachmentDownloadLink'
import AuthedImage from '@/components/common/AuthedImage'
import type {TaskAttachment} from '@/types'
import {
	canPreviewAttachment,
	formatAttachmentSize,
	formatLongDate,
	getUserDisplayName,
} from '@/utils/formatting'
import type {TaskDetailSection} from '@/utils/task-detail-helpers'
import CollapsibleSection from './CollapsibleSection'

export default function TaskDetailAttachments({
	open,
	onToggle,
	taskId,
	taskAttachments,
	attachmentUploading,
	attachmentInputRef,
	onAttachmentInputChange,
	onOpenAttachmentPreview,
	onRemoveAttachment,
}: {
	open: boolean
	onToggle: (section: TaskDetailSection) => void
	taskId: number
	taskAttachments: TaskAttachment[]
	attachmentUploading: boolean
	attachmentInputRef: RefObject<HTMLInputElement | null>
	onAttachmentInputChange: (event: FormEvent<HTMLInputElement>) => void
	onOpenAttachmentPreview: (attachment: TaskAttachment) => void
	onRemoveAttachment: (attachmentId: number) => void
}) {
	return (
		<CollapsibleSection title="Attachments" section="attachments" open={open} onToggle={onToggle}>
			<div className="detail-attachments-card">
				<div className="detail-inline-actions detail-attachment-upload-row">
					<input
						ref={attachmentInputRef}
						className="detail-attachment-input"
						data-detail-attachment-input
						type="file"
						onChange={event => void onAttachmentInputChange(event)}
					/>
					<button
						className="composer-submit"
						type="button"
						data-action="open-attachment-picker"
						disabled={attachmentUploading}
						onClick={() => attachmentInputRef.current?.click()}
					>
						{attachmentUploading ? 'Uploading…' : 'Upload file'}
					</button>
				</div>
				<div className="detail-attachment-list">
					{taskAttachments.length > 0 ? taskAttachments.map(attachment => {
						const previewable = canPreviewAttachment(attachment)
						return (
							<div key={attachment.id} className="detail-attachment-row" data-task-attachment={attachment.id}>
								{previewable ? (
									<button
										className="detail-attachment-preview"
										type="button"
										data-action="open-task-attachment-preview"
										data-task-attachment-id={attachment.id}
										onClick={() => onOpenAttachmentPreview(attachment)}
									>
										<AuthedImage
											src={`/api/tasks/${taskId}/attachments/${attachment.id}`}
											alt={attachment.file.name || 'Attachment preview'}
											loading="lazy"
											decoding="async"
										/>
									</button>
								) : null}
								<div className="detail-attachment-copy">
									{previewable ? (
										<button
											className="detail-attachment-name detail-attachment-name-button"
											type="button"
											onClick={() => onOpenAttachmentPreview(attachment)}
										>
											{attachment.file.name || 'Unnamed attachment'}
										</button>
									) : (
										<AttachmentDownloadLink
											className="detail-attachment-name"
											path={`/api/tasks/${taskId}/attachments/${attachment.id}`}
											filename={attachment.file.name || 'attachment'}
										>
											{attachment.file.name || 'Unnamed attachment'}
										</AttachmentDownloadLink>
									)}
									<div className="detail-meta">
										{formatAttachmentSize(attachment.file.size)}
										{attachment.created ? ` · ${formatLongDate(attachment.created)}` : ''}
										{attachment.created_by?.id ? ` · ${getUserDisplayName(attachment.created_by)}` : ''}
									</div>
								</div>
								<div className="detail-attachment-actions">
									{previewable ? (
										<button
											className="ghost-button detail-comment-action"
											type="button"
											onClick={() => onOpenAttachmentPreview(attachment)}
										>
											Preview
										</button>
									) : null}
									<AttachmentDownloadLink
										className="ghost-button detail-comment-action"
										path={`/api/tasks/${taskId}/attachments/${attachment.id}`}
										filename={attachment.file.name || 'attachment'}
									>
										Download
									</AttachmentDownloadLink>
									<button
										className="ghost-button detail-comment-action"
										type="button"
										data-action="delete-task-attachment"
										data-task-attachment-id={attachment.id}
										onClick={() => void onRemoveAttachment(attachment.id)}
									>
										Delete
									</button>
								</div>
							</div>
						)
					}) : <div className="detail-helper-text">No attachments yet.</div>}
				</div>
			</div>
		</CollapsibleSection>
	)
}

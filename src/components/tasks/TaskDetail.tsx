import {api} from '@/api'
import DetailSheet from '@/components/common/DetailSheet'
import {defaultTaskFilters, taskMatchesProjectFilters} from '@/hooks/useFilters'
import useWideLayout from '@/hooks/useWideLayout'
import TaskDetailAttachments from './detail/TaskDetailAttachments'
import CollapsibleSection from './detail/CollapsibleSection'
import TaskDetailComments from './detail/TaskDetailComments'
import MetadataRow from './detail/MetadataRow'
import TaskDetailOrganization from './detail/TaskDetailOrganization'
import TaskDetailPlanning from './detail/TaskDetailPlanning'
import TaskDetailRecurring from './detail/TaskDetailRecurring'
import TaskDetailRelated from './detail/TaskDetailRelated'
import TaskDetailReminders from './detail/TaskDetailReminders'
import {findTaskInAnyContext, getSubtasksFor, getTaskCollectionForTask} from '@/store/selectors'
import {useAppStore} from '@/store'
import type {Task, TaskAssignee, TaskAttachment, TaskComment, TaskRelationKind, TaskRelationRef, TaskReminder} from '@/types'
import {
	formatOptionalLongDate,
	formatRepeatSummary,
	getUserDisplayName,
	normalizePercentDone,
	normalizeRepeatAfter,
	normalizeTaskDateValue,
	normalizeTaskReminders,
} from '@/utils/formatting'
import {
	buildQuickReminderOptions,
	convertRepeatValueToSeconds,
	getRepeatEditorState,
	type RepeatUnit,
	type TaskDateField,
	type TaskDetailSection,
} from '@/utils/task-detail-helpers'
import {type FormEvent, useEffect, useMemo, useRef, useState} from 'react'

export default function TaskDetail({mode = 'sheet'}: {mode?: 'sheet' | 'inspector'}) {
	const isWideLayout = useWideLayout()
	const taskDetailOpen = useAppStore(state => state.taskDetailOpen)
	const taskDetailLoading = useAppStore(state => state.taskDetailLoading)
	const taskDetail = useAppStore(state => state.taskDetail)
	const currentUserId = useAppStore(state => Number(state.account?.user?.id || 0))
	const offlineReadOnlyMode = useAppStore(state => state.offlineReadOnlyMode)
	const projects = useAppStore(state => state.projects)
	const labels = useAppStore(state => state.labels)
	const screen = useAppStore(state => state.screen)
	const taskFilters = useAppStore(state => state.taskFilters)
	const projectFilters = useAppStore(state => state.projectFilters)
	const recentlyCompletedTaskIds = useAppStore(state => state.recentlyCompletedTaskIds)
	const tasks = useAppStore(state => state.tasks)
	const todayTasks = useAppStore(state => state.todayTasks)
	const inboxTasks = useAppStore(state => state.inboxTasks)
	const upcomingTasks = useAppStore(state => state.upcomingTasks)
	const searchTasks = useAppStore(state => state.searchTasks)
	const savedFilterTasks = useAppStore(state => state.savedFilterTasks)
	const projectPreviewTasksById = useAppStore(state => state.projectPreviewTasksById)
	const togglingTaskIds = useAppStore(state => state.togglingTaskIds)
	const getProjectAncestors = useAppStore(state => state.getProjectAncestors)
	const closeTaskDetail = useAppStore(state => state.closeTaskDetail)
	const openTaskDetail = useAppStore(state => state.openTaskDetail)
	const toggleTaskDone = useAppStore(state => state.toggleTaskDone)
	const saveTaskDetailPatch = useAppStore(state => state.saveTaskDetailPatch)
	const addAttachmentToTask = useAppStore(state => state.addAttachmentToTask)
	const removeTaskAttachment = useAppStore(state => state.removeTaskAttachment)
	const addAssigneeToTask = useAppStore(state => state.addAssigneeToTask)
	const removeAssigneeFromTask = useAppStore(state => state.removeAssigneeFromTask)
	const addCommentToTask = useAppStore(state => state.addCommentToTask)
	const updateTaskComment = useAppStore(state => state.updateTaskComment)
	const deleteTaskComment = useAppStore(state => state.deleteTaskComment)
	const addLabelToTask = useAppStore(state => state.addLabelToTask)
	const removeLabelFromTask = useAppStore(state => state.removeLabelFromTask)
	const removeTaskRelation = useAppStore(state => state.removeTaskRelation)
	const openFocusedTask = useAppStore(state => state.openFocusedTask)
	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	const [percentDone, setPercentDone] = useState(0)
	const [repeatEveryValue, setRepeatEveryValue] = useState('1')
	const [repeatEveryUnit, setRepeatEveryUnit] = useState<RepeatUnit>('days')
	const [repeatFromCurrentDate, setRepeatFromCurrentDate] = useState(false)
	const [assigneeQuery, setAssigneeQuery] = useState('')
	const [assigneeResults, setAssigneeResults] = useState<TaskAssignee[]>([])
	const [assigneeSearchLoading, setAssigneeSearchLoading] = useState(false)
	const [commentDraft, setCommentDraft] = useState('')
	const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
	const [editingCommentValue, setEditingCommentValue] = useState('')
	const [attachmentUploading, setAttachmentUploading] = useState(false)
	const [previewAttachment, setPreviewAttachment] = useState<TaskAttachment | null>(null)
	const [reminderInput, setReminderInput] = useState('')
	const [selectedRelativeReminder, setSelectedRelativeReminder] = useState('')
	const [reminders, setReminders] = useState<TaskReminder[]>([])
	const [selectedLabelId, setSelectedLabelId] = useState('')
	const [relationComposerOpen, setRelationComposerOpen] = useState(false)
	const [openSections, setOpenSections] = useState<Record<TaskDetailSection, boolean>>({
		planning: false,
		recurring: false,
		reminders: false,
		organization: false,
		assignees: false,
		related: false,
		comments: false,
		attachments: false,
		description: false,
		info: false,
	})
	const percentDoneSaveTimeoutRef = useRef<number | null>(null)
	const attachmentInputRef = useRef<HTMLInputElement | null>(null)

	useEffect(() => {
		setTitle(taskDetail?.title || '')
		setDescription(taskDetail?.description || '')
		setPercentDone(normalizePercentDone(taskDetail?.percent_done))
		const repeatEditorState = getRepeatEditorState(taskDetail?.repeat_after)
		setRepeatEveryValue(repeatEditorState.value)
		setRepeatEveryUnit(repeatEditorState.unit)
		setRepeatFromCurrentDate(Boolean(taskDetail?.repeat_from_current_date))
		setReminders(normalizeTaskReminders(taskDetail?.reminders))
		if (percentDoneSaveTimeoutRef.current !== null) {
			window.clearTimeout(percentDoneSaveTimeoutRef.current)
			percentDoneSaveTimeoutRef.current = null
		}
	}, [
		taskDetail?.description,
		taskDetail?.id,
		taskDetail?.percent_done,
		taskDetail?.reminders,
		taskDetail?.repeat_after,
		taskDetail?.repeat_from_current_date,
		taskDetail?.title,
	])

	useEffect(() => {
		setSelectedLabelId('')
		setReminderInput('')
		setSelectedRelativeReminder('')
		setAssigneeQuery('')
		setAssigneeResults([])
		setAssigneeSearchLoading(false)
		setCommentDraft('')
		setEditingCommentId(null)
		setEditingCommentValue('')
		setPreviewAttachment(null)
		setRelationComposerOpen(false)
		setOpenSections({
			planning: false,
			recurring: false,
			reminders: false,
			organization: false,
			assignees: false,
			related: false,
			comments: false,
			attachments: false,
			description: false,
			info: false,
		})
	}, [taskDetail?.id])

	useEffect(() => {
		return () => {
			if (percentDoneSaveTimeoutRef.current !== null) {
				window.clearTimeout(percentDoneSaveTimeoutRef.current)
			}
		}
	}, [])
	const projectPreviewTaskCollection = useMemo(() => {
		if (screen !== 'projects' || !taskDetail?.project_id) {
			return null
		}

		return Object.prototype.hasOwnProperty.call(projectPreviewTasksById, taskDetail.project_id)
			? (projectPreviewTasksById[taskDetail.project_id] || [])
			: null
	}, [projectPreviewTasksById, screen, taskDetail?.project_id])

	const taskCollection = useMemo(() => {
		if (!taskDetail) {
			return tasks
		}

		if (projectPreviewTaskCollection) {
			return projectPreviewTaskCollection
		}

		return getTaskCollectionForTask(taskDetail.id, taskDetail.project_id, {
			tasks,
			todayTasks,
			inboxTasks,
			upcomingTasks,
			searchTasks,
			savedFilterTasks,
			projectPreviewTasksById,
		})
	}, [
		inboxTasks,
		projectPreviewTasksById,
		savedFilterTasks,
		searchTasks,
		taskDetail,
		projectPreviewTaskCollection,
		tasks,
		todayTasks,
		upcomingTasks,
	])

	const listTask = useMemo(() => {
		if (!taskDetail) {
			return null
		}

		return (
			taskCollection.find(entry => entry.id === taskDetail.id) ||
			findTaskInAnyContext(taskDetail.id, {
				tasks,
				todayTasks,
				inboxTasks,
				upcomingTasks,
				searchTasks,
				savedFilterTasks,
				projectPreviewTasksById,
			}) ||
			taskDetail
		)
	}, [
		inboxTasks,
		projectPreviewTasksById,
		savedFilterTasks,
		searchTasks,
		taskCollection,
		taskDetail,
		tasks,
		todayTasks,
		upcomingTasks,
	])

	const taskCollectionSortBy =
		screen === 'projects'
			? projectFilters.taskSortBy
			: screen === 'tasks' && taskCollection === tasks
				? taskFilters.sortBy
				: defaultTaskFilters.sortBy
	const subtaskMatcher = useMemo(
		() => (task: Task) =>
			(screen === 'projects' ? taskMatchesProjectFilters(task, projectFilters) : !task.done) ||
			recentlyCompletedTaskIds.has(task.id),
		[projectFilters, recentlyCompletedTaskIds, screen],
	)
	const subtasks = listTask ? getSubtasksFor(listTask, taskCollection, subtaskMatcher, taskCollectionSortBy) : []
	const taskLabels = taskDetail?.labels || []
	const taskAssignees = useMemo(
		() => (Array.isArray(taskDetail?.assignees) ? taskDetail.assignees.filter(assignee => assignee?.id) : []),
		[taskDetail?.assignees],
	)
	const taskComments = useMemo(
		() => (Array.isArray(taskDetail?.comments) ? taskDetail.comments.filter(comment => comment?.id) : []),
		[taskDetail?.comments],
	)
	const taskAttachments = useMemo(
		() => (Array.isArray(taskDetail?.attachments) ? taskDetail.attachments.filter(attachment => attachment?.id) : []),
		[taskDetail?.attachments],
	)
	const availableLabels = labels
		.filter(label => !taskLabels.some(taskLabel => taskLabel.id === label.id))
		.slice()
		.sort((a, b) => `${a.title}`.localeCompare(`${b.title}`))
	const dueDateValue = normalizeTaskDateValue(taskDetail?.due_date || null)
	const repeatAfterValue = normalizeRepeatAfter(taskDetail?.repeat_after)
	const repeatSummary = formatRepeatSummary(taskDetail?.repeat_after, taskDetail?.repeat_from_current_date)
	const quickReminderOptions = useMemo(() => buildQuickReminderOptions(new Date()), [taskDetail?.id])

	useEffect(() => {
		const normalizedQuery = `${assigneeQuery || ''}`.trim()
		if (!normalizedQuery || offlineReadOnlyMode) {
			setAssigneeResults([])
			setAssigneeSearchLoading(false)
			return
		}

		let cancelled = false
		setAssigneeSearchLoading(true)
		void api<{users: TaskAssignee[]}>(`/api/projects/${taskDetail?.project_id || 0}/projectusers?s=${encodeURIComponent(normalizedQuery)}`)
			.then(result => {
				if (cancelled) {
					return
				}

				const assignedIds = new Set(taskAssignees.map(assignee => assignee.id))
				const users = Array.isArray(result.users) ? result.users : []
				setAssigneeResults(
					users
						.filter(user => user?.id && !assignedIds.has(user.id))
						.sort((left, right) => getUserDisplayName(left).localeCompare(getUserDisplayName(right))),
				)
			})
			.catch(() => {
				if (!cancelled) {
					setAssigneeResults([])
				}
			})
			.finally(() => {
				if (!cancelled) {
					setAssigneeSearchLoading(false)
				}
			})

		return () => {
			cancelled = true
		}
	}, [assigneeQuery, offlineReadOnlyMode, taskAssignees, taskDetail?.project_id])

	async function handleTitleBlur() {
		if (!taskDetail) {
			return
		}

		const trimmedTitle = title.trim()
		if (!trimmedTitle || trimmedTitle === taskDetail.title) {
			setTitle(taskDetail.title)
			return
		}

		const success = await saveTaskDetailPatch({title: trimmedTitle})
		if (!success) {
			setTitle(taskDetail.title)
		}
	}

	async function handleDescriptionBlur() {
		if (!taskDetail || description === (taskDetail.description || '')) {
			setDescription(taskDetail?.description || '')
			return
		}

		const success = await saveTaskDetailPatch({description})
		if (!success) {
			setDescription(taskDetail.description || '')
		}
	}

	async function handleProjectChange(projectId: number) {
		if (!taskDetail || !projectId || projectId === taskDetail.project_id) {
			return
		}

		await saveTaskDetailPatch({project_id: projectId})
	}

	async function handlePriorityChange(priority: number) {
		if (!taskDetail || priority === Number(taskDetail.priority || 0)) {
			return
		}

		await saveTaskDetailPatch({priority})
	}

	async function commitPercentDone(nextValue: number) {
		if (!taskDetail) {
			return
		}

		const normalizedValue = normalizePercentDone(nextValue)
		if (normalizedValue === normalizePercentDone(taskDetail.percent_done)) {
			return
		}

		const success = await saveTaskDetailPatch({percent_done: normalizedValue})
		if (!success) {
			setPercentDone(normalizePercentDone(taskDetail.percent_done))
		}
	}

	function schedulePercentDoneSave(nextValue: number) {
		if (percentDoneSaveTimeoutRef.current !== null) {
			window.clearTimeout(percentDoneSaveTimeoutRef.current)
		}

		percentDoneSaveTimeoutRef.current = window.setTimeout(() => {
			percentDoneSaveTimeoutRef.current = null
			void commitPercentDone(nextValue)
		}, 250)
	}

	function flushPercentDoneSave(nextValue: number) {
		if (percentDoneSaveTimeoutRef.current !== null) {
			window.clearTimeout(percentDoneSaveTimeoutRef.current)
			percentDoneSaveTimeoutRef.current = null
		}

		void commitPercentDone(nextValue)
	}

	async function handleDateChange(field: TaskDateField, value: string) {
		if (!taskDetail) {
			return
		}

		const nextValue = value ? new Date(value).toISOString() : null
		const currentValue = normalizeTaskDateValue(taskDetail[field] || null) || null
		if (currentValue === nextValue) {
			return
		}

		await saveTaskDetailPatch({[field]: nextValue} as Partial<typeof taskDetail>)
	}

	async function clearDate(field: TaskDateField) {
		if (!taskDetail || (normalizeTaskDateValue(taskDetail[field] || null) || null) === null) {
			return
		}

		await saveTaskDetailPatch({[field]: null} as Partial<typeof taskDetail>)
	}

	async function saveRecurringSettings(nextRepeatAfter: number, nextRepeatFromCurrentDate: boolean) {
		if (!taskDetail) {
			return false
		}

		return saveTaskDetailPatch({
			repeat_after: nextRepeatAfter || null,
			repeat_from_current_date: nextRepeatAfter > 0 ? nextRepeatFromCurrentDate : false,
		})
	}

	async function handleRecurringPreset(value: number, unit: RepeatUnit) {
		const repeatAfter = convertRepeatValueToSeconds(value, unit)
		setRepeatEveryValue(`${value}`)
		setRepeatEveryUnit(unit)
		const success = await saveRecurringSettings(repeatAfter, repeatFromCurrentDate)
		if (!success) {
			const repeatEditorState = getRepeatEditorState(taskDetail?.repeat_after)
			setRepeatEveryValue(repeatEditorState.value)
			setRepeatEveryUnit(repeatEditorState.unit)
			setRepeatFromCurrentDate(Boolean(taskDetail?.repeat_from_current_date))
		}
	}

	async function handleRecurringSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const repeatValue = Number(repeatEveryValue)
		if (!Number.isFinite(repeatValue) || repeatValue <= 0) {
			return
		}

		const repeatAfter = convertRepeatValueToSeconds(repeatValue, repeatEveryUnit)
		const success = await saveRecurringSettings(repeatAfter, repeatFromCurrentDate)
		if (!success) {
			const repeatEditorState = getRepeatEditorState(taskDetail?.repeat_after)
			setRepeatEveryValue(repeatEditorState.value)
			setRepeatEveryUnit(repeatEditorState.unit)
			setRepeatFromCurrentDate(Boolean(taskDetail?.repeat_from_current_date))
		}
	}

	async function handleRepeatOriginToggle(nextValue: boolean) {
		setRepeatFromCurrentDate(nextValue)
		if (!repeatAfterValue) {
			return
		}

		const success = await saveRecurringSettings(repeatAfterValue, nextValue)
		if (!success) {
			setRepeatFromCurrentDate(Boolean(taskDetail?.repeat_from_current_date))
		}
	}

	async function handleClearRecurring() {
		setRepeatEveryValue('1')
		setRepeatEveryUnit('days')
		setRepeatFromCurrentDate(false)
		const success = await saveRecurringSettings(0, false)
		if (!success) {
			const repeatEditorState = getRepeatEditorState(taskDetail?.repeat_after)
			setRepeatEveryValue(repeatEditorState.value)
			setRepeatEveryUnit(repeatEditorState.unit)
			setRepeatFromCurrentDate(Boolean(taskDetail?.repeat_from_current_date))
		}
	}

	async function handleAddAbsoluteReminder(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!taskDetail) {
			return
		}

		const normalizedInput = `${reminderInput || ''}`.trim()
		if (!normalizedInput) {
			return
		}

		const reminderDate = new Date(normalizedInput)
		if (Number.isNaN(reminderDate.getTime())) {
			return
		}

		const nextReminders = normalizeTaskReminders([
			...reminders,
			{
				reminder: reminderDate.toISOString(),
				relative_period: 0,
				relative_to: '',
			},
		])
		setReminders(nextReminders)
		const success = await saveTaskDetailPatch({reminders: nextReminders})
		if (success) {
			setReminderInput('')
		} else {
			setReminders(normalizeTaskReminders(taskDetail?.reminders))
		}
	}

	async function handleAddRelativeReminder(relativePeriod: number) {
		if (!taskDetail || !dueDateValue) {
			return
		}

		const dueDate = new Date(dueDateValue)
		if (Number.isNaN(dueDate.getTime())) {
			return
		}

		const nextReminders = normalizeTaskReminders([
			...reminders,
			{
				reminder: new Date(dueDate.getTime() + relativePeriod * 1000).toISOString(),
				relative_period: relativePeriod,
				relative_to: 'due_date',
			},
		])
		setReminders(nextReminders)
		const success = await saveTaskDetailPatch({reminders: nextReminders})
		if (!success) {
			setReminders(normalizeTaskReminders(taskDetail?.reminders))
		}
	}

	async function handleAddSelectedRelativeReminder(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const relativePeriod = Number(selectedRelativeReminder)
		if (!Number.isFinite(relativePeriod)) {
			return
		}

		await handleAddRelativeReminder(relativePeriod)
		setSelectedRelativeReminder('')
	}

	async function handleAddQuickReminder(reminderValue: string) {
		if (!taskDetail) {
			return
		}

		const option = quickReminderOptions.find(entry => entry.value === reminderValue)
		if (!option) {
			return
		}

		const nextReminders = normalizeTaskReminders([
			...reminders,
			{
				reminder: option.reminder.toISOString(),
				relative_period: 0,
				relative_to: '',
			},
		])
		setReminders(nextReminders)
		const success = await saveTaskDetailPatch({reminders: nextReminders})
		if (!success) {
			setReminders(normalizeTaskReminders(taskDetail?.reminders))
		}
	}

	async function handleRemoveReminder(index: number) {
		if (!taskDetail || index < 0 || index >= reminders.length) {
			return
		}

		const nextReminders = reminders.filter((_, reminderIndex) => reminderIndex !== index)
		setReminders(nextReminders)
		const success = await saveTaskDetailPatch({reminders: nextReminders})
		if (!success) {
			setReminders(normalizeTaskReminders(taskDetail?.reminders))
		}
	}

	async function handleAddAssignee(assignee: TaskAssignee) {
		const success = await addAssigneeToTask(assignee)
		if (success) {
			setAssigneeQuery('')
			setAssigneeResults([])
		}
	}

	async function handleRemoveAssignee(userId: number) {
		await removeAssigneeFromTask(userId)
	}

	async function handleAddComment(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await addCommentToTask(commentDraft)
		if (success) {
			setCommentDraft('')
		}
	}

	function handleEditComment(comment: TaskComment) {
		setEditingCommentId(comment.id)
		setEditingCommentValue(comment.comment)
	}

	function handleCancelEditComment() {
		setEditingCommentId(null)
		setEditingCommentValue('')
	}

	async function handleSaveEditedComment(commentId: number) {
		const success = await updateTaskComment(commentId, editingCommentValue)
		if (success) {
			handleCancelEditComment()
		}
	}

	async function handleDeleteComment(commentId: number) {
		if (editingCommentId === commentId) {
			handleCancelEditComment()
		}
		await deleteTaskComment(commentId)
	}

	async function handleAttachmentInputChange(event: FormEvent<HTMLInputElement>) {
		const input = event.currentTarget
		const [file] = Array.from(input.files || [])
		if (!file) {
			return
		}

		setAttachmentUploading(true)
		const success = await addAttachmentToTask(file)
		setAttachmentUploading(false)
		input.value = ''
		if (!success) {
			return
		}
	}

	async function handleRemoveAttachment(attachmentId: number) {
		await removeTaskAttachment(attachmentId)
	}

	function openAttachmentPreview(attachment: TaskAttachment) {
		setPreviewAttachment(attachment)
	}

	function closeAttachmentPreview() {
		setPreviewAttachment(null)
	}

	async function handleAddLabel(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const labelId = Number(selectedLabelId || 0)
		if (!labelId) {
			return
		}

		const success = await addLabelToTask(labelId)
		if (success) {
			setSelectedLabelId('')
		}
	}

	function toggleSection(section: TaskDetailSection) {
		setOpenSections(current => ({
			...current,
			[section]: !current[section],
		}))
	}

	function openRelatedTask(taskRef: TaskRelationRef) {
		if (isWideLayout) {
			void openTaskDetail(taskRef.id)
		}

		if (!isWideLayout) {
			closeTaskDetail()
		}

		openFocusedTask(taskRef.id, taskRef.project_id, screen)
	}

	async function handleRemoveTaskRelation(relationKind: TaskRelationKind, otherTaskId: number) {
		if (!taskDetail) {
			return
		}

		await removeTaskRelation(taskDetail.id, otherTaskId, relationKind)
	}

	const parentTasks = taskDetail?.related_tasks?.parenttask || []
	const extraRelationKinds = [
		'related',
		'duplicateof',
		'duplicates',
		'blocking',
		'blocked',
		'precedes',
		'follows',
		'copiedfrom',
		'copiedto',
	] as TaskRelationKind[]

	return (
		<DetailSheet open={taskDetailOpen} closeAction="close-task-detail" onClose={closeTaskDetail} mode={mode}>
			<div className="sheet-head">
				<div>
					<div className="panel-label">Task Detail</div>
					<div className="panel-title">{taskDetail ? taskDetail.title : 'Loading…'}</div>
				</div>
			</div>
			{taskDetailLoading && !taskDetail ? <div className="empty-state">Loading task details…</div> : null}
			{taskDetail ? (
				<>
					{previewAttachment ? (
						<div className="detail-media-viewer" data-detail-media-viewer>
							<button
								className="detail-media-viewer-backdrop"
								type="button"
								aria-label="Close attachment preview"
								onClick={closeAttachmentPreview}
							/>
							<div className="detail-media-viewer-card">
								<div className="detail-media-viewer-head">
									<div className="detail-media-viewer-title">{previewAttachment.file.name || 'Attachment preview'}</div>
									<button className="ghost-button" type="button" onClick={closeAttachmentPreview}>
										Close
									</button>
								</div>
								<div className="detail-media-viewer-body">
									<img
										src={`/api/tasks/${taskDetail.id}/attachments/${previewAttachment.id}`}
										alt={previewAttachment.file.name || 'Attachment preview'}
									/>
								</div>
								<div className="detail-inline-actions">
									<a
										className="composer-submit"
										href={`/api/tasks/${taskDetail.id}/attachments/${previewAttachment.id}`}
										download={previewAttachment.file.name || 'attachment'}
									>
										Download
									</a>
								</div>
							</div>
						</div>
					) : null}
					<div className="detail-core-card">
						<div className="detail-grid detail-grid-tight">
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">Title</div>
								<input
									className="detail-input"
									data-detail-title
									type="text"
									value={title}
									onChange={event => setTitle(event.currentTarget.value)}
									onBlur={() => void handleTitleBlur()}
									onKeyDown={event => {
										if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
											event.preventDefault()
											event.currentTarget.blur()
										}
									}}
								/>
							</label>
							<label className="detail-item detail-field">
								<div className="detail-label">Project</div>
								<select
									className="detail-input"
									data-detail-project
									value={taskDetail.project_id}
									onChange={event => void handleProjectChange(Number(event.currentTarget.value))}
								>
									{projects
										.slice()
										.sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || a.id - b.id)
										.map(project => (
											<option key={project.id} value={project.id}>
												{getProjectAncestors(project.id).map(entry => entry.title).join(' / ')}
											</option>
										))}
								</select>
							</label>
							<div className="detail-item detail-field detail-toggle-item">
								<div className="detail-label">Completed</div>
								<button className="detail-done-toggle" data-action="toggle-detail-done" type="button" onClick={() => void toggleTaskDone(taskDetail.id)}>
									<span className={`checkbox-button ${taskDetail.done ? 'is-checked' : ''}`.trim()}>
										{taskDetail.done ? '✓' : ''}
									</span>
									<span>{taskDetail.done ? 'Completed' : 'Mark complete'}</span>
								</button>
							</div>
							<div className="detail-item detail-field detail-toggle-item">
								<div className="detail-label">Favorite</div>
								<button
									className="detail-done-toggle"
									data-action="toggle-task-favorite"
									type="button"
									onClick={() => void saveTaskDetailPatch({is_favorite: !taskDetail.is_favorite})}
								>
									<span className={`checkbox-button ${taskDetail.is_favorite ? 'is-checked' : ''}`.trim()}>
										{taskDetail.is_favorite ? '✓' : ''}
									</span>
									<span>{taskDetail.is_favorite ? 'In favorites' : 'Add to favorites'}</span>
								</button>
							</div>
						</div>
					</div>
					<div className="detail-section-list">
						<TaskDetailRelated
							open={openSections.related}
							onToggle={toggleSection}
							taskId={taskDetail.id}
							projectId={taskDetail.project_id}
							parentTasks={parentTasks}
							subtasks={subtasks}
							relationComposerOpen={relationComposerOpen}
							onToggleRelationComposer={() => setRelationComposerOpen(current => !current)}
							recentlyCompletedTaskIds={recentlyCompletedTaskIds}
							togglingTaskIds={togglingTaskIds}
							onOpenRelatedTask={openRelatedTask}
							onToggleTaskDone={taskId => {
								void toggleTaskDone(taskId)
							}}
							onRemoveTaskRelation={(relationKind, otherTaskId) => {
								void handleRemoveTaskRelation(relationKind, otherTaskId)
							}}
							extraRelationKinds={extraRelationKinds}
							relatedTasksByKind={taskDetail.related_tasks || {}}
						/>
						<TaskDetailPlanning
							open={openSections.planning}
							onToggle={toggleSection}
							task={taskDetail}
							percentDone={percentDone}
							onPriorityChange={value => {
								void handlePriorityChange(value)
							}}
							onPercentDoneChange={nextValue => {
								setPercentDone(nextValue)
								schedulePercentDoneSave(nextValue)
							}}
							onPercentDoneCommit={flushPercentDoneSave}
							onClearDate={field => {
								void clearDate(field)
							}}
							onDateChange={handleDateChange}
						/>
						<TaskDetailReminders
							open={openSections.reminders}
							onToggle={toggleSection}
							quickReminderOptions={quickReminderOptions}
							dueDateValue={dueDateValue}
							selectedRelativeReminder={selectedRelativeReminder}
							onSelectedRelativeReminderChange={setSelectedRelativeReminder}
							reminders={reminders}
							reminderInput={reminderInput}
							onReminderInputChange={setReminderInput}
							onAddQuickReminder={reminderValue => {
								void handleAddQuickReminder(reminderValue)
							}}
							onAddSelectedRelativeReminder={handleAddSelectedRelativeReminder}
							onAddAbsoluteReminder={handleAddAbsoluteReminder}
							onRemoveReminder={index => {
								void handleRemoveReminder(index)
							}}
						/>
						<TaskDetailRecurring
							open={openSections.recurring}
							onToggle={toggleSection}
							repeatSummary={repeatSummary}
							repeatAfterValue={repeatAfterValue}
							repeatEveryValue={repeatEveryValue}
							repeatEveryUnit={repeatEveryUnit}
							repeatFromCurrentDate={repeatFromCurrentDate}
							onRecurringPreset={(value, unit) => {
								void handleRecurringPreset(value, unit)
							}}
							onRepeatEveryValueChange={setRepeatEveryValue}
							onRepeatEveryUnitChange={setRepeatEveryUnit}
							onRecurringSubmit={handleRecurringSubmit}
							onRepeatOriginToggle={nextValue => {
								void handleRepeatOriginToggle(nextValue)
							}}
							onClearRecurring={() => {
								void handleClearRecurring()
							}}
						/>
						<TaskDetailOrganization
							organizationOpen={openSections.organization}
							assigneesOpen={openSections.assignees}
							onToggle={toggleSection}
							taskLabels={taskLabels}
							availableLabels={availableLabels}
							selectedLabelId={selectedLabelId}
							onSelectedLabelIdChange={setSelectedLabelId}
							onAddLabel={handleAddLabel}
							onRemoveLabel={labelId => {
								void removeLabelFromTask(labelId)
							}}
							taskAssignees={taskAssignees}
							assigneeQuery={assigneeQuery}
							assigneeResults={assigneeResults}
							assigneeSearchLoading={assigneeSearchLoading}
							onAssigneeQueryChange={setAssigneeQuery}
							onAddAssignee={assignee => {
								void handleAddAssignee(assignee)
							}}
							onRemoveAssignee={userId => {
								void handleRemoveAssignee(userId)
							}}
						/>
						<TaskDetailComments
							open={openSections.comments}
							onToggle={toggleSection}
							taskComments={taskComments}
							currentUserId={currentUserId}
							editingCommentId={editingCommentId}
							editingCommentValue={editingCommentValue}
							onEditingCommentValueChange={setEditingCommentValue}
							commentDraft={commentDraft}
							onCommentDraftChange={setCommentDraft}
							onEditComment={handleEditComment}
							onCancelEditComment={handleCancelEditComment}
							onSaveEditedComment={commentId => {
								void handleSaveEditedComment(commentId)
							}}
							onDeleteComment={commentId => {
								void handleDeleteComment(commentId)
							}}
							onAddComment={handleAddComment}
						/>
						<TaskDetailAttachments
							open={openSections.attachments}
							onToggle={toggleSection}
							taskId={taskDetail.id}
							taskAttachments={taskAttachments}
							attachmentUploading={attachmentUploading}
							attachmentInputRef={attachmentInputRef}
							onAttachmentInputChange={handleAttachmentInputChange}
							onOpenAttachmentPreview={openAttachmentPreview}
							onRemoveAttachment={attachmentId => {
								void handleRemoveAttachment(attachmentId)
							}}
						/>
						<CollapsibleSection
							title="Description"
							section="description"
							open={openSections.description}
							onToggle={toggleSection}
						>
							<label className="detail-description-field">
								<textarea
									className="detail-textarea"
									data-detail-description
									placeholder="No description"
									value={description}
									onChange={event => setDescription(event.currentTarget.value)}
									onBlur={() => void handleDescriptionBlur()}
								/>
							</label>
						</CollapsibleSection>
						<CollapsibleSection
							title="Info"
							section="info"
							open={openSections.info}
							onToggle={toggleSection}
						>
							<div className="detail-item detail-field">
								<div className="detail-metadata-list">
									<MetadataRow
										label="Completed"
										field="done_at"
										value={taskDetail.done ? formatOptionalLongDate(taskDetail.done_at, 'Completion time unavailable') : 'Not completed yet'}
									/>
									<MetadataRow
										label="Created"
										field="created"
										value={formatOptionalLongDate(taskDetail.created)}
									/>
									<MetadataRow
										label="Updated"
										field="updated"
										value={formatOptionalLongDate(taskDetail.updated)}
									/>
								</div>
							</div>
						</CollapsibleSection>
					</div>
				</>
			) : null}
		</DetailSheet>
	)
}

import type {AppNotification, TaskAssignee, TaskAttachment, TaskReminder} from '@/types'

const SHORT_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SHORT_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatError(error: {message?: string; details?: unknown} | null | undefined) {
	if (typeof error?.details === 'object' && error.details && 'message' in error.details) {
		return `${(error.details as {message?: string}).message || 'Something went wrong.'}`
	}
	if (typeof error?.details === 'string') {
		return error.details
	}
	return error?.message || 'Something went wrong.'
}

export function formatShortDate(value: string | number | Date) {
	const date = parseValidDate(value)
	if (!date) {
		return ''
	}

	return `${date.getDate()} ${SHORT_MONTH_LABELS[date.getMonth()]}`
}

export function formatLongDate(value: string | number | Date) {
	const date = parseValidDate(value)
	if (!date) {
		return ''
	}

	return [
		`${padTwo(date.getDate())}/${padTwo(date.getMonth() + 1)}/${date.getFullYear()}`,
		`${padTwo(date.getHours())}:${padTwo(date.getMinutes())}:${padTwo(date.getSeconds())}`,
	].join(', ')
}

export function formatOptionalLongDate(value: string | number | Date | null | undefined, fallback = 'Not available') {
	const normalized = normalizeTaskDateValue(typeof value === 'string' ? value : value ? new Date(value).toISOString() : null)
	return normalized ? formatLongDate(normalized) : fallback
}

export function formatDateTimeInput(value: string | number | Date | null | undefined) {
	const date = new Date(value || '')
	if (Number.isNaN(date.getTime())) {
		return ''
	}

	const year = date.getFullYear()
	const month = `${date.getMonth() + 1}`.padStart(2, '0')
	const day = `${date.getDate()}`.padStart(2, '0')
	const hours = `${date.getHours()}`.padStart(2, '0')
	const minutes = `${date.getMinutes()}`.padStart(2, '0')

	return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function normalizeTaskDateValue(value: string | null | undefined) {
	if (!value) {
		return ''
	}

	const raw = `${value}`.trim()
	if (!raw || raw.startsWith('0001-01-01')) {
		return ''
	}

	const date = new Date(raw)
	if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1 || date.getUTCFullYear() <= 1901) {
		return ''
	}

	return raw
}

export function normalizeTaskReminders(reminders: TaskReminder[] | null | undefined) {
	if (!Array.isArray(reminders)) {
		return []
	}

	return reminders
		.map(reminder => ({
			reminder: normalizeTaskDateValue(reminder?.reminder || null),
			relative_period: Number.isFinite(Number(reminder?.relative_period))
				? Number(reminder.relative_period)
				: 0,
			relative_to: normalizeReminderRelativeTo(reminder?.relative_to),
		}))
		.filter(reminder => Boolean(reminder.reminder))
		.sort((left, right) => new Date(left.reminder).getTime() - new Date(right.reminder).getTime())
}

export function formatReminderLabel(reminder: TaskReminder) {
	const normalizedReminder = normalizeTaskDateValue(reminder?.reminder || null)
	if (!normalizedReminder) {
		return 'Invalid reminder'
	}

	return formatLongDate(normalizedReminder)
}

export function formatShortWeekdayLabel(value: string | number | Date) {
	const date = parseValidDate(value)
	if (!date) {
		return ''
	}

	return SHORT_WEEKDAY_LABELS[date.getDay()]
}

export function formatReminderMeta(reminder: TaskReminder) {
	const relativeTo = normalizeReminderRelativeTo(reminder?.relative_to)
	const relativePeriod = Number(reminder?.relative_period || 0)
	if (!relativeTo) {
		return 'Custom time'
	}

	if (relativePeriod === 0) {
		return `At ${formatReminderRelativeToLabel(relativeTo)}`
	}

	const magnitude = Math.abs(relativePeriod)
	const unit = formatReminderDuration(magnitude)
	const direction = relativePeriod < 0 ? 'before' : 'after'
	return `${unit} ${direction} ${formatReminderRelativeToLabel(relativeTo)}`
}

export function normalizeRepeatAfter(value: number | string | null | undefined) {
	const numeric = Number(value)
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return 0
	}

	return Math.max(0, Math.round(numeric))
}

export function formatRepeatInterval(seconds: number | string | null | undefined) {
	const normalized = normalizeRepeatAfter(seconds)
	if (!normalized) {
		return ''
	}

	if (normalized % 2592000 === 0) {
		const months = normalized / 2592000
		return `${months} month${months === 1 ? '' : 's'}`
	}
	if (normalized % 604800 === 0) {
		const weeks = normalized / 604800
		return `${weeks} week${weeks === 1 ? '' : 's'}`
	}
	if (normalized % 86400 === 0) {
		const days = normalized / 86400
		return `${days} day${days === 1 ? '' : 's'}`
	}
	if (normalized % 3600 === 0) {
		const hours = normalized / 3600
		return `${hours} hour${hours === 1 ? '' : 's'}`
	}

	return formatReminderDuration(normalized)
}

export function formatRepeatSummary(
	repeatAfter: number | string | null | undefined,
	repeatFromCurrentDate: boolean | null | undefined,
) {
	const interval = formatRepeatInterval(repeatAfter)
	if (!interval) {
		return ''
	}

	return `Repeats every ${interval}${repeatFromCurrentDate ? ' from completion' : ' from due date'}`
}

export function getUserDisplayName(user: Pick<TaskAssignee, 'name' | 'username'> | null | undefined) {
	const normalizedName = `${user?.name || ''}`.trim()
	if (normalizedName) {
		return normalizedName
	}

	const normalizedUsername = `${user?.username || ''}`.trim()
	return normalizedUsername || 'Unknown user'
}

export function getUserInitials(user: Pick<TaskAssignee, 'name' | 'username'> | null | undefined) {
	const displayName = getUserDisplayName(user)
	const normalized = displayName
		.replaceAll(/[_-]+/g, ' ')
		.trim()

	return normalized.charAt(0).toUpperCase() || '?'
}

export function isNotificationRead(notification: Pick<AppNotification, 'read' | 'read_at'> | null | undefined) {
	return Boolean(notification?.read) || Boolean(normalizeTaskDateValue(notification?.read_at || null))
}

export function formatNotificationSummary(
	notification: AppNotification | null | undefined,
	currentUser: Pick<TaskAssignee, 'id'> | null | undefined = null,
) {
	if (!notification) {
		return ''
	}

	const payload = notification.notification
	switch (notification.name) {
		case 'task.comment':
			return `${getUserDisplayName(payload?.doer)} commented on ${payload?.task?.title || 'a task'}`
		case 'task.assigned': {
			const assigneeId = Number(payload?.assignee?.id || 0)
			const assigneeLabel =
				currentUser?.id && assigneeId && currentUser.id === assigneeId
					? 'you'
					: getUserDisplayName(payload?.assignee)
			return `${getUserDisplayName(payload?.doer)} assigned ${assigneeLabel} to ${payload?.task?.title || 'a task'}`
		}
		case 'task.deleted':
			return `${getUserDisplayName(payload?.doer)} deleted ${payload?.task?.title || 'a task'}`
		case 'project.created':
			return `${getUserDisplayName(payload?.doer)} created ${payload?.project?.title || 'a project'}`
		case 'team.member.added': {
			const memberId = Number(payload?.member?.id || 0)
			const memberLabel =
				currentUser?.id && memberId && currentUser.id === memberId
					? 'you'
					: getUserDisplayName(payload?.member)
			return `${getUserDisplayName(payload?.doer)} added ${memberLabel} to ${payload?.team?.name || 'a team'}`
		}
		case 'task.reminder':
			return `Reminder for ${payload?.task?.title || 'a task'}`
		case 'task.mentioned':
			return `${getUserDisplayName(payload?.doer)} mentioned you on ${payload?.task?.title || 'a task'}`
		case 'task.undone.overdue':
			return `${payload?.task?.title || 'A task'} is overdue`
		case 'data.export.ready':
			return 'Your data export is ready'
		default:
			return payload?.task?.title || payload?.project?.title || 'Notification'
	}
}

export function getNotificationLeadLabel(notification: AppNotification | null | undefined) {
	if (!notification) {
		return '?'
	}

	switch (notification.name) {
		case 'task.comment':
			return 'C'
		case 'task.assigned':
			return 'A'
		case 'task.deleted':
			return 'D'
		case 'project.created':
			return 'P'
		case 'team.member.added':
			return 'T'
		case 'task.reminder':
			return 'R'
		case 'task.mentioned':
			return 'M'
		case 'task.undone.overdue':
			return 'O'
		case 'data.export.ready':
			return 'E'
		default:
			return 'N'
	}
}

export function formatAttachmentSize(size: number | string | null | undefined) {
	const bytes = Number(size)
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return 'Unknown size'
	}
	if (bytes < 1024) {
		return `${bytes} B`
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KB`
	}
	return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

export function canPreviewAttachment(attachment: Pick<TaskAttachment, 'file'> | null | undefined) {
	const fileName = `${attachment?.file?.name || ''}`.trim().toLowerCase()
	return ['.jpeg', '.jpg', '.png', '.bmp', '.gif', '.webp'].some(suffix => fileName.endsWith(suffix))
}

function normalizeReminderRelativeTo(value: string | null | undefined) {
	switch (`${value || ''}`) {
		case 'due_date':
		case 'start_date':
		case 'end_date':
			return `${value}` as 'due_date' | 'start_date' | 'end_date'
		default:
			return ''
	}
}

function formatReminderRelativeToLabel(value: 'due_date' | 'start_date' | 'end_date') {
	switch (value) {
		case 'due_date':
			return 'due date'
		case 'start_date':
			return 'start date'
		case 'end_date':
			return 'end date'
	}
}

function formatReminderDuration(seconds: number) {
	if (seconds % 86400 === 0) {
		const days = seconds / 86400
		return `${days} day${days === 1 ? '' : 's'}`
	}
	if (seconds % 3600 === 0) {
		const hours = seconds / 3600
		return `${hours} hour${hours === 1 ? '' : 's'}`
	}
	if (seconds % 60 === 0) {
		const minutes = seconds / 60
		return `${minutes} minute${minutes === 1 ? '' : 's'}`
	}

	return `${seconds} seconds`
}

export function normalizePercentDone(value: number | string | null | undefined) {
	const numeric = Number(value)
	if (!Number.isFinite(numeric)) {
		return 0
	}

	return Math.min(100, Math.max(0, Math.round(numeric)))
}

export function normalizeHexColor(value: string | null | undefined) {
	const trimmed = `${value || ''}`.trim()
	if (!trimmed) {
		return ''
	}

	return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

export function getColorInputValue(value: string | null | undefined) {
	return normalizeHexColor(value) || '#1973ff'
}

export function renderPriorityOptions(selectedPriority: number) {
	return [
		{value: 0, label: 'Unset'},
		{value: 1, label: 'Priority 1'},
		{value: 2, label: 'Priority 2'},
		{value: 3, label: 'Priority 3'},
		{value: 4, label: 'Priority 4'},
		{value: 5, label: 'Priority 5'},
	]
		.map(option => `<option value="${option.value}" ${option.value === selectedPriority ? 'selected' : ''}>${option.label}</option>`)
		.join('')
}

export function renderLabelStyle(label: {hex_color?: string; hexColor?: string}) {
	const hex = label.hex_color || label.hexColor || ''
	if (!hex) {
		return ''
	}

	const background = hex.startsWith('#') ? hex : `#${hex}`
	return `background:${background};color:${pickLabelTextColor(background)};`
}

function pickLabelTextColor(hex: string) {
	const normalized = hex.replace('#', '')
	if (normalized.length !== 6) {
		return '#170f0d'
	}

	const red = parseInt(normalized.slice(0, 2), 16)
	const green = parseInt(normalized.slice(2, 4), 16)
	const blue = parseInt(normalized.slice(4, 6), 16)
	const brightness = (red * 299 + green * 587 + blue * 114) / 1000

	return brightness > 170 ? '#170f0d' : '#fff7f1'
}

export function formatSessionTimestamp(value: string | null | undefined) {
	if (!value) {
		return 'Unknown time'
	}

	return formatLongDate(value)
}

export function escapeHtml(value: string | null | undefined) {
	return `${value || ''}`
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}

function parseValidDate(value: string | number | Date) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return null
	}

	return date
}

function padTwo(value: number) {
	return `${value}`.padStart(2, '0')
}

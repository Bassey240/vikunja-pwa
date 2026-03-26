import type {
	AppNotification,
	NotificationCategory,
	NotificationPreferenceMap,
	UserFrontendSettings,
} from '@/types'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const notificationPreferenceDefinitions: Array<{
	category: NotificationCategory
	title: string
	description: string
	defaultCenter: boolean
}> = [
	{
		category: 'mentions',
		title: 'Mentions',
		description: 'When someone mentions you on a task.',
		defaultCenter: true,
	},
	{
		category: 'comments',
		title: 'Comments',
		description: 'Comments on tasks that are already relevant to you.',
		defaultCenter: true,
	},
	{
		category: 'assignments',
		title: 'Assignments',
		description: 'When a task is assigned to you.',
		defaultCenter: true,
	},
	{
		category: 'reminders',
		title: 'Reminders',
		description: 'Task reminder notifications.',
		defaultCenter: true,
	},
	{
		category: 'overdue',
		title: 'Overdue',
		description: 'Alerts for overdue tasks.',
		defaultCenter: true,
	},
	{
		category: 'taskDeletions',
		title: 'Task deletions',
		description: 'When another user deletes a task that reaches your notification feed.',
		defaultCenter: false,
	},
	{
		category: 'projectCreation',
		title: 'Project creation',
		description: 'When Vikunja sends a project-created notification.',
		defaultCenter: false,
	},
	{
		category: 'teamMembership',
		title: 'Team membership',
		description: 'When you are added to a team.',
		defaultCenter: true,
	},
	{
		category: 'system',
		title: 'System & other',
		description: 'Exports and any notification names not mapped to a collaboration category yet.',
		defaultCenter: true,
	},
]

export const defaultNotificationPreferences: NotificationPreferenceMap = notificationPreferenceDefinitions.reduce(
	(result, definition) => ({
		...result,
		[definition.category]: {
			center: definition.defaultCenter,
		},
	}),
	{} as NotificationPreferenceMap,
)

export function getNotificationCategory(name: string | null | undefined): NotificationCategory {
	switch (`${name || ''}`.trim()) {
		case 'task.mentioned':
			return 'mentions'
		case 'task.comment':
			return 'comments'
		case 'task.assigned':
			return 'assignments'
		case 'task.reminder':
			return 'reminders'
		case 'task.undone.overdue':
			return 'overdue'
		case 'task.deleted':
			return 'taskDeletions'
		case 'project.created':
			return 'projectCreation'
		case 'team.member.added':
			return 'teamMembership'
		case 'data.export.ready':
		default:
			return 'system'
	}
}

export function normalizeNotificationPreferences(
	frontendSettings: UserFrontendSettings | null | undefined,
): NotificationPreferenceMap {
	const storedPreferences = isRecord(frontendSettings?.notification_preferences)
		? frontendSettings.notification_preferences
		: {}

	return notificationPreferenceDefinitions.reduce(
		(result, definition) => ({
			...result,
			[definition.category]: {
				center: readCenterPreference(storedPreferences[definition.category], definition.defaultCenter),
			},
		}),
		{} as NotificationPreferenceMap,
	)
}

export function serializeNotificationPreferences(
	preferences: NotificationPreferenceMap,
): Record<NotificationCategory, NotificationPreferenceMap[NotificationCategory]> {
	return notificationPreferenceDefinitions.reduce(
		(result, definition) => ({
			...result,
			[definition.category]: {
				center: Boolean(preferences[definition.category]?.center),
			},
		}),
		{} as Record<NotificationCategory, NotificationPreferenceMap[NotificationCategory]>,
	)
}

export function isOwnActionNotification(
	notification: AppNotification | null | undefined,
	currentUserId: number | null | undefined,
) {
	const userId = Number(currentUserId || 0)
	if (!userId) {
		return false
	}

	switch (notification?.name) {
		case 'task.comment':
		case 'task.assigned':
		case 'task.deleted':
		case 'project.created':
		case 'team.member.added':
		case 'task.mentioned':
			return Number(notification.notification?.doer?.id || 0) === userId
		default:
			return false
	}
}

export function shouldShowNotificationInCenter(
	notification: AppNotification | null | undefined,
	preferences: NotificationPreferenceMap,
	currentUserId: number | null | undefined,
) {
	if (!notification) {
		return false
	}

	if (isOwnActionNotification(notification, currentUserId)) {
		return false
	}

	return Boolean(preferences[getNotificationCategory(notification.name)]?.center)
}

export function getVisibleNotifications(
	notifications: AppNotification[] | null | undefined,
	preferences: NotificationPreferenceMap,
	currentUserId: number | null | undefined,
) {
	if (!Array.isArray(notifications)) {
		return []
	}

	return notifications.filter(notification =>
		shouldShowNotificationInCenter(notification, preferences, currentUserId),
	)
}

function readCenterPreference(value: unknown, fallback: boolean) {
	if (!isRecord(value) || typeof value.center !== 'boolean') {
		return fallback
	}

	return value.center
}

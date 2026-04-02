import {api} from '@/api'
import type {AppNotification, NotificationPayload, TaskAssignee} from '@/types'
import {formatError, normalizeTaskDateValue} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {blockOfflineReadOnlyAction} from '../offline-readonly'
import {mergeOfflineSnapshot} from '../offline-snapshot'

export interface NotificationsSlice {
	notifications: AppNotification[]
	notificationsLoaded: boolean
	loadingNotifications: boolean
	markingNotificationIds: Set<number>
	loadNotifications: (options?: {silent?: boolean}) => Promise<void>
	markNotificationRead: (notificationId: number, read?: boolean) => Promise<boolean>
	markAllNotificationsRead: (notificationIds?: number[]) => Promise<boolean>
	resetNotificationsState: () => void
}

export const createNotificationsSlice: StateCreator<AppStore, [], [], NotificationsSlice> = (set, get) => ({
	notifications: [],
	notificationsLoaded: false,
	loadingNotifications: false,
	markingNotificationIds: new Set(),

	async loadNotifications({silent = false} = {}) {
		if (!get().connected) {
			return
		}

		if (!get().isOnline && get().offlineReadOnlyMode) {
			return
		}

		const shouldShowLoading = !silent || !get().notificationsLoaded
		if (shouldShowLoading) {
			set({
				loadingNotifications: true,
				error: silent ? get().error : null,
			})
		}

		try {
			const notifications = await api<AppNotification[]>('/api/notifications')
			set({
				notifications: normalizeNotifications(notifications),
				notificationsLoaded: true,
			})
			void mergeOfflineSnapshot({
				notifications: get().notifications,
			})
		} catch (error) {
			if (!silent) {
				set({error: formatError(error as Error)})
			}
		} finally {
			if (shouldShowLoading) {
				set({loadingNotifications: false})
			}
		}
	},

	async markNotificationRead(notificationId, read = true) {
		if (blockOfflineReadOnlyAction(get, set, 'update notifications')) {
			return false
		}

		const numericNotificationId = Number(notificationId || 0)
		if (!numericNotificationId) {
			return false
		}

		const currentNotification = get().notifications.find(entry => entry.id === numericNotificationId)
		if (!currentNotification) {
			return false
		}

		const previousNotification = normalizeNotification(currentNotification)
		const optimisticNotification = normalizeNotification({
			...previousNotification,
			read,
			read_at: read ? new Date().toISOString() : null,
		})

		set(state => ({
			notifications: state.notifications.map(entry =>
				entry.id === numericNotificationId ? optimisticNotification : entry,
			),
			markingNotificationIds: new Set(state.markingNotificationIds).add(numericNotificationId),
		}))

		try {
			const result = await api<{notification: AppNotification}, {read: boolean}>(
				`/api/notifications/${numericNotificationId}`,
				{
					method: 'POST',
					body: {read},
				},
			)
			const committedNotification = normalizeNotification(result.notification)
			set(state => {
				const markingNotificationIds = new Set(state.markingNotificationIds)
				markingNotificationIds.delete(numericNotificationId)
				return {
					notifications: state.notifications.map(entry =>
						entry.id === numericNotificationId ? committedNotification : entry,
					),
					markingNotificationIds,
				}
			})
			return true
		} catch (error) {
			set(state => {
				const markingNotificationIds = new Set(state.markingNotificationIds)
				markingNotificationIds.delete(numericNotificationId)
				return {
					notifications: state.notifications.map(entry =>
						entry.id === numericNotificationId ? previousNotification : entry,
					),
					markingNotificationIds,
					error: formatError(error as Error),
				}
			})
			return false
		}
	},

	async markAllNotificationsRead(notificationIds) {
		if (Array.isArray(notificationIds) && notificationIds.length > 0) {
			const results = await Promise.all(notificationIds.map(notificationId => get().markNotificationRead(notificationId, true)))
			return results.every(Boolean)
		}

		if (blockOfflineReadOnlyAction(get, set, 'update notifications')) {
			return false
		}

		const notifications = normalizeNotifications(get().notifications)
		const unreadNotificationIds = notifications.filter(entry => !isNotificationRead(entry)).map(entry => entry.id)
		if (unreadNotificationIds.length === 0) {
			return true
		}

		const readAt = new Date().toISOString()
		const nextNotifications = notifications.map(entry =>
			isNotificationRead(entry)
				? entry
				: normalizeNotification({
						...entry,
						read: true,
						read_at: readAt,
					}),
		)

		set({
			notifications: nextNotifications,
			markingNotificationIds: new Set(unreadNotificationIds),
		})

		try {
			await api('/api/notifications', {
				method: 'POST',
				body: {},
			})
			set({
				markingNotificationIds: new Set(),
			})
			return true
		} catch (error) {
			set({
				notifications,
				markingNotificationIds: new Set(),
				error: formatError(error as Error),
			})
			return false
		}
	},

	resetNotificationsState() {
		set({
			notifications: [],
			notificationsLoaded: false,
			loadingNotifications: false,
			markingNotificationIds: new Set(),
		})
	},
})

function normalizeNotifications(notifications: AppNotification[] | null | undefined) {
	if (!Array.isArray(notifications)) {
		return []
	}

	return notifications
		.map(notification => normalizeNotification(notification))
		.filter(notification => notification.id > 0)
		.sort((left, right) => right.id - left.id)
}

function normalizeNotification(notification: AppNotification | null | undefined): AppNotification {
	return {
		id: Number(notification?.id || 0),
		name: `${notification?.name || ''}`.trim(),
		notification: normalizeNotificationPayload(notification?.notification),
		read: Boolean(notification?.read) || Boolean(normalizeTaskDateValue(notification?.read_at || null)),
		read_at: normalizeTaskDateValue(notification?.read_at || null) || null,
		created: normalizeTaskDateValue(notification?.created || null) || null,
	}
}

function normalizeNotificationPayload(payload: AppNotification['notification']): NotificationPayload | null {
	if (!payload || typeof payload !== 'object') {
		return null
	}

	return {
		doer: normalizeNotificationUser(payload.doer),
		task: payload.task?.id
			? {
					id: Number(payload.task.id),
					title: `${payload.task.title || ''}`.trim(),
					project_id: payload.task.project_id ? Number(payload.task.project_id) : null,
				}
			: null,
		project: payload.project?.id
			? {
					id: Number(payload.project.id),
					title: `${payload.project.title || ''}`.trim(),
				}
			: null,
		comment: payload.comment?.id
			? {
					id: Number(payload.comment.id),
					comment: `${payload.comment.comment || ''}`.trim(),
				}
			: null,
		assignee: normalizeNotificationUser(payload.assignee),
		member: normalizeNotificationUser(payload.member),
		team: payload.team?.id
			? {
					id: Number(payload.team.id),
					name: `${payload.team.name || ''}`.trim(),
				}
			: null,
	}
}

function normalizeNotificationUser(user: TaskAssignee | null | undefined) {
	if (!user?.id) {
		return null
	}

	return {
		id: Number(user.id),
		name: `${user.name || ''}`.trim(),
		username: `${user.username || ''}`.trim(),
		email: `${user.email || ''}`.trim(),
	}
}

export function isNotificationRead(notification: AppNotification | null | undefined) {
	return Boolean(notification?.read) || Boolean(normalizeTaskDateValue(notification?.read_at || null))
}

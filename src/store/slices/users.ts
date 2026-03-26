import {api} from '@/api'
import type {AdminRuntimeHealth, AdminUser, NotificationPreferenceMap, UserFrontendSettings} from '@/types'
import {serializeNotificationPreferences} from '@/utils/notificationPreferences'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'

interface AdminUsersPayload {
	items?: AdminUser[]
}

interface AdminRuntimeHealthPayload extends AdminRuntimeHealth {}

interface AdminUserPayload {
	ok: boolean
	user?: AdminUser | null
}

interface CollaborationSettingsPatch {
	name: string
	discoverableByName: boolean
	discoverableByEmail: boolean
}

export interface UsersSlice {
	adminUsers: AdminUser[]
	adminUsersLoaded: boolean
	adminUsersLoading: boolean
	adminUserSubmitting: boolean
	adminRuntimeHealth: AdminRuntimeHealth | null
	adminRuntimeHealthLoading: boolean
	collaborationSettingsSubmitting: boolean
	notificationPreferencesSubmitting: boolean
	loadAdminUsers: () => Promise<void>
	loadAdminRuntimeHealth: () => Promise<void>
	createAdminUser: (payload: {username: string; email: string; password: string}) => Promise<boolean>
	updateAdminUser: (identifier: number | string, payload: {username: string; email: string}) => Promise<boolean>
	setAdminUserEnabled: (identifier: number | string, enabled: boolean) => Promise<boolean>
	resetAdminUserPassword: (identifier: number | string, password: string) => Promise<boolean>
	deleteAdminUser: (identifier: number | string) => Promise<boolean>
	saveCollaborationSettings: (payload: CollaborationSettingsPatch) => Promise<boolean>
	saveNotificationPreferences: (payload: NotificationPreferenceMap) => Promise<boolean>
	resetUsersState: () => void
}

export const createUsersSlice: StateCreator<AppStore, [], [], UsersSlice> = (set, get) => ({
	adminUsers: [],
	adminUsersLoaded: false,
	adminUsersLoading: false,
	adminUserSubmitting: false,
	adminRuntimeHealth: null,
	adminRuntimeHealthLoading: false,
	collaborationSettingsSubmitting: false,
	notificationPreferencesSubmitting: false,

	async loadAdminUsers() {
		if (!canManageUsers(get())) {
			set({
				adminUsers: [],
				adminUsersLoaded: false,
				adminUsersLoading: false,
			})
			return
		}

		const health = get().adminRuntimeHealth
		if (health && (!health.dockerReachable || !health.vikunjaContainerFound || !health.vikunjaCliReachable)) {
			set({
				adminUsers: [],
				adminUsersLoaded: false,
				adminUsersLoading: false,
			})
			return
		}

		set({adminUsersLoading: true, error: null})

		try {
			const payload = await api<AdminUsersPayload>('/api/admin/users')
			set({
				adminUsers: Array.isArray(payload.items) ? payload.items : [],
				adminUsersLoaded: true,
			})
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({adminUsersLoading: false})
		}
	},

	async loadAdminRuntimeHealth() {
		if (!canManageUsers(get())) {
			set({
				adminRuntimeHealth: null,
				adminRuntimeHealthLoading: false,
			})
			return
		}

		set({adminRuntimeHealthLoading: true, error: null})

		try {
			const payload = await api<AdminRuntimeHealthPayload>('/api/admin/runtime/health')
			set({adminRuntimeHealth: payload})
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({adminRuntimeHealthLoading: false})
		}
	},

	async createAdminUser(payload) {
		if (!canManageUsers(get())) {
			return false
		}

		const username = `${payload.username || ''}`.trim()
		const email = `${payload.email || ''}`.trim()
		const password = `${payload.password || ''}`
		if (!username || !email || !password) {
			set({error: 'Username, email, and password are required.'})
			return false
		}

		set({adminUserSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<AdminUserPayload, {username: string; email: string; password: string}>('/api/admin/users', {
				method: 'POST',
				body: {
					username,
					email,
					password,
				},
			})
			await get().loadAdminUsers()
			set({settingsNotice: `Created user "${username}".`})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({adminUserSubmitting: false})
		}
	},

	async updateAdminUser(identifier, payload) {
		if (!canManageUsers(get())) {
			return false
		}

		const username = `${payload.username || ''}`.trim()
		const email = `${payload.email || ''}`.trim()
		if (!username || !email) {
			set({error: 'Username and email are required.'})
			return false
		}

		set({adminUserSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<AdminUserPayload, {username: string; email: string}>(`/api/admin/users/${encodeURIComponent(String(identifier))}`, {
				method: 'PATCH',
				body: {
					username,
					email,
				},
			})
			await get().loadAdminUsers()
			set({settingsNotice: `Updated user "${username}".`})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({adminUserSubmitting: false})
		}
	},

	async setAdminUserEnabled(identifier, enabled) {
		if (!canManageUsers(get())) {
			return false
		}

		set({adminUserSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<AdminUserPayload, {enabled: boolean}>(`/api/admin/users/${encodeURIComponent(String(identifier))}/status`, {
				method: 'PATCH',
				body: {enabled},
			})
			await get().loadAdminUsers()
			set({settingsNotice: enabled ? 'User enabled.' : 'User disabled.'})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({adminUserSubmitting: false})
		}
	},

	async resetAdminUserPassword(identifier, password) {
		if (!canManageUsers(get())) {
			return false
		}

		const nextPassword = `${password || ''}`
		if (!nextPassword) {
			set({error: 'A new password is required.'})
			return false
		}

		set({adminUserSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<{ok: boolean}, {password: string}>(`/api/admin/users/${encodeURIComponent(String(identifier))}/password`, {
				method: 'POST',
				body: {password: nextPassword},
			})
			set({settingsNotice: 'Password updated.'})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({adminUserSubmitting: false})
		}
	},

	async deleteAdminUser(identifier) {
		if (!canManageUsers(get())) {
			return false
		}

		if (!window.confirm('Delete this user immediately?')) {
			return false
		}

		set({adminUserSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<{ok: boolean}>(`/api/admin/users/${encodeURIComponent(String(identifier))}`, {
				method: 'DELETE',
			})
			await get().loadAdminUsers()
			set({settingsNotice: 'User deleted.'})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({adminUserSubmitting: false})
		}
	},

	async saveCollaborationSettings(payload) {
		if (!get().connected || !get().account?.user) {
			return false
		}

		const name = `${payload.name || ''}`.trim()
		if (!name) {
			set({error: 'Display name is required.'})
			return false
		}

		set({collaborationSettingsSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<{ok: boolean; user?: unknown}, Record<string, unknown>>('/api/session/settings/general', {
				method: 'POST',
				body: {
					...(get().account?.user?.settings || {}),
					name,
					discoverable_by_name: payload.discoverableByName,
					discoverable_by_email: payload.discoverableByEmail,
				},
			})
			await get().loadCurrentUser()
			set({settingsNotice: 'Collaboration settings updated.'})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({collaborationSettingsSubmitting: false})
		}
	},

	async saveNotificationPreferences(payload) {
		if (!get().connected || !get().account?.user) {
			return false
		}

		const existingSettings = (get().account?.user?.settings || {}) as Record<string, unknown>
		const existingFrontendSettings = normalizeFrontendSettings(existingSettings.frontend_settings)

		set({notificationPreferencesSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<{ok: boolean; user?: unknown}, Record<string, unknown>>('/api/session/settings/general', {
				method: 'POST',
				body: {
					...existingSettings,
					frontend_settings: {
						...existingFrontendSettings,
						notification_preferences: serializeNotificationPreferences(payload),
					},
				},
			})
			await get().loadCurrentUser()
			set({settingsNotice: 'Notification preferences updated.'})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({notificationPreferencesSubmitting: false})
		}
	},

	resetUsersState() {
		set({
			adminUsers: [],
			adminUsersLoaded: false,
			adminUsersLoading: false,
			adminUserSubmitting: false,
			adminRuntimeHealth: null,
			adminRuntimeHealthLoading: false,
			collaborationSettingsSubmitting: false,
			notificationPreferencesSubmitting: false,
		})
	},
})

function canManageUsers(state: AppStore) {
	return Boolean(
		state.connected &&
		state.account?.isAdmin &&
		state.account?.authMode === 'password',
	)
}

function normalizeFrontendSettings(value: unknown): UserFrontendSettings {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {}
	}

	return value as UserFrontendSettings
}

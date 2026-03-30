import {api, uploadApi} from '@/api'
import type {
	AdminMailDiagnosticsResult,
	AdminRuntimeHealth,
	AdminUser,
	AvatarProvider,
	MailerConfig,
	MailerConfigInput,
	NotificationSettingsForm,
	UserFrontendSettings,
} from '@/types'
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

interface AvatarSettingsPayload {
	avatar_provider?: string | null
}

interface MailerConfigApplyPayload {
	restarted?: boolean
	config?: MailerConfig | null
}

export interface UsersSlice {
	adminUsers: AdminUser[]
	adminUsersLoaded: boolean
	adminUsersLoading: boolean
	adminUserSubmitting: boolean
	adminRuntimeHealth: AdminRuntimeHealth | null
	adminRuntimeHealthLoading: boolean
	mailDiagnosticsSubmitting: boolean
	mailDiagnosticsResult: AdminMailDiagnosticsResult | null
	mailerConfig: MailerConfig | null
	mailerConfigLoadAttempted: boolean
	mailerConfigLoading: boolean
	mailerConfigSubmitting: boolean
	mailerConfigRestarting: boolean
	collaborationSettingsSubmitting: boolean
	notificationPreferencesSubmitting: boolean
	avatarProvider: AvatarProvider | null
	avatarProviderLoaded: boolean
	avatarProviderLoading: boolean
	avatarProviderSubmitting: boolean
	avatarUploadSubmitting: boolean
	avatarCacheBuster: number
	loadAdminUsers: () => Promise<void>
	loadAdminRuntimeHealth: () => Promise<void>
	sendTestmail: (email: string) => Promise<boolean>
	loadMailerConfig: () => Promise<void>
	saveMailerConfig: (settings: MailerConfigInput) => Promise<boolean>
	applyMailerConfig: () => Promise<boolean>
	createAdminUser: (payload: {username: string; email: string; password: string}) => Promise<boolean>
	updateAdminUser: (identifier: number | string, payload: {username: string; email: string}) => Promise<boolean>
	setAdminUserEnabled: (identifier: number | string, enabled: boolean) => Promise<boolean>
	resetAdminUserPassword: (identifier: number | string, password: string) => Promise<boolean>
	deleteAdminUser: (identifier: number | string) => Promise<boolean>
	saveCollaborationSettings: (payload: CollaborationSettingsPatch) => Promise<boolean>
	saveNotificationPreferences: (payload: NotificationSettingsForm) => Promise<boolean>
	loadAvatarProvider: () => Promise<void>
	updateAvatarProvider: (provider: AvatarProvider) => Promise<boolean>
	uploadAvatar: (file: File) => Promise<boolean>
	resetUsersState: () => void
}

export const createUsersSlice: StateCreator<AppStore, [], [], UsersSlice> = (set, get) => ({
	adminUsers: [],
	adminUsersLoaded: false,
	adminUsersLoading: false,
	adminUserSubmitting: false,
	adminRuntimeHealth: null,
	adminRuntimeHealthLoading: false,
	mailDiagnosticsSubmitting: false,
	mailDiagnosticsResult: null,
	mailerConfig: null,
	mailerConfigLoadAttempted: false,
	mailerConfigLoading: false,
	mailerConfigSubmitting: false,
	mailerConfigRestarting: false,
	collaborationSettingsSubmitting: false,
	notificationPreferencesSubmitting: false,
	avatarProvider: null,
	avatarProviderLoaded: false,
	avatarProviderLoading: false,
	avatarProviderSubmitting: false,
	avatarUploadSubmitting: false,
	avatarCacheBuster: 0,

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
		const account = get().account
		if (account?.authMode !== 'password') {
			set({
				adminRuntimeHealth: null,
				adminRuntimeHealthLoading: false,
			})
			return
		}

		set({adminRuntimeHealthLoading: true, error: null})

		try {
			const payload = await api<AdminRuntimeHealthPayload>('/api/admin/runtime/status')
			set({adminRuntimeHealth: payload})
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({adminRuntimeHealthLoading: false})
		}
	},

	async sendTestmail(email) {
		if (!canManageUsers(get())) {
			return false
		}

		const nextEmail = `${email || ''}`.trim()
		if (!nextEmail) {
			set({
				mailDiagnosticsResult: {
					success: false,
					stdout: null,
					stderr: 'An email address is required.',
				},
			})
			return false
		}

		set({
			mailDiagnosticsSubmitting: true,
			mailDiagnosticsResult: null,
			error: null,
			settingsNotice: null,
		})

		try {
			const result = await api<AdminMailDiagnosticsResult, {email: string}>('/api/admin/testmail', {
				method: 'POST',
				body: {email: nextEmail},
			})
			set({mailDiagnosticsResult: result})
			return result.success
		} catch (error) {
			set({
				mailDiagnosticsResult: {
					success: false,
					stdout: null,
					stderr: formatError(error as Error),
				},
			})
			return false
		} finally {
			set({mailDiagnosticsSubmitting: false})
		}
	},

	async loadMailerConfig() {
		if (!canManageUsers(get())) {
			set({
				mailerConfig: null,
				mailerConfigLoadAttempted: false,
				mailerConfigLoading: false,
			})
			return
		}

		if (get().mailerConfigLoading) {
			return
		}

		set({
			mailerConfigLoading: true,
			error: null,
		})

		try {
			const config = await api<MailerConfig>('/api/admin/config/mailer')
			set({
				mailerConfig: config,
				mailerConfigLoadAttempted: true,
			})
		} catch (error) {
			set({
				error: formatError(error as Error),
				mailerConfigLoadAttempted: true,
			})
		} finally {
			set({mailerConfigLoading: false})
		}
	},

	async saveMailerConfig(settings) {
		if (!canManageUsers(get())) {
			return false
		}

		set({
			mailerConfigSubmitting: true,
			error: null,
			settingsNotice: null,
		})

		try {
			const config = await api<MailerConfig, MailerConfigInput>('/api/admin/config/mailer', {
				method: 'POST',
				body: {
					enabled: Boolean(settings.enabled),
					host: `${settings.host || ''}`.trim(),
					port: Number(settings.port) || 587,
					authType: `${settings.authType || 'plain'}`.trim() || 'plain',
					username: `${settings.username || ''}`.trim(),
					password: `${settings.password || ''}`,
					skipTlsVerify: Boolean(settings.skipTlsVerify),
					fromEmail: `${settings.fromEmail || ''}`.trim(),
					forceSsl: Boolean(settings.forceSsl),
				},
			})
			set({
				mailerConfig: config,
				mailerConfigLoadAttempted: true,
				settingsNotice: 'SMTP configuration saved.',
			})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({mailerConfigSubmitting: false})
		}
	},

	async applyMailerConfig() {
		if (!canManageUsers(get())) {
			return false
		}

		set({
			mailerConfigRestarting: true,
			error: null,
			settingsNotice: null,
		})

		try {
			const result = await api<MailerConfigApplyPayload>('/api/admin/config/mailer/apply', {
				method: 'POST',
			})
			set({
				mailerConfig: result.config || null,
				mailerConfigLoadAttempted: true,
				settingsNotice: result.restarted ? 'SMTP configuration applied.' : null,
			})
			await Promise.all([
				get().loadAccountStatus(),
				get().loadAdminRuntimeHealth(),
			])
			return result.restarted === true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({mailerConfigRestarting: false})
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
					email_reminders_enabled: payload.emailRemindersEnabled,
					overdue_tasks_reminders_enabled: payload.overdueTasksRemindersEnabled,
					frontend_settings: {
						...existingFrontendSettings,
						notification_preferences: serializeNotificationPreferences(payload.centerPreferences),
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

	async loadAvatarProvider() {
		if (!get().connected || !get().account?.user) {
			set({
				avatarProvider: null,
				avatarProviderLoaded: false,
				avatarProviderLoading: false,
			})
			return
		}

		if (get().avatarProviderLoading) {
			return
		}

		set({avatarProviderLoading: true, error: null})

		try {
			const payload = await api<AvatarSettingsPayload>('/api/session/settings/avatar')
			set({
				avatarProvider: normalizeAvatarProvider(payload.avatar_provider),
				avatarProviderLoaded: true,
			})
		} catch (error) {
			set({
				error: formatError(error as Error),
				avatarProviderLoaded: true,
			})
		} finally {
			set({avatarProviderLoading: false})
		}
	},

	async updateAvatarProvider(provider) {
		if (!get().connected || !get().account?.user || get().avatarProviderSubmitting || get().avatarUploadSubmitting) {
			return false
		}

		set({avatarProviderSubmitting: true, error: null, settingsNotice: null})

		try {
			const payload = await api<AvatarSettingsPayload, {avatar_provider: AvatarProvider}>('/api/session/settings/avatar', {
				method: 'POST',
				body: {avatar_provider: provider},
			})
			await get().loadCurrentUser()
			set(state => ({
				avatarProvider: normalizeAvatarProvider(payload.avatar_provider) || provider,
				avatarProviderLoaded: true,
				avatarCacheBuster: Date.now(),
				settingsNotice: 'Avatar provider updated.',
			}))
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({avatarProviderSubmitting: false})
		}
	},

	async uploadAvatar(file) {
		if (!get().connected || !get().account?.user || get().avatarUploadSubmitting || get().avatarProviderSubmitting) {
			return false
		}

		if (!(file instanceof File) || file.size <= 0) {
			set({error: 'Choose an image file to upload.'})
			return false
		}

		const formData = new FormData()
		formData.append('avatar', file)

		set({avatarUploadSubmitting: true, error: null, settingsNotice: null})

		try {
			await uploadApi<{ok: boolean}>('/api/session/settings/avatar/upload', formData, {
				method: 'PUT',
			})
			await Promise.all([
				get().loadCurrentUser(),
				get().loadAvatarProvider(),
			])
			set({
				avatarCacheBuster: Date.now(),
				settingsNotice: 'Avatar uploaded.',
			})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({avatarUploadSubmitting: false})
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
			mailDiagnosticsSubmitting: false,
			mailDiagnosticsResult: null,
			mailerConfig: null,
			mailerConfigLoadAttempted: false,
			mailerConfigLoading: false,
			mailerConfigSubmitting: false,
			mailerConfigRestarting: false,
			collaborationSettingsSubmitting: false,
			notificationPreferencesSubmitting: false,
			avatarProvider: null,
			avatarProviderLoaded: false,
			avatarProviderLoading: false,
			avatarProviderSubmitting: false,
			avatarUploadSubmitting: false,
			avatarCacheBuster: 0,
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

function normalizeAvatarProvider(value: unknown): AvatarProvider | null {
	switch (`${value || ''}`.trim()) {
		case 'default':
		case 'initials':
		case 'gravatar':
		case 'marble':
		case 'upload':
		case 'ldap':
		case 'openid':
			return value
		default:
			return null
	}
}

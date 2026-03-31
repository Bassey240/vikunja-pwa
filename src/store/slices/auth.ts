import {api} from '@/api'
import {defaultProjectFilters, defaultTaskFilters} from '@/hooks/useFilters'
import type {
	Account,
	AccountForm,
	AuthMode,
	ServerConfig,
	Session,
	UserProfile,
} from '@/types'
import {formatError} from '@/utils/formatting'
import {storageKeys} from '@/storageKeys'
import {clearLegacyUiState, loadJson, saveJson, saveNumber} from '@/utils/storage'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {persistOfflineBrowseSnapshot} from '../offline-browse-cache'
import {clearOfflineSnapshot, loadOfflineSnapshot, mergeOfflineSnapshot} from '../offline-snapshot'
import {loadPersistedPreferredProjectViewKind} from '../view-selections'

interface SessionPayload {
	connected: boolean
	account: Account | null
}

interface ChangePasswordForm {
	oldPassword: string
	newPassword: string
	confirmPassword: string
}

interface RegistrationForm {
	baseUrl: string
	username: string
	email: string
	password: string
	confirmPassword: string
}

interface ForgotPasswordForm {
	email: string
}

interface ResetPasswordForm {
	baseUrl: string
	token: string
	password: string
	confirmPassword: string
}

const defaultAccountForm: AccountForm = {
	authMode: 'password',
	baseUrl: '',
	username: '',
	password: '',
	apiToken: '',
}

const defaultChangePasswordForm: ChangePasswordForm = {
	oldPassword: '',
	newPassword: '',
	confirmPassword: '',
}

const defaultForgotPasswordForm: ForgotPasswordForm = {
	email: '',
}

const defaultResetPasswordForm: ResetPasswordForm = {
	baseUrl: '',
	token: '',
	password: '',
	confirmPassword: '',
}

function buildRegistrationForm(baseUrl = ''): RegistrationForm {
	return {
		baseUrl,
		username: '',
		email: '',
		password: '',
		confirmPassword: '',
	}
}

type PersistedAccountForm = Pick<AccountForm, 'authMode' | 'baseUrl' | 'username'>

function loadPersistedAccountForm(): PersistedAccountForm {
	if (typeof window === 'undefined') {
		return {
			authMode: defaultAccountForm.authMode,
			baseUrl: defaultAccountForm.baseUrl,
			username: defaultAccountForm.username,
		}
	}

	const stored = loadJson<Partial<PersistedAccountForm> | null>(storageKeys.accountForm, null)
	return {
		authMode: stored?.authMode === 'apiToken' ? 'apiToken' : 'password',
		baseUrl: `${stored?.baseUrl || ''}`,
		username: `${stored?.username || ''}`,
	}
}

function buildAccountForm(accountForm: Partial<AccountForm> = {}): AccountForm {
	const persisted = loadPersistedAccountForm()
	return {
		...defaultAccountForm,
		...persisted,
		...accountForm,
		password: '',
		apiToken: '',
	}
}

function persistAccountForm(accountForm: AccountForm) {
	if (typeof window === 'undefined') {
		return
	}

	saveJson(storageKeys.accountForm, {
		authMode: accountForm.authMode === 'apiToken' ? 'apiToken' : 'password',
		baseUrl: `${accountForm.baseUrl || ''}`,
		username: `${accountForm.username || ''}`,
	} satisfies PersistedAccountForm)
}

function getFallbackTimezones(currentTimezone: string | null | undefined) {
	const current = `${currentTimezone || ''}`.trim()
	const supportedValuesOf = Intl.supportedValuesOf as ((key: 'timeZone') => string[]) | undefined
	const browserTimezones = typeof supportedValuesOf === 'function' ? supportedValuesOf('timeZone') : []
	const merged = new Set<string>(browserTimezones)
	if (current) {
		merged.add(current)
	}
	return [...merged].sort((left, right) => left.localeCompare(right))
}

function buildPreservedAccountForm(currentForm: AccountForm, account: Account | null): AccountForm {
	if (!account) {
		return {
			...currentForm,
			password: '',
			apiToken: '',
		}
	}

	return {
		...currentForm,
		authMode: account.authMode,
		baseUrl: account.baseUrl || currentForm.baseUrl,
		username: account.authMode === 'password' ? (account.user?.username || currentForm.username) : currentForm.username,
		password: '',
		apiToken: '',
	}
}

function persistOfflineAuthSnapshot(state: AppStore) {
	mergeOfflineSnapshot({
		serverConfig: state.serverConfig,
		account: state.account,
		defaultProjectId: state.defaultProjectId,
	})
}

function restoreOfflineSnapshotState(get: () => AppStore, set: Parameters<StateCreator<AppStore, [], [], AuthSlice>>[0]) {
	const snapshot = loadOfflineSnapshot()
	if (!snapshot?.account) {
		return false
	}

	set(state => ({
		error: null,
		serverConfig: snapshot.serverConfig || state.serverConfig,
		connected: true,
		offlineReadOnlyMode: true,
		account: snapshot.account,
		defaultProjectId: snapshot.defaultProjectId,
		accountLoading: false,
		accountSessionsLoading: false,
		accountSessionsLoaded: false,
		accountSessions: [],
		settingsNotice: 'Offline snapshot restored. Reconnect to sync live data and edits.',
		projects: snapshot.projects,
		savedFilters: snapshot.savedFilters,
		selectedProjectId: snapshot.selectedProjectId,
		selectedSavedFilterProjectId: snapshot.selectedSavedFilterProjectId,
		inboxProjectId: snapshot.inboxProjectId,
		tasks: snapshot.tasks,
		currentTasksProjectId: snapshot.currentTasksProjectId,
		currentProjectViewId: snapshot.currentProjectViewId,
		currentInboxViewId: snapshot.currentInboxViewId,
		currentSavedFilterViewId: snapshot.currentSavedFilterViewId,
		projectPreviewTasksById: snapshot.projectPreviewTasksById,
		todayTasks: snapshot.todayTasks,
		inboxTasks: snapshot.inboxTasks,
		upcomingTasks: snapshot.upcomingTasks,
		savedFilterTasks: snapshot.savedFilterTasks,
		projectFilterTasks: snapshot.projectFilterTasks,
		projectFilterTasksLoaded: snapshot.projectFilterTasksLoaded,
		projectViewsById: snapshot.projectViewsById,
		projectBucketsByViewId: snapshot.projectBucketsByViewId,
		notifications: snapshot.notifications,
		notificationsLoaded: true,
		loadingProjects: false,
		loadingTasks: false,
		loadingToday: false,
		loadingInbox: false,
		loadingUpcoming: false,
		loadingNotifications: false,
		accountForm: {
			...buildPreservedAccountForm(state.accountForm, snapshot.account),
			baseUrl:
				snapshot.account.baseUrl ||
				snapshot.serverConfig?.defaultBaseUrl ||
				state.serverConfig?.defaultBaseUrl ||
				state.accountForm.baseUrl,
		},
	}))

	return get().connected
}

function getOfflineFallbackState(state: AppStore) {
	const snapshot = loadOfflineSnapshot()
	if (!snapshot?.account) {
		return null
	}

	return {
		serverConfig: snapshot.serverConfig || state.serverConfig,
		connected: true,
		account: state.account || snapshot.account,
		defaultProjectId: state.defaultProjectId ?? snapshot.defaultProjectId,
		projects: state.projects.length > 0 ? state.projects : snapshot.projects,
		savedFilters: state.savedFilters.length > 0 ? state.savedFilters : snapshot.savedFilters,
		selectedProjectId: state.selectedProjectId ?? snapshot.selectedProjectId,
		selectedSavedFilterProjectId: state.selectedSavedFilterProjectId ?? snapshot.selectedSavedFilterProjectId,
		inboxProjectId: state.inboxProjectId ?? snapshot.inboxProjectId,
		tasks: state.tasks.length > 0 ? state.tasks : snapshot.tasks,
		currentTasksProjectId: state.currentTasksProjectId ?? snapshot.currentTasksProjectId,
		currentProjectViewId: state.currentProjectViewId ?? snapshot.currentProjectViewId,
		currentInboxViewId: state.currentInboxViewId ?? snapshot.currentInboxViewId,
		currentSavedFilterViewId: state.currentSavedFilterViewId ?? snapshot.currentSavedFilterViewId,
		projectPreviewTasksById:
			Object.keys(state.projectPreviewTasksById || {}).length > 0
				? state.projectPreviewTasksById
				: snapshot.projectPreviewTasksById,
		todayTasks: state.todayTasks.length > 0 ? state.todayTasks : snapshot.todayTasks,
		inboxTasks: state.inboxTasks.length > 0 ? state.inboxTasks : snapshot.inboxTasks,
		upcomingTasks: state.upcomingTasks.length > 0 ? state.upcomingTasks : snapshot.upcomingTasks,
		savedFilterTasks: state.savedFilterTasks.length > 0 ? state.savedFilterTasks : snapshot.savedFilterTasks,
		projectFilterTasks:
			state.projectFilterTasks.length > 0 ? state.projectFilterTasks : snapshot.projectFilterTasks,
		projectFilterTasksLoaded:
			state.projectFilterTasksLoaded || snapshot.projectFilterTasksLoaded,
		projectViewsById:
			Object.keys(state.projectViewsById || {}).length > 0
				? state.projectViewsById
				: snapshot.projectViewsById,
		projectBucketsByViewId:
			Object.keys(state.projectBucketsByViewId || {}).length > 0
				? state.projectBucketsByViewId
				: snapshot.projectBucketsByViewId,
		notifications: state.notifications.length > 0 ? state.notifications : snapshot.notifications,
		notificationsLoaded: state.notificationsLoaded || snapshot.notifications.length > 0,
		accountForm: {
			...buildPreservedAccountForm(state.accountForm, state.account || snapshot.account),
			baseUrl:
				(state.account || snapshot.account)?.baseUrl ||
				snapshot.serverConfig?.defaultBaseUrl ||
				state.serverConfig?.defaultBaseUrl ||
				state.accountForm.baseUrl,
		},
	}
}

export interface AuthSlice {
	initialized: boolean
	initializing: boolean
	serverConfig: ServerConfig | null
	connected: boolean
	offlineReadOnlyMode: boolean
	accountLoading: boolean
	account: Account | null
	defaultProjectId: number | null
	settingsSubmitting: boolean
	settingsNotice: string | null
	accountSessionsLoading: boolean
	accountSessionsLoaded: boolean
	accountSessions: Session[]
	passwordChangeSubmitting: boolean
	changePasswordForm: ChangePasswordForm
	timezoneOptionsLoading: boolean
	timezoneOptionsLoaded: boolean
	timezoneOptions: string[]
	timezoneSubmitting: boolean
	accountForm: AccountForm
	registrationForm: RegistrationForm
	registrationSubmitting: boolean
	registrationError: string | null
	forgotPasswordForm: ForgotPasswordForm
	forgotPasswordSubmitting: boolean
	forgotPasswordSent: boolean
	resetPasswordForm: ResetPasswordForm
	resetPasswordSubmitting: boolean
	resetPasswordDone: boolean
	resetPasswordError: string | null
	init: () => Promise<void>
	enterOfflineReadOnlyMode: () => void
	loadAccountStatus: () => Promise<void>
	resetConnectedData: (options?: {clearOfflineSnapshot?: boolean}) => void
	loadCurrentUser: () => Promise<void>
	disconnectAccount: () => Promise<boolean>
	logoutAccount: () => Promise<boolean>
	restoreLegacyFallback: () => Promise<boolean>
	loadAccountSessions: () => Promise<void>
	revokeAccountSession: (sessionId: string) => Promise<boolean>
	loadTimezoneOptions: () => Promise<void>
	updateTimezone: (timezone: string) => Promise<boolean>
	setChangePasswordField: <K extends keyof ChangePasswordForm>(field: K, value: ChangePasswordForm[K]) => void
	changePassword: () => Promise<boolean>
	login: () => Promise<boolean>
	refreshAppData: () => Promise<void>
	setAccountField: <K extends keyof AccountForm>(field: K, value: AccountForm[K]) => void
	setAccountAuthMode: (mode: AuthMode) => void
	setRegistrationField: <K extends keyof RegistrationForm>(field: K, value: RegistrationForm[K]) => void
	register: () => Promise<boolean>
	setForgotPasswordEmail: (email: string) => void
	requestPasswordReset: () => Promise<boolean>
	setResetPasswordField: <K extends keyof ResetPasswordForm>(field: K, value: ResetPasswordForm[K]) => void
	populateResetPasswordFromParams: (params: {token: string; baseUrl: string}) => void
	resetPassword: () => Promise<boolean>
}

export const createAuthSlice: StateCreator<AppStore, [], [], AuthSlice> = (set, get) => ({
	initialized: false,
	initializing: false,
	serverConfig: null,
	connected: false,
	offlineReadOnlyMode: false,
	accountLoading: false,
	account: null,
	defaultProjectId: null,
	settingsSubmitting: false,
	settingsNotice: null,
	accountSessionsLoading: false,
	accountSessionsLoaded: false,
	accountSessions: [],
	passwordChangeSubmitting: false,
	changePasswordForm: defaultChangePasswordForm,
	timezoneOptionsLoading: false,
	timezoneOptionsLoaded: false,
	timezoneOptions: [],
	timezoneSubmitting: false,
	accountForm: buildAccountForm(),
	registrationForm: buildRegistrationForm(),
	registrationSubmitting: false,
	registrationError: null,
	forgotPasswordForm: defaultForgotPasswordForm,
	forgotPasswordSubmitting: false,
	forgotPasswordSent: false,
	resetPasswordForm: defaultResetPasswordForm,
	resetPasswordSubmitting: false,
	resetPasswordDone: false,
	resetPasswordError: null,

	async init() {
		set({initializing: true, error: null})
		clearLegacyUiState()

		try {
			const config = await api<ServerConfig>('/api/config')
			set(state => ({
				serverConfig: config,
				offlineReadOnlyMode: false,
				accountForm: {
					...state.accountForm,
					baseUrl: state.accountForm.baseUrl || config.defaultBaseUrl || '',
				},
			}))
			persistAccountForm(get().accountForm)
			mergeOfflineSnapshot({serverConfig: config})

			await get().loadAccountStatus()
			if (get().connected) {
				if (get().offlineReadOnlyMode || !get().isOnline) {
					return
				}
				await get().loadCurrentUser()
				if (!get().connected) {
					return
				}
				if (!get().account?.linkShareAuth) {
					await get().loadProjects()
					void get().ensureProjectFilterTasksLoaded()
					void get().loadNotifications({silent: true})
				}
				if (get().account?.sessionsSupported && !get().account?.linkShareAuth) {
					void get().loadAccountSessions()
				}
			}
		} catch (error) {
			if (!get().isOnline && restoreOfflineSnapshotState(get, set)) {
				set({error: null})
			} else {
				set({error: formatError(error as Error)})
			}
		} finally {
			set({initialized: true, initializing: false})
		}
	},

	enterOfflineReadOnlyMode() {
		if (get().offlineReadOnlyMode) {
			return
		}

		set(state => ({
			...(getOfflineFallbackState(state) || {}),
			offlineReadOnlyMode: true,
			error: null,
			accountLoading: false,
			accountSessionsLoading: false,
			loadingProjects: false,
			loadingTasks: false,
			loadingToday: false,
			loadingInbox: false,
			loadingUpcoming: false,
			loadingNotifications: false,
			settingsNotice: 'Offline mode active. Cached data is available in read-only mode until the connection returns.',
		}))
	},

	async loadAccountStatus() {
		set({accountLoading: true, error: null})

		try {
			const payload = await api<SessionPayload>('/api/session')
			if (!payload.connected || !payload.account) {
				get().resetConnectedData({clearOfflineSnapshot: true})
				set(state => ({
					accountForm: {
						...state.accountForm,
						baseUrl: state.accountForm.baseUrl || state.serverConfig?.defaultBaseUrl || '',
					},
				}))
				persistAccountForm(get().accountForm)
				return
			}

			const account = payload.account

			set(state => ({
				connected: true,
				offlineReadOnlyMode: false,
				account,
				accountForm: buildPreservedAccountForm(state.accountForm, account),
				accountSessions: account.sessionsSupported ? state.accountSessions : [],
				accountSessionsLoaded: account.sessionsSupported ? state.accountSessionsLoaded : false,
			}))
			persistAccountForm(get().accountForm)
			persistOfflineAuthSnapshot(get())
		} catch (error) {
			if (!get().isOnline && restoreOfflineSnapshotState(get, set)) {
				set({error: null})
			} else {
				set({error: formatError(error as Error)})
				get().resetConnectedData()
			}
		} finally {
			set({accountLoading: false})
		}
	},

	resetConnectedData({clearOfflineSnapshot: shouldClearOfflineSnapshot = false} = {}) {
		saveNumber(storageKeys.selectedProjectId, null)
		if (shouldClearOfflineSnapshot) {
			clearOfflineSnapshot()
		}
		get().clearPendingMutation()
		get().resetUsersState()
		get().resetTeamsState()
		get().resetProjectSharingState()
		get().resetSubscriptionsState()
		set(state => ({
			connected: false,
			offlineReadOnlyMode: false,
			account: null,
			defaultProjectId: null,
				accountSessionsLoading: false,
				accountSessionsLoaded: false,
				accountSessions: [],
				passwordChangeSubmitting: false,
				changePasswordForm: defaultChangePasswordForm,
				timezoneOptionsLoading: false,
				timezoneOptionsLoaded: false,
				timezoneOptions: [],
				timezoneSubmitting: false,
				openMenu: null,
			labels: [],
			labelsLoaded: false,
			loadingLabels: false,
			labelSubmitting: false,
			labelDetailOpen: false,
			labelDetail: null,
			projects: [],
			savedFilters: [],
			loadingProjects: false,
			selectedProjectId: null,
			inboxProjectId: null,
			composerProjectId: null,
			selectedSavedFilterProjectId: null,
			projectDetailOpen: false,
			projectDetailLoading: false,
			projectDetail: null,
			projectComposerOpen: false,
			projectComposerParentId: null,
			projectComposerPlacement: 'sheet',
			projectSubmitting: false,
			projectPreviewTasksById: {},
			expandedProjectIds: new Set(),
			loadingProjectPreviewIds: new Set(),
			projectViewsById: {},
			preferredProjectViewKind: loadPersistedPreferredProjectViewKind(),
			currentProjectViewId: null,
			currentInboxViewId: null,
			currentSavedFilterViewId: null,
			subscriptionsByEntity: {},
			subscriptionMutatingKeys: new Set(),
			tasks: [],
			todayTasks: [],
			inboxTasks: [],
			upcomingTasks: [],
			searchTasks: [],
			savedFilterTasks: [],
			projectFilterTasks: [],
			taskDetailOpen: false,
			taskDetailLoading: false,
			taskDetail: null,
			focusedTaskId: null,
			focusedTaskProjectId: null,
			focusedTaskSourceScreen: null,
			rootComposerOpen: false,
			rootComposerPlacement: 'sheet',
			composerDueDate: null,
			rootSubmitting: false,
			composerParentTaskId: null,
			activeSubtaskParentId: null,
			activeSubtaskSource: null,
			subtaskSubmittingParentId: null,
			loadingTasks: false,
			loadingToday: false,
			loadingInbox: false,
			loadingUpcoming: false,
			loadingSearch: false,
			loadingSavedFilterTasks: false,
			loadingProjectFilterTasks: false,
			projectFilterTasksLoaded: false,
			notifications: [],
			notificationsLoaded: false,
			loadingNotifications: false,
			markingNotificationIds: new Set(),
			searchQuery: '',
			searchHasRun: false,
			taskFilters: defaultTaskFilters,
			taskFilterDraft: defaultTaskFilters,
			projectFilters: defaultProjectFilters,
			projectFilterDraft: defaultProjectFilters,
			expandedTaskIds: new Set(),
			togglingTaskIds: new Set(),
			recentlyCompletedTaskIds: new Set(),
			movingTaskIds: new Set(),
			bulkTaskEditorScope: null,
			bulkTaskAction: 'complete',
			bulkTaskTargetProjectId: null,
			bulkTaskPriority: 0,
			bulkTaskSubmitting: false,
			bulkSelectedTaskIds: new Set(),
			pendingUndoMutation: null,
			accountForm: {
				...state.accountForm,
				password: '',
				apiToken: '',
			},
			registrationForm: buildRegistrationForm(state.accountForm.baseUrl || state.serverConfig?.defaultBaseUrl || ''),
			registrationSubmitting: false,
			registrationError: null,
			forgotPasswordForm: defaultForgotPasswordForm,
			forgotPasswordSubmitting: false,
			forgotPasswordSent: false,
			resetPasswordForm: defaultResetPasswordForm,
			resetPasswordSubmitting: false,
			resetPasswordDone: false,
			resetPasswordError: null,
		}))
		persistAccountForm(get().accountForm)
	},

	async loadCurrentUser() {
		if (!get().connected) {
			return
		}

		try {
			const user = await api<UserProfile>('/api/user')
			set(state => ({
				defaultProjectId: user.settings?.default_project_id || null,
				account: state.account
					? {
						...state.account,
						user: {
							id: user.id,
							name: user.name || '',
							username: user.username || '',
							email: user.email || state.account?.user?.email || '',
							settings: user.settings || {},
						},
					}
					: null,
			}))
			persistOfflineAuthSnapshot(get())
		} catch (error) {
			const authError = error as Error & {statusCode?: number}
			if (authError.statusCode === 401) {
				get().resetConnectedData({clearOfflineSnapshot: true})
				set({error: 'Your Vikunja session expired. Sign in again.'})
				return
			}

			set({error: formatError(authError)})
		}
	},

	async disconnectAccount() {
		const account = get().account
		if (!account || !window.confirm('Disconnect this account and return to the sign-in screen?')) {
			return false
		}

		set(state => ({
			accountForm: buildPreservedAccountForm(state.accountForm, account),
		}))
		persistAccountForm(get().accountForm)

		try {
			await api<{ok: boolean}>('/api/session/disconnect', {
				method: 'POST',
			})
			get().resetConnectedData({clearOfflineSnapshot: true})
			set({error: null, settingsNotice: 'Disconnected. Reconnect when ready.'})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async logoutAccount() {
		const account = get().account
		if (!account || !window.confirm('Log out of this Vikunja session?')) {
			return false
		}

		set(state => ({
			accountForm: buildPreservedAccountForm(state.accountForm, account),
		}))
		persistAccountForm(get().accountForm)

		try {
			await api<{ok: boolean}>('/api/session/logout', {
				method: 'POST',
			})
			get().resetConnectedData({clearOfflineSnapshot: true})
			set({error: null, settingsNotice: 'Logged out. Sign in again when ready.'})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async restoreLegacyFallback() {
		try {
			await api<{ok: boolean}>('/api/session/legacy/restore', {
				method: 'POST',
			})
			await get().refreshAppData()
			return get().connected
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async loadAccountSessions() {
		const account = get().account
		if (!get().connected || !account?.sessionsSupported) {
			set({
				accountSessions: [],
				accountSessionsLoading: false,
				accountSessionsLoaded: false,
			})
			return
		}

		set({accountSessionsLoading: true, error: null})

		try {
			const payload = await api<{sessions?: Session[]}>('/api/session/sessions')
			set({
				accountSessions: payload.sessions || [],
				accountSessionsLoaded: true,
			})
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({accountSessionsLoading: false})
		}
	},

	async revokeAccountSession(sessionId) {
		if (!sessionId) {
			return false
		}

		if (!window.confirm('Revoke this Vikunja session?')) {
			return false
		}

		try {
			await api<{ok: boolean}>(`/api/session/sessions/${encodeURIComponent(sessionId)}`, {
				method: 'DELETE',
			})
			await get().loadAccountSessions()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async loadTimezoneOptions() {
		if (!get().connected) {
			set({
				timezoneOptionsLoading: false,
				timezoneOptionsLoaded: false,
				timezoneOptions: [],
			})
			return
		}

		if (get().timezoneOptionsLoading) {
			return
		}

		set({timezoneOptionsLoading: true, error: null})

		try {
			const payload = await api<{timezones?: string[]}>('/api/session/timezones')
			const timezones = Array.isArray(payload.timezones) ? [...payload.timezones].sort((left, right) => left.localeCompare(right)) : []
			set({
				timezoneOptions: timezones.length > 0 ? timezones : getFallbackTimezones(get().account?.user?.settings?.timezone),
				timezoneOptionsLoaded: true,
			})
		} catch (error) {
			set({
				timezoneOptions: getFallbackTimezones(get().account?.user?.settings?.timezone),
				timezoneOptionsLoaded: true,
			})
		} finally {
			set({timezoneOptionsLoading: false})
		}
	},

	async updateTimezone(timezone) {
		const account = get().account
		const user = account?.user
		const nextTimezone = `${timezone || ''}`.trim()
		if (!get().connected || !user || !nextTimezone || get().timezoneSubmitting) {
			return false
		}

		set({timezoneSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<{ok: boolean; user?: UserProfile}>('/api/session/settings/general', {
				method: 'POST',
				body: {
					...(user.settings || {}),
					timezone: nextTimezone,
				},
			})
			await get().loadCurrentUser()
			set({settingsNotice: 'Timezone updated.'})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({timezoneSubmitting: false})
		}
	},

	setChangePasswordField(field, value) {
		set(state => ({
			changePasswordForm: {
				...state.changePasswordForm,
				[field]: value,
			},
		}))
	},

	async changePassword() {
		if (get().passwordChangeSubmitting) {
			return false
		}

		const account = get().account
		const {oldPassword, newPassword, confirmPassword} = get().changePasswordForm
		if (account?.authMode !== 'password') {
			set({error: 'Password changes require a session-based Vikunja login.'})
			return false
		}
		if (!oldPassword || !newPassword || !confirmPassword) {
			set({error: 'All password fields are required.'})
			return false
		}
		if (newPassword !== confirmPassword) {
			set({error: 'The new passwords do not match.'})
			return false
		}
		if (newPassword.length < 8) {
			set({error: 'The new password must be at least 8 characters long.'})
			return false
		}

		set({passwordChangeSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<{ok: boolean; reauthRequired?: boolean; message?: string}>('/api/session/password', {
				method: 'POST',
				body: {
					oldPassword,
					newPassword,
				},
			})
			get().resetConnectedData({clearOfflineSnapshot: true})
			set({
				changePasswordForm: defaultChangePasswordForm,
				settingsNotice: 'Password updated. Sign in again with the new password.',
			})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({passwordChangeSubmitting: false})
		}
	},

	async login() {
		if (get().settingsSubmitting) {
			return false
		}
		if (!get().isOnline) {
			set({
				error: 'You’re offline. Sign-in requires a live connection.',
				settingsNotice: null,
			})
			return false
		}

		set({settingsSubmitting: true, error: null, settingsNotice: null})

		try {
			const {accountForm} = get()
			const payload: Record<string, string> = {
				authMode: accountForm.authMode,
				baseUrl: accountForm.baseUrl.trim(),
			}

			if (accountForm.authMode === 'password') {
				payload.username = accountForm.username.trim()
				payload.password = accountForm.password
			} else {
				payload.apiToken = accountForm.apiToken.trim()
			}

			await api<SessionPayload, Record<string, string>>('/api/session/login', {
				method: 'POST',
				body: payload,
			})

			set(state => ({
				accountForm: {
					...state.accountForm,
					password: '',
					apiToken: '',
				},
			}))
			persistAccountForm(get().accountForm)

			await get().loadAccountStatus()
			if (!get().connected) {
				return false
			}

			await get().loadCurrentUser()
			if (!get().account?.linkShareAuth) {
				await get().loadProjects()
				void get().ensureProjectFilterTasksLoaded()
				void get().loadNotifications({silent: true})
			}
			if (get().account?.sessionsSupported && !get().account?.linkShareAuth) {
				void get().loadAccountSessions()
			}
			set({offlineReadOnlyMode: false})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({settingsSubmitting: false})
		}
	},

	async refreshAppData() {
		await get().init()
		if (get().connected && !get().account?.linkShareAuth) {
			await get().loadProjects()
			await Promise.allSettled([
				get().ensureProjectFilterTasksLoaded({force: true}),
				get().loadNotifications({silent: true}),
				get().refreshCurrentCollections(),
				get().refreshExpandedProjectPreviews(),
			])
			persistOfflineBrowseSnapshot(get())
		}
		if (get().screen === 'labels' || get().labelsLoaded || get().labelDetailOpen) {
			await get().loadLabels()
		}
	},

	setAccountField(field, value) {
		set(state => {
			const accountForm = {
				...state.accountForm,
				[field]: value,
			}
			persistAccountForm(accountForm)
			return {accountForm}
		})
	},

	setAccountAuthMode(mode) {
		set(state => {
			const accountForm = {
				...state.accountForm,
				authMode: mode,
			}
			persistAccountForm(accountForm)
			return {accountForm}
		})
	},

	setRegistrationField(field, value) {
		set(state => ({
			registrationForm: {
				...state.registrationForm,
				[field]: value,
			},
			registrationError: null,
		}))
	},

	async register() {
		if (get().registrationSubmitting) {
			return false
		}

		const {baseUrl, username, email, password, confirmPassword} = get().registrationForm
		if (!baseUrl || !username || !email || !password || !confirmPassword) {
			set({registrationError: 'All fields are required.'})
			return false
		}
		if (password !== confirmPassword) {
			set({registrationError: 'Passwords do not match.'})
			return false
		}
		if (!get().isOnline) {
			set({registrationError: 'Registration requires a live connection.'})
			return false
		}

		set({registrationSubmitting: true, registrationError: null})

		try {
			await api<{connected: boolean}, {baseUrl: string; username: string; email: string; password: string}>('/api/session/register', {
				method: 'POST',
				body: {
					baseUrl: baseUrl.trim(),
					username: username.trim(),
					email: email.trim(),
					password,
				},
			})

			set({
				registrationForm: buildRegistrationForm(baseUrl.trim()),
				forgotPasswordForm: defaultForgotPasswordForm,
				forgotPasswordSent: false,
			})

			await get().loadAccountStatus()
			if (!get().connected) {
				return false
			}

			await get().loadCurrentUser()
			if (!get().account?.linkShareAuth) {
				await get().loadProjects()
				void get().ensureProjectFilterTasksLoaded()
				void get().loadNotifications({silent: true})
			}
			if (get().account?.sessionsSupported && !get().account?.linkShareAuth) {
				void get().loadAccountSessions()
			}
			set({offlineReadOnlyMode: false})
			return true
		} catch (error) {
			set({registrationError: formatError(error as Error)})
			return false
		} finally {
			set({registrationSubmitting: false})
		}
	},

	setForgotPasswordEmail(email) {
		set(state => ({
			forgotPasswordForm: {
				...state.forgotPasswordForm,
				email,
			},
			forgotPasswordSent: false,
			error: null,
		}))
	},

	async requestPasswordReset() {
		if (get().forgotPasswordSubmitting) {
			return false
		}

		const email = get().forgotPasswordForm.email.trim()
		const baseUrl = get().accountForm.baseUrl.trim()
		if (!email) {
			set({error: 'Email is required.'})
			return false
		}
		if (!get().isOnline) {
			set({error: 'Password reset requests require a live connection.'})
			return false
		}

		set({forgotPasswordSubmitting: true, forgotPasswordSent: false, error: null})

		try {
			await api<{ok: boolean}, {baseUrl: string; email: string}>('/api/session/forgot-password', {
				method: 'POST',
				body: {
					baseUrl,
					email,
				},
			})
			set({forgotPasswordSent: true})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({forgotPasswordSubmitting: false})
		}
	},

	setResetPasswordField(field, value) {
		set(state => ({
			resetPasswordForm: {
				...state.resetPasswordForm,
				[field]: value,
			},
			resetPasswordDone: false,
			resetPasswordError: null,
		}))
	},

	populateResetPasswordFromParams({token, baseUrl}) {
		set({
			resetPasswordForm: {
				baseUrl,
				token,
				password: '',
				confirmPassword: '',
			},
			resetPasswordDone: false,
			resetPasswordError: null,
		})
	},

	async resetPassword() {
		if (get().resetPasswordSubmitting) {
			return false
		}

		const {baseUrl, token, password, confirmPassword} = get().resetPasswordForm
		if (!token || !baseUrl || !password || !confirmPassword) {
			set({resetPasswordError: 'Token, base URL, and password are required.'})
			return false
		}
		if (password !== confirmPassword) {
			set({resetPasswordError: 'Passwords do not match.'})
			return false
		}
		if (!get().isOnline) {
			set({resetPasswordError: 'Password reset requires a live connection.'})
			return false
		}

		set({resetPasswordSubmitting: true, resetPasswordError: null})

		try {
			await api<{ok: boolean}, {baseUrl: string; token: string; password: string}>('/api/session/reset-password', {
				method: 'POST',
				body: {
					baseUrl: baseUrl.trim(),
					token: token.trim(),
					password,
				},
			})
			set(state => ({
				resetPasswordDone: true,
				accountForm: {
					...state.accountForm,
					baseUrl: state.accountForm.baseUrl || baseUrl.trim(),
					password: '',
				},
			}))
			persistAccountForm(get().accountForm)
			return true
		} catch (error) {
			set({resetPasswordError: formatError(error as Error)})
			return false
		} finally {
			set({resetPasswordSubmitting: false})
		}
	},
})

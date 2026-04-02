import {api} from '@/api'
import type {ApiRouteGroups, ApiToken, CalDavToken, TotpSettings} from '@/types'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {blockOfflineReadOnlyAction} from '../offline-readonly'

export interface SecuritySlice {
	totpSettings: TotpSettings | null
	totpSettingsLoading: boolean
	totpSettingsSubmitting: boolean
	totpQrCodeUrl: string | null
	totpEnrolling: boolean
	caldavTokens: CalDavToken[]
	caldavTokensLoading: boolean
	caldavTokensLoaded: boolean
	caldavTokenSubmitting: boolean
	newCaldavToken: string | null
	apiTokens: ApiToken[]
	apiTokensLoading: boolean
	apiTokensLoaded: boolean
	apiTokenSubmitting: boolean
	newApiToken: string | null
	availableRoutes: ApiRouteGroups
	availableRoutesLoaded: boolean

	loadTotpStatus: () => Promise<void>
	enrollTotp: () => Promise<boolean>
	loadTotpQrCode: () => Promise<void>
	enableTotp: (passcode: string) => Promise<boolean>
	disableTotp: (password: string) => Promise<boolean>

	loadCaldavTokens: () => Promise<void>
	createCaldavToken: () => Promise<boolean>
	clearNewCaldavToken: () => void
	deleteCaldavToken: (id: number) => Promise<boolean>

	loadApiTokens: () => Promise<void>
	loadAvailableRoutes: () => Promise<void>
	createApiToken: (title: string, permissions: Record<string, string[]>, expiresAt: string | null) => Promise<boolean>
	clearNewApiToken: () => void
	deleteApiToken: (id: number) => Promise<boolean>
	resetSecurityState: () => void
}

export const createSecuritySlice: StateCreator<AppStore, [], [], SecuritySlice> = (set, get) => ({
	totpSettings: null,
	totpSettingsLoading: false,
	totpSettingsSubmitting: false,
	totpQrCodeUrl: null,
	totpEnrolling: false,
	caldavTokens: [],
	caldavTokensLoading: false,
	caldavTokensLoaded: false,
	caldavTokenSubmitting: false,
	newCaldavToken: null,
	apiTokens: [],
	apiTokensLoading: false,
	apiTokensLoaded: false,
	apiTokenSubmitting: false,
	newApiToken: null,
	availableRoutes: {},
	availableRoutesLoaded: false,

	async loadTotpStatus() {
		if (!get().connected) {
			return
		}

		set({totpSettingsLoading: true})
		try {
			const totp = await api<TotpSettings>('/api/session/totp')
			const normalizedTotp = normalizeTotpSettings(totp)
			const pendingEnrollment = isTotpEnrollmentPending(normalizedTotp)
			if (!pendingEnrollment) {
				revokeObjectUrl(get().totpQrCodeUrl)
			}
			set({
				totpSettings: normalizedTotp,
				totpEnrolling: pendingEnrollment,
				totpQrCodeUrl: pendingEnrollment ? get().totpQrCodeUrl : null,
			})
			if (pendingEnrollment) {
				await get().loadTotpQrCode()
			}
		} catch {
			revokeObjectUrl(get().totpQrCodeUrl)
			set({totpSettings: null, totpEnrolling: false, totpQrCodeUrl: null})
		} finally {
			set({totpSettingsLoading: false})
		}
	},

	async enrollTotp() {
		if (blockOfflineReadOnlyAction(get, set, 'manage 2FA')) {
			return false
		}

		set({totpSettingsSubmitting: true, error: null})
		try {
			const totp = await api<TotpSettings>('/api/session/totp/enroll', {
				method: 'POST',
			})
			set({
				totpSettings: normalizeTotpSettings(totp),
				totpEnrolling: true,
			})
			await get().loadTotpQrCode()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({totpSettingsSubmitting: false})
		}
	},

	async loadTotpQrCode() {
		revokeObjectUrl(get().totpQrCodeUrl)
		try {
			const response = await fetch('/api/session/totp/qrcode', {
				credentials: 'same-origin',
			})
			if (!response.ok) {
				set({totpQrCodeUrl: null})
				return
			}

			const blob = await response.blob()
			set({totpQrCodeUrl: URL.createObjectURL(blob)})
		} catch {
			set({totpQrCodeUrl: null})
		}
	},

	async enableTotp(passcode) {
		if (blockOfflineReadOnlyAction(get, set, 'manage 2FA')) {
			return false
		}

		const nextPasscode = `${passcode || ''}`.trim()
		if (!nextPasscode) {
			set({error: 'Passcode is required.'})
			return false
		}

		set({totpSettingsSubmitting: true, error: null})
		try {
			await api('/api/session/totp/enable', {
				method: 'POST',
				body: {passcode: nextPasscode},
			})
			revokeObjectUrl(get().totpQrCodeUrl)
			set({
				totpQrCodeUrl: null,
				totpEnrolling: false,
			})
			await get().loadTotpStatus()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({totpSettingsSubmitting: false})
		}
	},

	async disableTotp(password) {
		if (blockOfflineReadOnlyAction(get, set, 'manage 2FA')) {
			return false
		}

		const nextPassword = `${password || ''}`
		if (!nextPassword) {
			set({error: 'Password is required.'})
			return false
		}

		set({totpSettingsSubmitting: true, error: null})
		try {
			await api('/api/session/totp/disable', {
				method: 'POST',
				body: {password: nextPassword},
			})
			revokeObjectUrl(get().totpQrCodeUrl)
			set({
				totpSettings: {enabled: false, secret: null, totpUrl: null},
				totpQrCodeUrl: null,
				totpEnrolling: false,
			})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({totpSettingsSubmitting: false})
		}
	},

	async loadCaldavTokens() {
		if (!get().connected) {
			set({
				caldavTokens: [],
				caldavTokensLoading: false,
				caldavTokensLoaded: false,
			})
			return
		}

		set({caldavTokensLoading: true, error: null})
		try {
			const result = await api<{tokens?: CalDavToken[]}>('/api/session/caldav-tokens')
			set({
				caldavTokens: Array.isArray(result.tokens) ? result.tokens : [],
				caldavTokensLoaded: true,
			})
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({caldavTokensLoading: false})
		}
	},

	async createCaldavToken() {
		if (blockOfflineReadOnlyAction(get, set, 'manage CalDAV tokens')) {
			return false
		}

		set({caldavTokenSubmitting: true, error: null})
		try {
			const token = await api<{token?: string}>('/api/session/caldav-tokens', {
				method: 'PUT',
			})
			set({newCaldavToken: `${token.token || ''}`.trim() || null})
			await get().loadCaldavTokens()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({caldavTokenSubmitting: false})
		}
	},

	clearNewCaldavToken() {
		set({newCaldavToken: null})
	},

	async deleteCaldavToken(id) {
		if (blockOfflineReadOnlyAction(get, set, 'manage CalDAV tokens')) {
			return false
		}
		if (!id) {
			return false
		}

		set({caldavTokenSubmitting: true, error: null})
		try {
			await api(`/api/session/caldav-tokens/${id}`, {
				method: 'DELETE',
			})
			await get().loadCaldavTokens()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({caldavTokenSubmitting: false})
		}
	},

	async loadApiTokens() {
		if (!get().connected) {
			set({
				apiTokens: [],
				apiTokensLoading: false,
				apiTokensLoaded: false,
			})
			return
		}

		set({apiTokensLoading: true, error: null})
		try {
			const result = await api<{tokens?: ApiToken[]}>('/api/tokens')
			set({
				apiTokens: Array.isArray(result.tokens) ? result.tokens : [],
				apiTokensLoaded: true,
			})
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({apiTokensLoading: false})
		}
	},

	async loadAvailableRoutes() {
		if (!get().connected) {
			set({
				availableRoutes: [],
				availableRoutesLoaded: false,
			})
			return
		}

		set({error: null})
		try {
			const result = await api<{routes?: ApiRouteGroups}>('/api/routes')
			set({
				availableRoutes: normalizeApiRouteGroups(result.routes),
				availableRoutesLoaded: true,
			})
		} catch (error) {
			set({error: formatError(error as Error)})
		}
	},

	async createApiToken(title, permissions, expiresAt) {
		if (blockOfflineReadOnlyAction(get, set, 'manage API tokens')) {
			return false
		}

		const nextTitle = `${title || ''}`.trim()
		if (!nextTitle) {
			set({error: 'Title is required.'})
			return false
		}

		const nextPermissions = Object.fromEntries(
			Object.entries(permissions)
				.map(([resource, values]) => [resource, values.filter(Boolean)])
				.filter(([, values]) => values.length > 0),
		)
		if (Object.keys(nextPermissions).length === 0) {
			set({error: 'Select at least one API permission.'})
			return false
		}

		const tokenPayload = {
			title: nextTitle,
			permissions: nextPermissions,
		}
		if (expiresAt) {
			tokenPayload.expires_at = expiresAt
		}

		set({apiTokenSubmitting: true, error: null})
		try {
			const token = await api<ApiToken>('/api/tokens', {
				method: 'PUT',
				body: tokenPayload,
			})
			set({newApiToken: `${token.token || ''}`.trim() || null})
			await get().loadApiTokens()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({apiTokenSubmitting: false})
		}
	},

	clearNewApiToken() {
		set({newApiToken: null})
	},

	async deleteApiToken(id) {
		if (blockOfflineReadOnlyAction(get, set, 'manage API tokens')) {
			return false
		}
		if (!id) {
			return false
		}

		set({apiTokenSubmitting: true, error: null})
		try {
			await api(`/api/tokens/${id}`, {
				method: 'DELETE',
			})
			await get().loadApiTokens()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({apiTokenSubmitting: false})
		}
	},

	resetSecurityState() {
		revokeObjectUrl(get().totpQrCodeUrl)
		set({
			totpSettings: null,
			totpSettingsLoading: false,
			totpSettingsSubmitting: false,
			totpQrCodeUrl: null,
			totpEnrolling: false,
			caldavTokens: [],
			caldavTokensLoading: false,
			caldavTokensLoaded: false,
			caldavTokenSubmitting: false,
			newCaldavToken: null,
			apiTokens: [],
			apiTokensLoading: false,
			apiTokensLoaded: false,
			apiTokenSubmitting: false,
			newApiToken: null,
			availableRoutes: {},
			availableRoutesLoaded: false,
		})
	},
})

function revokeObjectUrl(value: string | null) {
	if (value) {
		URL.revokeObjectURL(value)
	}
}

function isTotpEnrollmentPending(value: TotpSettings | null) {
	return Boolean(value && !value.enabled && (value.secret || value.totpUrl))
}

function normalizeTotpSettings(value: TotpSettings | Record<string, unknown>) {
	return {
		enabled: Boolean(value?.enabled),
		secret: typeof value?.secret === 'string' ? value.secret : null,
		totpUrl:
			typeof value?.totpUrl === 'string'
				? value.totpUrl
				: typeof (value as {url?: unknown}).url === 'string'
					? (value as {url: string}).url
				: typeof (value as {totp_url?: unknown}).totp_url === 'string'
					? (value as {totp_url: string}).totp_url
					: null,
	} satisfies TotpSettings
}

function normalizeApiRouteGroups(routes: ApiRouteGroups | undefined) {
	if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
		return {}
	}

	return Object.fromEntries(
		Object.entries(routes)
			.filter(([, permissions]) => permissions && typeof permissions === 'object' && !Array.isArray(permissions))
			.map(([group, permissions]) => [
				group,
				Object.fromEntries(
					Object.entries(permissions)
						.filter(([, detail]) => detail && typeof detail === 'object')
						.map(([permission, detail]) => [
							permission,
							{
								path: typeof detail.path === 'string' ? detail.path : '',
								method: typeof detail.method === 'string' ? detail.method : '',
							},
						])
						.filter(([, detail]) => detail.path && detail.method),
				),
			]),
	)
}

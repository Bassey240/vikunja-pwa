import {api, uploadApi, type ApiError} from '@/api'
import type {MigrationService, MigrationStatus, MigrationStatusValue} from '@/types'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {blockOfflineReadOnlyAction} from '../offline-readonly'

export interface MigrationSlice {
	migrationStatus: Partial<Record<MigrationService, MigrationStatusValue>>
	migrationMessages: Partial<Record<MigrationService, string | null>>
	migrationLoadingServices: Set<MigrationService>
	migrationSubmittingServices: Set<MigrationService>

	loadMigrationStatus: (service: MigrationService) => Promise<void>
	getMigrationAuthUrl: (service: MigrationService) => Promise<string | null>
	completeOAuthMigration: (service: MigrationService, code: string) => Promise<boolean>
	uploadFileMigration: (service: MigrationService, file: File) => Promise<boolean>
	resetMigrationState: () => void
}

const FILE_MIGRATION_SERVICES = new Set<MigrationService>(['ticktick', 'vikunja-file'])

export const createMigrationSlice: StateCreator<AppStore, [], [], MigrationSlice> = (set, get) => ({
	migrationStatus: {},
	migrationMessages: {},
	migrationLoadingServices: new Set(),
	migrationSubmittingServices: new Set(),

	async loadMigrationStatus(service) {
		if (!get().connected) {
			return
		}
		if (get().migrationLoadingServices.has(service)) {
			return
		}

		set(state => ({
			migrationLoadingServices: new Set(state.migrationLoadingServices).add(service),
			error: null,
		}))
		try {
			const result = await api<MigrationStatus>(`/api/migration/${service}/status`)
			const normalized = normalizeMigrationStatus(service, result)
			set(state => {
				const loading = new Set(state.migrationLoadingServices)
				loading.delete(service)
				return {
					migrationLoadingServices: loading,
					migrationStatus: {
						...state.migrationStatus,
						[service]: normalized.status,
					},
					migrationMessages: {
						...state.migrationMessages,
						[service]: normalized.message || null,
					},
				}
			})
		} catch (error) {
			const apiError = error as ApiError
			const message = getMigrationErrorMessage(apiError)
			set(state => {
				const loading = new Set(state.migrationLoadingServices)
				loading.delete(service)
				return {
					migrationLoadingServices: loading,
					migrationStatus: {
						...state.migrationStatus,
						[service]: 'error',
					},
					migrationMessages: {
						...state.migrationMessages,
						[service]: message,
					},
					error: message,
				}
			})
		}
	},

	async getMigrationAuthUrl(service) {
		if (blockOfflineReadOnlyAction(get, set, 'start an import')) {
			return null
		}
		if (FILE_MIGRATION_SERVICES.has(service)) {
			return null
		}

		set(state => ({
			migrationSubmittingServices: new Set(state.migrationSubmittingServices).add(service),
			error: null,
		}))
		try {
			const result = await api<{authUrl?: string}>(`/api/migration/${service}/auth`)
			return `${result.authUrl || ''}`.trim() || null
		} catch (error) {
			const message = getMigrationErrorMessage(error as ApiError)
			set(state => ({
				migrationStatus: {
					...state.migrationStatus,
					[service]: 'error',
				},
				migrationMessages: {
					...state.migrationMessages,
					[service]: message,
				},
				error: message,
			}))
			return null
		} finally {
			set(state => {
				const submitting = new Set(state.migrationSubmittingServices)
				submitting.delete(service)
				return {
					migrationSubmittingServices: submitting,
				}
			})
		}
	},

	async completeOAuthMigration(service, code) {
		if (blockOfflineReadOnlyAction(get, set, 'start an import')) {
			return false
		}
		if (!code.trim()) {
			set({error: 'Migration code is required.'})
			return false
		}

		set(state => ({
			migrationSubmittingServices: new Set(state.migrationSubmittingServices).add(service),
			migrationStatus: {
				...state.migrationStatus,
				[service]: 'running',
			},
			migrationMessages: {
				...state.migrationMessages,
				[service]: 'Import started. Vikunja will finish it in the background.',
			},
			error: null,
		}))
		try {
			const result = await api<MigrationStatus, {code: string}>(`/api/migration/${service}/migrate`, {
				method: 'POST',
				body: {code: code.trim()},
			})
			const normalized = normalizeMigrationStatus(service, result)
			set(state => ({
				migrationStatus: {
					...state.migrationStatus,
					[service]: normalized.status,
				},
				migrationMessages: {
					...state.migrationMessages,
					[service]: normalized.message || 'Import started.',
				},
			}))
			void get().loadMigrationStatus(service)
			return true
		} catch (error) {
			const message = getMigrationErrorMessage(error as ApiError)
			set(state => ({
				migrationStatus: {
					...state.migrationStatus,
					[service]: 'error',
				},
				migrationMessages: {
					...state.migrationMessages,
					[service]: message,
				},
				error: message,
			}))
			return false
		} finally {
			set(state => {
				const submitting = new Set(state.migrationSubmittingServices)
				submitting.delete(service)
				return {
					migrationSubmittingServices: submitting,
				}
			})
		}
	},

	async uploadFileMigration(service, file) {
		if (blockOfflineReadOnlyAction(get, set, 'upload an import file')) {
			return false
		}
		if (!FILE_MIGRATION_SERVICES.has(service)) {
			set({error: 'This import service uses browser sign-in instead of a file upload.'})
			return false
		}
		if (!(file instanceof File)) {
			set({error: 'Select a file to import.'})
			return false
		}

		set(state => ({
			migrationSubmittingServices: new Set(state.migrationSubmittingServices).add(service),
			migrationStatus: {
				...state.migrationStatus,
				[service]: 'running',
			},
			migrationMessages: {
				...state.migrationMessages,
				[service]: 'Uploading import file…',
			},
			error: null,
		}))
		try {
			const formData = new FormData()
			formData.append('file', file)
			const result = await uploadApi<MigrationStatus>(`/api/migration/${service}/migrate`, formData, {
				method: 'POST',
			})
			const normalized = normalizeMigrationStatus(service, result)
			set(state => ({
				migrationStatus: {
					...state.migrationStatus,
					[service]: normalized.status,
				},
				migrationMessages: {
					...state.migrationMessages,
					[service]: normalized.message || 'Import uploaded.',
				},
			}))
			void get().loadMigrationStatus(service)
			return true
		} catch (error) {
			const message = getMigrationErrorMessage(error as ApiError)
			set(state => ({
				migrationStatus: {
					...state.migrationStatus,
					[service]: 'error',
				},
				migrationMessages: {
					...state.migrationMessages,
					[service]: message,
				},
				error: message,
			}))
			return false
		} finally {
			set(state => {
				const submitting = new Set(state.migrationSubmittingServices)
				submitting.delete(service)
				return {
					migrationSubmittingServices: submitting,
				}
			})
		}
	},

	resetMigrationState() {
		set({
			migrationStatus: {},
			migrationMessages: {},
			migrationLoadingServices: new Set(),
			migrationSubmittingServices: new Set(),
		})
	},
})

function normalizeMigrationStatus(service: MigrationService, value: unknown): MigrationStatus {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {
			service,
			status: 'idle',
			message: null,
		}
	}

	const record = value as Record<string, unknown>
	const rawStatus = `${record.status || ''}`.trim().toLowerCase()
	const message =
		typeof record.message === 'string'
			? `${record.message}`.trim() || null
			: typeof record.error === 'string'
				? `${record.error}`.trim() || null
				: null

	if (rawStatus === 'running' || rawStatus === 'done' || rawStatus === 'error' || rawStatus === 'idle') {
		return {service, status: rawStatus, message}
	}
	if (record.done === true || record.migrated === true || rawStatus === 'success') {
		return {service, status: 'done', message}
	}
	if (record.running === true || rawStatus === 'pending') {
		return {service, status: 'running', message}
	}

	return {
		service,
		status: 'idle',
		message,
	}
}

function getMigrationErrorMessage(error: ApiError) {
	return formatError(error)
}

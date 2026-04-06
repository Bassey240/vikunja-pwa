import {api} from '@/api'
import type {Webhook, WebhookEventOption} from '@/types'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {blockOfflineReadOnlyAction} from '../offline-readonly'

interface WebhookPayload {
	targetUrl: string
	events: string[]
	secret?: string
}

export interface WebhooksSlice {
	userWebhooks: Webhook[]
	userWebhooksLoaded: boolean
	userWebhooksLoading: boolean
	projectWebhooks: Record<number, Webhook[]>
	projectWebhooksLoadedIds: Set<number>
	projectWebhooksLoadingIds: Set<number>
	userWebhookEvents: WebhookEventOption[]
	projectWebhookEvents: WebhookEventOption[]
	userWebhookEventsLoaded: boolean
	projectWebhookEventsLoaded: boolean
	webhookSubmitting: boolean

	loadUserWebhooks: (options?: {force?: boolean}) => Promise<void>
	loadProjectWebhooks: (projectId: number, options?: {force?: boolean}) => Promise<void>
	loadUserWebhookEvents: (options?: {force?: boolean}) => Promise<void>
	loadProjectWebhookEvents: (options?: {force?: boolean}) => Promise<void>
	createUserWebhook: (payload: WebhookPayload) => Promise<boolean>
	updateUserWebhookEvents: (hookId: number, events: string[]) => Promise<boolean>
	deleteUserWebhook: (hookId: number) => Promise<boolean>
	createProjectWebhook: (projectId: number, payload: WebhookPayload) => Promise<boolean>
	updateProjectWebhookEvents: (projectId: number, hookId: number, events: string[]) => Promise<boolean>
	deleteProjectWebhook: (projectId: number, hookId: number) => Promise<boolean>
	resetWebhooksState: () => void
}

export const createWebhooksSlice: StateCreator<AppStore, [], [], WebhooksSlice> = (set, get) => ({
	userWebhooks: [],
	userWebhooksLoaded: false,
	userWebhooksLoading: false,
	projectWebhooks: {},
	projectWebhooksLoadedIds: new Set(),
	projectWebhooksLoadingIds: new Set(),
	userWebhookEvents: [],
	projectWebhookEvents: [],
	userWebhookEventsLoaded: false,
	projectWebhookEventsLoaded: false,
	webhookSubmitting: false,

	async loadUserWebhooks({force = false} = {}) {
		if (!get().connected) {
			set({
				userWebhooks: [],
				userWebhooksLoaded: false,
				userWebhooksLoading: false,
			})
			return
		}
		if (get().userWebhooksLoading) {
			return
		}
		if (!force && get().userWebhooksLoaded) {
			return
		}

		set({userWebhooksLoading: true, error: null})
		try {
			const result = await api<{webhooks?: unknown[]}>('/api/session/webhooks')
			set({
				userWebhooks: normalizeWebhooks(result.webhooks),
				userWebhooksLoaded: true,
			})
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({userWebhooksLoading: false})
		}
	},

	async loadProjectWebhooks(projectId, {force = false} = {}) {
		if (!get().connected || projectId <= 0) {
			return
		}
		if (get().projectWebhooksLoadingIds.has(projectId)) {
			return
		}
		if (!force && get().projectWebhooksLoadedIds.has(projectId)) {
			return
		}

		set(state => ({
			projectWebhooksLoadingIds: new Set(state.projectWebhooksLoadingIds).add(projectId),
			error: null,
		}))
		try {
			const result = await api<{webhooks?: unknown[]}>(`/api/projects/${projectId}/webhooks`)
			set(state => {
				const loaded = new Set(state.projectWebhooksLoadedIds)
				loaded.add(projectId)
				const loading = new Set(state.projectWebhooksLoadingIds)
				loading.delete(projectId)
				return {
					projectWebhooks: {
						...state.projectWebhooks,
						[projectId]: normalizeWebhooks(result.webhooks),
					},
					projectWebhooksLoadedIds: loaded,
					projectWebhooksLoadingIds: loading,
				}
			})
		} catch (error) {
			set(state => {
				const loading = new Set(state.projectWebhooksLoadingIds)
				loading.delete(projectId)
				return {
					projectWebhooksLoadingIds: loading,
					error: formatError(error as Error),
				}
			})
		}
	},

	async loadUserWebhookEvents({force = false} = {}) {
		if (!get().connected) {
			set({
				userWebhookEvents: [],
				userWebhookEventsLoaded: false,
			})
			return
		}
		if (!force && get().userWebhookEventsLoaded) {
			return
		}

		try {
			const result = await api<{events?: unknown[]}>('/api/session/webhooks/events')
			set({
				userWebhookEvents: normalizeWebhookEvents(result.events),
				userWebhookEventsLoaded: true,
			})
		} catch (error) {
			set({error: formatError(error as Error)})
		}
	},

	async loadProjectWebhookEvents({force = false} = {}) {
		if (!get().connected) {
			set({
				projectWebhookEvents: [],
				projectWebhookEventsLoaded: false,
			})
			return
		}
		if (!force && get().projectWebhookEventsLoaded) {
			return
		}

		try {
			const result = await api<{events?: unknown[]}>('/api/webhooks/events')
			set({
				projectWebhookEvents: normalizeWebhookEvents(result.events),
				projectWebhookEventsLoaded: true,
			})
		} catch (error) {
			set({error: formatError(error as Error)})
		}
	},

	async createUserWebhook(payload) {
		if (blockOfflineReadOnlyAction(get, set, 'manage webhooks')) {
			return false
		}

		set({webhookSubmitting: true, error: null})
		try {
			await api('/api/session/webhooks', {
				method: 'PUT',
				body: normalizeWebhookPayload(payload),
			})
			await get().loadUserWebhooks({force: true})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({webhookSubmitting: false})
		}
	},

	async updateUserWebhookEvents(hookId, events) {
		if (blockOfflineReadOnlyAction(get, set, 'manage webhooks')) {
			return false
		}
		if (hookId <= 0) {
			return false
		}

		set({webhookSubmitting: true, error: null})
		try {
			await api(`/api/session/webhooks/${hookId}`, {
				method: 'POST',
				body: {events: normalizeEventNames(events)},
			})
			await get().loadUserWebhooks({force: true})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({webhookSubmitting: false})
		}
	},

	async deleteUserWebhook(hookId) {
		if (blockOfflineReadOnlyAction(get, set, 'manage webhooks')) {
			return false
		}
		if (hookId <= 0) {
			return false
		}

		set({webhookSubmitting: true, error: null})
		try {
			await api(`/api/session/webhooks/${hookId}`, {
				method: 'DELETE',
			})
			await get().loadUserWebhooks({force: true})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({webhookSubmitting: false})
		}
	},

	async createProjectWebhook(projectId, payload) {
		if (blockOfflineReadOnlyAction(get, set, 'manage webhooks')) {
			return false
		}
		if (projectId <= 0) {
			return false
		}

		set({webhookSubmitting: true, error: null})
		try {
			await api(`/api/projects/${projectId}/webhooks`, {
				method: 'PUT',
				body: normalizeWebhookPayload(payload),
			})
			await get().loadProjectWebhooks(projectId, {force: true})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({webhookSubmitting: false})
		}
	},

	async updateProjectWebhookEvents(projectId, hookId, events) {
		if (blockOfflineReadOnlyAction(get, set, 'manage webhooks')) {
			return false
		}
		if (projectId <= 0 || hookId <= 0) {
			return false
		}

		set({webhookSubmitting: true, error: null})
		try {
			await api(`/api/projects/${projectId}/webhooks/${hookId}`, {
				method: 'POST',
				body: {events: normalizeEventNames(events)},
			})
			await get().loadProjectWebhooks(projectId, {force: true})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({webhookSubmitting: false})
		}
	},

	async deleteProjectWebhook(projectId, hookId) {
		if (blockOfflineReadOnlyAction(get, set, 'manage webhooks')) {
			return false
		}
		if (projectId <= 0 || hookId <= 0) {
			return false
		}

		set({webhookSubmitting: true, error: null})
		try {
			await api(`/api/projects/${projectId}/webhooks/${hookId}`, {
				method: 'DELETE',
			})
			await get().loadProjectWebhooks(projectId, {force: true})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({webhookSubmitting: false})
		}
	},

	resetWebhooksState() {
		set({
			userWebhooks: [],
			userWebhooksLoaded: false,
			userWebhooksLoading: false,
			projectWebhooks: {},
			projectWebhooksLoadedIds: new Set(),
			projectWebhooksLoadingIds: new Set(),
			userWebhookEvents: [],
			projectWebhookEvents: [],
			userWebhookEventsLoaded: false,
			projectWebhookEventsLoaded: false,
			webhookSubmitting: false,
		})
	},
})

function normalizeWebhookPayload(payload: WebhookPayload) {
	return {
		target_url: `${payload.targetUrl || ''}`.trim(),
		events: normalizeEventNames(payload.events),
		secret: `${payload.secret || ''}`.trim() || null,
	}
}

function normalizeEventNames(events: string[]) {
	return [...new Set(
		(events || [])
			.map(eventName => `${eventName || ''}`.trim())
			.filter(Boolean),
	)]
}

function normalizeWebhooks(value: unknown): Webhook[] {
	if (!Array.isArray(value)) {
		return []
	}

	return value
		.map(entry => normalizeWebhook(entry))
		.filter((entry): entry is Webhook => Boolean(entry))
}

function normalizeWebhook(value: unknown): Webhook | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null
	}

	const record = value as Record<string, unknown>
	const id = Number(record.id || 0)
	if (id <= 0) {
		return null
	}

	return {
		id,
		target_url:
			`${record.target_url || record.targetUrl || record.url || ''}`.trim(),
		events: normalizeEventNames(Array.isArray(record.events) ? record.events as string[] : []),
		secret:
			typeof record.secret === 'string'
				? `${record.secret}`.trim() || null
				: null,
		created: typeof record.created === 'string' ? record.created : null,
		updated: typeof record.updated === 'string' ? record.updated : null,
	}
}

function normalizeWebhookEvents(value: unknown): WebhookEventOption[] {
	if (!Array.isArray(value)) {
		return []
	}

	return value
		.map(entry => {
			if (typeof entry === 'string') {
				const event_name = entry.trim()
				return event_name ? {event_name} : null
			}
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
				return null
			}
			const record = entry as Record<string, unknown>
			const event_name = `${record.event_name || record.eventName || record.name || record.key || ''}`.trim()
			return event_name ? {event_name} : null
		})
		.filter((entry): entry is WebhookEventOption => Boolean(entry))
}

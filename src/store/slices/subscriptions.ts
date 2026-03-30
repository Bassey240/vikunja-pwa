import {api} from '@/api'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {blockOfflineReadOnlyAction} from '../offline-readonly'

export type SubscriptionEntity = 'task' | 'project'

export interface SubscriptionsSlice {
	subscriptionsByEntity: Record<string, boolean | null>
	subscriptionMutatingKeys: Set<string>
	setSubscriptionState: (entity: SubscriptionEntity, id: number, subscribed: boolean | null) => void
	toggleSubscription: (entity: SubscriptionEntity, id: number) => Promise<boolean>
	resetSubscriptionsState: () => void
}

export const createSubscriptionsSlice: StateCreator<AppStore, [], [], SubscriptionsSlice> = (set, get) => ({
	subscriptionsByEntity: {},
	subscriptionMutatingKeys: new Set(),

	setSubscriptionState(entity, id, subscribed) {
		const key = getSubscriptionKey(entity, id)
		if (!key) {
			return
		}

		set(state => ({
			subscriptionsByEntity: {
				...state.subscriptionsByEntity,
				[key]: subscribed,
			},
			taskDetail:
				entity === 'task' && state.taskDetail?.id === id
					? {
						...state.taskDetail,
						subscription: subscribed === null ? null : {subscribed},
					}
					: state.taskDetail,
			projectDetail:
				entity === 'project' && state.projectDetail?.id === id
					? {
						...state.projectDetail,
						subscription: subscribed === null ? null : {subscribed},
					}
					: state.projectDetail,
		}))
	},

	async toggleSubscription(entity, id) {
		if (blockOfflineReadOnlyAction(get, set, 'manage subscriptions')) {
			return false
		}

		const key = getSubscriptionKey(entity, id)
		if (!key) {
			return false
		}

		const current = get().subscriptionsByEntity[key]
		if (current === null || typeof current === 'undefined' || get().subscriptionMutatingKeys.has(key)) {
			return false
		}

		const nextSubscribed = !current
		set(state => {
			const subscriptionMutatingKeys = new Set(state.subscriptionMutatingKeys)
			subscriptionMutatingKeys.add(key)
			return {
				subscriptionsByEntity: {
					...state.subscriptionsByEntity,
					[key]: nextSubscribed,
				},
				subscriptionMutatingKeys,
				taskDetail:
					entity === 'task' && state.taskDetail?.id === id
						? {
							...state.taskDetail,
							subscription: {subscribed: nextSubscribed},
						}
						: state.taskDetail,
				projectDetail:
					entity === 'project' && state.projectDetail?.id === id
						? {
							...state.projectDetail,
							subscription: {subscribed: nextSubscribed},
						}
						: state.projectDetail,
			}
		})

		try {
			await api<{ok: boolean; subscribed: boolean}>(`/api/subscriptions/${entity}/${id}`, {
				method: current ? 'DELETE' : 'PUT',
			})
			return true
		} catch (error) {
			set(state => ({
				subscriptionsByEntity: {
					...state.subscriptionsByEntity,
					[key]: current,
				},
				taskDetail:
					entity === 'task' && state.taskDetail?.id === id
						? {
							...state.taskDetail,
							subscription: {subscribed: current},
						}
						: state.taskDetail,
				projectDetail:
					entity === 'project' && state.projectDetail?.id === id
						? {
							...state.projectDetail,
							subscription: {subscribed: current},
						}
						: state.projectDetail,
				error: formatError(error as Error),
			}))
			return false
		} finally {
			set(state => {
				const subscriptionMutatingKeys = new Set(state.subscriptionMutatingKeys)
				subscriptionMutatingKeys.delete(key)
				return {subscriptionMutatingKeys}
			})
		}
	},

	resetSubscriptionsState() {
		set({
			subscriptionsByEntity: {},
			subscriptionMutatingKeys: new Set(),
		})
	},
})

function getSubscriptionKey(entity: SubscriptionEntity, id: number) {
	const normalizedId = Number(id || 0)
	if ((entity !== 'task' && entity !== 'project') || !normalizedId) {
		return ''
	}

	return `${entity}:${normalizedId}`
}

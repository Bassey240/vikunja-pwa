import {useEffect} from 'react'
import {getPlatform} from '@/platform/registry'
import {useAppStore} from '@/store'
import {isTimeTrackingAvailable} from '@/store/slices/time-tracking'

export default function useVikunjaEvents() {
	const enabled = useAppStore(state =>
		state.initialized && state.connected && state.isOnline && !state.offlineReadOnlyMode &&
		state.account?.source === 'account' && state.account.authMode === 'password' &&
		!state.account.linkShareAuth && state.account.instanceFeatures?.apiV2Available === true,
	)
	const baseUrl = useAppStore(state => state.account?.baseUrl)
	const userId = useAppStore(state => state.account?.user?.id)
	const timersEnabled = useAppStore(isTimeTrackingAvailable)

	useEffect(() => {
		if (!enabled) return
		const refreshNotifications = async () => {
			await useAppStore.getState().loadNotifications({silent: true})
			const state = useAppStore.getState()
			await getPlatform().notificationSurface.surface(state.notifications, state.account?.user || null)
		}
		const refreshTimers = () => {
			const state = useAppStore.getState()
			if (!isTimeTrackingAvailable(state)) return
			void state.loadRunningTimeEntry({silent: true})
			if (state.taskDetailOpen && state.taskDetail?.id) {
				void state.loadTaskTimeEntries(state.taskDetail.id, {silent: true})
			}
		}
		let stop = () => {}
		const onEvent = (name: string) => {
			if (name === 'notification.created' || name === 'ready') void refreshNotifications()
			if (['timer.created', 'timer.updated', 'timer.deleted', 'ready'].includes(name)) refreshTimers()
			if (name === 'auth-error') {
				stop()
				void useAppStore.getState().loadAccountStatus()
			}
		}
		const subscribeNative = getPlatform().subscribeVikunjaEvents
		if (subscribeNative) {
			stop = subscribeNative(onEvent, timersEnabled)
		} else {
			if (!getPlatform().capabilities.showPwaOnlySections || typeof EventSource === 'undefined') return
			const source = new EventSource('/api/events')
			for (const name of ['notification.created', 'timer.created', 'timer.updated', 'timer.deleted', 'ready', 'auth-error']) {
				source.addEventListener(name, () => onEvent(name))
			}
			stop = () => source.close()
		}
		return () => stop()
	}, [enabled, baseUrl, userId, timersEnabled])
}

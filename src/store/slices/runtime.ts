import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import type {ConflictEntry} from '../offline-sync'

type BrowserNotificationPermissionState = NotificationPermission | 'unsupported'

function browserHasWindow() {
	return typeof window !== 'undefined'
}

function getCurrentRuntimeAssetUrls() {
	if (!browserHasWindow()) {
		return []
	}

	const urls = new Set<string>([
		'/',
		'/index.html',
		window.location.pathname || '/',
	])
	const selectors = [
		'script[src]',
		'link[rel="stylesheet"][href]',
		'link[rel="manifest"][href]',
		'link[rel="apple-touch-icon"][href]',
		'link[rel="icon"][href]',
	]

	for (const element of document.querySelectorAll<HTMLElement>(selectors.join(','))) {
		const href = element instanceof HTMLScriptElement ? element.src : element.getAttribute('href')
		if (!href) {
			continue
		}
		try {
			const url = new URL(href, window.location.origin)
			if (url.origin === window.location.origin) {
				urls.add(`${url.pathname}${url.search}`)
			}
		} catch {
			// Ignore invalid asset URLs.
		}
	}

	return [...urls]
}

async function precacheRuntimeAssets() {
	if (!browserHasWindow() || !('serviceWorker' in window.navigator)) {
		return
	}

	try {
		const registration = await window.navigator.serviceWorker.ready
		registration.active?.postMessage({
			type: 'PRECACHE_URLS',
			urls: getCurrentRuntimeAssetUrls(),
		})
	} catch {
		// Ignore runtime precache failures.
	}
}

function getOnlineStatus() {
	if (!browserHasWindow()) {
		return true
	}

	return window.navigator.onLine
}

async function getReachableOnlineStatus() {
	if (!browserHasWindow()) {
		return true
	}

	if (window.navigator.onLine) {
		return true
	}

	try {
		const response = await fetch('/health', {
			method: 'GET',
			cache: 'no-store',
		})
		return response.ok
	} catch {
		return false
	}
}

function getNotificationPermission(): BrowserNotificationPermissionState {
	if (!browserHasWindow() || !('Notification' in window)) {
		return 'unsupported'
	}

	return Notification.permission
}

export interface RuntimeSlice {
	runtimeInitialized: boolean
	isOnline: boolean
	isSecureContext: boolean
	standaloneDisplayMode: boolean
	serviceWorkerSupported: boolean
	serviceWorkerRegistered: boolean
	serviceWorkerUpdateAvailable: boolean
	serviceWorkerError: string | null
	browserNotificationsSupported: boolean
	pushManagerSupported: boolean
	browserNotificationPermission: BrowserNotificationPermissionState
	notificationPermissionRequesting: boolean
	offlineQueueCount: number
	offlineQueueFailedCount: number
	offlineSyncInProgress: boolean
	offlineSyncConflicts: ConflictEntry[]
	initRuntime: () => Promise<void>
	refreshRuntimeState: () => Promise<void>
	refreshOfflineQueueCounts: () => Promise<void>
	setOfflineSyncInProgress: (value: boolean) => void
	setOfflineSyncConflicts: (conflicts: ConflictEntry[]) => void
	clearOfflineSyncConflicts: () => void
	requestBrowserNotificationPermission: () => Promise<boolean>
	sendTestBrowserNotification: () => Promise<boolean>
	applyServiceWorkerUpdate: () => Promise<boolean>
}

function attachServiceWorkerLifecycle(registration: ServiceWorkerRegistration, get: () => AppStore, set: Parameters<StateCreator<AppStore, [], [], RuntimeSlice>>[0]) {
	registration.addEventListener('updatefound', () => {
		const installing = registration.installing
		if (!installing) {
			return
		}

		installing.addEventListener('statechange', () => {
			if (installing.state === 'installed') {
				set({
					serviceWorkerRegistered: true,
					serviceWorkerUpdateAvailable: Boolean(window.navigator.serviceWorker.controller),
				})
			}
		})
	})

	if (registration.waiting) {
		set({
			serviceWorkerRegistered: true,
			serviceWorkerUpdateAvailable: true,
		})
	}

	window.navigator.serviceWorker.addEventListener('controllerchange', () => {
		const shouldReload = get().serviceWorkerUpdateAvailable
		set({
			serviceWorkerRegistered: true,
			serviceWorkerUpdateAvailable: false,
			serviceWorkerError: null,
		})
		if (browserHasWindow() && shouldReload) {
			window.location.reload()
		}
	})

	void get().refreshRuntimeState()
}

export const createRuntimeSlice: StateCreator<AppStore, [], [], RuntimeSlice> = (set, get) => ({
	runtimeInitialized: false,
	isOnline: getOnlineStatus(),
	isSecureContext: browserHasWindow() ? window.isSecureContext : false,
	standaloneDisplayMode: browserHasWindow()
		? window.matchMedia('(display-mode: standalone)').matches ||
			Boolean((navigator as Navigator & {standalone?: boolean}).standalone)
		: false,
	serviceWorkerSupported: browserHasWindow() && 'serviceWorker' in window.navigator,
	serviceWorkerRegistered: false,
	serviceWorkerUpdateAvailable: false,
	serviceWorkerError: null,
	browserNotificationsSupported: browserHasWindow() && 'Notification' in window,
	pushManagerSupported: browserHasWindow() && 'PushManager' in window,
	browserNotificationPermission: getNotificationPermission(),
	notificationPermissionRequesting: false,
	offlineQueueCount: 0,
	offlineQueueFailedCount: 0,
	offlineSyncInProgress: false,
	offlineSyncConflicts: [],

	async initRuntime() {
		if (get().runtimeInitialized || !browserHasWindow()) {
			return
		}

		set({
			runtimeInitialized: true,
			isOnline: getOnlineStatus(),
			isSecureContext: window.isSecureContext,
			standaloneDisplayMode:
				window.matchMedia('(display-mode: standalone)').matches ||
				Boolean((navigator as Navigator & {standalone?: boolean}).standalone),
			serviceWorkerSupported: 'serviceWorker' in window.navigator,
			browserNotificationsSupported: 'Notification' in window,
			pushManagerSupported: 'PushManager' in window,
			browserNotificationPermission: getNotificationPermission(),
		})
		await get().refreshOfflineQueueCounts()

		const handleOnlineState = () => {
			void get().refreshRuntimeState()
		}

		const handleRuntimeRefresh = () => {
			void get().refreshRuntimeState()
		}

		window.addEventListener('online', handleOnlineState)
		window.addEventListener('offline', handleOnlineState)
		window.addEventListener('focus', handleRuntimeRefresh)
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') {
				void get().refreshRuntimeState()
			}
		})

		if (!('serviceWorker' in window.navigator)) {
			return
		}

		try {
			const registration = await window.navigator.serviceWorker.register('/sw.js')
			set({
				serviceWorkerRegistered: Boolean(registration.active || registration.installing || registration.waiting),
				serviceWorkerError: null,
			})
			attachServiceWorkerLifecycle(registration, get, set)
			await precacheRuntimeAssets()
		} catch (error) {
			set({
				serviceWorkerRegistered: false,
				serviceWorkerUpdateAvailable: false,
				serviceWorkerError: formatError(error as Error),
			})
		}
	},

	async refreshRuntimeState() {
		if (!browserHasWindow()) {
			return
		}

		const isOnline = await getReachableOnlineStatus()

		set({
			isOnline,
			isSecureContext: window.isSecureContext,
			standaloneDisplayMode:
				window.matchMedia('(display-mode: standalone)').matches ||
				Boolean((navigator as Navigator & {standalone?: boolean}).standalone),
			browserNotificationsSupported: 'Notification' in window,
			pushManagerSupported: 'PushManager' in window,
			browserNotificationPermission: getNotificationPermission(),
			serviceWorkerSupported: 'serviceWorker' in window.navigator,
		})

		if (!get().isOnline && get().connected) {
			void get().enterOfflineReadOnlyMode()
		}

		if (!('serviceWorker' in window.navigator)) {
			set({
				serviceWorkerRegistered: false,
				serviceWorkerUpdateAvailable: false,
				serviceWorkerError: null,
			})
			return
		}

		try {
			const registration = await window.navigator.serviceWorker.getRegistration()
			set({
				serviceWorkerRegistered: Boolean(registration?.active || registration?.installing || registration?.waiting),
				serviceWorkerUpdateAvailable: Boolean(registration?.waiting),
				serviceWorkerError: null,
			})
		} catch (error) {
			set({
				serviceWorkerRegistered: false,
				serviceWorkerUpdateAvailable: false,
				serviceWorkerError: formatError(error as Error),
			})
		}
	},

	async refreshOfflineQueueCounts() {
		try {
			const {getFailedCount, getPendingCount} = await import('@/store/offline-queue')
			set({
				offlineQueueCount: await getPendingCount(),
				offlineQueueFailedCount: await getFailedCount(),
			})
		} catch {
			set({
				offlineQueueCount: 0,
				offlineQueueFailedCount: 0,
			})
		}
	},

	setOfflineSyncInProgress(offlineSyncInProgress) {
		set({offlineSyncInProgress})
	},

	setOfflineSyncConflicts(offlineSyncConflicts) {
		set({offlineSyncConflicts})
	},

	clearOfflineSyncConflicts() {
		set({offlineSyncConflicts: []})
	},

	async requestBrowserNotificationPermission() {
		if (!browserHasWindow() || !('Notification' in window)) {
			set({
				browserNotificationsSupported: false,
				browserNotificationPermission: 'unsupported',
			})
			return false
		}

		set({notificationPermissionRequesting: true})

		try {
			const permission = await Notification.requestPermission()
			set({
				browserNotificationsSupported: true,
				browserNotificationPermission: permission,
			})
			return permission === 'granted'
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({notificationPermissionRequesting: false})
		}
	},

	async sendTestBrowserNotification() {
		if (!browserHasWindow() || !('Notification' in window) || Notification.permission !== 'granted') {
			return false
		}

		const options: NotificationOptions = {
			body: 'Browser notifications are enabled for this device.',
			tag: 'vikunja-mobile-poc-notification-test',
			icon: '/icons/icon-192.png?v=20260320-3',
			badge: '/icons/icon-192.png?v=20260320-3',
		}

		try {
			const shouldUseWindowNotification =
				typeof document !== 'undefined' && document.visibilityState === 'visible'

			if (shouldUseWindowNotification) {
				new Notification('Vikunja browser notifications', options)
				return true
			}

			if ('serviceWorker' in window.navigator) {
				const registration = await window.navigator.serviceWorker.ready
				await registration.showNotification('Vikunja browser notifications', options)
				return true
			}

			new Notification('Vikunja browser notifications', options)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async applyServiceWorkerUpdate() {
		if (!browserHasWindow() || !('serviceWorker' in window.navigator)) {
			return false
		}

		try {
			const registration = await window.navigator.serviceWorker.getRegistration()
			if (!registration?.waiting) {
				return false
			}

			registration.waiting.postMessage({type: 'SKIP_WAITING'})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},
})

import type {ApiTransport} from '@/api/transport'
import type {Account, AppNotification, TaskAssignee} from '@/types'
import type {ComponentType, ReactNode} from 'react'

// Platform ports: shared code talks to these; the defaults here are the no-op /
// web behavior the PWA uses. A platform can overwrite the slots via
// registerPlatform() before boot.

export interface SessionPayload {
	connected: boolean
	account: Account | null
}

export interface HapticsPort {
	lift(): void
	drop(): void
	success(): void
	error(): void
	selection(): void
}

export interface NotificationSurfacePort {
	enabled: boolean
	surface(
		notifications: AppNotification[],
		currentUser: Pick<TaskAssignee, 'id'> | null,
	): Promise<void>
}

export interface ImageLoadResult {
	url: string
	revoke?: () => void
}

export interface ImageLoaderPort {
	mode: 'passthrough' | 'blob'
	load(src: string): Promise<ImageLoadResult>
}

export interface DownloaderPort {
	mode: 'anchor' | 'native'
	download(path: string, filename: string): Promise<void>
}

export interface SettingsSectionProps {
	open: boolean
	onToggle: (id: string) => void
}

export interface SettingsSectionDescriptor {
	id: string
	render(props: SettingsSectionProps): ReactNode
}

export interface AuthGatePort {
	LockScreen: ComponentType | null
	OnboardingScreen: ComponentType | null
	useLockState(): {locked: boolean}
}

export interface PlatformCapabilities {
	hasNativeNotifications: boolean
	offlineShellMode: 'serviceWorker' | 'bundled'
	showPwaOnlySections: boolean
}

export interface PlatformRegistry {
	// null = use the gateway fallback owned by api.ts / auth.ts (avoids a
	// registry↔api import cycle: this module imports no shared runtime code).
	transport: ApiTransport | null
	sessionLoader: (() => Promise<SessionPayload>) | null
	haptics: HapticsPort
	notificationSurface: NotificationSurfacePort
	imageLoader: ImageLoaderPort
	downloader: DownloaderPort
	serviceWorker: {shouldRegister: boolean}
	authGate: AuthGatePort
	settingsSections: SettingsSectionDescriptor[]
	capabilities: PlatformCapabilities
}

const noop = (): void => {}

const registry: PlatformRegistry = {
	transport: null,
	sessionLoader: null,
	haptics: {lift: noop, drop: noop, success: noop, error: noop, selection: noop},
	notificationSurface: {enabled: false, surface: async () => {}},
	imageLoader: {mode: 'passthrough', load: async src => ({url: src})},
	downloader: {mode: 'anchor', download: async () => {}},
	serviceWorker: {shouldRegister: true},
	authGate: {LockScreen: null, OnboardingScreen: null, useLockState: () => ({locked: false})},
	settingsSections: [],
	capabilities: {hasNativeNotifications: false, offlineShellMode: 'serviceWorker', showPwaOnlySections: true},
}

export function getPlatform(): PlatformRegistry {
	return registry
}

export function registerPlatform(overrides: Partial<PlatformRegistry>): void {
	Object.assign(registry, overrides)
}

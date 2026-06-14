import {storageKeys} from '@/storageKeys'
import {loadString, saveString} from '@/utils/storage'
import {DESKTOP_VIEW_KINDS, MOBILE_VIEW_KINDS, type ProjectViewKind} from './view-resolution'

export {DESKTOP_VIEW_KINDS, MOBILE_VIEW_KINDS, resolveTaskViewId} from './view-resolution'
export type {ProjectViewKind} from './view-resolution'

function loadKind(key: string, allowed: ProjectViewKind[]): ProjectViewKind {
	const stored = loadString(key, '') as ProjectViewKind
	return allowed.includes(stored) ? stored : 'list'
}

export function loadDefaultDesktopViewKind(): ProjectViewKind {
	return loadKind(storageKeys.defaultProjectViewKindDesktop, DESKTOP_VIEW_KINDS)
}

export function loadDefaultMobileViewKind(): ProjectViewKind {
	return loadKind(storageKeys.defaultProjectViewKindMobile, MOBILE_VIEW_KINDS)
}

export function persistDefaultDesktopViewKind(kind: ProjectViewKind) {
	saveString(storageKeys.defaultProjectViewKindDesktop, kind)
}

export function persistDefaultMobileViewKind(kind: ProjectViewKind) {
	saveString(storageKeys.defaultProjectViewKindMobile, kind)
}

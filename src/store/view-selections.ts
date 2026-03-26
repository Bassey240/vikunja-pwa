import {storageKeys} from '@/storageKeys'
import {loadJson, loadString, saveString} from '@/utils/storage'

const SUPPORTED_PROJECT_VIEW_KINDS = new Set(['list', 'kanban', 'table', 'gantt'])

export function loadPersistedPreferredProjectViewKind() {
	const preferredKind = loadString(storageKeys.preferredProjectViewKind, '')
	if (preferredKind && SUPPORTED_PROJECT_VIEW_KINDS.has(preferredKind)) {
		return preferredKind
	}

	// One-time compatibility path from the previous per-project storage.
	// We cannot recover the exact view kind from stored ids alone, but keeping the read here
	// prevents older malformed values from throwing during upgrades.
	loadJson<Record<string, number | null | string>>(storageKeys.projectViewIdsByProjectId, {})
	return null
}

export function persistPreferredProjectViewKind(kind: string | null) {
	saveString(storageKeys.preferredProjectViewKind, kind || '')
}

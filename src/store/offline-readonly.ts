interface OfflineReadonlyContext {
	isOnline: boolean
	offlineReadOnlyMode: boolean
}

export function isOfflineReadOnly(get: () => OfflineReadonlyContext) {
	return !get().isOnline && get().offlineReadOnlyMode
}

export function blockOfflineReadOnlyAction(
	get: () => OfflineReadonlyContext,
	set: (patch: {error?: string | null; offlineActionNotice?: string | null}) => void,
	action: string,
) {
	if (!isOfflineReadOnly(get)) {
		return false
	}

	set({
		error: null,
		offlineActionNotice: `You're offline. Reconnect to ${action}.`,
	})
	return true
}

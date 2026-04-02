interface OfflineReadonlyContext {
	isOnline: boolean
	offlineReadOnlyMode: boolean
}

const QUEUEABLE_ACTIONS = new Set([
	'toggleTaskDone',
	'deleteTask',
	'moveTask',
	'duplicateTask',
	'saveTaskDetailPatch',
	'submitRootTask',
	'submitSubtask',
	'addAssigneeToTask',
	'removeAssigneeFromTask',
	'bulkUpdateAssignees',
	'addLabelToTask',
	'removeLabelFromTask',
	'addCommentToTask',
	'deleteTaskComment',
	'addTaskRelation',
	'removeTaskRelation',
	'submitProject',
	'deleteProject',
	'saveProjectDetailPatch',
	'moveProjectToParent',
	'applyBulkTaskAction',
])

export function isOfflineReadOnly(get: () => OfflineReadonlyContext) {
	return !get().isOnline && get().offlineReadOnlyMode
}

export function shouldQueueOffline(get: () => OfflineReadonlyContext, actionName: string): boolean {
	if (get().isOnline) {
		return false
	}

	return QUEUEABLE_ACTIONS.has(actionName)
}

export function blockNonQueueableOfflineAction(
	get: () => OfflineReadonlyContext,
	set: (patch: {error?: string | null; offlineActionNotice?: string | null}) => void,
	actionName: string,
) {
	if (get().isOnline) {
		return false
	}

	if (QUEUEABLE_ACTIONS.has(actionName)) {
		return false
	}

	set({
		error: null,
		offlineActionNotice: 'This action requires a connection. Reconnect to continue.',
	})
	return true
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

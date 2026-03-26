import {type UndoableMutationNotice} from '@/types'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'

interface UndoableMutationController {
	id: string
	commit: () => Promise<void>
	rollback: () => Promise<void> | void
	onCommitted?: () => Promise<void> | void
	onUndone?: () => Promise<void> | void
}

export interface MutationsSlice {
	pendingUndoMutation: UndoableMutationNotice | null
	startUndoableMutation: (options: {
		notice: UndoableMutationNotice
		durationMs?: number
		commit: () => Promise<void>
		rollback: () => Promise<void> | void
		onCommitted?: () => Promise<void> | void
		onUndone?: () => Promise<void> | void
	}) => Promise<boolean>
	undoPendingMutation: () => Promise<boolean>
	dismissPendingMutation: () => Promise<boolean>
	flushPendingMutation: () => Promise<boolean>
	clearPendingMutation: () => void
}

const DEFAULT_UNDO_MS = 4200
let activeController: UndoableMutationController | null = null
let activeControllerTimer: ReturnType<typeof setTimeout> | null = null

function clearActiveControllerTimer() {
	if (!activeControllerTimer) {
		return
	}

	clearTimeout(activeControllerTimer)
	activeControllerTimer = null
}

export const createMutationsSlice: StateCreator<AppStore, [], [], MutationsSlice> = (set, get) => {
	const commitController = async (controller: UndoableMutationController | null) => {
		if (!controller) {
			return false
		}

		try {
			await controller.commit()
			await controller.onCommitted?.()
			return true
		} catch (error) {
			await controller.rollback()
			set({error: formatError(error as Error)})
			return false
		}
	}

	const releaseActiveController = () => {
		if (!activeController) {
			return null
		}

		const controller = activeController
		clearActiveControllerTimer()
		activeController = null
		return controller
	}

	const finalizeController = async (controller: UndoableMutationController) => {
		if (activeController !== controller) {
			return
		}

		const released = releaseActiveController()
		set({pendingUndoMutation: null})
		void commitController(released)
	}

	return {
		pendingUndoMutation: null,

		async startUndoableMutation({notice, durationMs = DEFAULT_UNDO_MS, commit, rollback, onCommitted, onUndone}) {
			if (activeController) {
				const previousController = releaseActiveController()
				void commitController(previousController)
			}

			const controller: UndoableMutationController = {
				id: notice.id,
				commit,
				rollback,
				onCommitted,
				onUndone,
			}

			activeController = controller
			set({
				pendingUndoMutation: {
					...notice,
					actionLabel: notice.actionLabel || 'Undo',
				},
				error: null,
			})
			clearActiveControllerTimer()
			activeControllerTimer = setTimeout(() => {
				void finalizeController(controller)
			}, durationMs)
			return true
		},

		async undoPendingMutation() {
			const controller = releaseActiveController()
			if (!controller) {
				return false
			}

			set({pendingUndoMutation: null})
			await controller.rollback()
			await controller.onUndone?.()
			return true
		},

		async dismissPendingMutation() {
			return get().flushPendingMutation()
		},

		async flushPendingMutation() {
			const controller = releaseActiveController()
			if (!controller) {
				return false
			}

			set({pendingUndoMutation: null})
			return commitController(controller)
		},

		clearPendingMutation() {
			clearActiveControllerTimer()
			activeController = null
			set({pendingUndoMutation: null})
		},
	}
}

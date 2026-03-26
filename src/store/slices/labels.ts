import {api} from '@/api'
import type {Label, MenuAnchor} from '@/types'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'

export interface LabelsSlice {
	labels: Label[]
	labelsLoaded: boolean
	loadingLabels: boolean
	labelSubmitting: boolean
	labelDetailOpen: boolean
	labelDetail: Label | null
	loadLabels: () => Promise<void>
	ensureLabelsLoaded: () => Promise<void>
	createLabel: (title: string) => Promise<boolean>
	editLabel: (labelId: number) => Promise<void>
	closeLabelDetail: () => void
	saveLabelDetailPatch: (patch: Partial<Label>) => Promise<boolean>
	deleteLabel: (labelId: number) => Promise<boolean>
	toggleLabelMenu: (labelId: number, anchor: MenuAnchor) => void
	resetLabelState: () => void
}

export const createLabelsSlice: StateCreator<AppStore, [], [], LabelsSlice> = (set, get) => ({
	labels: [],
	labelsLoaded: false,
	loadingLabels: false,
	labelSubmitting: false,
	labelDetailOpen: false,
	labelDetail: null,

	async loadLabels() {
		set({loadingLabels: true, error: null})

		try {
			const labels = await api<Label[]>('/api/labels')
			set({
				labels,
				labelsLoaded: true,
			})
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({loadingLabels: false})
		}
	},

	async ensureLabelsLoaded() {
		if (get().labelsLoaded || get().loadingLabels) {
			return
		}

		await get().loadLabels()
	},

	async createLabel(title) {
		const trimmedTitle = title.trim()
		if (!trimmedTitle) {
			return false
		}

		set({labelSubmitting: true, error: null})

		try {
			const result = await api<{label?: Label} | Label, {title: string}>('/api/labels', {
				method: 'POST',
				body: {title: trimmedTitle},
			})
			const nextLabel = unwrapLabel(result)

			await get().loadLabels()
			if (nextLabel && get().labelDetailOpen && get().labelDetail?.id === nextLabel.id) {
				set({labelDetail: nextLabel})
			}
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({labelSubmitting: false})
		}
	},

	async editLabel(labelId) {
		const label = get().labels.find(entry => entry.id === labelId) || null
		if (!label) {
			return
		}

		set({
			openMenu: null,
			labelDetail: label,
			labelDetailOpen: true,
		})
	},

	closeLabelDetail() {
		set({
			labelDetailOpen: false,
			labelDetail: null,
		})
	},

	async saveLabelDetailPatch(patch) {
		const currentLabel = get().labelDetail
		if (!currentLabel?.id) {
			return false
		}

		try {
			const result = await api<{label?: Label} | Label, Partial<Label>>(
				`/api/labels/${currentLabel.id}`,
				{
					method: 'POST',
					body: {
						...currentLabel,
						...patch,
					},
				},
			)
			const nextLabel = unwrapLabel(result)
			if (!nextLabel) {
				return false
			}

			set({
				labelDetail: nextLabel,
			})
			await get().loadLabels()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	async deleteLabel(labelId) {
		if (!labelId || !window.confirm('Delete this label?')) {
			return false
		}

		try {
			await api<{ok: boolean}>(`/api/labels/${labelId}`, {method: 'DELETE'})
			set(state => ({
				openMenu: null,
				labelDetailOpen: state.labelDetail?.id === labelId ? false : state.labelDetailOpen,
				labelDetail: state.labelDetail?.id === labelId ? null : state.labelDetail,
			}))
			await get().loadLabels()
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		}
	},

	toggleLabelMenu(labelId, anchor) {
		set(state => ({
			openMenu:
				state.openMenu?.kind === 'label' && state.openMenu.id === labelId
					? null
					: {
						kind: 'label',
						id: labelId,
						anchor,
					},
		}))
	},

	resetLabelState() {
		set({
			labels: [],
			labelsLoaded: false,
			loadingLabels: false,
			labelSubmitting: false,
			labelDetailOpen: false,
			labelDetail: null,
		})
	},
})

function unwrapLabel(result: {label?: Label} | Label) {
	if ('id' in result) {
		return result
	}

	return result.label || null
}

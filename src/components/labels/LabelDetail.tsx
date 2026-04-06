import DetailSheet from '@/components/common/DetailSheet'
import {useAppStore} from '@/store'
import {ACCENT_BLUE} from '@/utils/color-constants'
import {getColorInputValue, normalizeHexColor} from '@/utils/formatting'
import {useEffect, useState} from 'react'

export default function LabelDetail() {
	const labelDetailOpen = useAppStore(state => state.labelDetailOpen)
	const labelDetail = useAppStore(state => state.labelDetail)
	const closeLabelDetail = useAppStore(state => state.closeLabelDetail)
	const saveLabelDetailPatch = useAppStore(state => state.saveLabelDetailPatch)
	const deleteLabel = useAppStore(state => state.deleteLabel)
	const [title, setTitle] = useState('')
	const [color, setColor] = useState(ACCENT_BLUE)

	useEffect(() => {
		setTitle(labelDetail?.title || '')
		setColor(getColorInputValue(labelDetail?.hex_color || labelDetail?.hexColor))
	}, [labelDetail?.hexColor, labelDetail?.hex_color, labelDetail?.id, labelDetail?.title])

	async function handleTitleBlur() {
		if (!labelDetail) {
			return
		}

		const trimmedTitle = title.trim()
		if (!trimmedTitle || trimmedTitle === labelDetail.title) {
			setTitle(labelDetail.title)
			return
		}

		const success = await saveLabelDetailPatch({title: trimmedTitle})
		if (!success) {
			setTitle(labelDetail.title)
		}
	}

	async function handleColorChange(nextValue: string) {
		if (!labelDetail) {
			return
		}

		const normalizedColor = normalizeHexColor(nextValue)
		setColor(getColorInputValue(normalizedColor))
		if (normalizedColor === normalizeHexColor(labelDetail.hex_color || labelDetail.hexColor || '')) {
			return
		}

		await saveLabelDetailPatch({hex_color: normalizedColor})
	}

	return (
		<DetailSheet open={labelDetailOpen} closeAction="close-label-detail" onClose={closeLabelDetail}>
			<div className="sheet-head">
				<div>
					<div className="panel-label">Label Detail</div>
					<div className="panel-title">{labelDetail ? labelDetail.title : 'Loading…'}</div>
				</div>
			</div>
			{labelDetail ? (
				<div className="detail-grid">
					<label className="detail-item detail-item-full detail-field">
						<div className="detail-label">Title</div>
						<input
							className="detail-input"
							data-label-detail-title
							type="text"
							value={title}
							onChange={event => setTitle(event.currentTarget.value)}
							onBlur={() => void handleTitleBlur()}
							onKeyDown={event => {
								if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
									event.preventDefault()
									event.currentTarget.blur()
								}
							}}
						/>
					</label>
					<label className="detail-item detail-field">
						<div className="detail-label">Color</div>
						<input
							className="detail-input detail-color-input"
							data-label-detail-color
							type="color"
							value={color}
							onChange={event => void handleColorChange(event.currentTarget.value)}
						/>
					</label>
					<div className="detail-item detail-field">
						<div className="detail-label">Identifier</div>
						<div className="detail-value">#{labelDetail.id}</div>
					</div>
					<div className="detail-item detail-item-full detail-field">
						<div className="detail-label">Actions</div>
						<div className="detail-actions">
							<button
								className="pill-button danger-button"
								data-action="delete-label"
								data-label-id={labelDetail.id}
								type="button"
								onClick={() => void deleteLabel(labelDetail.id)}
							>
								Delete label
							</button>
						</div>
					</div>
				</div>
			) : null}
		</DetailSheet>
	)
}

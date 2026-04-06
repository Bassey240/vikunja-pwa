import type {Label} from '@/types'
import {normalizeLabelColor, pickLabelTextColor} from '@/utils/color-helpers'

export default function LabelBadge({label}: {label: Label}) {
	const background = normalizeLabelColor(label.hex_color || label.hexColor || '')
	const textColor = pickLabelTextColor(background)

	return (
		<div
			className="label-chip"
			style={{
				background,
				color: textColor,
			}}
		>
			<span>{label.title}</span>
		</div>
	)
}

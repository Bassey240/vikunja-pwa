import type {Label} from '@/types'

export default function LabelBadge({label}: {label: Label}) {
	const hex = label.hex_color || label.hexColor || ''
	const background = hex ? (hex.startsWith('#') ? hex : `#${hex}`) : '#dbe8ff'
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

function pickLabelTextColor(hex: string) {
	const normalized = hex.replace('#', '')
	if (normalized.length !== 6) {
		return '#170f0d'
	}

	const red = parseInt(normalized.slice(0, 2), 16)
	const green = parseInt(normalized.slice(2, 4), 16)
	const blue = parseInt(normalized.slice(4, 6), 16)
	const brightness = (red * 299 + green * 587 + blue * 114) / 1000

	return brightness > 170 ? '#170f0d' : '#fff7f1'
}

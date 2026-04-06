import {
	DEFAULT_LABEL_BG,
	LABEL_TEXT_DARK,
	LABEL_TEXT_LIGHT,
} from '@/utils/color-constants'

export function normalizeLabelColor(value: string | null | undefined) {
	const hex = `${value || ''}`.trim()
	if (!hex) {
		return DEFAULT_LABEL_BG
	}

	return hex.startsWith('#') ? hex : `#${hex}`
}

export function pickLabelTextColor(hex: string) {
	const normalized = hex.replace('#', '')
	if (normalized.length !== 6) {
		return LABEL_TEXT_DARK
	}

	const red = parseInt(normalized.slice(0, 2), 16)
	const green = parseInt(normalized.slice(2, 4), 16)
	const blue = parseInt(normalized.slice(4, 6), 16)
	const brightness = (red * 299 + green * 587 + blue * 114) / 1000

	return brightness > 170 ? LABEL_TEXT_DARK : LABEL_TEXT_LIGHT
}

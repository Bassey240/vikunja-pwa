const MIN_POSITION_SPACING = 0.01

export function calculateTaskPosition(
	positionBefore: number | null = null,
	positionAfter: number | null = null,
) {
	if (positionBefore !== null && positionAfter !== null && positionBefore === positionAfter) {
		return positionAfter + MIN_POSITION_SPACING
	}

	if (positionBefore === null) {
		if (positionAfter === null) {
			return 0
		}

		return positionAfter / 2
	}

	if (positionAfter === null) {
		return positionBefore + Math.pow(2, 16)
	}

	return positionBefore + (positionAfter - positionBefore) / 2
}

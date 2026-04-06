export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isMissingRouteError(error: unknown): boolean {
	if (!isRecord(error)) {
		return false
	}

	if (error.statusCode === 404) {
		return true
	}

	const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
	return message.includes('route not found') || message.includes('not found')
}

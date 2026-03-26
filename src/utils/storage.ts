export function loadNumber(key: string) {
	const raw = localStorage.getItem(key)
	if (!raw) {
		return null
	}

	const parsed = Number(raw)
	return Number.isFinite(parsed) ? parsed : null
}

export function saveNumber(key: string, value: number | null | undefined) {
	if (value === null || typeof value === 'undefined') {
		localStorage.removeItem(key)
		return
	}

	localStorage.setItem(key, `${value}`)
}

export function loadJson<T>(key: string, fallback: T) {
	const raw = localStorage.getItem(key)
	if (!raw) {
		return fallback
	}

	try {
		return JSON.parse(raw) as T
	} catch {
		return fallback
	}
}

export function saveJson(key: string, value: unknown) {
	if (value === null || typeof value === 'undefined') {
		localStorage.removeItem(key)
		return
	}

	localStorage.setItem(key, JSON.stringify(value))
}

export function loadString(key: string, fallback = '') {
	const raw = localStorage.getItem(key)
	return raw ?? fallback
}

export function saveString(key: string, value: string | null | undefined) {
	if (!value) {
		localStorage.removeItem(key)
		return
	}

	localStorage.setItem(key, value)
}

export function clearLegacyUiState() {
	localStorage.removeItem('vikunja-mobile-poc:expanded-project-ids')
}

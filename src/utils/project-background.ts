import type {Project, UserFrontendSettings} from '@/types'

function hasOwn(value: object, key: string) {
	return Object.prototype.hasOwnProperty.call(value, key)
}

export function getProjectBackgroundInformation(project: Partial<Project> | null | undefined) {
	if (!project || typeof project !== 'object') {
		return null
	}

	if (hasOwn(project, 'backgroundInformation')) {
		return project.backgroundInformation ?? null
	}

	if (hasOwn(project, 'background_information')) {
		return project.background_information ?? null
	}

	return null
}

export function getProjectBackgroundBlurHash(project: Partial<Project> | null | undefined) {
	if (!project || typeof project !== 'object') {
		return null
	}

	const blurHash = project.backgroundBlurHash ?? project.background_blur_hash
	return typeof blurHash === 'string' && blurHash.trim() ? blurHash.trim() : null
}

export function projectHasBackground(project: Partial<Project> | null | undefined) {
	if (!project || typeof project !== 'object') {
		return false
	}

	if (hasOwn(project, 'backgroundInformation') || hasOwn(project, 'background_information')) {
		return getProjectBackgroundInformation(project) !== null
	}

	return project.has_background === true
}

export function getProjectBackgroundBrightness(frontendSettings: UserFrontendSettings | null | undefined) {
	const brightnessValue = frontendSettings?.backgroundBrightness ?? frontendSettings?.background_brightness
	const numericBrightness = Number(brightnessValue)

	if (!Number.isFinite(numericBrightness)) {
		return 100
	}

	return Math.min(100, Math.max(0, numericBrightness))
}

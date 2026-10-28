/* Avatar upload constraints. Vikunja 2.4 rejects images it cannot decode —
 * notably SVG — with a 400 ("Reject non-decodable images (e.g. SVG) on avatar
 * upload with 400"), and shares that logic between the v1 and v2 handlers, so
 * it applies to the routes this app uses today. Kept pure and alias-free so
 * node can unit-test it. */

export const AVATAR_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'

export const AVATAR_UPLOAD_REJECTED_MESSAGE =
	'That image format is not supported. Use a PNG, JPEG, GIF, or WebP file.'

const SUPPORTED_AVATAR_MIME_TYPES = AVATAR_UPLOAD_ACCEPT.split(',')

interface AvatarFileLike {
	name?: string
	type?: string
	size?: number
}

export function getUnsupportedAvatarFileMessage(file: AvatarFileLike | null | undefined) {
	const type = `${file?.type || ''}`.trim().toLowerCase()
	if (type) {
		return SUPPORTED_AVATAR_MIME_TYPES.includes(type) ? null : AVATAR_UPLOAD_REJECTED_MESSAGE
	}

	// Some browsers report an empty type for .svg picked through a file dialog.
	const name = `${file?.name || ''}`.trim().toLowerCase()
	const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
	const supportedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp']
	return supportedExtensions.includes(extension) ? null : AVATAR_UPLOAD_REJECTED_MESSAGE
}

export function describeAvatarUploadFailure(error: {statusCode?: number | null; message?: string} | null | undefined) {
	if (error?.statusCode === 400) {
		return AVATAR_UPLOAD_REJECTED_MESSAGE
	}
	return error?.message || 'Something went wrong.'
}

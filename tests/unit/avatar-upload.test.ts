import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
	AVATAR_UPLOAD_ACCEPT,
	AVATAR_UPLOAD_REJECTED_MESSAGE,
	describeAvatarUploadFailure,
	getUnsupportedAvatarFileMessage,
} from '../../src/utils/avatar-upload.ts'

function fileLike(name: string, type: string, size = 128) {
	return {name, type, size}
}

test('the accept list excludes SVG, which 2.4 rejects as non-decodable', () => {
	assert.ok(!AVATAR_UPLOAD_ACCEPT.includes('svg'))
	for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
		assert.ok(AVATAR_UPLOAD_ACCEPT.includes(mime), mime)
	}
})

test('SVG files are rejected before upload', () => {
	assert.equal(
		getUnsupportedAvatarFileMessage(fileLike('me.svg', 'image/svg+xml')),
		AVATAR_UPLOAD_REJECTED_MESSAGE,
	)
})

test('extension-only SVGs are caught even when the browser reports no MIME type', () => {
	assert.equal(
		getUnsupportedAvatarFileMessage(fileLike('me.svg', '')),
		AVATAR_UPLOAD_REJECTED_MESSAGE,
	)
})

test('supported raster images pass', () => {
	assert.equal(getUnsupportedAvatarFileMessage(fileLike('me.png', 'image/png')), null)
	assert.equal(getUnsupportedAvatarFileMessage(fileLike('me.jpg', 'image/jpeg')), null)
	assert.equal(getUnsupportedAvatarFileMessage(fileLike('me.webp', 'image/webp')), null)
})

test('non-images are rejected', () => {
	assert.equal(
		getUnsupportedAvatarFileMessage(fileLike('notes.pdf', 'application/pdf')),
		AVATAR_UPLOAD_REJECTED_MESSAGE,
	)
})

test('an upstream 400 is mapped to the same friendly message', () => {
	assert.equal(
		describeAvatarUploadFailure({statusCode: 400, message: 'invalid image'}),
		AVATAR_UPLOAD_REJECTED_MESSAGE,
	)
})

test('other failures keep their own message', () => {
	assert.equal(
		describeAvatarUploadFailure({statusCode: 413, message: 'File is too large.'}),
		'File is too large.',
	)
	assert.equal(
		describeAvatarUploadFailure({statusCode: 500, message: ''}),
		'Something went wrong.',
	)
})

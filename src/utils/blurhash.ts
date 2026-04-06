import {decode} from 'blurhash'

export async function getBlobFromBlurHash(blurHash: string): Promise<Blob | null> {
	const normalized = `${blurHash || ''}`.trim()
	if (!normalized) {
		return null
	}

	const pixels = decode(normalized, 32, 32)
	const canvas = document.createElement('canvas')
	canvas.width = 32
	canvas.height = 32
	const ctx = canvas.getContext('2d')
	if (ctx === null) {
		return null
	}

	const imageData = ctx.createImageData(32, 32)
	imageData.data.set(pixels)
	ctx.putImageData(imageData, 0, 0)

	return new Promise((resolve, reject) => {
		canvas.toBlob(blob => {
			if (blob === null) {
				reject(new Error('Failed to encode blur-hash preview.'))
				return
			}

			resolve(blob)
		})
	})
}

const MAX_BODY_BYTES = 1024 * 1024

export async function readJsonBody(req) {
	const chunks = []
	let totalBytes = 0
	for await (const chunk of req) {
		totalBytes += chunk.byteLength
		if (totalBytes > MAX_BODY_BYTES) {
			const error = new Error('Request body exceeds the 1 MB limit.')
			error.statusCode = 413
			throw error
		}

		chunks.push(chunk)
	}

	const buffer = chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks, totalBytes)
	if (buffer.byteLength === 0) {
		return {}
	}

	return JSON.parse(buffer.toString('utf8'))
}

export async function readRawBody(req) {
	const chunks = []
	for await (const chunk of req) {
		chunks.push(chunk)
	}

	if (chunks.length === 0) {
		return Buffer.alloc(0)
	}

	return Buffer.concat(chunks)
}

export function sendJson(res, statusCode, payload, headers = {}) {
	res.writeHead(statusCode, {
		'Content-Type': 'application/json; charset=utf-8',
		...headers,
	})
	res.end(JSON.stringify(payload))
}

export function sendBuffer(res, statusCode, payload, headers = {}) {
	res.writeHead(statusCode, headers)
	res.end(payload)
}

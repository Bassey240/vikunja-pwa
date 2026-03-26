export function parseCookies(header = '') {
	const pairs = header.split(/;\s*/)
	const cookies = {}

	for (const pair of pairs) {
		if (!pair) {
			continue
		}

		const index = pair.indexOf('=')
		if (index === -1) {
			continue
		}

		const key = decodeURIComponent(pair.slice(0, index).trim())
		const value = decodeURIComponent(pair.slice(index + 1).trim())
		cookies[key] = value
	}

	return cookies
}

export function serializeCookie(name, value, options = {}) {
	const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]

	if (options.maxAge) {
		parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
	}

	if (options.expires instanceof Date) {
		parts.push(`Expires=${options.expires.toUTCString()}`)
	}

	parts.push(`Path=${options.path || '/'}`)

	if (options.httpOnly !== false) {
		parts.push('HttpOnly')
	}

	if (options.sameSite) {
		parts.push(`SameSite=${options.sameSite}`)
	}

	if (options.secure) {
		parts.push('Secure')
	}

	return parts.join('; ')
}

export function clearCookie(name, options = {}) {
	return serializeCookie(name, '', {
		...options,
		expires: new Date(0),
		maxAge: 0,
	})
}

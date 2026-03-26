export function createRateLimiter({
	windowMs = 60_000,
	max = 10,
} = {}) {
	const entries = new Map()

	return {
		consume(key) {
			const now = Date.now()
			const normalizedKey = `${key || 'anonymous'}`
			const current = entries.get(normalizedKey)

			if (!current || current.resetAt <= now) {
				const nextEntry = {
					count: 1,
					resetAt: now + windowMs,
				}
				entries.set(normalizedKey, nextEntry)
				prune(now)
				return buildResult(nextEntry, max, true)
			}

			current.count += 1
			prune(now)
			return buildResult(current, max, current.count <= max)
		},
	}

	function prune(now) {
		for (const [key, entry] of entries.entries()) {
			if (entry.resetAt <= now) {
				entries.delete(key)
			}
		}
	}
}

function buildResult(entry, max, allowed) {
	return {
		allowed,
		limit: max,
		remaining: Math.max(0, max - entry.count),
		resetAt: entry.resetAt,
		retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000)),
	}
}

import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from 'node:crypto'
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from 'node:fs'
import path from 'node:path'

const SESSION_STORE_VERSION = 1
const KEY_BYTE_LENGTH = 32
const IV_BYTE_LENGTH = 12
const AUTH_TAG_BYTE_LENGTH = 16
const TOUCH_PERSIST_WINDOW_MS = 60 * 1000

export function createSessionStore({
	ttlSeconds = 43200,
	filePath = '',
	keyPath = '',
} = {}) {
	const sessions = new Map()
	const persistenceEnabled = Boolean(filePath && keyPath)
	const encryptionKey = persistenceEnabled ? loadOrCreateEncryptionKey(keyPath) : null

	if (persistenceEnabled) {
		loadPersistedSessions()
	}

	return {
		create(data) {
			cleanupExpired()
			const id = randomBytes(32).toString('hex')
			const now = Date.now()
			sessions.set(id, {
				id,
				...data,
				createdAt: data.createdAt || new Date(now).toISOString(),
				expiresAt: now + ttlSeconds * 1000,
			})
			persistSessions()
			return id
		},

		get(id) {
			if (!id) {
				return null
			}

			const session = sessions.get(id)
			if (!session) {
				return null
			}

			if (session.expiresAt <= Date.now()) {
				sessions.delete(id)
				persistSessions()
				return null
			}

			const nextExpiresAt = Date.now() + ttlSeconds * 1000
			const shouldPersistTouch = nextExpiresAt - session.expiresAt > TOUCH_PERSIST_WINDOW_MS
			session.expiresAt = nextExpiresAt
			if (shouldPersistTouch) {
				persistSessions()
			}
			return session
		},

		update(id, patch) {
			const session = this.get(id)
			if (!session) {
				return null
			}

			Object.assign(session, patch)
			session.expiresAt = Date.now() + ttlSeconds * 1000
			persistSessions()
			return session
		},

		delete(id) {
			if (!sessions.has(id)) {
				return
			}

			sessions.delete(id)
			persistSessions()
		},

		getStats() {
			cleanupExpired()
			return {
				count: sessions.size,
				persistenceEnabled,
				ttlSeconds,
				filePath,
				keyPath,
			}
		},
	}

	function cleanupExpired() {
		let changed = false
		const now = Date.now()
		for (const [id, session] of sessions.entries()) {
			if (session.expiresAt <= now) {
				sessions.delete(id)
				changed = true
			}
		}

		if (changed) {
			persistSessions()
		}
	}

	function loadPersistedSessions() {
		try {
			if (!existsSync(filePath)) {
				return
			}

			const encrypted = readFileSync(filePath)
			if (!encrypted || encrypted.length <= IV_BYTE_LENGTH + AUTH_TAG_BYTE_LENGTH) {
				return
			}

			const payload = JSON.parse(decryptPayload(encryptionKey, encrypted))
			if (payload?.version !== SESSION_STORE_VERSION || !Array.isArray(payload?.sessions)) {
				return
			}

			const now = Date.now()
			for (const session of payload.sessions) {
				if (!session?.id || session.expiresAt <= now) {
					continue
				}

				sessions.set(session.id, session)
			}
		} catch (error) {
			console.error('Failed to load persisted app sessions:', error)
		}
	}

	function persistSessions() {
		if (!persistenceEnabled) {
			return
		}

		try {
			ensureParentDirectory(filePath)
			const payload = Buffer.from(JSON.stringify({
				version: SESSION_STORE_VERSION,
				sessions: [...sessions.values()],
			}))
			const encrypted = encryptPayload(encryptionKey, payload)
			const tempPath = `${filePath}.tmp`
			writeFileSync(tempPath, encrypted)
			chmodSync(tempPath, 0o600)
			renameSync(tempPath, filePath)
			chmodSync(filePath, 0o600)
		} catch (error) {
			console.error('Failed to persist app sessions:', error)
		}
	}
}

function loadOrCreateEncryptionKey(keyPath) {
	ensureParentDirectory(keyPath)

	if (existsSync(keyPath)) {
		return normalizeEncryptionKey(readFileSync(keyPath))
	}

	const key = randomBytes(KEY_BYTE_LENGTH)
	writeFileSync(keyPath, key.toString('hex'))
	chmodSync(keyPath, 0o600)
	return key
}

function normalizeEncryptionKey(rawValue) {
	const trimmed = `${rawValue || ''}`.trim()
	if (!trimmed) {
		throw new Error('Session store encryption key file is empty.')
	}

	if (/^[0-9a-f]{64}$/i.test(trimmed)) {
		return Buffer.from(trimmed, 'hex')
	}

	return createHash('sha256').update(trimmed).digest()
}

function encryptPayload(key, payload) {
	const iv = randomBytes(IV_BYTE_LENGTH)
	const cipher = createCipheriv('aes-256-gcm', key, iv)
	const ciphertext = Buffer.concat([
		cipher.update(payload),
		cipher.final(),
	])
	const authTag = cipher.getAuthTag()
	return Buffer.concat([iv, authTag, ciphertext])
}

function decryptPayload(key, encryptedPayload) {
	const iv = encryptedPayload.subarray(0, IV_BYTE_LENGTH)
	const authTag = encryptedPayload.subarray(IV_BYTE_LENGTH, IV_BYTE_LENGTH + AUTH_TAG_BYTE_LENGTH)
	const ciphertext = encryptedPayload.subarray(IV_BYTE_LENGTH + AUTH_TAG_BYTE_LENGTH)
	const decipher = createDecipheriv('aes-256-gcm', key, iv)
	decipher.setAuthTag(authTag)
	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString('utf8')
}

function ensureParentDirectory(filePath) {
	mkdirSync(path.dirname(filePath), {recursive: true, mode: 0o700})
}

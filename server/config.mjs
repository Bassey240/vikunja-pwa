import {readFileSync} from 'node:fs'
import path from 'node:path'

export function loadConfig(rootDir) {
	const env = {
		...loadDotEnv(path.join(rootDir, '.env')),
		...process.env,
	}

	const host = env.HOST || '0.0.0.0'
	const port = Number(env.PORT || 4300)
	const httpsKeyPath = resolveDataPath(rootDir, env.APP_HTTPS_KEY_PATH || '')
	const httpsCertPath = resolveDataPath(rootDir, env.APP_HTTPS_CERT_PATH || '')
	const httpsEnabled = Boolean(httpsKeyPath && httpsCertPath)
	const legacyBaseUrl = normalizeBaseUrl(env.VIKUNJA_BASE_URL || '')
	const defaultBaseUrl = normalizeBaseUrl(env.VIKUNJA_DEFAULT_BASE_URL || env.VIKUNJA_BASE_URL || '')
	const bridgeMode = normalizeBridgeMode(env.VIKUNJA_BRIDGE_MODE || (env.VIKUNJA_SSH_DESTINATION ? 'ssh-docker-exec' : ''))
	const hostConfigPathValue = `${env.VIKUNJA_HOST_CONFIG_PATH || ''}`.trim()
	const composePathValue = `${env.VIKUNJA_COMPOSE_PATH || ''}`.trim()
	const hostConfigPath = hostConfigPathValue
		? bridgeMode === 'ssh-docker-exec'
			? hostConfigPathValue
			: resolveDataPath(rootDir, hostConfigPathValue)
		: ''
	const composePath = composePathValue
		? bridgeMode === 'ssh-docker-exec'
			? composePathValue
			: resolveDataPath(rootDir, composePathValue)
		: ''
	const publicAppOrigin =
		normalizeOrigin(env.APP_PUBLIC_ORIGIN || '') ||
		normalizeOrigin(`127.0.0.1:${port}`) ||
		null

	return {
		env,
		host,
		port,
		httpsEnabled,
		httpsKeyPath,
		httpsCertPath,
		vikunjaBaseUrl: legacyBaseUrl,
		vikunjaApiToken: env.VIKUNJA_API_TOKEN || '',
		defaultVikunjaBaseUrl: defaultBaseUrl,
		appTrustProxy: parseBoolean(env.APP_TRUST_PROXY, false),
		publicAppOrigin,
		cookieSecure: parseBoolean(env.COOKIE_SECURE, httpsEnabled),
		appSessionTtlSeconds: Number(env.APP_SESSION_TTL_SECONDS || 2592000),
		appSessionStorePath: resolveDataPath(rootDir, env.APP_SESSION_STORE_PATH || '.data/app-sessions.enc'),
		appSessionKeyPath: resolveDataPath(rootDir, env.APP_SESSION_KEY_PATH || '.data/app-sessions.key'),
		logRequests: parseBoolean(env.LOG_REQUESTS, true),
		healthcheckUpstreamTimeoutMs: Number(env.HEALTHCHECK_UPSTREAM_TIMEOUT_MS || 3000),
		loginRateLimitWindowSeconds: Number(env.LOGIN_RATE_LIMIT_WINDOW_SECONDS || 300),
		loginRateLimitMax: Number(env.LOGIN_RATE_LIMIT_MAX || 10),
		sessionMutationRateLimitWindowSeconds: Number(env.SESSION_MUTATION_RATE_LIMIT_WINDOW_SECONDS || 60),
		sessionMutationRateLimitMax: Number(env.SESSION_MUTATION_RATE_LIMIT_MAX || 30),
		vikunjaBridgeMode: bridgeMode,
		vikunjaContainerName: `${env.VIKUNJA_CONTAINER_NAME || 'vikunja'}`.trim(),
		vikunjaCliPath: `${env.VIKUNJA_CLI_PATH || '/app/vikunja/vikunja'}`.trim(),
		vikunjaSshDestination: `${env.VIKUNJA_SSH_DESTINATION || ''}`.trim(),
		vikunjaSshPort: Number(env.VIKUNJA_SSH_PORT || 22),
		vikunjaSshKeyPath: `${env.VIKUNJA_SSH_KEY_PATH || ''}`.trim(),
		vikunjaHostConfigPath: hostConfigPath,
		vikunjaComposePath: composePath,
		adminBridgeAllowedEmails: parseCommaSeparatedList(env.ADMIN_BRIDGE_ALLOWED_EMAILS || ''),
		bridgeTimeoutMs: Number(env.VIKUNJA_BRIDGE_TIMEOUT_MS || env.VCANYA_BRIDGE_TIMEOUT_MS || 10000),
	}
}

function loadDotEnv(filePath) {
	try {
		const content = readFileSyncSafe(filePath)
		if (content === null) {
			return {}
		}

		return content
			.split(/\r?\n/)
			.map(line => line.trim())
			.filter(line => line && !line.startsWith('#'))
			.reduce((result, line) => {
				const index = line.indexOf('=')
				if (index === -1) {
					return result
				}

				const key = line.slice(0, index).trim()
				let value = line.slice(index + 1).trim()
				if (
					(value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))
				) {
					value = value.slice(1, -1)
				}

				result[key] = value
				return result
			}, {})
	} catch {
		return {}
	}
}

function readFileSyncSafe(filePath) {
	try {
		return readFileSync(filePath, 'utf8')
	} catch {
		return null
	}
}

function normalizeBaseUrl(value) {
	if (!value) {
		return ''
	}

	let normalized = value.trim().replace(/\/+$/, '')
	if (!/^https?:\/\//.test(normalized)) {
		normalized = `http://${normalized}`
	}
	if (!normalized.endsWith('/api/v1')) {
		normalized = `${normalized}/api/v1`
	}
	return normalized
}

function parseBoolean(value, fallback) {
	if (typeof value === 'undefined' || value === null || value === '') {
		return fallback
	}

	return `${value}`.toLowerCase() === 'true'
}

function normalizeBridgeMode(value) {
	const normalized = `${value || ''}`.trim()
	if (normalized === 'ssh-docker-exec') {
		return 'ssh-docker-exec'
	}
	if (normalized === 'docker-exec') {
		return 'docker-exec'
	}
	return ''
}

function resolveDataPath(rootDir, value) {
	const normalized = `${value || ''}`.trim()
	if (!normalized) {
		return ''
	}

	return path.isAbsolute(normalized) ? normalized : path.join(rootDir, normalized)
}

function normalizeOrigin(value) {
	const trimmed = `${value || ''}`.trim()
	if (!trimmed) {
		return ''
	}

	let normalized = trimmed
	if (!/^[a-z]+:\/\//i.test(normalized)) {
		normalized = `http://${normalized}`
	}

	try {
		return new URL(normalized).origin
	} catch {
		return ''
	}
}

function parseCommaSeparatedList(value) {
	return `${value || ''}`
		.split(',')
		.map(entry => entry.trim().toLowerCase())
		.filter(Boolean)
}

export {normalizeBaseUrl}

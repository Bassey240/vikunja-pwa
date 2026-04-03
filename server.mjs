import http from 'node:http'
import https from 'node:https'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createAdminBridge} from './server/admin-bridge.mjs'
import {createAdminConfig} from './server/admin-config.mjs'
import {loadConfig, normalizeBaseUrl} from './server/config.mjs'
import {parseCookies, serializeCookie, clearCookie} from './server/cookies.mjs'
import {readJsonBody, readRawBody, sendBuffer, sendJson} from './server/http.mjs'
import {createRateLimiter} from './server/rate-limit.mjs'
import {createSessionStore} from './server/session-store.mjs'
import {serveStatic} from './server/static.mjs'
import {
	authenticateLinkShare,
	createApiTokenAccount,
	createLinkShareAccount,
	createPasswordAccount,
	createVikunjaClient,
} from './server/vikunja-client.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = process.env.PUBLIC_DIR || path.join(__dirname, 'dist')
const {
	host,
	port,
	httpsEnabled,
	httpsKeyPath,
	httpsCertPath,
	vikunjaBaseUrl,
	vikunjaApiToken,
	defaultVikunjaBaseUrl,
	appTrustProxy,
	publicAppOrigin,
	cookieSecure,
	appSessionTtlSeconds,
	appSessionStorePath,
	appSessionKeyPath,
	logRequests,
	healthcheckUpstreamTimeoutMs,
	loginRateLimitWindowSeconds,
	loginRateLimitMax,
	sessionMutationRateLimitWindowSeconds,
	sessionMutationRateLimitMax,
	vikunjaBridgeMode,
	vikunjaContainerName,
	vikunjaCliPath,
	vikunjaSshDestination,
	vikunjaSshPort,
	vikunjaSshKeyPath,
	vikunjaHostConfigPath,
	vikunjaComposePath,
	adminBridgeAllowedEmails,
	bridgeTimeoutMs,
} = loadConfig(__dirname)

const appSessionCookieName = 'vikunja_pwa_session'
const ignoreLegacyCookieName = 'vikunja_pwa_ignore_legacy'
const serverStartedAt = Date.now()
const sessionStore = createSessionStore({
	ttlSeconds: appSessionTtlSeconds,
	filePath: appSessionStorePath,
	keyPath: appSessionKeyPath,
})
const accountRefreshOperations = new Map()
const loginRateLimiter = createRateLimiter({
	windowMs: loginRateLimitWindowSeconds * 1000,
	max: loginRateLimitMax,
})
const sessionMutationRateLimiter = createRateLimiter({
	windowMs: sessionMutationRateLimitWindowSeconds * 1000,
	max: sessionMutationRateLimitMax,
})
const legacyConfigured = Boolean(vikunjaBaseUrl && vikunjaApiToken)
const buildId = '2026-04-03-hotfix-0.3.1'
const adminBridge = createAdminBridge({
	bridgeMode: vikunjaBridgeMode,
	vikunjaContainerName,
	vikunjaCliPath,
	vikunjaSshDestination,
	vikunjaSshPort,
	vikunjaSshKeyPath,
	adminBridgeAllowedEmails,
	bridgeTimeoutMs,
})
const adminConfig = createAdminConfig({
	bridgeMode: vikunjaBridgeMode,
	vikunjaContainerName,
	vikunjaSshDestination,
	vikunjaSshPort,
	vikunjaSshKeyPath,
	bridgeTimeoutMs,
	hostConfigPath: vikunjaHostConfigPath,
	composePath: vikunjaComposePath,
})

const requestHandler = async (req, res) => {
	const requestId = randomUUID()
	const startedAt = Date.now()
	res.setHeader('X-Request-Id', requestId)
	setSecurityHeaders(res)
	attachRequestLogging(req, res, requestId, startedAt)

	try {
		const protocol = req.socket?.encrypted ? 'https' : 'http'
		const url = new URL(req.url || '/', `${protocol}://${req.headers.host || '127.0.0.1'}`)

		if (url.pathname === '/health' && req.method === 'GET') {
			await handleHealth(req, res)
			return
		}

		const resetRedirect = url.pathname.match(/^\/user\/password\/reset\/([^/]+)$/)
		if (resetRedirect && req.method === 'GET') {
			const token = encodeURIComponent(resetRedirect[1])
			const baseUrl = encodeURIComponent(normalizeBaseUrl(defaultVikunjaBaseUrl || ''))
			res.writeHead(302, {
				Location: `/auth/reset-password?token=${token}&baseUrl=${baseUrl}`,
			})
			res.end()
			return
		}

		if (url.pathname.startsWith('/api/')) {
			await handleApi(req, res, url)
			return
		}

		await serveStatic(publicDir, res, url, sendJson)
	} catch (error) {
		logError('request.error', {
			requestId,
			method: req.method || 'GET',
			path: req.url || '/',
			statusCode: error.statusCode || 500,
			message: error.message || 'Internal server error',
			details: error.details || null,
			stack: error.stack || null,
		})
		sendJson(res, error.statusCode || 500, {
			error: error.message || 'Internal server error',
			details: error.details || null,
		})
	}
}

const server = httpsEnabled
	? https.createServer(
			{
				key: readFileSync(httpsKeyPath),
				cert: readFileSync(httpsCertPath),
			},
			requestHandler,
		)
	: http.createServer(requestHandler)

server.listen(port, host, () => {
	logInfo('server.start', {
		protocol: httpsEnabled ? 'https' : 'http',
		host,
		port,
		buildId,
		defaultVikunjaBaseUrl: defaultVikunjaBaseUrl || null,
	})
	if (legacyConfigured) {
		logWarn('server.legacy_mode', {
			message:
				'Legacy VIKUNJA_BASE_URL/VIKUNJA_API_TOKEN mode is active. This is a development fallback only and is not recommended for production.',
		})
	}
	if (!defaultVikunjaBaseUrl && !legacyConfigured) {
		logInfo('server.notice', {
			message: 'No default Vikunja server is configured. Connect an account from Settings.',
		})
	}
})

async function handleApi(req, res, url) {
	if (req.method === 'OPTIONS') {
		assertTrustedOrigin(req)
		res.writeHead(204, {
			'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		})
		res.end()
		return
	}

	assertTrustedOrigin(req)

	if (url.pathname === '/api/config' && req.method === 'GET') {
		sendJson(res, 200, {
			configured: legacyConfigured,
			baseUrl: defaultVikunjaBaseUrl || null,
			defaultBaseUrl: defaultVikunjaBaseUrl || null,
			publicAppOrigin,
			legacyConfigured,
			buildId,
			authModes: ['password', 'apiToken'],
			features: {
				adminBridgeMode: adminBridge.getPublicConfig().mode,
				httpsEnabled,
			},
		})
		return
	}

	if (url.pathname === '/api/instance-info' && req.method === 'GET') {
		const rawBase = url.searchParams.get('baseUrl') || ''
		const probeUrl = normalizeBaseUrl(rawBase)
		if (!probeUrl) {
			sendJson(res, 400, {error: 'baseUrl is required.'})
			return
		}

		let infoRes
		try {
			infoRes = await fetch(new URL('info', `${probeUrl}/`), {
				headers: {
					Accept: 'application/json',
				},
			})
		} catch {
			sendJson(res, 502, {error: 'Could not reach Vikunja instance.'})
			return
		}

		if (!infoRes.ok) {
			sendJson(res, infoRes.status, {error: 'Could not reach Vikunja instance.'})
			return
		}

		const info = await infoRes.json().catch(() => ({}))
		sendJson(res, 200, info)
		return
	}

	if (url.pathname === '/api/session' && req.method === 'GET') {
		const context = await getVikunjaContext(req, res)
		if (!context) {
			sendJson(res, 200, {
				connected: false,
				account: null,
			})
			return
		}

		sendJson(res, 200, {
			connected: true,
			account: summarizeAccount(context.account, context.source),
		})
		return
	}

	if (url.pathname === '/api/session/auth-info' && req.method === 'GET') {
		const baseUrl = normalizeBaseUrl(url.searchParams.get('baseUrl') || defaultVikunjaBaseUrl || '')
		if (!baseUrl) {
			sendJson(res, 400, {error: 'A Vikunja base URL is required.'})
			return
		}

		sendJson(res, 200, await fetchUpstreamAuthInfo(baseUrl))
		return
	}

	if (url.pathname === '/api/session/login' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, loginRateLimiter, 'login')) {
			return
		}

		const body = await readJsonBody(req)
		const authMode = body.authMode === 'apiToken' ? 'apiToken' : 'password'
		const baseUrl = normalizeBaseUrl(body.baseUrl || defaultVikunjaBaseUrl || '')

		if (!baseUrl) {
			sendJson(res, 400, {error: 'A Vikunja base URL is required.'})
			return
		}

		let account
		if (authMode === 'password') {
			const username = `${body.username || ''}`.trim()
			const password = `${body.password || ''}`
			const totpPasscode = `${body.totpPasscode || ''}`.trim()
			if (!username || !password) {
				sendJson(res, 400, {error: 'Username and password are required.'})
				return
			}

			account = await createPasswordAccount({
				baseUrl,
				username,
				password,
				totpPasscode,
			})
			account = await hydrateOperatorAccountIdentity(account)
		} else {
			const apiToken = `${body.apiToken || ''}`.trim()
			if (!apiToken) {
				sendJson(res, 400, {error: 'An API token is required.'})
				return
			}

			account = await createApiTokenAccount({
				baseUrl,
				apiToken,
			})
		}

		const currentSessionId = getAppSessionId(req)
		if (currentSessionId) {
			sessionStore.delete(currentSessionId)
		}

		const nextSessionId = sessionStore.create({account})
		sendJson(
			res,
			200,
			{
				connected: true,
				account: summarizeAccount(account, 'account'),
			},
			{
				'Set-Cookie': [
					buildAppSessionCookie(nextSessionId),
					clearCookie(ignoreLegacyCookieName, {
						httpOnly: true,
						sameSite: 'Strict',
						secure: cookieSecure,
						path: '/',
					}),
				],
			},
		)
		return
	}

	if (url.pathname === '/api/session/register' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, loginRateLimiter, 'register')) {
			return
		}

		const body = await readJsonBody(req)
		const baseUrl = normalizeBaseUrl(body.baseUrl || '')
		if (!baseUrl) {
			sendJson(res, 400, {error: 'A Vikunja base URL is required.'})
			return
		}

		const username = `${body.username || ''}`.trim()
		const email = `${body.email || ''}`.trim()
		const password = `${body.password || ''}`
		if (!username || !email || !password) {
			sendJson(res, 400, {error: 'Username, email, and password are required.'})
			return
		}

		const authInfo = await fetchUpstreamAuthInfo(baseUrl)
		if (authInfo.localEnabled === false) {
			sendJson(res, 403, {error: 'This Vikunja server does not allow password account creation.'})
			return
		}
		if (authInfo.registrationEnabled === false) {
			sendJson(res, 403, {error: 'This Vikunja server does not allow self-registration.'})
			return
		}

		const registerRes = await fetch(new URL('register', `${baseUrl}/`), {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				username,
				email,
				password,
			}),
		})

		if (!registerRes.ok) {
			const payload = await registerRes.json().catch(() => ({}))
			sendJson(res, registerRes.status, {
				error: payload.message || payload.error || 'Registration failed.',
			})
			return
		}

		const account = await createPasswordAccount({
			baseUrl,
			username,
			password,
		})
		const hydratedAccount = await hydrateOperatorAccountIdentity(account)

		const currentSessionId = getAppSessionId(req)
		if (currentSessionId) {
			sessionStore.delete(currentSessionId)
		}

		const nextSessionId = sessionStore.create({account: hydratedAccount})
		sendJson(
			res,
			200,
			{
				connected: true,
				account: summarizeAccount(hydratedAccount, 'account'),
			},
			{
				'Set-Cookie': [
					buildAppSessionCookie(nextSessionId),
					clearCookie(ignoreLegacyCookieName, {
						httpOnly: true,
						sameSite: 'Strict',
						secure: cookieSecure,
						path: '/',
					}),
				],
			},
		)
		return
	}

	if (url.pathname === '/api/session/forgot-password' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, loginRateLimiter, 'forgot-password')) {
			return
		}

		const body = await readJsonBody(req)
		const baseUrl = normalizeBaseUrl(body.baseUrl || '')
		if (!baseUrl) {
			sendJson(res, 400, {error: 'A Vikunja base URL is required.'})
			return
		}

		const email = `${body.email || ''}`.trim()
		if (!email) {
			sendJson(res, 400, {error: 'Email is required.'})
			return
		}

		await fetch(new URL('user/password/token', `${baseUrl}/`), {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({email}),
		}).catch(() => {})

		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/session/reset-password' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, loginRateLimiter, 'reset-password')) {
			return
		}

		const body = await readJsonBody(req)
		const baseUrl = normalizeBaseUrl(body.baseUrl || '')
		if (!baseUrl) {
			sendJson(res, 400, {error: 'A Vikunja base URL is required.'})
			return
		}

		const token = `${body.token || ''}`.trim()
		const password = `${body.password || ''}`
		if (!token || !password) {
			sendJson(res, 400, {error: 'Token and new password are required.'})
			return
		}

		const resetRes = await fetch(new URL('user/password/reset', `${baseUrl}/`), {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				token,
				new_password: password,
			}),
		})

		if (!resetRes.ok) {
			const payload = await resetRes.json().catch(() => ({}))
			sendJson(res, resetRes.status, {
				error: payload.message || payload.error || 'Password reset failed.',
			})
			return
		}

		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/session/logout' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const appSessionId = getAppSessionId(req)
		const session = sessionStore.get(appSessionId)

		if (session?.account?.authMode === 'password') {
			try {
				const client = createVikunjaClient({
					baseUrl: session.account.baseUrl,
					authMode: session.account.authMode,
					accessToken: session.account.accessToken,
					refreshCookie: session.account.refreshCookie,
					onAuthStateChange: patch => {
						const current = sessionStore.get(appSessionId)
						if (current) {
							sessionStore.update(appSessionId, {
								account: {
									...current.account,
									...patch,
								},
							})
						}
					},
				})
				await client.request('user/logout', {method: 'POST'})
			} catch {
				// Clear local state even if the upstream session is already gone.
			}
		}

		if (appSessionId) {
			sessionStore.delete(appSessionId)
		}

		sendJson(
			res,
			200,
			{ok: true},
			{
				'Set-Cookie': [
					clearCookie(appSessionCookieName, {
						httpOnly: true,
						sameSite: 'Strict',
						secure: cookieSecure,
						path: '/',
					}),
					serializeCookie(ignoreLegacyCookieName, '1', {
						httpOnly: true,
						sameSite: 'Strict',
						secure: cookieSecure,
						path: '/',
						maxAge: appSessionTtlSeconds,
					}),
				],
			},
		)
		return
	}

	const linkShareAuthMatch = url.pathname.match(/^\/api\/shares\/([^/]+)\/auth$/)
	if (linkShareAuthMatch && req.method === 'POST') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const body = await readJsonBody(req)
		const hash = decodeURIComponent(linkShareAuthMatch[1])
		const currentContext = await getVikunjaContext(req)
		const baseUrl = normalizeBaseUrl(currentContext?.account?.baseUrl || defaultVikunjaBaseUrl || vikunjaBaseUrl || '')

		if (!baseUrl) {
			sendJson(res, 400, {error: 'A Vikunja base URL is required.'})
			return
		}

		const {token, projectId} = await authenticateLinkShare({
			baseUrl,
			hash,
			password: `${body.password || ''}`,
		})
		const account = await createLinkShareAccount({
			baseUrl,
			token,
			projectId,
		})

		const currentSessionId = getAppSessionId(req)
		if (currentSessionId) {
			sessionStore.delete(currentSessionId)
		}

		const nextSessionId = sessionStore.create({account})
		sendJson(
			res,
			200,
			{
				connected: true,
				account: summarizeAccount(account, 'account'),
				projectId,
			},
			{
				'Set-Cookie': [
					buildAppSessionCookie(nextSessionId),
					clearCookie(ignoreLegacyCookieName, {
						httpOnly: true,
						sameSite: 'Strict',
						secure: cookieSecure,
						path: '/',
					}),
				],
			},
		)
		return
	}

	if (url.pathname === '/api/session/disconnect' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const appSessionId = getAppSessionId(req)
		if (appSessionId) {
			sessionStore.delete(appSessionId)
		}

		sendJson(
			res,
			200,
			{ok: true},
			{
				'Set-Cookie': [
					clearCookie(appSessionCookieName, {
						httpOnly: true,
						sameSite: 'Strict',
						secure: cookieSecure,
						path: '/',
					}),
					serializeCookie(ignoreLegacyCookieName, '1', {
						httpOnly: true,
						sameSite: 'Strict',
						secure: cookieSecure,
						path: '/',
						maxAge: appSessionTtlSeconds,
					}),
				],
			},
		)
		return
	}

	if (url.pathname === '/api/info' && req.method === 'GET') {
		const context = await requireVikunjaContext(req, res)
		const info = await context.client.request('info')
		sendJson(res, 200, info)
		return
	}

	if (url.pathname === '/api/user/deletion/confirm' && req.method === 'POST') {
		const context = await requireVikunjaContext(req, res)
		const body = await readJsonBody(req)
		const token = `${body.token || ''}`.trim()
		if (!token) {
			sendJson(res, 400, {error: 'Token is required.'})
			return
		}

		try {
			await context.client.request('user/deletion/confirm', {
				method: 'POST',
				body: {token},
			})
		} catch (error) {
			const statusCode = Number(error?.statusCode || 0) || 500
			const message =
				typeof error?.message === 'string' && error.message.trim()
					? error.message
					: 'Confirmation failed.'
			sendJson(res, statusCode, {error: message})
			return
		}

		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/session/legacy/restore' && req.method === 'POST') {
		sendJson(
			res,
			200,
			{ok: true},
			{
				'Set-Cookie': clearCookie(ignoreLegacyCookieName, {
					httpOnly: true,
					sameSite: 'Strict',
					secure: cookieSecure,
					path: '/',
				}),
			},
		)
		return
	}

	if (url.pathname === '/api/session/sessions' && req.method === 'GET') {
		const context = await requireInteractiveSession(req, res)
		const sessions = await context.client.fetchAllPages('user/sessions')
		sendJson(res, 200, {sessions})
		return
	}

	if (url.pathname === '/api/session/timezones' && req.method === 'GET') {
		const context = await requireVikunjaContext(req, res)
		const timezones = await context.client.request('user/timezones')
		sendJson(res, 200, {timezones})
		return
	}

	const remoteSessionMatch = url.pathname.match(/^\/api\/session\/sessions\/([^/]+)$/)
	if (remoteSessionMatch && req.method === 'DELETE') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const context = await requireInteractiveSession(req, res)
		await context.client.request(`user/sessions/${remoteSessionMatch[1]}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/session/password' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const context = await requireInteractiveSession(req, res, {refreshCookie: false})
		const body = await readJsonBody(req)
		const oldPassword = `${body.oldPassword || body.old_password || ''}`
		const newPassword = `${body.newPassword || body.new_password || ''}`

		await context.client.request('user/password', {
			method: 'POST',
			body: {
				old_password: oldPassword,
				new_password: newPassword,
			},
		})

		if (context.sessionId) {
			sessionStore.delete(context.sessionId)
		}

		sendJson(
			res,
			200,
			{
				ok: true,
				reauthRequired: true,
				message: 'Password updated. Sign in again.',
			},
			{
				'Set-Cookie': [
					clearCookie(appSessionCookieName, {
						httpOnly: true,
						sameSite: 'Strict',
						secure: cookieSecure,
						path: '/',
					}),
					serializeCookie(ignoreLegacyCookieName, '1', {
						httpOnly: true,
						sameSite: 'Strict',
						secure: cookieSecure,
						path: '/',
						maxAge: appSessionTtlSeconds,
					}),
				],
			},
		)
		return
	}

	if (url.pathname === '/api/session/settings/general' && req.method === 'POST') {
		const context = await requireVikunjaContext(req, res)
		const body = await readJsonBody(req)

		await context.client.request('user/settings/general', {
			method: 'POST',
			body,
		})

		const user = await context.client.request('user')
		updateSessionUser(context, user)
		sendJson(res, 200, {ok: true, user})
		return
	}

	if (url.pathname === '/api/session/settings/avatar' && req.method === 'GET') {
		const context = await requireVikunjaContext(req, res)
		const avatarSettings = await context.client.request('user/settings/avatar')
		sendJson(res, 200, {
			avatar_provider: avatarSettings?.avatar_provider || null,
		})
		return
	}

	if (url.pathname === '/api/session/settings/avatar' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const context = await requireVikunjaContext(req, res)
		const body = await readJsonBody(req)
		const avatarProvider = `${body.avatar_provider || body.avatarProvider || ''}`.trim()
		if (!avatarProvider) {
			sendJson(res, 400, {error: 'avatar_provider is required.'})
			return
		}

		await context.client.request('user/settings/avatar', {
			method: 'POST',
			body: {
				avatar_provider: avatarProvider,
			},
		})

		const [avatarSettings, user] = await Promise.all([
			context.client.request('user/settings/avatar'),
			context.client.request('user'),
		])
		updateSessionUser(context, user)
		sendJson(res, 200, {
			ok: true,
			user,
			avatar_provider: avatarSettings?.avatar_provider || avatarProvider,
		})
		return
	}

	if (url.pathname === '/api/session/settings/avatar/upload' && req.method === 'PUT') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const context = await requireVikunjaContext(req, res)
		const contentType = `${req.headers['content-type'] || ''}`.trim()
		if (!contentType.toLowerCase().includes('multipart/form-data')) {
			sendJson(res, 400, {error: 'multipart/form-data is required.'})
			return
		}

		const rawBody = await readRawBody(req)
		await context.client.request('user/settings/avatar/upload', {
			method: 'PUT',
			rawBody,
			headers: {
				Accept: 'application/json',
				'Content-Type': contentType,
			},
		})

		const [avatarSettings, user] = await Promise.all([
			context.client.request('user/settings/avatar'),
			context.client.request('user'),
		])
		updateSessionUser(context, user)
		sendJson(res, 200, {
			ok: true,
			user,
			avatar_provider: avatarSettings?.avatar_provider || 'upload',
		})
		return
	}

	if (url.pathname === '/api/admin/runtime/health' && req.method === 'GET') {
		const context = await requireAdminSession(req, res, {allowBridgeUnavailable: true})
		const health = await adminBridge.getRuntimeHealth()
		sendJson(res, 200, {
			...health,
			admin: summarizeAccount(context.account, context.source),
		})
		return
	}

	if (url.pathname === '/api/admin/runtime/status' && req.method === 'GET') {
		await requireInteractiveSession(req, res)
		const health = await adminBridge.getRuntimeHealth()
		sendJson(res, 200, health)
		return
	}

	if (url.pathname === '/api/admin/users' && req.method === 'GET') {
		await requireAdminSession(req, res)
		const users = await adminBridge.listUsers()
		sendJson(res, 200, {items: users})
		return
	}

	if (url.pathname === '/api/admin/users' && req.method === 'POST') {
		await requireAdminSession(req, res)
		const body = await readJsonBody(req)
		const user = await adminBridge.createUser({
			username: body.username,
			email: body.email,
			password: body.password,
		})
		sendJson(res, 201, {ok: true, user})
		return
	}

	const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
	const adminUserStatusMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/)
	const adminUserPasswordMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/)

	if (adminUserMatch && req.method === 'PATCH') {
		await requireAdminSession(req, res)
		const body = await readJsonBody(req)
		const identifier = decodeURIComponent(adminUserMatch[1])
		const user = await adminBridge.updateUser(identifier, {
			username: body.username,
			email: body.email,
			avatarProvider: body.avatarProvider || body.avatar_provider,
		})
		sendJson(res, 200, {ok: true, user})
		return
	}

	if (adminUserStatusMatch && req.method === 'PATCH') {
		const context = await requireAdminSession(req, res)
		const body = await readJsonBody(req)
		const enabled = body.enabled !== false
		const identifier = decodeURIComponent(adminUserStatusMatch[1])
		assertAdminUserMutationAllowed(context.account, identifier, enabled ? 'enable' : 'disable')
		const user = await adminBridge.setUserEnabled(identifier, enabled)
		sendJson(res, 200, {ok: true, user})
		return
	}

	if (adminUserPasswordMatch && req.method === 'POST') {
		await requireAdminSession(req, res)
		const body = await readJsonBody(req)
		const identifier = decodeURIComponent(adminUserPasswordMatch[1])
		await adminBridge.resetUserPassword(identifier, body.password)
		sendJson(res, 200, {ok: true})
		return
	}

	if (adminUserMatch && req.method === 'DELETE') {
		const context = await requireAdminSession(req, res)
		const identifier = decodeURIComponent(adminUserMatch[1])
		assertAdminUserMutationAllowed(context.account, identifier, 'delete')
		await adminBridge.deleteUser(identifier)
		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/admin/testmail' && req.method === 'POST') {
		await requireAdminSession(req, res)
		const body = await readJsonBody(req)
		const result = await adminBridge.runTestmail(body.email)
		sendJson(res, 200, result)
		return
	}

	if (url.pathname === '/api/admin/doctor' && req.method === 'POST') {
		await requireAdminSession(req, res)
		const result = await adminBridge.runDoctor()
		sendJson(res, 200, result)
		return
	}

	if (url.pathname === '/api/admin/dump' && req.method === 'POST') {
		await requireAdminSession(req, res)
		const {buffer, filename} = await adminBridge.runDump()
		sendBuffer(res, 200, buffer, {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store',
		})
		return
	}

	if (url.pathname === '/api/admin/restore' && req.method === 'POST') {
		await requireAdminSession(req, res)
		const zipBuffer = await readRawBody(req)
		if (!zipBuffer.length) {
			sendJson(res, 400, {error: 'A backup ZIP file is required.'})
			return
		}

		const result = await adminBridge.runRestore(zipBuffer)
		sendJson(res, 200, {ok: true, ...result})
		return
	}

	if (url.pathname === '/api/admin/migrate/list' && req.method === 'GET') {
		await requireAdminSession(req, res)
		const migrations = await adminBridge.listMigrations()
		sendJson(res, 200, {migrations})
		return
	}

	if (url.pathname === '/api/admin/migrate' && req.method === 'POST') {
		await requireAdminSession(req, res)
		const result = await adminBridge.runMigrate()
		sendJson(res, 200, {ok: true, ...result})
		return
	}

	if (url.pathname === '/api/admin/migrate/rollback' && req.method === 'POST') {
		await requireAdminSession(req, res)
		const body = await readJsonBody(req)
		const name = `${body.name || ''}`.trim()
		if (!name) {
			sendJson(res, 400, {error: 'Migration name is required.'})
			return
		}

		const result = await adminBridge.rollbackMigration(name)
		sendJson(res, 200, {ok: true, ...result})
		return
	}

	const repairMatch = url.pathname.match(/^\/api\/admin\/repair\/([^/]+)$/)
	if (repairMatch && req.method === 'POST') {
		await requireAdminSession(req, res)
		const command = decodeURIComponent(repairMatch[1])
		const result = await adminBridge.runRepair(command)
		sendJson(res, result.success ? 200 : 500, result)
		return
	}

	if (url.pathname === '/api/admin/config/mailer' && req.method === 'GET') {
		await requireAdminSession(req, res, {allowBridgeUnavailable: true})
		const config = await adminConfig.readMailerConfig()
		sendJson(res, 200, config)
		return
	}

	if (url.pathname === '/api/admin/config/mailer' && req.method === 'POST') {
		await requireAdminSession(req, res, {allowBridgeUnavailable: true})
		const body = await readJsonBody(req)
		const config = await adminConfig.writeMailerConfig({
			enabled: body.enabled,
			host: body.host,
			port: body.port,
			authType: body.authType,
			username: body.username,
			password: body.password,
			skipTlsVerify: body.skipTlsVerify,
			fromEmail: body.fromEmail,
			forceSsl: body.forceSsl,
		})
		sendJson(res, 200, config)
		return
	}

	if (url.pathname === '/api/admin/config/mailer/apply' && req.method === 'POST') {
		await requireAdminSession(req, res, {allowBridgeUnavailable: true})
		const result = await adminConfig.restartVikunja()
		const config = await adminConfig.readMailerConfig()
		sendJson(res, 200, {
			...result,
			config,
		})
		return
	}

	const context = await requireVikunjaContext(req, res)
	const vikunja = context.client
	const avatarMatch = url.pathname.match(/^\/api\/avatar\/([^/]+)$/)
	const subscriptionMatch = url.pathname.match(/^\/api\/subscriptions\/([^/]+)\/(\d+)$/)

	if (url.pathname === '/api/session/settings/email' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const body = await readJsonBody(req)
		const password = `${body.password || ''}`
		const newEmail = `${body.newEmail || ''}`.trim()
		if (!password || !newEmail) {
			sendJson(res, 400, {error: 'Password and new email are required.'})
			return
		}

		await vikunja.request('user/settings/email', {
			method: 'POST',
			body: {
				password,
				new_email: newEmail,
			},
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/user/export/request' && req.method === 'POST') {
		const body = await readJsonBody(req)
		const password = `${body.password || ''}`
		if (!password) {
			sendJson(res, 400, {error: 'Password is required.'})
			return
		}

		await vikunja.request('user/export/request', {
			method: 'POST',
			body: {password},
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/user/export' && req.method === 'GET') {
		const status = await vikunja.request('user/export')
		sendJson(res, 200, status)
		return
	}

	if (url.pathname === '/api/user/export/download' && req.method === 'POST') {
		const body = await readJsonBody(req)
		const password = `${body.password || ''}`
		if (!password) {
			sendJson(res, 400, {error: 'Password is required.'})
			return
		}

		const raw = await vikunja.requestRaw('user/export/download', {
			method: 'POST',
			body: {password},
		})
		const buffer = Buffer.from(await raw.arrayBuffer())
		sendBuffer(res, raw.status, buffer, {
			'Content-Type': raw.headers.get('content-type') || 'application/zip',
			'Content-Disposition':
				raw.headers.get('content-disposition') || 'attachment; filename="vikunja-export.zip"',
		})
		return
	}

	if (url.pathname === '/api/user/deletion/request' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const body = await readJsonBody(req)
		const password = `${body.password || ''}`

		await vikunja.request('user/deletion/request', {
			method: 'POST',
			body: password ? {password} : {},
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/user/deletion/cancel' && req.method === 'POST') {
		const body = await readJsonBody(req)
		const password = `${body.password || ''}`

		await vikunja.request('user/deletion/cancel', {
			method: 'POST',
			body: password ? {password} : {},
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/session/totp' && req.method === 'GET') {
		const totp = await vikunja.request('user/settings/totp')
		sendJson(res, 200, totp)
		return
	}

	if (url.pathname === '/api/session/totp/enroll' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const totp = await vikunja.request('user/settings/totp/enroll', {
			method: 'POST',
		})
		sendJson(res, 200, totp)
		return
	}

	if (url.pathname === '/api/session/totp/enable' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const body = await readJsonBody(req)
		const passcode = `${body.passcode || ''}`.trim()
		if (!passcode) {
			sendJson(res, 400, {error: 'Passcode is required.'})
			return
		}

		await vikunja.request('user/settings/totp/enable', {
			method: 'POST',
			body: {passcode},
		})
		sendJson(res, 200, {ok: true, enabled: true})
		return
	}

	if (url.pathname === '/api/session/totp/disable' && req.method === 'POST') {
		if (!enforceRateLimit(req, res, sessionMutationRateLimiter, 'session-mutation')) {
			return
		}

		const body = await readJsonBody(req)
		const password = `${body.password || ''}`
		if (!password) {
			sendJson(res, 400, {error: 'Password is required.'})
			return
		}

		await vikunja.request('user/settings/totp/disable', {
			method: 'POST',
			body: {password},
		})
		sendJson(res, 200, {ok: true, enabled: false})
		return
	}

	if (url.pathname === '/api/session/totp/qrcode' && req.method === 'GET') {
		const raw = await vikunja.requestRaw('user/settings/totp/qrcode')
		const buffer = Buffer.from(await raw.arrayBuffer())
		sendBuffer(res, raw.status, buffer, {
			'Content-Type': raw.headers.get('content-type') || 'image/png',
			'Cache-Control': 'no-store',
		})
		return
	}

	if (url.pathname === '/api/session/caldav-tokens' && req.method === 'GET') {
		const tokens = await vikunja.request('user/settings/token/caldav')
		sendJson(res, 200, {tokens: Array.isArray(tokens) ? tokens : []})
		return
	}

	if (url.pathname === '/api/session/caldav-tokens' && req.method === 'PUT') {
		const token = await vikunja.request('user/settings/token/caldav', {
			method: 'PUT',
		})
		sendJson(res, 200, token)
		return
	}

	const caldavTokenMatch = url.pathname.match(/^\/api\/session\/caldav-tokens\/(\d+)$/)
	if (caldavTokenMatch && req.method === 'DELETE') {
		const tokenId = Number(caldavTokenMatch[1])
		await vikunja.request(`user/settings/token/caldav/${tokenId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/tokens' && req.method === 'GET') {
		const tokens = await vikunja.fetchAllPages('tokens')
		sendJson(res, 200, {tokens})
		return
	}

	if (url.pathname === '/api/tokens' && req.method === 'PUT') {
		const body = await readJsonBody(req)
		const upstreamToken = {
			title: `${body.title || ''}`.trim(),
			permissions: body.permissions || {},
		}
		if (typeof body.expires_at === 'string' && body.expires_at.trim()) {
			upstreamToken.expires_at = body.expires_at
		}
		const token = await vikunja.request('tokens', {
			method: 'PUT',
			body: upstreamToken,
		})
		sendJson(res, 200, token)
		return
	}

	const apiTokenMatch = url.pathname.match(/^\/api\/tokens\/(\d+)$/)
	if (apiTokenMatch && req.method === 'DELETE') {
		const tokenId = Number(apiTokenMatch[1])
		await vikunja.request(`tokens/${tokenId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/routes' && req.method === 'GET') {
		const routes = await vikunja.request('routes')
		sendJson(res, 200, {routes})
		return
	}

	if (url.pathname === '/api/user' && req.method === 'GET') {
		const user = await vikunja.request('user')
		updateSessionUser(context, user)
		sendJson(res, 200, user)
		return
	}

	if (url.pathname === '/api/users' && req.method === 'GET') {
		const search = `${url.searchParams.get('s') || ''}`.trim()
		const users = await vikunja.fetchAllPages('users', search ? {s: search} : {})
		sendJson(res, 200, {users})
		return
	}

	if (avatarMatch && req.method === 'GET') {
		const username = decodeURIComponent(avatarMatch[1])
		const requestedSize = Number(url.searchParams.get('size') || 64)
		const size = Number.isFinite(requestedSize) && requestedSize > 0 ? Math.round(requestedSize) : 64
		const avatarRouteCandidates = [
			`avatar/${encodeURIComponent(username)}`,
			`${encodeURIComponent(username)}/avatar`,
		]
		let response = null
		for (const route of avatarRouteCandidates) {
			const candidate = await vikunja.requestRaw(route, {
				method: 'GET',
				params: {size},
				headers: {
					Accept: '*/*',
				},
			})
			if (candidate.status !== 404) {
				response = candidate
				break
			}
		}
		if (!response) {
			response = await vikunja.requestRaw(`avatar/${encodeURIComponent(username)}`, {
				method: 'GET',
				params: {size},
				headers: {
					Accept: '*/*',
				},
			})
		}
		const buffer = Buffer.from(await response.arrayBuffer())
		sendBuffer(res, response.status, buffer, {
			'Content-Type': response.headers.get('content-type') || 'image/png',
			'Cache-Control': 'no-store',
		})
		return
	}

	if (subscriptionMatch) {
		const entity = `${subscriptionMatch[1] || ''}`.trim()
		const entityId = Number(subscriptionMatch[2] || 0)
		if (!entityId || (entity !== 'task' && entity !== 'project')) {
			sendJson(res, 400, {error: 'A valid subscription entity and id are required.'})
			return
		}

		if (req.method === 'PUT') {
			await vikunja.request(`subscriptions/${entity}/${entityId}`, {
				method: 'PUT',
			})
			sendJson(res, 200, {ok: true, subscribed: true})
			return
		}

		if (req.method === 'DELETE') {
			await vikunja.request(`subscriptions/${entity}/${entityId}`, {
				method: 'DELETE',
			})
			sendJson(res, 200, {ok: true, subscribed: false})
			return
		}
	}

	const reactionsMatch = url.pathname.match(/^\/api\/(tasks|comments|projects)\/(\d+)\/reactions$/)
	const reactionsDeleteMatch = url.pathname.match(/^\/api\/(tasks|comments|projects)\/(\d+)\/reactions\/delete$/)
	if (reactionsMatch) {
		const kind = reactionsMatch[1]
		const id = Number(reactionsMatch[2])
		if (req.method === 'GET') {
			const reactions = await vikunja.request(`${kind}/${id}/reactions`)
			sendJson(res, 200, {reactions: normalizeReactionEntities(reactions)})
			return
		}
		if (req.method === 'PUT') {
			const body = await readJsonBody(req)
			await vikunja.request(`${kind}/${id}/reactions`, {
				method: 'PUT',
				body: {
					value: `${body.value || ''}`,
				},
			})
			sendJson(res, 200, {ok: true})
			return
		}
	}

	if (reactionsDeleteMatch && req.method === 'POST') {
		const kind = reactionsDeleteMatch[1]
		const id = Number(reactionsDeleteMatch[2])
		const body = await readJsonBody(req)
		await vikunja.request(`${kind}/${id}/reactions/delete`, {
			method: 'POST',
			body: {
				value: `${body.value || ''}`,
			},
		})
		sendJson(res, 200, {ok: true})
		return
	}

	function normalizeReactionEntities(reactions) {
		if (Array.isArray(reactions)) {
			return reactions
				.filter(reaction => reaction && typeof reaction === 'object')
				.map(reaction => ({
					value: `${reaction.value || ''}`.trim(),
					user: reaction.user || null,
				}))
				.filter(reaction => reaction.value && reaction.user)
		}

		if (!reactions || typeof reactions !== 'object') {
			return []
		}

		const normalized = []
		for (const [value, users] of Object.entries(reactions)) {
			if (!Array.isArray(users)) {
				continue
			}

			for (const user of users) {
				if (!user || typeof user !== 'object') {
					continue
				}

				normalized.push({
					value: `${value || ''}`.trim(),
					user,
				})
			}
		}

		return normalized
	}

	const teamsCollectionMatch = url.pathname.match(/^\/api\/teams$/)
	const teamMatch = url.pathname.match(/^\/api\/teams\/(\d+)$/)
	const teamMembersMatch = url.pathname.match(/^\/api\/teams\/(\d+)\/members$/)
	const teamMemberMatch = url.pathname.match(/^\/api\/teams\/(\d+)\/members\/([^/]+)$/)
	const teamMemberAdminMatch = url.pathname.match(/^\/api\/teams\/(\d+)\/members\/([^/]+)\/admin$/)

	if (teamsCollectionMatch && req.method === 'GET') {
		const search = `${url.searchParams.get('s') || ''}`.trim()
		const teams = await vikunja.fetchAllPages('teams', search ? {s: search} : {})
		sendJson(res, 200, {teams})
		return
	}

	if (teamsCollectionMatch && req.method === 'POST') {
		const body = await readJsonBody(req)
		const team = await vikunja.request('teams', {
			method: 'PUT',
			body: {
				name: `${body.name || ''}`.trim(),
				description: `${body.description || ''}`.trim(),
				is_public: body.is_public === true || body.isPublic === true,
			},
		})
		sendJson(res, 201, {team})
		return
	}

	if (teamMatch && req.method === 'GET') {
		const teamId = Number(teamMatch[1])
		const team = await vikunja.request(`teams/${teamId}`)
		sendJson(res, 200, {team})
		return
	}

	if (teamMatch && req.method === 'POST') {
		const teamId = Number(teamMatch[1])
		const body = await readJsonBody(req)
		const team = await vikunja.request(`teams/${teamId}`, {
			method: 'POST',
			body: {
				name: `${body.name || ''}`.trim(),
				description: `${body.description || ''}`.trim(),
				is_public: body.is_public === true || body.isPublic === true,
			},
		})
		sendJson(res, 200, {team})
		return
	}

	if (teamMatch && req.method === 'DELETE') {
		const teamId = Number(teamMatch[1])
		await vikunja.request(`teams/${teamId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (teamMembersMatch && req.method === 'POST') {
		const teamId = Number(teamMembersMatch[1])
		const body = await readJsonBody(req)
		const member = await vikunja.request(`teams/${teamId}/members`, {
			method: 'PUT',
			body: {
				username: `${body.username || ''}`.trim(),
			},
		})
		sendJson(res, 201, {member})
		return
	}

	if (teamMemberAdminMatch && req.method === 'POST') {
		const teamId = Number(teamMemberAdminMatch[1])
		const username = decodeURIComponent(teamMemberAdminMatch[2])
		const member = await vikunja.request(`teams/${teamId}/members/${encodeURIComponent(username)}/admin`, {
			method: 'POST',
			body: {},
		})
		sendJson(res, 200, {member})
		return
	}

	if (teamMemberMatch && req.method === 'DELETE') {
		const teamId = Number(teamMemberMatch[1])
		const username = decodeURIComponent(teamMemberMatch[2])
		await vikunja.request(`teams/${teamId}/members/${encodeURIComponent(username)}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (url.pathname === '/api/tasks' && req.method === 'GET') {
		const query = readTaskCollectionParams(url)
		if (query.s && query.filter) {
			sendJson(res, 400, {error: 'Search text cannot be combined with a task filter.'})
			return
		}

		const tasks = await vikunja.fetchAllPages('tasks', query)
		sendJson(res, 200, normalizeTaskGraph(tasks))
		return
	}

	if (url.pathname === '/api/filters' && req.method === 'GET') {
		const search = `${url.searchParams.get('s') || ''}`.trim().toLowerCase()
		const filters = await listSavedFilters(vikunja, search)
		sendJson(res, 200, {filters})
		return
	}

	if (url.pathname === '/api/filters' && req.method === 'POST') {
		const body = await readJsonBody(req)
		const title = `${body.title || ''}`.trim()
		if (!title) {
			sendJson(res, 400, {error: 'Filter title is required.'})
			return
		}

		try {
			const filter = await vikunja.request('filters', {
				method: 'PUT',
				body: buildSavedFilterPayload(body),
			})
			sendJson(res, 201, {filter})
		} catch (error) {
			if (isLegacySavedFilterRouteError(error)) {
				sendJson(res, 501, {
					error: 'This Vikunja server does not support saved filter creation through the API used by this app.',
				})
				return
			}

			throw error
		}
		return
	}

	const filterMatch = url.pathname.match(/^\/api\/filters\/(\d+)$/)
	if (filterMatch && req.method === 'GET') {
		const filterId = Number(filterMatch[1])
		try {
			const filter = await vikunja.request(`filters/${filterId}`)
			sendJson(res, 200, {filter})
		} catch (error) {
			if (isLegacySavedFilterRouteError(error)) {
				sendJson(res, 501, {
					error: 'This Vikunja server exposes saved filters as read-only pseudo-projects. Upgrade Vikunja to edit filters here.',
				})
				return
			}

			throw error
		}
		return
	}

	if (filterMatch && req.method === 'POST') {
		const filterId = Number(filterMatch[1])
		const body = await readJsonBody(req)
		const title = `${body.title || ''}`.trim()
		if (!title) {
			sendJson(res, 400, {error: 'Filter title is required.'})
			return
		}

		try {
			const filter = await vikunja.request(`filters/${filterId}`, {
				method: 'POST',
				body: buildSavedFilterPayload(body, filterId),
			})
			sendJson(res, 200, {filter})
		} catch (error) {
			if (isLegacySavedFilterRouteError(error)) {
				sendJson(res, 501, {
					error: 'This Vikunja server does not support saved filter editing through the API used by this app.',
				})
				return
			}

			throw error
		}
		return
	}

	if (filterMatch && req.method === 'DELETE') {
		const filterId = Number(filterMatch[1])
		try {
			await vikunja.request(`filters/${filterId}`, {
				method: 'DELETE',
			})
			sendJson(res, 200, {ok: true})
		} catch (error) {
			if (isLegacySavedFilterRouteError(error)) {
				sendJson(res, 501, {
					error: 'This Vikunja server does not support saved filter deletion through the API used by this app.',
				})
				return
			}

			throw error
		}
		return
	}

	if (url.pathname === '/api/projects' && req.method === 'GET') {
		const projects = await vikunja.fetchAllPages('projects')
		sendJson(res, 200, projects)
		return
	}

	if (url.pathname === '/api/tasks/today' && req.method === 'GET') {
		const {startIso, endIso, timezone} = vikunja.getTodayRange()
		const tasks = await vikunja.fetchAllPages('tasks', {
			filter: `due_date >= "${startIso}" && due_date < "${endIso}"`,
			filter_timezone: timezone,
			sort_by: ['due_date', 'id'],
			order_by: ['asc', 'asc'],
			expand: ['subtasks', 'comment_count'],
		})
		sendJson(res, 200, normalizeTaskGraph(tasks))
		return
	}

	if (url.pathname === '/api/projects' && req.method === 'POST') {
		const body = await readJsonBody(req)
		const title = `${body.title || ''}`.trim()

		if (!title) {
			sendJson(res, 400, {error: 'Project title is required.'})
			return
		}

		const project = await vikunja.request('projects', {
			method: 'PUT',
			body: {
				title,
				parent_project_id: Number(body.parentProjectId || 0),
			},
		})
		sendJson(res, 201, {project})
		return
	}

	if (url.pathname === '/api/labels' && req.method === 'GET') {
		const labels = await vikunja.fetchAllPages('labels')
		sendJson(res, 200, labels)
		return
	}

	if (url.pathname === '/api/labels' && req.method === 'POST') {
		const body = await readJsonBody(req)
		const title = `${body.title || ''}`.trim()

		if (!title) {
			sendJson(res, 400, {error: 'Label title is required.'})
			return
		}

		const label = await vikunja.request('labels', {
			method: 'PUT',
			body: {
				title,
				hex_color: body.hexColor || '#1973ff',
			},
		})
		sendJson(res, 201, {label})
		return
	}

	const labelMatch = url.pathname.match(/^\/api\/labels\/(\d+)$/)
	if (labelMatch && req.method === 'POST') {
		const labelId = Number(labelMatch[1])
		const body = await readJsonBody(req)
		const title = `${body.title || ''}`.trim()

		if (!title) {
			sendJson(res, 400, {error: 'Label title is required.'})
			return
		}

		const label = await vikunja.request(`labels/${labelId}`, {
			method: 'POST',
			body: {
				title,
				hex_color: body.hexColor || body.hex_color || '#1973ff',
			},
		})
		sendJson(res, 200, {label})
		return
	}

	if (labelMatch && req.method === 'DELETE') {
		const labelId = Number(labelMatch[1])
		await vikunja.request(`labels/${labelId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	const projectViewsMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/views$/)
	const projectViewMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/views\/(\d+)$/)
	if (projectViewsMatch && req.method === 'GET') {
		const projectId = Number(projectViewsMatch[1])
		const views = await vikunja.fetchAllPages(`projects/${projectId}/views`)
		sendJson(res, 200, {views})
		return
	}

	if (projectViewMatch && (req.method === 'POST' || req.method === 'PUT')) {
		const projectId = Number(projectViewMatch[1])
		const viewId = Number(projectViewMatch[2])
		const body = await readJsonBody(req)
		const view = await vikunja.request(`projects/${projectId}/views/${viewId}`, {
			method: 'POST',
			body,
		})
		sendJson(res, 200, {view})
		return
	}

	const projectUsersMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/projectusers$/)
	const projectSharedUsersMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/users$/)
	const projectSharedUserMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/users\/([^/]+)$/)
	const projectSharedTeamsMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/teams$/)
	const projectSharedTeamMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/teams\/(\d+)$/)
	const projectLinkSharesMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/shares$/)
	const projectLinkShareMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/shares\/(\d+)$/)
	const notificationCollectionMatch = url.pathname.match(/^\/api\/notifications$/)
	const notificationMatch = url.pathname.match(/^\/api\/notifications\/(\d+)$/)
	if (projectUsersMatch && req.method === 'GET') {
		const projectId = Number(projectUsersMatch[1])
		const search = `${url.searchParams.get('s') || ''}`.trim()
		const users = await vikunja.fetchAllPages(`projects/${projectId}/projectusers`, search ? {s: search} : {})
		sendJson(res, 200, {users})
		return
	}

	if (projectSharedUsersMatch && req.method === 'GET') {
		const projectId = Number(projectSharedUsersMatch[1])
		const search = `${url.searchParams.get('s') || ''}`.trim()
		const users = await vikunja.fetchAllPages(`projects/${projectId}/users`, search ? {s: search} : {})
		sendJson(res, 200, {users})
		return
	}

	if (projectSharedUsersMatch && req.method === 'POST') {
		const projectId = Number(projectSharedUsersMatch[1])
		const body = await readJsonBody(req)
		const user = await vikunja.request(`projects/${projectId}/users`, {
			method: 'PUT',
			body: {
				username: `${body.username || ''}`.trim(),
				permission: normalizeSharePermission(body.permission),
			},
		})
		sendJson(res, 201, {user})
		return
	}

	if (projectSharedUserMatch && req.method === 'POST') {
		const projectId = Number(projectSharedUserMatch[1])
		const username = decodeURIComponent(projectSharedUserMatch[2])
		const body = await readJsonBody(req)
		const user = await vikunja.request(`projects/${projectId}/users/${encodeURIComponent(username)}`, {
			method: 'POST',
			body: {
				username,
				permission: normalizeSharePermission(body.permission),
			},
		})
		sendJson(res, 200, {user})
		return
	}

	if (projectSharedUserMatch && req.method === 'DELETE') {
		const projectId = Number(projectSharedUserMatch[1])
		const username = decodeURIComponent(projectSharedUserMatch[2])
		await vikunja.request(`projects/${projectId}/users/${encodeURIComponent(username)}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (projectSharedTeamsMatch && req.method === 'GET') {
		const projectId = Number(projectSharedTeamsMatch[1])
		const search = `${url.searchParams.get('s') || ''}`.trim()
		const teams = await vikunja.fetchAllPages(`projects/${projectId}/teams`, search ? {s: search} : {})
		sendJson(res, 200, {teams})
		return
	}

	if (projectSharedTeamsMatch && req.method === 'POST') {
		const projectId = Number(projectSharedTeamsMatch[1])
		const body = await readJsonBody(req)
		const teamId = Number(body.team_id || body.teamId || 0)
		const team = await vikunja.request(`projects/${projectId}/teams`, {
			method: 'PUT',
			body: {
				team_id: teamId,
				permission: normalizeSharePermission(body.permission),
			},
		})
		sendJson(res, 201, {team})
		return
	}

	if (projectSharedTeamMatch && req.method === 'POST') {
		const projectId = Number(projectSharedTeamMatch[1])
		const teamId = Number(projectSharedTeamMatch[2])
		const body = await readJsonBody(req)
		const team = await vikunja.request(`projects/${projectId}/teams/${teamId}`, {
			method: 'POST',
			body: {
				team_id: teamId,
				permission: normalizeSharePermission(body.permission),
			},
		})
		sendJson(res, 200, {team})
		return
	}

	if (projectSharedTeamMatch && req.method === 'DELETE') {
		const projectId = Number(projectSharedTeamMatch[1])
		const teamId = Number(projectSharedTeamMatch[2])
		await vikunja.request(`projects/${projectId}/teams/${teamId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (projectLinkSharesMatch && req.method === 'GET') {
		const projectId = Number(projectLinkSharesMatch[1])
		const shares = await vikunja.fetchAllPages(`projects/${projectId}/shares`)
		sendJson(res, 200, {shares})
		return
	}

	if (projectLinkSharesMatch && req.method === 'POST') {
		const projectId = Number(projectLinkSharesMatch[1])
		const body = await readJsonBody(req)
		const share = await vikunja.request(`projects/${projectId}/shares`, {
			method: 'PUT',
			body: {
				name: `${body.name || ''}`.trim(),
				password: `${body.password || ''}`,
				permission: normalizeSharePermission(body.permission),
			},
		})
		sendJson(res, 201, {share})
		return
	}

	if (projectLinkShareMatch && req.method === 'GET') {
		const projectId = Number(projectLinkShareMatch[1])
		const shareId = Number(projectLinkShareMatch[2])
		const share = await vikunja.request(`projects/${projectId}/shares/${shareId}`)
		sendJson(res, 200, {share})
		return
	}

	if (projectLinkShareMatch && req.method === 'DELETE') {
		const projectId = Number(projectLinkShareMatch[1])
		const shareId = Number(projectLinkShareMatch[2])
		await vikunja.request(`projects/${projectId}/shares/${shareId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (notificationCollectionMatch && req.method === 'GET') {
		const notifications = await vikunja.fetchAllPages('notifications')
		sendJson(res, 200, notifications)
		return
	}

	if (notificationCollectionMatch && req.method === 'POST') {
		await vikunja.request('notifications', {
			method: 'POST',
			body: {},
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (notificationMatch && req.method === 'POST') {
		const notificationId = Number(notificationMatch[1])
		const body = await readJsonBody(req)
		const notification = await vikunja.request(`notifications/${notificationId}`, {
			method: 'POST',
			body: {
				read: body?.read !== false,
			},
		})
		sendJson(res, 200, {notification})
		return
	}

	const projectViewTasksMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/views\/(\d+)\/tasks$/)
	const projectViewBucketsMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/views\/(\d+)\/buckets$/)
	const projectViewBucketMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/views\/(\d+)\/buckets\/(\d+)$/)
	const projectViewBucketTaskMoveMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/views\/(\d+)\/buckets\/(\d+)\/tasks$/)
	if (projectViewBucketsMatch && req.method === 'GET') {
		const projectId = Number(projectViewBucketsMatch[1])
		const viewId = Number(projectViewBucketsMatch[2])
		const query = readTaskCollectionParams(url)
		const buckets = await vikunja.fetchAllPages(`projects/${projectId}/views/${viewId}/buckets`, {
			...query,
			expand: query.expand?.length ? query.expand : ['subtasks', 'comment_count'],
			sort_by: query.sort_by?.length ? query.sort_by : ['position', 'id'],
			order_by: query.order_by?.length ? query.order_by : ['asc', 'asc'],
		})
		sendJson(res, 200, {
			buckets: Array.isArray(buckets)
				? buckets.map(bucket => ({
					...bucket,
					tasks: normalizeTaskGraph(Array.isArray(bucket.tasks) ? bucket.tasks : []),
				}))
				: [],
		})
		return
	}

	if (projectViewBucketsMatch && req.method === 'POST') {
		const projectId = Number(projectViewBucketsMatch[1])
		const viewId = Number(projectViewBucketsMatch[2])
		const body = await readJsonBody(req)
		const title = `${body.title || ''}`.trim()
		if (!title) {
			sendJson(res, 400, {error: 'Bucket title is required.'})
			return
		}

		const bucket = await vikunja.request(`projects/${projectId}/views/${viewId}/buckets`, {
			method: 'PUT',
			body: {
				title,
				limit: Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined,
			},
		})
		sendJson(res, 201, {bucket})
		return
	}

	if (projectViewBucketMatch && (req.method === 'POST' || req.method === 'PUT')) {
		const projectId = Number(projectViewBucketMatch[1])
		const viewId = Number(projectViewBucketMatch[2])
		const bucketId = Number(projectViewBucketMatch[3])
		const body = await readJsonBody(req)
		const bucket = await vikunja.request(`projects/${projectId}/views/${viewId}/buckets/${bucketId}`, {
			method: 'POST',
			body,
		})
		sendJson(res, 200, {bucket})
		return
	}

	if (projectViewBucketMatch && req.method === 'DELETE') {
		const projectId = Number(projectViewBucketMatch[1])
		const viewId = Number(projectViewBucketMatch[2])
		const bucketId = Number(projectViewBucketMatch[3])
		await vikunja.request(`projects/${projectId}/views/${viewId}/buckets/${bucketId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (projectViewBucketTaskMoveMatch && req.method === 'POST') {
		const projectId = Number(projectViewBucketTaskMoveMatch[1])
		const viewId = Number(projectViewBucketTaskMoveMatch[2])
		const bucketId = Number(projectViewBucketTaskMoveMatch[3])
		const body = await readJsonBody(req)
		const taskId = Number(body.task_id || body.taskId || 0)

		if (!projectId || !viewId || !bucketId || !taskId) {
			sendJson(res, 400, {error: 'projectId, viewId, bucketId and task_id are required.'})
			return
		}

		const taskBucket = await vikunja.request(`projects/${projectId}/views/${viewId}/buckets/${bucketId}/tasks`, {
			method: 'POST',
			body: {
				task_id: taskId,
				bucket_id: bucketId,
				project_view_id: viewId,
				project_id: projectId,
			},
		})
		sendJson(res, 200, {taskBucket})
		return
	}

	if (projectViewTasksMatch && req.method === 'GET') {
		const projectId = Number(projectViewTasksMatch[1])
		const viewId = Number(projectViewTasksMatch[2])
		const query = readTaskCollectionParams(url)
		const viewTasks = await vikunja.fetchAllPages(`projects/${projectId}/views/${viewId}/tasks`, {
			...query,
			expand: query.expand?.length ? query.expand : ['subtasks'],
			sort_by: query.sort_by?.length ? query.sort_by : ['position', 'id'],
			order_by: query.order_by?.length ? query.order_by : ['asc', 'asc'],
		})

		if (isGroupedBucketTaskPayload(viewTasks)) {
			sendJson(res, 200, viewTasks.map(bucket => ({
				...bucket,
				tasks: normalizeTaskGraph(Array.isArray(bucket.tasks) ? bucket.tasks : []),
			})))
			return
		}

		if (hasMissingTaskAncestors(viewTasks)) {
			const projectTasks = await vikunja.fetchAllPages(`projects/${projectId}/tasks`, {
				expand: ['subtasks', 'comment_count'],
			})
			sendJson(res, 200, hydrateTaskAncestors(viewTasks, projectTasks))
			return
		}

		sendJson(res, 200, normalizeTaskGraph(viewTasks))
		return
	}

	const projectTasksMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)\/tasks$/)
	if (projectTasksMatch && req.method === 'GET') {
		const projectId = Number(projectTasksMatch[1])
		const query = sanitizeProjectTaskCollectionParams(readTaskCollectionParams(url))
		const tasks = await vikunja.fetchAllPages(`projects/${projectId}/tasks`, {
			...query,
			expand: query.expand?.length ? query.expand : ['subtasks'],
			sort_by: query.sort_by?.length ? query.sort_by : ['position', 'id'],
			order_by: query.order_by?.length ? query.order_by : ['asc', 'asc'],
		})
		sendJson(res, 200, normalizeTaskGraph(tasks))
		return
	}

	if (projectTasksMatch && req.method === 'POST') {
		const projectId = Number(projectTasksMatch[1])
		if (projectId < 0) {
			sendJson(res, 400, {error: 'Tasks cannot be created directly inside a saved filter.'})
			return
		}

		const body = await readJsonBody(req)
		const title = `${body.title || ''}`.trim()
		const parentTaskId = body.parentTaskId ? Number(body.parentTaskId) : null
		const projectViewId = body.projectViewId ? Number(body.projectViewId) : null
		const bucketId = body.bucketId ? Number(body.bucketId) : null

		if (!title) {
			sendJson(res, 400, {error: 'Task title is required.'})
			return
		}

		const taskPayload = {
			title,
			project_id: projectId,
			description: `${body.description || ''}`.trim() || undefined,
			due_date: normalizeOptionalDate(body.due_date || body.dueDate),
			start_date: normalizeOptionalDate(body.start_date || body.startDate),
			end_date: normalizeOptionalDate(body.end_date || body.endDate),
			priority: body.priority == null ? undefined : Number(body.priority) || 0,
			repeat_after: body.repeat_after == null ? undefined : Number(body.repeat_after) || 0,
			repeat_from_current_date: body.repeat_from_current_date === true,
			done: body.done === true,
		}
		const task = await vikunja.request(`projects/${projectId}/tasks`, {
			method: 'PUT',
			body: taskPayload,
		})

		if (parentTaskId) {
			await vikunja.request(`tasks/${task.id}/relations`, {
				method: 'PUT',
				body: {
					task_id: task.id,
					other_task_id: parentTaskId,
					relation_kind: 'parenttask',
				},
			})
		}

		if (projectViewId && bucketId) {
			await vikunja.request(`projects/${projectId}/views/${projectViewId}/buckets/${bucketId}/tasks`, {
				method: 'POST',
				body: {
					task_id: task.id,
					bucket_id: bucketId,
					project_view_id: projectViewId,
					project_id: projectId,
				},
			})
		}

		sendJson(res, 201, {task})
		return
	}

	const projectDuplicateMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/duplicate$/)
	if (projectDuplicateMatch && req.method === 'POST') {
		const projectId = Number(projectDuplicateMatch[1])
		const body = await readJsonBody(req)
		const result = await vikunja.request(`projects/${projectId}/duplicate`, {
			method: 'PUT',
			body: {
				project_id: projectId,
				parent_project_id: Number(body.parentProjectId || 0),
			},
		})
		sendJson(res, 200, result)
		return
	}

	const projectReadMatch = url.pathname.match(/^\/api\/projects\/(-?\d+)$/)
	if (projectReadMatch && req.method === 'GET') {
		const projectId = Number(projectReadMatch[1])
		const project = await vikunja.request(`projects/${projectId}`)
		sendJson(res, 200, {project})
		return
	}

	const projectMutableMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/)
	if (projectMutableMatch && req.method === 'POST') {
		const projectId = Number(projectMutableMatch[1])
		const body = await readJsonBody(req)
		const title = `${body.title || ''}`.trim()

		if (!title) {
			sendJson(res, 400, {error: 'Project title is required.'})
			return
		}

		const project = await vikunja.request(`projects/${projectId}`, {
			method: 'POST',
			body: {
				...body,
				id: projectId,
				title,
			},
		})
		sendJson(res, 200, {project})
		return
	}

	if (projectMutableMatch && req.method === 'DELETE') {
		const projectId = Number(projectMutableMatch[1])
		await vikunja.request(`projects/${projectId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/)
	const taskPositionMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/position$/)
	const taskDuplicateMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/duplicate$/)
	const taskReadMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/read$/)
	const taskRelationsMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/relations$/)
	const taskRelationDeleteMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/relations\/(\w+)\/(\d+)$/)
	const taskAssigneesMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/assignees$/)
	const taskAssigneesBulkMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/assignees\/bulk$/)
	const taskAssigneeMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/assignees\/(\d+)$/)
	const taskCommentsMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/comments$/)
	const taskCommentMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/comments\/(\d+)$/)
	const taskAttachmentsMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/attachments$/)
	const taskAttachmentMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/attachments\/(\d+)$/)
	const taskLabelCollectionMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/labels$/)
	const taskLabelsBulkMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/labels\/bulk$/)
	const taskLabelMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/labels\/(\d+)$/)

	if (url.pathname === '/api/tasks/bulk' && req.method === 'POST') {
		const body = await readJsonBody(req)
		const taskIds = Array.isArray(body?.taskIds) ? body.taskIds.map(value => Number(value || 0)).filter(Boolean) : []
		const fields = Array.isArray(body?.fields)
			? body.fields.filter(value => typeof value === 'string' && value.trim())
			: []
		const values = body?.values && typeof body.values === 'object' && !Array.isArray(body.values) ? body.values : null

		if (taskIds.length === 0 || fields.length === 0 || !values) {
			sendJson(res, 400, {error: 'taskIds, fields, and a values object are required for bulk task updates.'})
			return
		}

		const result = await vikunja.request('tasks/bulk', {
			method: 'POST',
			body: {
				task_ids: taskIds,
				fields,
				values,
			},
		})
		sendJson(res, 200, {result})
		return
	}

	if (taskAssigneesMatch && req.method === 'GET') {
		const taskId = Number(taskAssigneesMatch[1])
		const search = `${url.searchParams.get('s') || ''}`.trim()
		const assignees = await vikunja.fetchAllPages(`tasks/${taskId}/assignees`, search ? {s: search} : {})
		sendJson(res, 200, {assignees})
		return
	}

	if (taskAssigneesBulkMatch && req.method === 'POST') {
		const taskId = Number(taskAssigneesBulkMatch[1])
		const body = await readJsonBody(req)
		const result = await vikunja.request(`tasks/${taskId}/assignees/bulk`, {
			method: 'POST',
			body: {
				assignees: body.assignees || [],
			},
		})
		sendJson(res, 200, result)
		return
	}

	if (taskAssigneesMatch && req.method === 'POST') {
		const taskId = Number(taskAssigneesMatch[1])
		const body = await readJsonBody(req)
		const userId = Number(body.userId || body.user_id || 0)

		if (!userId) {
			sendJson(res, 400, {error: 'userId is required.'})
			return
		}

		const result = await vikunja.request(`tasks/${taskId}/assignees`, {
			method: 'PUT',
			body: {
				user_id: userId,
			},
		})
		sendJson(res, 201, result)
		return
	}

	if (taskAssigneeMatch && req.method === 'DELETE') {
		const taskId = Number(taskAssigneeMatch[1])
		const userId = Number(taskAssigneeMatch[2])
		await vikunja.request(`tasks/${taskId}/assignees/${userId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (taskCommentsMatch && req.method === 'GET') {
		const taskId = Number(taskCommentsMatch[1])
		const comments = await vikunja.fetchAllPages(`tasks/${taskId}/comments`)
		sendJson(res, 200, {comments})
		return
	}

	if (taskCommentsMatch && req.method === 'POST') {
		const taskId = Number(taskCommentsMatch[1])
		const body = await readJsonBody(req)
		const comment = `${body.comment || ''}`.trim()
		if (!comment) {
			sendJson(res, 400, {error: 'comment is required.'})
			return
		}

		const createdComment = await vikunja.request(`tasks/${taskId}/comments`, {
			method: 'PUT',
			body: {comment},
		})
		sendJson(res, 201, {comment: createdComment})
		return
	}

	if (taskCommentMatch && req.method === 'GET') {
		const taskId = Number(taskCommentMatch[1])
		const commentId = Number(taskCommentMatch[2])
		const comment = await vikunja.request(`tasks/${taskId}/comments/${commentId}`)
		sendJson(res, 200, {comment})
		return
	}

	if (taskCommentMatch && req.method === 'POST') {
		const taskId = Number(taskCommentMatch[1])
		const commentId = Number(taskCommentMatch[2])
		const body = await readJsonBody(req)
		const comment = `${body.comment || ''}`.trim()
		if (!comment) {
			sendJson(res, 400, {error: 'comment is required.'})
			return
		}

		const updatedComment = await vikunja.request(`tasks/${taskId}/comments/${commentId}`, {
			method: 'POST',
			body: {comment},
		})
		sendJson(res, 200, {comment: updatedComment})
		return
	}

	if (taskCommentMatch && req.method === 'DELETE') {
		const taskId = Number(taskCommentMatch[1])
		const commentId = Number(taskCommentMatch[2])
		await vikunja.request(`tasks/${taskId}/comments/${commentId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (taskAttachmentsMatch && req.method === 'GET') {
		const taskId = Number(taskAttachmentsMatch[1])
		const attachments = await vikunja.fetchAllPages(`tasks/${taskId}/attachments`)
		sendJson(res, 200, {attachments})
		return
	}

	if (taskAttachmentsMatch && req.method === 'POST') {
		const taskId = Number(taskAttachmentsMatch[1])
		const contentType = `${req.headers['content-type'] || ''}`.trim()
		if (!contentType.toLowerCase().includes('multipart/form-data')) {
			sendJson(res, 400, {error: 'multipart/form-data is required.'})
			return
		}

		const rawBody = await readRawBody(req)
		const result = await vikunja.request(`tasks/${taskId}/attachments`, {
			method: 'PUT',
			rawBody,
			headers: {
				Accept: 'application/json',
				'Content-Type': contentType,
			},
		})
		sendJson(res, 201, {
			attachments: Array.isArray(result?.success) ? result.success : [],
		})
		return
	}

	if (taskAttachmentMatch && req.method === 'GET') {
		const taskId = Number(taskAttachmentMatch[1])
		const attachmentId = Number(taskAttachmentMatch[2])
		const previewSize = `${url.searchParams.get('preview_size') || ''}`.trim()
		const response = await vikunja.requestRaw(`tasks/${taskId}/attachments/${attachmentId}`, {
			method: 'GET',
			params: previewSize ? {preview_size: previewSize} : {},
			headers: {
				Accept: '*/*',
			},
		})

		const buffer = Buffer.from(await response.arrayBuffer())
		const headers = {}
		for (const headerName of ['content-type', 'content-length', 'content-disposition', 'cache-control', 'etag', 'last-modified']) {
			const value = response.headers.get(headerName)
			if (value) {
				headers[headerName] = value
			}
		}
		sendBuffer(res, response.status, buffer, headers)
		return
	}

	if (taskAttachmentMatch && req.method === 'DELETE') {
		const taskId = Number(taskAttachmentMatch[1])
		const attachmentId = Number(taskAttachmentMatch[2])
		await vikunja.request(`tasks/${taskId}/attachments/${attachmentId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (taskRelationsMatch && req.method === 'PUT') {
		const taskId = Number(taskRelationsMatch[1])
		const body = await readJsonBody(req)
		const otherTaskId = Number(body.other_task_id || body.otherTaskId || 0)
		const relationKind = body.relation_kind || body.relationKind || ''

		if (!otherTaskId || !relationKind) {
			sendJson(res, 400, {error: 'other_task_id and relation_kind are required.'})
			return
		}

		const result = await vikunja.request(`tasks/${taskId}/relations`, {
			method: 'PUT',
			body: {
				task_id: taskId,
				other_task_id: otherTaskId,
				relation_kind: relationKind,
			},
		})
		sendJson(res, 201, result)
		return
	}

	if (taskRelationDeleteMatch && req.method === 'DELETE') {
		const taskId = Number(taskRelationDeleteMatch[1])
		const relationKind = taskRelationDeleteMatch[2]
		const otherTaskId = Number(taskRelationDeleteMatch[3])
		await vikunja.request(`tasks/${taskId}/relations/${relationKind}/${otherTaskId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (taskPositionMatch && req.method === 'POST') {
		const taskId = Number(taskPositionMatch[1])
		const body = await readJsonBody(req)
		const projectViewId = body.project_view_id ? Number(body.project_view_id) : Number(body.projectViewId || 0)
		const position = Number(body.position)

		if (!projectViewId) {
			sendJson(res, 400, {error: 'project_view_id is required.'})
			return
		}

		if (!Number.isFinite(position)) {
			sendJson(res, 400, {error: 'position must be a number.'})
			return
		}

		logInfo('task.position.forward', {
			taskId,
			projectViewId,
			position,
		})

		const taskPosition = await vikunja.request(`tasks/${taskId}/position`, {
			method: 'POST',
			body: {
				task_id: taskId,
				project_view_id: projectViewId,
				position,
			},
		})
		logInfo('task.position.result', {
			taskId,
			projectViewId,
			position: Number(taskPosition?.position),
		})
		sendJson(res, 200, {taskPosition})
		return
	}

	if (taskDuplicateMatch && req.method === 'POST') {
		const taskId = Number(taskDuplicateMatch[1])
		const result = await vikunja.request(`tasks/${taskId}/duplicate`, {
			method: 'PUT',
			body: {
				task_id: taskId,
			},
		})
		sendJson(res, 200, result)
		return
	}

	if (taskLabelCollectionMatch && req.method === 'POST') {
		const taskId = Number(taskLabelCollectionMatch[1])
		const body = await readJsonBody(req)
		let labelId = body.labelId ? Number(body.labelId) : null
		const title = `${body.title || ''}`.trim()

		if (!labelId && !title) {
			sendJson(res, 400, {error: 'Label title or labelId is required.'})
			return
		}

		if (!labelId) {
			const labels = await vikunja.fetchAllPages('labels')
			const existingLabel = labels.find(label => `${label.title || ''}`.toLowerCase() === title.toLowerCase())
			if (existingLabel) {
				labelId = Number(existingLabel.id)
			} else {
				const createdLabel = await vikunja.request('labels', {
					method: 'PUT',
					body: {
						title,
						hex_color: body.hexColor || '#1973ff',
					},
				})
				labelId = Number(createdLabel.id)
			}
		}

		const result = await vikunja.request(`tasks/${taskId}/labels`, {
			method: 'PUT',
			body: {
				label_id: labelId,
			},
		})
		sendJson(res, 200, result)
		return
	}

	if (taskLabelsBulkMatch && req.method === 'POST') {
		const taskId = Number(taskLabelsBulkMatch[1])
		const body = await readJsonBody(req)
		const result = await vikunja.request(`tasks/${taskId}/labels/bulk`, {
			method: 'POST',
			body: {
				labels: body.labels || [],
			},
		})
		sendJson(res, 200, result)
		return
	}

	if (taskLabelMatch && req.method === 'DELETE') {
		const taskId = Number(taskLabelMatch[1])
		const labelId = Number(taskLabelMatch[2])
		await vikunja.request(`tasks/${taskId}/labels/${labelId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (taskReadMatch && req.method === 'POST') {
		const taskId = Number(taskReadMatch[1])
		await vikunja.request(`tasks/${taskId}/read`, {
			method: 'POST',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	if (taskMatch && req.method === 'GET') {
		const taskId = Number(taskMatch[1])
		const task = await vikunja.request(`tasks/${taskId}`, {
			method: 'GET',
		})
		const comments = await vikunja.fetchAllPages(`tasks/${taskId}/comments`)
		sendJson(res, 200, {task: mergeTaskComments(task, comments)})
		return
	}

	if (taskMatch && req.method === 'POST') {
		const taskId = Number(taskMatch[1])
		const body = await readJsonBody(req)
		const task = await vikunja.request(`tasks/${taskId}`, {
			method: 'POST',
			body,
		})
		const comments = await vikunja.fetchAllPages(`tasks/${taskId}/comments`)
		sendJson(res, 200, {task: mergeTaskComments(task, comments)})
		return
	}

	if (taskMatch && req.method === 'DELETE') {
		const taskId = Number(taskMatch[1])
		await vikunja.request(`tasks/${taskId}`, {
			method: 'DELETE',
		})
		sendJson(res, 200, {ok: true})
		return
	}

	sendJson(res, 404, {error: 'Route not found.'})
}

async function handleHealth(req, res) {
	const upstream = await checkUpstreamHealth()
	const sessionStats = sessionStore.getStats()
	const payload = {
		ok: upstream.ok,
		buildId,
		timestamp: new Date().toISOString(),
		uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
		sessionStore: {
			count: sessionStats.count,
			persistenceEnabled: sessionStats.persistenceEnabled,
			filePath: sessionStats.filePath,
			keyPath: sessionStats.keyPath,
			ttlSeconds: sessionStats.ttlSeconds,
		},
		vikunja: upstream,
	}

	sendJson(res, payload.ok ? 200 : 503, payload)
}

function getAppSessionId(req) {
	const cookies = parseCookies(req.headers.cookie || '')
	return cookies[appSessionCookieName] || ''
}

function buildAppSessionCookie(sessionId) {
	return serializeCookie(appSessionCookieName, sessionId, {
		httpOnly: true,
		sameSite: 'Strict',
		secure: cookieSecure,
		path: '/',
		maxAge: appSessionTtlSeconds,
	})
}

function refreshAppSessionCookie(res, sessionId) {
	if (!res || !sessionId || res.headersSent) {
		return
	}

	const nextCookie = buildAppSessionCookie(sessionId)
	const existing = res.getHeader('Set-Cookie')
	if (!existing) {
		res.setHeader('Set-Cookie', nextCookie)
		return
	}

	const existingCookies = Array.isArray(existing) ? existing : [existing]
	const otherCookies = existingCookies.filter(cookie => {
		const serialized = `${cookie || ''}`
		return !serialized.startsWith(`${encodeURIComponent(appSessionCookieName)}=`)
	})
	res.setHeader('Set-Cookie', [...otherCookies, nextCookie])
}

function invalidateAppSession(res, sessionId, {setIgnoreLegacy = true} = {}) {
	if (!sessionId) {
		return
	}

	accountRefreshOperations.delete(sessionId)
	sessionStore.delete(sessionId)
	if (!res || res.headersSent) {
		return
	}

	const existing = res.getHeader('Set-Cookie')
	const existingCookies = existing ? (Array.isArray(existing) ? existing : [existing]) : []
	const otherCookies = existingCookies.filter(cookie => {
		const serialized = `${cookie || ''}`
		return (
			!serialized.startsWith(`${encodeURIComponent(appSessionCookieName)}=`) &&
			!serialized.startsWith(`${encodeURIComponent(ignoreLegacyCookieName)}=`)
		)
	})

	res.setHeader('Set-Cookie', [
		...otherCookies,
		clearCookie(appSessionCookieName, {
			httpOnly: true,
			sameSite: 'Strict',
			secure: cookieSecure,
			path: '/',
		}),
		...(setIgnoreLegacy
			? [
				serializeCookie(ignoreLegacyCookieName, '1', {
					httpOnly: true,
					sameSite: 'Strict',
					secure: cookieSecure,
					path: '/',
					maxAge: appSessionTtlSeconds,
				}),
			]
			: []),
	])
}

function coordinateAccountRefresh(sessionId, refreshOperation) {
	if (!sessionId || typeof refreshOperation !== 'function') {
		return Promise.resolve().then(() => refreshOperation())
	}

	const current = accountRefreshOperations.get(sessionId)
	if (current) {
		return current
	}

	const next = Promise.resolve()
		.then(() => refreshOperation())
		.finally(() => {
			if (accountRefreshOperations.get(sessionId) === next) {
				accountRefreshOperations.delete(sessionId)
			}
		})

	accountRefreshOperations.set(sessionId, next)
	return next
}

async function fetchUpstreamAuthInfo(baseUrl) {
	let infoResponse
	try {
		infoResponse = await fetch(new URL('info', `${baseUrl}/`), {
			headers: {
				Accept: 'application/json',
			},
		})
	} catch {
		const error = new Error('Unable to load auth settings from the Vikunja server.')
		error.statusCode = 502
		throw error
	}

	if (!infoResponse.ok) {
		const error = new Error('Unable to load auth settings from the Vikunja server.')
		error.statusCode = 502
		throw error
	}

	const payload = await infoResponse.json().catch(() => ({}))
	const localAuth = typeof payload?.auth?.local === 'object' && payload.auth.local ? payload.auth.local : null
	return {
		baseUrl,
		localEnabled: typeof localAuth?.enabled === 'boolean' ? localAuth.enabled : null,
		registrationEnabled:
			typeof localAuth?.registration_enabled === 'boolean' ? localAuth.registration_enabled : null,
	}
}

async function getVikunjaContext(req, res = null) {
	const cookies = parseCookies(req.headers.cookie || '')
	const ignoreLegacy = cookies[ignoreLegacyCookieName] === '1'
	const appSessionId = getAppSessionId(req)
	const session = sessionStore.get(appSessionId)
	if (session?.account) {
		refreshAppSessionCookie(res, appSessionId)
		return await hydrateOperatorAccountContext({
			source: 'account',
			sessionId: appSessionId,
			account: session.account,
			client: createAccountClient(session.account, appSessionId, res),
		})
	}

	// Legacy API-token mode is retained as a development-only fallback.
	if (legacyConfigured && !ignoreLegacy) {
		const account = {
			authMode: 'apiToken',
			baseUrl: vikunjaBaseUrl,
			apiToken: vikunjaApiToken,
			user: null,
		}
		return {
			source: 'legacy',
			sessionId: null,
			account,
			client: createVikunjaClient({
				baseUrl: account.baseUrl,
				authMode: account.authMode,
				apiToken: account.apiToken,
			}),
		}
	}

	return null
}

async function requireVikunjaContext(req, res = null) {
	const context = await getVikunjaContext(req, res)
	if (!context) {
		const error = new Error('Connect a Vikunja account in Settings first.')
		error.statusCode = 401
		throw error
	}

	return context
}

async function requireInteractiveSession(req, res = null, {refreshCookie = true} = {}) {
	const appSessionId = getAppSessionId(req)
	const session = sessionStore.get(appSessionId)
	if (!session?.account) {
		const error = new Error('An account-backed session is required for this action.')
		error.statusCode = 401
		throw error
	}

	if (session.account.authMode !== 'password') {
		const error = new Error('This action requires a session-based Vikunja login.')
		error.statusCode = 400
		throw error
	}

	if (refreshCookie) {
		refreshAppSessionCookie(res, appSessionId)
	}

	return await hydrateOperatorAccountContext({
		source: 'account',
		sessionId: appSessionId,
		account: session.account,
		client: createAccountClient(session.account, appSessionId, res),
	})
}

async function requireAdminSession(req, res = null, {allowBridgeUnavailable = false} = {}) {
	const context = await requireInteractiveSession(req, res)
	if (!adminBridge.isOperatorAccount(context.account)) {
		const error = new Error('This action requires an authorized operator account.')
		error.statusCode = 403
		throw error
	}

	if (!allowBridgeUnavailable && !adminBridge.enabled) {
		const error = new Error('The Vikunja admin bridge is not configured correctly.')
		error.statusCode = 503
		throw error
	}

	return context
}

async function hydrateOperatorAccountContext(context) {
	if (!context?.account || context.account.authMode !== 'password') {
		return context
	}

	const hydratedAccount = await hydrateOperatorAccountIdentity(context.account, context.sessionId)
	if (hydratedAccount === context.account) {
		return context
	}

	return {
		...context,
		account: hydratedAccount,
	}
}

async function hydrateOperatorAccountIdentity(account, sessionId = '') {
	if (!account || account.authMode !== 'password' || !adminBridge.enabled) {
		return account
	}

	const currentEmail = `${account.user?.email || ''}`.trim()
	if (currentEmail) {
		return account
	}

	const currentUsername = `${account.user?.username || ''}`.trim().toLowerCase()
	const currentUserId = Number(account.user?.id || 0)
	if (!currentUsername && currentUserId <= 0) {
		return account
	}

	let matchedUser = null
	try {
		const users = await adminBridge.listUsers()
		matchedUser = users.find(user =>
			(currentUserId > 0 && Number(user.id || 0) === currentUserId) ||
			(currentUsername && `${user.username || ''}`.trim().toLowerCase() === currentUsername),
		) || null
	} catch {
		return account
	}

	const hydratedEmail = `${matchedUser?.email || ''}`.trim()
	if (!hydratedEmail) {
		return account
	}

	const hydratedAccount = {
		...account,
		user: {
			...(account.user || {}),
			email: hydratedEmail,
		},
	}

	if (sessionId) {
		const current = sessionStore.get(sessionId)
		if (current) {
			sessionStore.update(sessionId, {
				account: hydratedAccount,
			})
		}
	}

	return hydratedAccount
}

function assertAdminUserMutationAllowed(account, identifier, action) {
	const normalizedIdentifier = `${identifier || ''}`.trim().toLowerCase()
	const currentUserId = String(Number(account?.user?.id || 0))
	const currentUsername = `${account?.user?.username || ''}`.trim().toLowerCase()
	const currentEmail = `${account?.user?.email || ''}`.trim().toLowerCase()
	const targetsCurrentUser = Boolean(
		normalizedIdentifier &&
			(normalizedIdentifier === currentUserId ||
				(currentUsername && normalizedIdentifier === currentUsername) ||
				(currentEmail && normalizedIdentifier === currentEmail)),
	)

	if (targetsCurrentUser && (action === 'disable' || action === 'delete')) {
		const error = new Error('You cannot disable or delete the account you are currently signed in with.')
		error.statusCode = 400
		throw error
	}
}

function createAccountClient(account, sessionId, res = null) {
	return createVikunjaClient({
		baseUrl: account.baseUrl,
		authMode: account.authMode,
		apiToken: account.apiToken || '',
		accessToken: account.accessToken || '',
		refreshCookie: account.refreshCookie || '',
		getAuthState: () => sessionStore.get(sessionId)?.account || null,
		coordinateRefresh: refreshOperation => coordinateAccountRefresh(sessionId, refreshOperation),
		onAuthFailure: failure => {
			const statusCode = Number(failure?.statusCode || 0)
			if (statusCode === 401) {
				invalidateAppSession(res, sessionId)
			}
		},
		onAuthStateChange: patch => {
			const current = sessionStore.get(sessionId)
			if (!current) {
				return
			}

			sessionStore.update(sessionId, {
				account: {
					...current.account,
					...patch,
				},
			})
		},
	})
}

function updateSessionUser(context, user) {
	if (context.source !== 'account' || !context.sessionId) {
		return
	}

	const current = sessionStore.get(context.sessionId)
	if (!current) {
		return
	}

	const nextEmail = `${user?.email || ''}`.trim() || `${current.account?.user?.email || ''}`.trim()

	sessionStore.update(context.sessionId, {
		account: {
			...current.account,
			user: {
				...(user || {}),
				email: nextEmail,
			},
		},
	})
}

function summarizeAccount(account, source) {
	return {
		source,
		authMode: account.authMode,
		baseUrl: account.baseUrl,
		linkShareAuth: account.linkShareAuth === true,
		linkShareProjectId:
			account.linkShareAuth === true && Number(account.linkShareProjectId || 0) > 0
				? Number(account.linkShareProjectId)
				: null,
		isAdmin:
			source === 'account' &&
			account.authMode === 'password' &&
			adminBridge.isOperatorAccount(account),
		instanceFeatures: account.instanceFeatures
			? {
				linkSharingEnabled:
					typeof account.instanceFeatures.linkSharingEnabled === 'boolean'
						? account.instanceFeatures.linkSharingEnabled
						: null,
				publicTeamsEnabled:
					typeof account.instanceFeatures.publicTeamsEnabled === 'boolean'
						? account.instanceFeatures.publicTeamsEnabled
						: null,
				frontendUrl: `${account.instanceFeatures.frontendUrl || ''}`.trim() || null,
				emailRemindersEnabled:
					typeof account.instanceFeatures.emailRemindersEnabled === 'boolean'
						? account.instanceFeatures.emailRemindersEnabled
						: null,
			}
			: null,
		user: account.user
			? {
				id: account.user.id,
				name: account.user.name || '',
				username: account.user.username || '',
				email: account.user.email || '',
			}
			: null,
		sessionsSupported: source === 'account' && account.authMode === 'password',
		disconnectSupported: source === 'account',
	}
}

function normalizeTaskGraph(tasks) {
	if (!Array.isArray(tasks) || tasks.length === 0) {
		return []
	}

	const normalizedTasks = tasks.map(task => ({
		...task,
		related_tasks: {
			...Object.fromEntries(
				Object.entries(task.related_tasks || {}).map(([relation, refs]) => [
					relation,
					Array.isArray(refs) ? refs.map(ref => ({...ref})) : [],
				]),
			),
			parenttask: Array.isArray(task.related_tasks?.parenttask)
				? task.related_tasks.parenttask.map(ref => ({...ref}))
				: [],
			subtask: Array.isArray(task.related_tasks?.subtask)
				? task.related_tasks.subtask.map(ref => ({...ref}))
				: [],
		},
	}))
	const taskMap = new Map(normalizedTasks.map(task => [task.id, task]))

	for (const task of normalizedTasks) {
		for (const parentRef of task.related_tasks.parenttask) {
			const parent = taskMap.get(parentRef.id)
			if (!parent) {
				continue
			}

			if (!parent.related_tasks.subtask.some(entry => entry.id === task.id)) {
				parent.related_tasks.subtask.push(makeTaskRelationRef(task))
			}
		}

		for (const childRef of task.related_tasks.subtask) {
			const child = taskMap.get(childRef.id)
			if (!child) {
				continue
			}

			if (!child.related_tasks.parenttask.some(entry => entry.id === task.id)) {
				child.related_tasks.parenttask.push(makeTaskRelationRef(task))
			}
		}
	}

	return normalizedTasks
}

function mergeTaskComments(task, comments) {
	const normalizedComments = Array.isArray(comments) ? comments.map(comment => ({
		...comment,
		author: comment?.author ? {...comment.author} : null,
	})) : []

	return {
		...task,
		comments: normalizedComments,
		comment_count: normalizedComments.length,
	}
}

function hasMissingTaskAncestors(tasks) {
	if (!Array.isArray(tasks) || tasks.length === 0) {
		return false
	}

	const taskIds = new Set(tasks.map(task => Number(task?.id || 0)).filter(Boolean))
	return tasks.some(task => (task.related_tasks?.parenttask || []).some(parentRef => {
		const parentId = Number(parentRef?.id || 0)
		return parentId && !taskIds.has(parentId)
	}))
}

function hydrateTaskAncestors(tasks, projectTasks) {
	if (!Array.isArray(tasks) || tasks.length === 0) {
		return []
	}

	if (!Array.isArray(projectTasks) || projectTasks.length === 0) {
		return normalizeTaskGraph(tasks)
	}

	const mergedTasks = [...tasks]
	const includedTaskIds = new Set(tasks.map(task => Number(task?.id || 0)).filter(Boolean))
	const projectTaskMap = new Map(projectTasks.map(task => [Number(task?.id || 0), task]))
	const queue = [...tasks]

	while (queue.length > 0) {
		const currentTask = queue.pop()
		for (const parentRef of currentTask?.related_tasks?.parenttask || []) {
			const parentId = Number(parentRef?.id || 0)
			if (!parentId || includedTaskIds.has(parentId)) {
				continue
			}

			const parentTask = projectTaskMap.get(parentId)
			if (!parentTask) {
				continue
			}

			includedTaskIds.add(parentId)
			mergedTasks.push(parentTask)
			queue.push(parentTask)
		}
	}

	return normalizeTaskGraph(mergedTasks)
}

function makeTaskRelationRef(task) {
	return {
		id: task.id,
		title: task.title,
		project_id: task.project_id,
		done: task.done,
		position: task.position,
	}
}

function readTaskCollectionParams(url) {
	const sortBy = readMultiValueQueryParam(url.searchParams, 'sort_by')
	const orderBy = readMultiValueQueryParam(url.searchParams, 'order_by')
	const expand = readMultiValueQueryParam(url.searchParams, 'expand')
	const filterTimezone = `${url.searchParams.get('filter_timezone') || ''}`.trim()
	const query = {
		s: `${url.searchParams.get('s') || ''}`.trim(),
		filter: `${url.searchParams.get('filter') || ''}`.trim(),
		sort_by: sortBy,
		order_by: orderBy,
	}

	if (expand.length > 0) {
		query.expand = expand
	} else if (!query.s) {
		query.expand = ['subtasks']
	}

	if (filterTimezone) {
		query.filter_timezone = filterTimezone
	}

	const includeNulls = parseBooleanQueryParam(url.searchParams.get('filter_include_nulls'))
	if (typeof includeNulls === 'boolean') {
		query.filter_include_nulls = includeNulls
	}

	return query
}

function sanitizeProjectTaskCollectionParams(query) {
	const sortBy = Array.isArray(query.sort_by) ? query.sort_by : []
	const orderBy = Array.isArray(query.order_by) ? query.order_by : []
	const pairs = sortBy.map((value, index) => ({
		sortBy: `${value || ''}`.trim(),
		orderBy: `${orderBy[index] || 'asc'}`.trim() || 'asc',
	}))
	const filteredPairs = pairs.filter(pair => pair.sortBy && pair.sortBy !== 'position')

	if (filteredPairs.length === pairs.length) {
		return query
	}

	return {
		...query,
		sort_by: filteredPairs.length > 0 ? filteredPairs.map(pair => pair.sortBy) : ['id'],
		order_by: filteredPairs.length > 0 ? filteredPairs.map(pair => pair.orderBy) : ['asc'],
	}
}

function isGroupedBucketTaskPayload(payload) {
	return Array.isArray(payload) && payload.every(entry =>
		entry &&
		typeof entry === 'object' &&
		('project_view_id' in entry || 'projectViewId' in entry || 'tasks' in entry) &&
		!('project_id' in entry && !('project_view_id' in entry || 'projectViewId' in entry || 'tasks' in entry)),
	)
}

function readMultiValueQueryParam(searchParams, key) {
	return searchParams
		.getAll(key)
		.flatMap(value => `${value}`.split(','))
		.map(value => value.trim())
		.filter(Boolean)
}

function parseBooleanQueryParam(value) {
	if (value === 'true') {
		return true
	}

	if (value === 'false') {
		return false
	}

	return null
}

function setSecurityHeaders(res) {
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.setHeader('X-Frame-Options', 'DENY')
	res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
	res.setHeader(
		'Content-Security-Policy',
		"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:",
	)

	if (httpsEnabled) {
		res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
	}
}

function enforceRateLimit(req, res, limiter, scope) {
	const key = `${scope}:${getRateLimitClientKey(req)}`
	const result = limiter.consume(key)
	res.setHeader('X-RateLimit-Limit', String(result.limit))
	res.setHeader('X-RateLimit-Remaining', String(result.remaining))
	res.setHeader('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)))

	if (result.allowed) {
		return true
	}

	sendJson(res, 429, {
		error: 'Too many requests. Please try again later.',
		retryAfterSeconds: result.retryAfterSeconds,
	}, {
		'Retry-After': String(result.retryAfterSeconds),
	})
	return false
}

function getRateLimitClientKey(req) {
	const forwardedFor = `${req.headers['x-forwarded-for'] || ''}`.trim()
	if (appTrustProxy && forwardedFor) {
		return forwardedFor.split(',')[0].trim()
	}

	return req.socket?.remoteAddress || 'unknown'
}

function attachRequestLogging(req, res, requestId, startedAt) {
	if (!logRequests) {
		return
	}

	res.on('finish', () => {
		logInfo('request.complete', {
			requestId,
			method: req.method || 'GET',
			path: req.url || '/',
			statusCode: res.statusCode,
			durationMs: Date.now() - startedAt,
			remoteAddress: req.socket?.remoteAddress || null,
			userAgent: req.headers['user-agent'] || null,
		})
	})
}

function assertTrustedOrigin(req) {
	if (!isUnsafeMethod(req.method || 'GET')) {
		return
	}

	const candidateOrigin = getRequestOrigin(req)
	if (!candidateOrigin) {
		return
	}

	if (isSameOriginRequest(req, candidateOrigin)) {
		return
	}

	const error = new Error('Origin is not allowed.')
	error.statusCode = 403
	error.details = {
		origin: candidateOrigin,
		expectedOrigin: getExpectedRequestOrigin(req),
	}
	throw error
}

function isUnsafeMethod(method) {
	return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(`${method || ''}`.toUpperCase())
}

function isSameOriginRequest(req, candidateOrigin) {
	const expectedOrigin = getExpectedRequestOrigin(req)
	if (!expectedOrigin) {
		return false
	}

	try {
		return new URL(candidateOrigin).origin === expectedOrigin
	} catch {
		return false
	}
}

function getExpectedRequestOrigin(req) {
	const forwardedHost = appTrustProxy ? getFirstForwardedValue(req.headers['x-forwarded-host']) : ''
	const forwardedProto = appTrustProxy ? getFirstForwardedValue(req.headers['x-forwarded-proto']) : ''
	const host = forwardedHost || `${req.headers.host || ''}`.trim()
	if (!host) {
		return ''
	}

	const protocol = forwardedProto || (req.socket?.encrypted ? 'https' : 'http')
	return `${protocol}://${host}`
}

function getFirstForwardedValue(value) {
	return `${value || ''}`
		.split(',')[0]
		.trim()
		.toLowerCase()
}

function getRequestOrigin(req) {
	const origin = `${req.headers.origin || ''}`.trim()
	if (origin) {
		return origin
	}

	const referer = `${req.headers.referer || ''}`.trim()
	if (!referer) {
		return ''
	}

	try {
		return new URL(referer).origin
	} catch {
		return ''
	}
}

async function checkUpstreamHealth() {
	const baseUrl = defaultVikunjaBaseUrl || vikunjaBaseUrl
	if (!baseUrl) {
		return {
			ok: true,
			configured: false,
			baseUrl: null,
			statusCode: null,
			responseTimeMs: null,
		}
	}

	const startedAt = Date.now()
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), healthcheckUpstreamTimeoutMs)

	try {
		const response = await fetch(new URL('info', `${baseUrl}/`), {
			headers: {
				Accept: 'application/json',
			},
			signal: controller.signal,
		})

		return {
			ok: response.ok,
			configured: true,
			baseUrl,
			statusCode: response.status,
			responseTimeMs: Date.now() - startedAt,
		}
	} catch (error) {
		return {
			ok: false,
			configured: true,
			baseUrl,
			statusCode: null,
			responseTimeMs: Date.now() - startedAt,
			error: error.name === 'AbortError' ? 'Upstream health check timed out.' : (error.message || 'Upstream health check failed.'),
		}
	} finally {
		clearTimeout(timeout)
	}
}

function logInfo(event, payload = {}) {
	console.log(JSON.stringify({
		level: 'info',
		event,
		timestamp: new Date().toISOString(),
		...payload,
	}))
}

function logWarn(event, payload = {}) {
	console.warn(JSON.stringify({
		level: 'warn',
		event,
		timestamp: new Date().toISOString(),
		...payload,
	}))
}

function logError(event, payload = {}) {
	console.error(JSON.stringify({
		level: 'error',
		event,
		timestamp: new Date().toISOString(),
		...payload,
	}))
}

async function listSavedFilters(vikunja, search) {
	try {
		return dedupeSavedFilters(
			(await vikunja.fetchAllPages('filters'))
				.map(summarizeSavedFilter)
				.filter(filter => !search || `${filter.title || ''}`.toLowerCase().includes(search)),
		)
	} catch (error) {
		if (!isLegacySavedFilterRouteError(error)) {
			throw error
		}

		const projects = await vikunja.fetchAllPages('projects')
		return dedupeSavedFilters(
			projects
				.filter(project => Number(project.id) < 0)
				.map(summarizeSavedFilterProject)
				.filter(filter => !search || `${filter.title || ''}`.toLowerCase().includes(search)),
		)
	}
}

function summarizeSavedFilter(filter) {
	const {id, projectId} = normalizeSavedFilterIdentity(filter)
	return {
		id,
		projectId,
		title: filter.title || '',
		description: filter.description || '',
		isFavorite: Boolean(filter.is_favorite),
		created: filter.created || null,
		updated: filter.updated || null,
	}
}

function summarizeSavedFilterProject(project) {
	const projectId = Number(project.id || 0)
	return {
		id: getFilterIdFromSavedFilterProjectId(projectId),
		projectId,
		title: project.title || '',
		description: project.description || '',
		isFavorite: Boolean(project.is_favorite),
		created: project.created || null,
		updated: project.updated || null,
	}
}

function dedupeSavedFilters(filters) {
	const seen = new Set()
	return filters.filter(filter => {
		const key = filter.projectId < 0 ? `project:${filter.projectId}` : `id:${filter.id}`
		if (seen.has(key)) {
			return false
		}
		seen.add(key)
		return true
	})
}

function normalizeSavedFilterIdentity(filter) {
	const explicitProjectId = toIntegerOrNull(filter.projectId ?? filter.project_id)
	const explicitFilterId = toIntegerOrNull(filter.filterId ?? filter.filter_id)
	const rawId = toIntegerOrNull(filter.id)

	if (explicitFilterId !== null && explicitFilterId >= 0) {
		return {
			id: explicitFilterId,
			projectId: explicitProjectId !== null && explicitProjectId < 0 ? explicitProjectId : getSavedFilterProjectId(explicitFilterId),
		}
	}

	if (rawId !== null && rawId > 0) {
		return {
			id: rawId,
			projectId: explicitProjectId !== null && explicitProjectId < 0 ? explicitProjectId : getSavedFilterProjectId(rawId),
		}
	}

	if (rawId !== null && rawId < 0) {
		return {
			id: getFilterIdFromSavedFilterProjectId(rawId),
			projectId: rawId,
		}
	}

	if (explicitProjectId !== null && explicitProjectId < 0) {
		return {
			id: getFilterIdFromSavedFilterProjectId(explicitProjectId),
			projectId: explicitProjectId,
		}
	}

	return {
		id: rawId ?? 0,
		projectId: getSavedFilterProjectId(rawId ?? 0),
	}
}

function isLegacySavedFilterRouteError(error) {
	return [404, 405].includes(Number(error?.statusCode || 0))
}

function getSavedFilterProjectId(filterId) {
	const numericFilterId = Number(filterId)
	if (!Number.isInteger(numericFilterId) || numericFilterId < 0) {
		return 0
	}

	return (numericFilterId + 1) * -1
}

function getFilterIdFromSavedFilterProjectId(projectId) {
	const numericProjectId = Number(projectId)
	if (!Number.isInteger(numericProjectId) || numericProjectId >= -1) {
		return 0
	}

	return Math.abs(numericProjectId) - 1
}

function toIntegerOrNull(value) {
	const numericValue = Number(value)
	return Number.isInteger(numericValue) ? numericValue : null
}

function buildSavedFilterPayload(body, filterId = 0) {
	const filters = body?.filters && typeof body.filters === 'object' ? body.filters : {}
	const payload = {
		title: `${body?.title || ''}`.trim(),
		description: `${body?.description || ''}`.trim(),
		is_favorite: Boolean(body?.is_favorite ?? body?.isFavorite),
		filters: {
			filter: `${filters.filter || body?.filter || 'done = false'}`.trim(),
			filter_include_nulls: Boolean(filters.filter_include_nulls ?? filters.filterIncludeNulls ?? body?.filter_include_nulls ?? body?.filterIncludeNulls),
			sort_by: normalizeTaskCollectionArray(filters.sort_by ?? filters.sortBy ?? body?.sort_by ?? body?.sortBy),
			order_by: normalizeTaskCollectionArray(filters.order_by ?? filters.orderBy ?? body?.order_by ?? body?.orderBy),
		},
	}

	const searchText = `${filters.s || body?.s || ''}`.trim()
	if (searchText) {
		payload.filters.s = searchText
	}

	const filterTimezone = `${filters.filter_timezone || filters.filterTimezone || body?.filter_timezone || body?.filterTimezone || ''}`.trim()
	if (filterTimezone) {
		payload.filters.filter_timezone = filterTimezone
	}

	if (filterId > 0) {
		payload.id = filterId
	}

	return payload
}

function normalizeTaskCollectionArray(value) {
	if (Array.isArray(value)) {
		return value.map(entry => `${entry}`.trim()).filter(Boolean)
	}

	if (typeof value === 'string') {
		return value
			.split(',')
			.map(entry => entry.trim())
			.filter(Boolean)
	}

	return []
}

function normalizeOptionalDate(value) {
	const normalized = `${value || ''}`.trim()
	return normalized || undefined
}

function normalizeSharePermission(value) {
	const numericPermission = Number(value)
	if (numericPermission === 0 || numericPermission === 1 || numericPermission === 2) {
		return numericPermission
	}

	return 1
}

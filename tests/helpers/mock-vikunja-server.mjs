import http from 'node:http'
import {setTimeout as delay} from 'node:timers/promises'
import {createMockFixture, cloneFixture} from './mock-data.mjs'

const ONE_PIXEL_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6V1x8AAAAASUVORK5CYII=',
	'base64',
)

export async function createMockVikunjaServer({
	avatarRouteStyle = 'suffix',
	hideAuthenticatedUserEmail = false,
	localAuthEnabled = true,
	registrationEnabled = true,
	caldavEnabled = true,
	totpState = null,
	oidcProviders = [],
	enabledBackgroundProviders = ['unsplash'],
	availableMigrators = ['vikunja-file', 'ticktick', 'todoist', 'trello', 'microsoft-todo'],
	motd = 'Smoke suite MOTD',
	taskAttachmentsEnabled = true,
	loginAccessTokenLifetimeSeconds = 3600,
	refreshAccessTokenLifetimeSeconds = 3600,
	rotateRefreshTokens = false,
	refreshResponseDelayMs = 0,
} = {}) {
	const initialFixture = createMockFixture()
	if (totpState && typeof totpState === 'object') {
		initialFixture.totp = {
			...initialFixture.totp,
			...totpState,
		}
	}
	let state = buildMutableState(initialFixture)

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url || '/', 'http://127.0.0.1')
			const mockOidcAuthorizeMatch = url.pathname.match(/^\/mock-oidc\/([^/]+)\/authorize$/)
			if (mockOidcAuthorizeMatch && req.method === 'GET') {
				const provider = decodeURIComponent(mockOidcAuthorizeMatch[1] || '')
				const redirectUrl = `${url.searchParams.get('redirect_url') || ''}`.trim()
				const stateToken = `${url.searchParams.get('state') || ''}`.trim()
				if (!provider || !redirectUrl || !stateToken) {
					sendJson(res, 400, {error: 'provider, redirect_url, and state are required.'})
					return
				}

				const nextUrl = new URL(redirectUrl)
				nextUrl.searchParams.set('code', `mock-oidc-code-${provider}`)
				nextUrl.searchParams.set('state', stateToken)
				res.statusCode = 302
				res.setHeader('Location', nextUrl.toString())
				res.end()
				return
			}

			if (!url.pathname.startsWith('/api/v1/')) {
				sendJson(res, 404, {error: 'Route not found.'})
				return
			}

			const route = url.pathname.replace(/^\/api\/v1\//, '')
			const isMultipart = `${req.headers['content-type'] || ''}`.toLowerCase().includes('multipart/form-data')
			const body = req.method === 'GET' || req.method === 'DELETE' || isMultipart ? null : await readJsonBody(req)
			const avatarSuffixMatch = route.match(/^([^/]+)\/avatar$/)
			const avatarPrefixMatch = route.match(/^avatar\/([^/]+)$/)

			const avatarRouteMatches = (
				(avatarRouteStyle === 'suffix' && avatarSuffixMatch) ||
				(avatarRouteStyle === 'prefix' && avatarPrefixMatch) ||
				(avatarRouteStyle === 'both' && (avatarPrefixMatch || avatarSuffixMatch))
			)

			if (avatarRouteMatches && req.method === 'GET') {
				sendBuffer(res, 200, ONE_PIXEL_PNG, {
					'Content-Type': 'image/png',
					'Cache-Control': 'no-store',
				})
				return
			}

			if (route === 'info' && req.method === 'GET') {
				const requestOrigin = `http://${req.headers.host || '127.0.0.1'}`
				sendJson(res, 200, {
					version: 'test',
					frontend_url: 'http://127.0.0.1',
					motd,
					caldav_enabled: caldavEnabled,
					task_attachments_enabled: taskAttachmentsEnabled,
					enabled_background_providers: enabledBackgroundProviders,
					available_migrators: availableMigrators,
					link_sharing_enabled: true,
					public_teams_enabled: true,
					email_reminders_enabled: true,
					auth: {
						local: {
							enabled: localAuthEnabled,
							registration_enabled: registrationEnabled,
						},
						openid: {
							enabled: oidcProviders.length > 0,
							providers: oidcProviders.map(provider => ({
								...provider,
								auth_url:
									typeof provider?.auth_url === 'string' && provider.auth_url.startsWith('/')
										? `${requestOrigin}${provider.auth_url}`
										: provider?.auth_url,
							})),
						},
					},
					registration_enabled: registrationEnabled,
				})
				return
			}

			if (route === 'register' && req.method === 'POST') {
				if (!localAuthEnabled || !registrationEnabled) {
					sendJson(res, 404, {message: 'Not Found'})
					return
				}

				const username = `${body?.username || ''}`.trim()
				const email = `${body?.email || ''}`.trim().toLowerCase()
				const password = `${body?.password || ''}`
				if (!username || !email || !password) {
					sendJson(res, 400, {error: 'Username, email, and password are required.'})
					return
				}
				if (password.length < 8) {
					sendJson(res, 412, {error: 'The password must have at least 8 characters.'})
					return
				}
				if (state.users.some(user => `${user.username || ''}`.trim() === username)) {
					sendJson(res, 400, {error: 'A user with this username already exists.'})
					return
				}
				if (state.users.some(user => `${user.email || ''}`.trim().toLowerCase() === email)) {
					sendJson(res, 400, {error: 'A user with this email already exists.'})
					return
				}

				const now = new Date().toISOString()
				const nextUser = {
					id: state.nextUserId++,
					name: username,
					username,
					email,
					created: now,
					updated: now,
					settings: buildDefaultUserSettings(),
				}
				state.users.push(nextUser)
				state.passwordsByUsername[username] = password
				sendJson(res, 200, {message: 'The user was created successfully.'})
				return
			}

			if (route === 'login' && req.method === 'POST') {
				const username = `${body?.username || ''}`.trim()
				const password = `${body?.password || ''}`.trim()
				const totpPasscode = `${body?.totp_passcode || body?.totpPasscode || ''}`.trim()
				if (!username || !password) {
					sendJson(res, 400, {error: 'Username and password are required.'})
					return
				}
				const expectedPassword = `${state.passwordsByUsername[username] || ''}`
				if (!expectedPassword || password !== expectedPassword) {
					sendJson(res, 401, {error: 'Wrong username or password.'})
					return
				}
				if (state.totp?.enabled && totpPasscode !== '123456') {
					sendJson(res, 401, {error: 'Invalid totp passcode.'})
					return
				}

				sendJson(
					res,
					200,
					{
						token: buildToken(username, loginAccessTokenLifetimeSeconds),
					},
					{
						'Set-Cookie': buildRefreshCookie(issueRefreshToken(username, {reset: true})),
					},
				)
				return
			}

			const oidcCallbackMatch = route.match(/^auth\/openid\/([^/]+)\/callback$/)
			if (oidcCallbackMatch && req.method === 'POST') {
				const provider = decodeURIComponent(oidcCallbackMatch[1] || '')
				const code = `${body?.code || ''}`.trim()
				const redirectUrl = `${body?.redirect_url || ''}`.trim()
				const configuredProvider = oidcProviders.find(entry => `${entry?.key || ''}`.trim() === provider)
				if (!configuredProvider) {
					sendJson(res, 404, {error: 'Unknown OpenID provider.'})
					return
				}
				if (!code || !redirectUrl) {
					sendJson(res, 400, {error: 'code and redirect_url are required.'})
					return
				}

				sendJson(
					res,
					200,
					{
						token: buildToken('smoke-user', loginAccessTokenLifetimeSeconds),
					},
					{
						'Set-Cookie': buildRefreshCookie(issueRefreshToken('smoke-user', {reset: true})),
					},
				)
				return
			}

			if (route === 'user/token/refresh' && req.method === 'POST') {
				if (refreshResponseDelayMs > 0) {
					await delay(refreshResponseDelayMs)
				}

				const refreshToken = getRefreshTokenFromRequest(req)
				if (!refreshToken) {
					sendJson(res, 401, {message: 'No refresh token provided.'})
					return
				}

				const username = `${state.refreshTokenSubjects?.[refreshToken] || ''}`.trim()
				if (!username) {
					sendJson(
						res,
						401,
						state.usedRefreshTokens?.has(refreshToken)
							? {message: 'Refresh token already used.'}
							: {message: 'Invalid or expired refresh token.'},
					)
					return
				}

				delete state.refreshTokenSubjects[refreshToken]
				if (rotateRefreshTokens) {
					state.usedRefreshTokens.add(refreshToken)
				}

				sendJson(
					res,
					200,
					{
						token: buildToken(username, refreshAccessTokenLifetimeSeconds),
					},
					{
						'Set-Cookie': buildRefreshCookie(issueRefreshToken(username)),
					},
				)
				return
			}

			if (route === 'user' && req.method === 'GET') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				sendJson(res, 200, {
					...authenticatedUser,
					email: hideAuthenticatedUserEmail ? '' : `${authenticatedUser?.email || ''}`.trim(),
				})
				return
			}

			if (route === 'users' && req.method === 'GET') {
				const search = `${url.searchParams.get('s') || ''}`.trim().toLowerCase()
				const users = !search
					? state.users
					: state.users.filter(user => {
						const haystacks = [
							`${user.name || ''}`,
							`${user.username || ''}`,
							`${user.email || ''}`,
						]
						return haystacks.some(value => value.toLowerCase().includes(search))
					})
				sendJson(res, 200, paginate(users, url))
				return
			}

			if (route === 'user/sessions' && req.method === 'GET') {
				sendJson(res, 200, paginate(state.sessions, url))
				return
			}

			if (route === 'user/timezones' && req.method === 'GET') {
				sendJson(res, 200, ['Europe/Amsterdam', 'UTC', 'America/New_York'])
				return
			}

			if (route === 'user/password' && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const oldPassword = `${body?.old_password || ''}`
				const newPassword = `${body?.new_password || ''}`
				if (!oldPassword) {
					sendJson(res, 400, {error: 'The old password is empty.'})
					return
				}
				if (oldPassword !== `${state.passwordsByUsername[authenticatedUser.username] || ''}`) {
					sendJson(res, 401, {error: 'Wrong username or password.'})
					return
				}
				if (!newPassword) {
					sendJson(res, 400, {error: 'The new password is empty.'})
					return
				}
				if (newPassword.length < 8) {
					sendJson(res, 412, {error: 'The new password must have at least 8 characters.'})
					return
				}
				state.passwordsByUsername[authenticatedUser.username] = newPassword
				if (authenticatedUser.username === 'smoke-user') {
					state.currentPassword = newPassword
				}
				state.sessions = []
				sendJson(res, 200, {message: 'The password was updated successfully.'})
				return
			}

			if (route === 'user/password/token' && req.method === 'POST') {
				const email = `${body?.email || ''}`.trim().toLowerCase()
				if (!email) {
					sendJson(res, 400, {error: 'Email is required.'})
					return
				}

				const user = state.users.find(entry => `${entry.email || ''}`.trim().toLowerCase() === email)
				if (user) {
					const token = `reset-token-${state.nextPasswordResetTokenId++}`
					state.passwordResetTokens[token] = `${user.username || ''}`.trim()
				}

				sendJson(res, 200, {message: 'If the account exists, a reset link has been sent.'})
				return
			}

			if (route === 'user/password/reset' && req.method === 'POST') {
				const token = `${body?.token || ''}`.trim()
				const newPassword = `${body?.new_password || ''}`
				if (!token || !newPassword) {
					sendJson(res, 400, {error: 'Token and password are required.'})
					return
				}
				if (newPassword.length < 8) {
					sendJson(res, 412, {error: 'The new password must have at least 8 characters.'})
					return
				}

				const username = `${state.passwordResetTokens[token] || ''}`.trim()
				if (!username) {
					sendJson(res, 400, {error: 'Invalid or expired password reset token.'})
					return
				}

				state.passwordsByUsername[username] = newPassword
				if (username === 'smoke-user') {
					state.currentPassword = newPassword
				}
				delete state.passwordResetTokens[token]
				sendJson(res, 200, {message: 'The password was updated successfully.'})
				return
			}

			if (route === 'user/settings/email' && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const password = `${body?.password || ''}`
				const newEmail = `${body?.new_email || ''}`.trim().toLowerCase()
				if (!password || !newEmail) {
					sendJson(res, 400, {error: 'Password and new_email are required.'})
					return
				}
				if (password !== `${state.passwordsByUsername[authenticatedUser.username] || ''}`) {
					sendJson(res, 401, {error: 'Wrong username or password.'})
					return
				}

				state.pendingEmailChange = {
					username: authenticatedUser.username,
					newEmail,
					requestedAt: new Date().toISOString(),
				}
				sendJson(res, 200, {message: 'The email change was requested successfully.'})
				return
			}

			if (route === 'user/export/request' && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const password = `${body?.password || ''}`
				if (!password) {
					sendJson(res, 400, {error: 'Password is required.'})
					return
				}
				if (password !== `${state.passwordsByUsername[authenticatedUser.username] || ''}`) {
					sendJson(res, 401, {error: 'Wrong username or password.'})
					return
				}

				const createdAt = new Date().toISOString()
				state.dataExport = {
					...(state.dataExport || {}),
					status: 'ready',
					createdAt,
				}
				sendJson(res, 200, {message: 'The export was requested successfully.'})
				return
			}

			if (route === 'user/export' && req.method === 'GET') {
				sendJson(res, 200, {
					status: state.dataExport?.status || null,
					createdAt: state.dataExport?.createdAt || null,
				})
				return
			}

			if (route === 'user/export/download' && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const password = `${body?.password || ''}`
				if (!password) {
					sendJson(res, 400, {error: 'Password is required.'})
					return
				}
				if (password !== `${state.passwordsByUsername[authenticatedUser.username] || ''}`) {
					sendJson(res, 401, {error: 'Wrong username or password.'})
					return
				}
				if (state.dataExport?.status !== 'ready') {
					sendJson(res, 404, {error: 'No export is ready to download.'})
					return
				}

				sendBuffer(res, 200, Buffer.from(`${state.dataExport?.contentBase64 || ''}`, 'base64'), {
					'Content-Type': 'application/zip',
					'Content-Disposition': `attachment; filename="${state.dataExport?.filename || 'vikunja-export.zip'}"`,
				})
				return
			}

			if (route === 'user/deletion/request' && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const password = `${body?.password || ''}`
				if (authenticatedUser.is_local_user !== false && !password) {
					sendJson(res, 400, {error: 'Password is required.'})
					return
				}
				if (
					authenticatedUser.is_local_user !== false &&
					password !== `${state.passwordsByUsername[authenticatedUser.username] || ''}`
				) {
					sendJson(res, 401, {error: 'Wrong username or password.'})
					return
				}

				state.accountDeletion = {
					pending: true,
					token: `delete-token-${authenticatedUser.id}`,
					requestedAt: new Date().toISOString(),
					deleted: false,
				}
				sendJson(res, 200, {message: 'The account deletion was requested successfully.'})
				return
			}

			if (route === 'user/deletion/cancel' && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const password = `${body?.password || ''}`
				if (authenticatedUser.is_local_user !== false && !password) {
					sendJson(res, 400, {error: 'Password is required.'})
					return
				}
				if (
					authenticatedUser.is_local_user !== false &&
					password !== `${state.passwordsByUsername[authenticatedUser.username] || ''}`
				) {
					sendJson(res, 401, {error: 'Wrong username or password.'})
					return
				}

				state.accountDeletion = {
					pending: false,
					token: null,
					requestedAt: null,
					deleted: false,
				}
				updateUserProfile(authenticatedUser.username, user => ({
					...user,
					deletion_scheduled_at: '0001-01-01T00:00:00Z',
				}))
				sendJson(res, 200, {message: 'The account deletion was cancelled successfully.'})
				return
			}

			if (route === 'user/deletion/confirm' && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const token = `${body?.token || ''}`.trim()
				if (!token || token !== `${state.accountDeletion?.token || ''}`) {
					sendJson(res, 400, {error: 'Invalid deletion token.'})
					return
				}

				const scheduledAt = new Date(Date.now() + 3 * DAY_MS).toISOString()
				state.accountDeletion = {
					...(state.accountDeletion || {}),
					pending: false,
					deleted: false,
					scheduledAt,
				}
				updateUserProfile(authenticatedUser.username, user => ({
					...user,
					deletion_scheduled_at: scheduledAt,
				}))
				sendJson(res, 200, {message: 'The account was deleted successfully.'})
				return
			}

			if (route === 'user/settings/totp' && req.method === 'GET') {
				sendJson(res, 200, normalizeTotpState(state.totp))
				return
			}

			if (route === 'user/settings/totp/enroll' && req.method === 'POST') {
				state.totp = {
					enabled: false,
					secret: 'SMOKE-TOTP-SECRET',
					totp_url: 'otpauth://totp/Vikunja:smoke-user?secret=SMOKE-TOTP-SECRET&issuer=Vikunja',
				}
				sendJson(res, 200, normalizeTotpState(state.totp))
				return
			}

			if (route === 'user/settings/totp/enable' && req.method === 'POST') {
				const passcode = `${body?.passcode || ''}`.trim()
				if (!passcode) {
					sendJson(res, 400, {error: 'Passcode is required.'})
					return
				}

				state.totp = {
					...(state.totp || {}),
					enabled: true,
				}
				sendJson(res, 200, {enabled: true})
				return
			}

			if (route === 'user/settings/totp/disable' && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const password = `${body?.password || ''}`
				if (!password) {
					sendJson(res, 400, {error: 'Password is required.'})
					return
				}
				if (password !== `${state.passwordsByUsername[authenticatedUser.username] || ''}`) {
					sendJson(res, 401, {error: 'Wrong username or password.'})
					return
				}

				state.totp = {
					enabled: false,
					secret: null,
					totp_url: null,
				}
				sendJson(res, 200, {enabled: false})
				return
			}

			if (route === 'user/settings/totp/qrcode' && req.method === 'GET') {
				sendBuffer(res, 200, ONE_PIXEL_PNG, {
					'Content-Type': 'image/png',
					'Cache-Control': 'no-store',
				})
				return
			}

			if (route === 'user/settings/token/caldav' && req.method === 'GET') {
				sendJson(res, 200, paginate((state.caldavTokens || []).map(stripSecretTokenFields), url))
				return
			}

			if (route === 'user/settings/token/caldav' && req.method === 'PUT') {
				const now = new Date().toISOString()
				const tokenId = Number(state.nextCaldavTokenId || 1)
				const token = {
					id: tokenId,
					created: now,
					token: `caldav-token-${tokenId}`,
				}
				state.nextCaldavTokenId = tokenId + 1
				state.caldavTokens = [...(state.caldavTokens || []), token]
				sendJson(res, 200, token)
				return
			}

			const caldavTokenMatch = route.match(/^user\/settings\/token\/caldav\/(\d+)$/)
			if (caldavTokenMatch && req.method === 'DELETE') {
				const tokenId = Number(caldavTokenMatch[1])
				state.caldavTokens = (state.caldavTokens || []).filter(token => Number(token.id) !== tokenId)
				sendJson(res, 200, {ok: true})
				return
			}

			if (route === 'tokens' && req.method === 'GET') {
				sendJson(res, 200, paginate((state.apiTokens || []).map(stripSecretTokenFields), url))
				return
			}

			if (route === 'tokens' && req.method === 'PUT') {
				if (!isValidApiTokenPayload(body, state.apiRoutes)) {
					sendJson(res, 400, {error: 'Invalid Data'})
					return
				}

				const tokenId = Number(state.nextApiTokenId || 1)
				const token = normalizeApiToken({
					id: tokenId,
					title: `${body?.title || ''}`.trim(),
					permissions: body?.permissions && typeof body.permissions === 'object' ? body.permissions : {},
					expires_at: body?.expires_at || null,
					created: new Date().toISOString(),
					token: `api-token-${tokenId}`,
				})
				state.nextApiTokenId = tokenId + 1
				state.apiTokens = [...(state.apiTokens || []), token]
				sendJson(res, 200, token)
				return
			}

			const apiTokenMatch = route.match(/^tokens\/(\d+)$/)
			if (apiTokenMatch && req.method === 'DELETE') {
				const tokenId = Number(apiTokenMatch[1])
				state.apiTokens = (state.apiTokens || []).filter(token => Number(token.id) !== tokenId)
				sendJson(res, 200, {ok: true})
				return
			}

			if (route === 'routes' && req.method === 'GET') {
				sendJson(res, 200, state.apiRoutes || {})
				return
			}

			if (route === 'user/settings/webhooks' && req.method === 'GET') {
				sendJson(res, 200, paginate((state.userWebhooks || []).map(normalizeWebhook), url))
				return
			}

			if (route === 'user/settings/webhooks' && req.method === 'PUT') {
				const now = new Date().toISOString()
				const webhook = normalizeWebhook({
					id: state.nextWebhookId++,
					target_url: `${body?.target_url || ''}`.trim(),
					events: Array.isArray(body?.events) ? body.events : [],
					secret: `${body?.secret || ''}`.trim() || null,
					created: now,
					updated: now,
				})
				state.userWebhooks = [...(state.userWebhooks || []), webhook]
				sendJson(res, 201, webhook)
				return
			}

			if (route === 'user/settings/webhooks/events' && req.method === 'GET') {
				sendJson(res, 200, state.userWebhookEvents || [])
				return
			}

			const userWebhookMatch = route.match(/^user\/settings\/webhooks\/(\d+)$/)
			if (userWebhookMatch && req.method === 'POST') {
				const webhookId = Number(userWebhookMatch[1])
				const webhook = getUserWebhook(state, webhookId)
				webhook.events = normalizeWebhookEvents(body?.events)
				webhook.updated = new Date().toISOString()
				sendJson(res, 200, normalizeWebhook(webhook))
				return
			}

			if (userWebhookMatch && req.method === 'DELETE') {
				const webhookId = Number(userWebhookMatch[1])
				state.userWebhooks = (state.userWebhooks || []).filter(entry => Number(entry.id || 0) !== webhookId)
				sendJson(res, 200, {ok: true})
				return
			}

			if (route === 'webhooks/events' && req.method === 'GET') {
				sendJson(res, 200, state.projectWebhookEvents || [])
				return
			}

			const migrationMatch = route.match(/^migration\/([^/]+)\/(auth|status|migrate)$/)
			if (migrationMatch) {
				const service = decodeURIComponent(migrationMatch[1] || '')
				const action = migrationMatch[2]
				if (!state.migrationStatus?.[service]) {
					sendJson(res, 404, {error: 'Unknown migration service.'})
					return
				}

				if (action === 'auth' && req.method === 'GET') {
					sendJson(res, 200, {
						authUrl: `https://import.example.test/${encodeURIComponent(service)}`,
					})
					return
				}

				if (action === 'status' && req.method === 'GET') {
					sendJson(res, 200, normalizeMigrationState(service, state.migrationStatus[service]))
					return
				}

				if (action === 'migrate' && req.method === 'POST') {
					if ((service === 'ticktick' || service === 'vikunja-file') && !isMultipart) {
						sendJson(res, 400, {error: 'File upload required.'})
						return
					}
					if (service !== 'ticktick' && service !== 'vikunja-file' && !`${body?.code || ''}`.trim()) {
						sendJson(res, 400, {error: 'code is required.'})
						return
					}

					state.migrationStatus[service] = {
						status: 'running',
						message:
							service === 'ticktick' || service === 'vikunja-file'
								? 'Import file uploaded. Vikunja is processing it.'
								: 'Import started. Vikunja is processing it.',
					}
					sendJson(res, 200, normalizeMigrationState(service, state.migrationStatus[service]))
					return
				}
			}

			const reactionMatch = route.match(/^(tasks|comments|projects)\/(\d+)\/reactions$/)
			if (reactionMatch && req.method === 'GET') {
				const entity = reactionMatch[1]
				const entityId = Number(reactionMatch[2])
				sendJson(res, 200, listReactions(state, entity, entityId))
				return
			}

			if (reactionMatch && req.method === 'PUT') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const entity = reactionMatch[1]
				const entityId = Number(reactionMatch[2])
				const value = `${body?.value || ''}`.trim()
				if (!value) {
					sendJson(res, 400, {error: 'Reaction value is required.'})
					return
				}

				upsertReaction(state, entity, entityId, value, authenticatedUser)
				sendJson(res, 200, {ok: true})
				return
			}

			const reactionDeleteMatch = route.match(/^(tasks|comments|projects)\/(\d+)\/reactions\/delete$/)
			if (reactionDeleteMatch && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const entity = reactionDeleteMatch[1]
				const entityId = Number(reactionDeleteMatch[2])
				const value = `${body?.value || ''}`.trim()
				removeReaction(state, entity, entityId, value, authenticatedUser)
				sendJson(res, 200, {ok: true})
				return
			}

			if (route === 'user/settings/general' && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				updateUserProfile(authenticatedUser.username, profile => ({
					...profile,
					name: typeof body?.name === 'string' ? body.name : profile.name,
					settings: {
						...(profile.settings || {}),
						...(body || {}),
					},
				}))
				sendJson(res, 200, {message: 'The settings were updated successfully.'})
				return
			}

			if (route === 'user/settings/avatar' && req.method === 'GET') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				sendJson(res, 200, {
					avatar_provider: `${authenticatedUser?.settings?.avatar_provider || 'default'}`,
				})
				return
			}

			if (route === 'user/settings/avatar' && req.method === 'POST') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const avatarProvider = `${body?.avatar_provider || ''}`.trim()
				if (!avatarProvider) {
					sendJson(res, 400, {error: 'avatar_provider is required.'})
					return
				}
				updateUserProfile(authenticatedUser.username, profile => ({
					...profile,
					settings: {
						...(profile.settings || {}),
						avatar_provider: avatarProvider,
					},
				}))
				sendJson(res, 200, {message: 'The avatar provider was updated successfully.'})
				return
			}

			if (route === 'user/settings/avatar/upload' && req.method === 'PUT') {
				const authenticatedUser = getAuthenticatedUserProfile(req)
				const uploadedFiles = parseMultipartFiles(await readRawBody(req), `${req.headers['content-type'] || ''}`)
				if (uploadedFiles.length === 0) {
					sendJson(res, 400, {error: 'At least one file is required.'})
					return
				}
				updateUserProfile(authenticatedUser.username, profile => ({
					...profile,
					settings: {
						...(profile.settings || {}),
						avatar_provider: 'upload',
					},
				}))
				sendJson(res, 200, {message: 'The avatar was uploaded successfully.'})
				return
			}

			if (route === 'notifications' && req.method === 'GET') {
				sendJson(res, 200, paginate(normalizeNotifications(state.notifications), url))
				return
			}

			if (route === 'notifications' && req.method === 'POST') {
				const readAt = new Date().toISOString()
				state.notifications = normalizeNotifications(
					state.notifications.map(notification => ({
						...notification,
						read: true,
						read_at: readAt,
					})),
				)
				sendJson(res, 200, {ok: true})
				return
			}

			const notificationMatch = route.match(/^notifications\/(\d+)$/)
			if (notificationMatch && req.method === 'POST') {
				const notificationId = Number(notificationMatch[1])
				const read = body?.read !== false
				const notification = getNotification(notificationId)
				Object.assign(notification, normalizeNotification({
					...notification,
					read,
					read_at: read ? new Date().toISOString() : null,
				}))
				sendJson(res, 200, notification)
				return
			}

			const sessionMatch = route.match(/^user\/sessions\/([^/]+)$/)
			if (sessionMatch && req.method === 'DELETE') {
				state.sessions = state.sessions.filter(session => session.id !== sessionMatch[1])
				sendJson(res, 200, {ok: true})
				return
			}

			if (route === 'projects' && req.method === 'GET') {
				sendJson(res, 200, paginate(state.projects, url))
				return
			}

			if (route === 'projects' && req.method === 'PUT') {
				const project = {
					id: state.nextProjectId++,
					title: `${body?.title || ''}`.trim(),
					description: `${body?.description || ''}`.trim(),
					parent_project_id: Number(body?.parent_project_id || 0),
					position: getNextProjectPosition(),
					identifier: `${body?.identifier || ''}`.trim(),
					is_favorite: Boolean(body?.is_favorite),
					is_archived: false,
					max_permission: 2,
				}
				state.projects.push(project)
				sendJson(res, 201, project)
				return
			}

			if (route === 'filters' && req.method === 'PUT') {
				if (hasInvalidSavedFilterSort(body?.filters)) {
					sendJson(res, 400, {message: 'You must provide a project view ID when sorting by position'})
					return
				}
				const savedFilter = buildSavedFilter({
					id: state.nextSavedFilterId++,
					title: body?.title,
					description: body?.description,
					is_favorite: body?.is_favorite,
					filters: body?.filters,
				})
				state.savedFilters.push(savedFilter)
				upsertSavedFilterProject(savedFilter)
				sendJson(res, 201, savedFilter)
				return
			}

			if (route === 'filters' && req.method === 'GET') {
				sendJson(res, 200, paginate(state.savedFilters, url))
				return
			}

			const filterMatch = route.match(/^filters\/(\d+)$/)
			if (filterMatch && req.method === 'GET') {
				sendJson(res, 200, getSavedFilter(Number(filterMatch[1])))
				return
			}

			if (filterMatch && req.method === 'POST') {
				if (hasInvalidSavedFilterSort(body?.filters)) {
					sendJson(res, 400, {message: 'You must provide a project view ID when sorting by position'})
					return
				}
				const savedFilter = getSavedFilter(Number(filterMatch[1]))
				const nextFilter = buildSavedFilter({
					...savedFilter,
					title: body?.title ?? savedFilter.title,
					description: body?.description ?? savedFilter.description,
					is_favorite: body?.is_favorite ?? savedFilter.is_favorite,
					filters: body?.filters ?? savedFilter.filters,
					created: savedFilter.created,
					updated: new Date().toISOString(),
				})
				Object.assign(savedFilter, nextFilter)
				upsertSavedFilterProject(savedFilter)
				sendJson(res, 200, savedFilter)
				return
			}

			if (filterMatch && req.method === 'DELETE') {
				const savedFilterId = Number(filterMatch[1])
				const savedFilter = getSavedFilter(savedFilterId)
				state.savedFilters = state.savedFilters.filter(entry => entry.id !== savedFilterId)
				state.projects = state.projects.filter(project => project.id !== savedFilter.projectId)
				delete state.viewsByProjectId[savedFilter.projectId]
				sendJson(res, 200, {ok: true})
				return
			}

			const projectViewsMatch = route.match(/^projects\/(-?\d+)\/views$/)
			if (projectViewsMatch && req.method === 'GET') {
				const projectId = Number(projectViewsMatch[1])
				sendJson(res, 200, paginate(getViewsForProject(projectId), url))
				return
			}

			if (projectViewsMatch && req.method === 'PUT') {
				const projectId = Number(projectViewsMatch[1])
				const project = getProject(projectId)
				const title = `${body?.title || ''}`.trim()
				const viewKind = `${body?.view_kind || ''}`.trim()
				if (!title || !viewKind) {
					sendJson(res, 400, {error: 'title and view_kind are required.'})
					return
				}

				const existingViews = getViewsForProject(projectId)
				const nextPosition = Math.max(0, ...existingViews.map(view => Number(view.position || 0))) + 100
				const view = {
					id: state.nextViewId++,
					project_id: projectId,
					title,
					view_kind: viewKind,
					position: Number(body?.position || nextPosition),
					filter: body?.filter || null,
					bucket_configuration_mode: body?.bucket_configuration_mode || null,
					bucket_configuration: Array.isArray(body?.bucket_configuration) ? body.bucket_configuration : null,
				}
				if (viewKind === 'kanban') {
					const defaultBucketId = state.nextBucketId++
					const doneBucketId = state.nextBucketId++
					view.default_bucket_id = defaultBucketId
					view.done_bucket_id = doneBucketId
					state.bucketsByViewId = {
						...state.bucketsByViewId,
						[view.id]: [
							{id: defaultBucketId, project_id: projectId, project_view_id: view.id, title: 'To Do', position: 100, limit: 0, tasks: []},
							{id: doneBucketId, project_id: projectId, project_view_id: view.id, title: 'Done', position: 200, limit: 0, tasks: []},
						],
					}
				}
				state.viewsByProjectId = {
					...state.viewsByProjectId,
					[projectId]: [...existingViews, view].sort((left, right) => Number(left.position || 0) - Number(right.position || 0)),
				}
				project.updated = new Date().toISOString()
				sendJson(res, 201, view)
				return
			}

			const projectViewMatch = route.match(/^projects\/(-?\d+)\/views\/(\d+)$/)
			if (projectViewMatch && req.method === 'DELETE') {
				const projectId = Number(projectViewMatch[1])
				const viewId = Number(projectViewMatch[2])
				state.viewsByProjectId = {
					...state.viewsByProjectId,
					[projectId]: getViewsForProject(projectId).filter(view => Number(view.id || 0) !== viewId),
				}
				delete state.bucketsByViewId[viewId]
				sendJson(res, 200, {ok: true})
				return
			}

			const projectBackgroundMatch = route.match(/^projects\/(-?\d+)\/background$/)
			if (projectBackgroundMatch && req.method === 'GET') {
				const projectId = Number(projectBackgroundMatch[1])
				if (!state.projectBackgrounds[projectId]) {
					sendJson(res, 404, {error: 'No background set.'})
					return
				}
				sendBuffer(res, 200, ONE_PIXEL_PNG, {'Content-Type': 'image/png'})
				return
			}

			if (projectBackgroundMatch && req.method === 'DELETE') {
				const projectId = Number(projectBackgroundMatch[1])
				const project = getProject(projectId)
				delete state.projectBackgrounds[projectId]
				project.has_background = false
				project.background_information = null
				project.background_blur_hash = null
				project.backgroundInformation = null
				project.backgroundBlurHash = null
				sendJson(res, 200, {ok: true})
				return
			}

			const projectBackgroundUploadMatch = route.match(/^projects\/(-?\d+)\/backgrounds\/upload$/)
			if (projectBackgroundUploadMatch && req.method === 'PUT') {
				const projectId = Number(projectBackgroundUploadMatch[1])
				const project = getProject(projectId)
				state.projectBackgrounds[projectId] = {source: 'upload'}
				project.has_background = true
				project.background_information = {provider: 'upload'}
				project.background_blur_hash = 'L5H2EC=PM+yV0g-mq.wG9c010J}I'
				project.backgroundInformation = project.background_information
				project.backgroundBlurHash = project.background_blur_hash
				sendJson(res, 200, project)
				return
			}

			const projectBackgroundUnsplashMatch = route.match(/^projects\/(-?\d+)\/backgrounds\/unsplash$/)
			if (projectBackgroundUnsplashMatch && req.method === 'POST') {
				const projectId = Number(projectBackgroundUnsplashMatch[1])
				const project = getProject(projectId)
				const imageId = `${body?.id || body?.image?.id || ''}`.trim()
				if (!imageId) {
					sendJson(res, 400, {error: 'image.id is required.'})
					return
				}
				state.projectBackgrounds[projectId] = {source: 'unsplash', imageId}
				project.has_background = true
				project.background_information = {
					provider: 'unsplash',
					image_id: imageId,
					url: `${body?.url || ''}`,
					thumb: `${body?.thumb || ''}`,
				}
				project.background_blur_hash = `${body?.blur_hash || 'L5H2EC=PM+yV0g-mq.wG9c010J}I'}`
				project.backgroundInformation = project.background_information
				project.backgroundBlurHash = project.background_blur_hash
				sendJson(res, 200, project)
				return
			}

			if (route === 'backgrounds/unsplash/search' && req.method === 'GET') {
				const search = `${url.searchParams.get('s') || ''}`.trim().toLowerCase()
				const results = !search
					? state.unsplashImages
					: state.unsplashImages.filter(image => `${image.info?.description || image.info?.alt_description || image.id || ''}`.toLowerCase().includes(search))
				sendJson(res, 200, results)
				return
			}

			const unsplashImageMatch = route.match(/^backgrounds\/unsplash\/images\/([^/]+)(?:\/thumb)?$/)
			if (unsplashImageMatch && req.method === 'GET') {
				sendBuffer(res, 200, ONE_PIXEL_PNG, {'Content-Type': 'image/png'})
				return
			}

			const projectUsersMatch = route.match(/^projects\/(-?\d+)\/projectusers$/)
			if (projectUsersMatch && req.method === 'GET') {
				const projectId = Number(projectUsersMatch[1])
				const search = `${url.searchParams.get('s') || ''}`.trim().toLowerCase()
				const projectUsers = listProjectUsers(projectId)
				const users = !search
					? projectUsers
					: projectUsers.filter(user => {
						const haystacks = [
							`${user.name || ''}`,
							`${user.username || ''}`,
						]
						return haystacks.some(value => value.toLowerCase().includes(search))
					})
				sendJson(res, 200, paginate(users, url))
				return
			}

			if (route === 'teams' && req.method === 'GET') {
				const search = `${url.searchParams.get('s') || ''}`.trim().toLowerCase()
				const teams = !search
					? state.teams
					: state.teams.filter(team => {
						const haystacks = [
							`${team.name || ''}`,
							`${team.description || ''}`,
						]
						return haystacks.some(value => value.toLowerCase().includes(search))
					})
				sendJson(res, 200, paginate(teams.map(team => serializeTeam(team)), url))
				return
			}

			if (route === 'teams' && req.method === 'PUT') {
				const now = new Date().toISOString()
				const team = normalizeTeam({
					id: state.nextTeamId++,
					name: `${body?.name || ''}`.trim(),
					description: `${body?.description || ''}`.trim(),
					is_public: body?.is_public === true,
					created: now,
					updated: now,
					members: [
						{
							...getUser(state.user.id),
							admin: true,
							created: now,
							updated: now,
						},
					],
				})
				state.teams.push(team)
				sendJson(res, 201, serializeTeam(team))
				return
			}

			const teamMatch = route.match(/^teams\/(\d+)$/)
			if (teamMatch && req.method === 'GET') {
				sendJson(res, 200, serializeTeam(getTeam(Number(teamMatch[1]))))
				return
			}

			if (teamMatch && req.method === 'POST') {
				const team = getTeam(Number(teamMatch[1]))
				team.name = `${body?.name || team.name || ''}`.trim()
				team.description = `${body?.description ?? team.description ?? ''}`.trim()
				team.is_public = body?.is_public === true
				team.updated = new Date().toISOString()
				sendJson(res, 200, serializeTeam(team))
				return
			}

			if (teamMatch && req.method === 'DELETE') {
				const teamId = Number(teamMatch[1])
				state.teams = state.teams.filter(team => team.id !== teamId)
				state.projectTeamShares = state.projectTeamShares.filter(entry => entry.team_id !== teamId)
				sendJson(res, 200, {ok: true})
				return
			}

			const teamMembersMatch = route.match(/^teams\/(\d+)\/members$/)
			if (teamMembersMatch && req.method === 'PUT') {
				const team = getTeam(Number(teamMembersMatch[1]))
				const username = `${body?.username || ''}`.trim()
				const user = getUserByUsername(username)
				if (!team.members.some(member => member.username === username)) {
					team.members.push({
						...user,
						admin: false,
						created: new Date().toISOString(),
						updated: new Date().toISOString(),
					})
				}
				team.updated = new Date().toISOString()
				sendJson(res, 201, {
					user_id: user.id,
					username: user.username,
					admin: false,
				})
				return
			}

			const teamMemberAdminMatch = route.match(/^teams\/(\d+)\/members\/([^/]+)\/admin$/)
			if (teamMemberAdminMatch && req.method === 'POST') {
				const team = getTeam(Number(teamMemberAdminMatch[1]))
				const username = decodeURIComponent(teamMemberAdminMatch[2])
				const member = getTeamMember(team, username)
				member.admin = !member.admin
				member.updated = new Date().toISOString()
				team.updated = new Date().toISOString()
				sendJson(res, 200, {
					user_id: member.id,
					username: member.username,
					admin: member.admin,
				})
				return
			}

			const teamMemberMatch = route.match(/^teams\/(\d+)\/members\/([^/]+)$/)
			if (teamMemberMatch && req.method === 'DELETE') {
				const team = getTeam(Number(teamMemberMatch[1]))
				const username = decodeURIComponent(teamMemberMatch[2])
				team.members = team.members.filter(member => member.username !== username)
				team.updated = new Date().toISOString()
				sendJson(res, 200, {ok: true})
				return
			}

			const projectSharedUsersMatch = route.match(/^projects\/(-?\d+)\/users$/)
			if (projectSharedUsersMatch && req.method === 'GET') {
				const projectId = Number(projectSharedUsersMatch[1])
				sendJson(res, 200, paginate(listProjectUserShares(projectId), url))
				return
			}

			if (projectSharedUsersMatch && req.method === 'PUT') {
				const projectId = Number(projectSharedUsersMatch[1])
				const username = `${body?.username || ''}`.trim()
				const user = getUserByUsername(username)
				const now = new Date().toISOString()
				const existing = state.projectUserShares.find(entry => entry.project_id === projectId && entry.username === username)
				if (existing) {
					existing.permission = normalizeSharePermission(body?.permission)
					existing.updated = now
				} else {
					state.projectUserShares.push({
						project_id: projectId,
						username,
						permission: normalizeSharePermission(body?.permission),
						created: now,
						updated: now,
					})
				}
				sendJson(res, 201, serializeProjectUserShare(projectId, user))
				return
			}

			const projectSharedUserMatch = route.match(/^projects\/(-?\d+)\/users\/([^/]+)$/)
			if (projectSharedUserMatch && req.method === 'POST') {
				const projectId = Number(projectSharedUserMatch[1])
				const username = decodeURIComponent(projectSharedUserMatch[2])
				const entry = getProjectUserShare(projectId, username)
				entry.permission = normalizeSharePermission(body?.permission)
				entry.updated = new Date().toISOString()
				sendJson(res, 200, serializeProjectUserShare(projectId, getUserByUsername(username)))
				return
			}

			if (projectSharedUserMatch && req.method === 'DELETE') {
				const projectId = Number(projectSharedUserMatch[1])
				const username = decodeURIComponent(projectSharedUserMatch[2])
				state.projectUserShares = state.projectUserShares.filter(entry => !(entry.project_id === projectId && entry.username === username))
				sendJson(res, 200, {ok: true})
				return
			}

			const projectSharedTeamsMatch = route.match(/^projects\/(-?\d+)\/teams$/)
			if (projectSharedTeamsMatch && req.method === 'GET') {
				const projectId = Number(projectSharedTeamsMatch[1])
				sendJson(res, 200, paginate(listProjectTeamShares(projectId), url))
				return
			}

			if (projectSharedTeamsMatch && req.method === 'PUT') {
				const projectId = Number(projectSharedTeamsMatch[1])
				const teamId = Number(body?.team_id || body?.teamId || 0)
				const now = new Date().toISOString()
				const existing = state.projectTeamShares.find(entry => entry.project_id === projectId && entry.team_id === teamId)
				if (existing) {
					existing.permission = normalizeSharePermission(body?.permission)
					existing.updated = now
				} else {
					state.projectTeamShares.push({
						project_id: projectId,
						team_id: teamId,
						permission: normalizeSharePermission(body?.permission),
						created: now,
						updated: now,
					})
				}
				sendJson(res, 201, serializeProjectTeamShare(projectId, getTeam(teamId)))
				return
			}

			const projectSharedTeamMatch = route.match(/^projects\/(-?\d+)\/teams\/(\d+)$/)
			if (projectSharedTeamMatch && req.method === 'POST') {
				const projectId = Number(projectSharedTeamMatch[1])
				const teamId = Number(projectSharedTeamMatch[2])
				const entry = getProjectTeamShare(projectId, teamId)
				entry.permission = normalizeSharePermission(body?.permission)
				entry.updated = new Date().toISOString()
				sendJson(res, 200, serializeProjectTeamShare(projectId, getTeam(teamId)))
				return
			}

			if (projectSharedTeamMatch && req.method === 'DELETE') {
				const projectId = Number(projectSharedTeamMatch[1])
				const teamId = Number(projectSharedTeamMatch[2])
				state.projectTeamShares = state.projectTeamShares.filter(entry => !(entry.project_id === projectId && entry.team_id === teamId))
				sendJson(res, 200, {ok: true})
				return
			}

			const projectLinkSharesMatch = route.match(/^projects\/(-?\d+)\/shares$/)
			if (projectLinkSharesMatch && req.method === 'GET') {
				const projectId = Number(projectLinkSharesMatch[1])
				sendJson(res, 200, paginate(listProjectLinkShares(projectId), url))
				return
			}

			const projectWebhooksMatch = route.match(/^projects\/(-?\d+)\/webhooks$/)
			if (projectWebhooksMatch && req.method === 'GET') {
				const projectId = Number(projectWebhooksMatch[1])
				sendJson(res, 200, paginate(listProjectWebhooks(state, projectId), url))
				return
			}

			if (projectWebhooksMatch && req.method === 'PUT') {
				const projectId = Number(projectWebhooksMatch[1])
				const now = new Date().toISOString()
				const webhook = normalizeWebhook({
					id: state.nextWebhookId++,
					target_url: `${body?.target_url || ''}`.trim(),
					events: Array.isArray(body?.events) ? body.events : [],
					secret: `${body?.secret || ''}`.trim() || null,
					created: now,
					updated: now,
				})
				state.projectWebhooks = {
					...(state.projectWebhooks || {}),
					[projectId]: [...listProjectWebhooks(state, projectId), webhook],
				}
				sendJson(res, 201, webhook)
				return
			}

			const projectWebhookMatch = route.match(/^projects\/(-?\d+)\/webhooks\/(\d+)$/)
			if (projectWebhookMatch && req.method === 'POST') {
				const projectId = Number(projectWebhookMatch[1])
				const webhookId = Number(projectWebhookMatch[2])
				const webhook = getProjectWebhook(state, projectId, webhookId)
				webhook.events = normalizeWebhookEvents(body?.events)
				webhook.updated = new Date().toISOString()
				sendJson(res, 200, normalizeWebhook(webhook))
				return
			}

			if (projectWebhookMatch && req.method === 'DELETE') {
				const projectId = Number(projectWebhookMatch[1])
				const webhookId = Number(projectWebhookMatch[2])
				state.projectWebhooks = {
					...(state.projectWebhooks || {}),
					[projectId]: listProjectWebhooks(state, projectId).filter(entry => Number(entry.id || 0) !== webhookId),
				}
				sendJson(res, 200, {ok: true})
				return
			}

			if (projectLinkSharesMatch && req.method === 'PUT') {
				const projectId = Number(projectLinkSharesMatch[1])
				const now = new Date().toISOString()
				const share = {
					id: state.nextLinkShareId++,
					hash: `share-${projectId}-${Date.now()}-${state.nextLinkShareId}`,
					project_id: projectId,
					name: `${body?.name || ''}`.trim(),
					permission: normalizeSharePermission(body?.permission),
					sharing_type: `${body?.password || ''}` ? 2 : 1,
					password: `${body?.password || ''}`,
					expires: normalizeDateString(body?.expires ?? body?.expires_at ?? null),
					shared_by: getUser(state.user.id),
					created: now,
					updated: now,
				}
				state.linkShares.push(share)
				sendJson(res, 201, normalizeLinkShare(share))
				return
			}

			const projectLinkShareMatch = route.match(/^projects\/(-?\d+)\/shares\/(\d+)$/)
			if (projectLinkShareMatch && req.method === 'GET') {
				const projectId = Number(projectLinkShareMatch[1])
				const shareId = Number(projectLinkShareMatch[2])
				const share = state.linkShares.find(entry => Number(entry.project_id) === projectId && Number(entry.id) === shareId)
				if (!share) {
					sendJson(res, 404, {error: 'The project share does not exist.', code: 13000})
					return
				}
				sendJson(res, 200, normalizeLinkShare(share))
				return
			}

			if (projectLinkShareMatch && req.method === 'DELETE') {
				const projectId = Number(projectLinkShareMatch[1])
				const shareId = Number(projectLinkShareMatch[2])
				state.linkShares = state.linkShares.filter(share => !(share.project_id === projectId && share.id === shareId))
				sendJson(res, 200, {ok: true})
				return
			}

			const linkShareAuthMatch = route.match(/^shares\/([^/]+)\/auth$/)
			if (linkShareAuthMatch && req.method === 'POST') {
				const hash = decodeURIComponent(linkShareAuthMatch[1])
				const share = state.linkShares.find(entry => `${entry.hash || ''}` === hash)
				if (!share) {
					sendJson(res, 404, {error: 'The project share does not exist.', code: 13000})
					return
				}

				const requiresPassword = Number(share.sharing_type || 0) === 2
				const password = `${body?.password || ''}`
				if (requiresPassword && !password) {
					sendJson(res, 401, {error: 'A password is required for this share.', code: 13001})
					return
				}
				if (requiresPassword && password !== `${share.password || ''}`) {
					sendJson(res, 401, {error: 'The provided share password is invalid.', code: 13002})
					return
				}

				sendJson(res, 200, {
					token: buildToken(`share-${share.project_id}`),
					project_id: Number(share.project_id || 0),
				})
				return
			}

			const viewBucketsMatch = route.match(/^projects\/(-?\d+)\/views\/(\d+)\/buckets$/)
			if (viewBucketsMatch && req.method === 'GET') {
				const viewId = Number(viewBucketsMatch[2])
				sendJson(res, 200, (state.bucketsByViewId?.[viewId] || []).map(bucket => ({
					...bucket,
					tasks: [],
				})))
				return
			}

			if (viewBucketsMatch && req.method === 'PUT') {
				const projectId = Number(viewBucketsMatch[1])
				const viewId = Number(viewBucketsMatch[2])
				const title = `${body?.title || ''}`.trim()
				if (!title) {
					sendJson(res, 400, {error: 'Title is required.'})
					return
				}

				const existingBuckets = Array.isArray(state.bucketsByViewId?.[viewId]) ? state.bucketsByViewId[viewId] : []
				const nextBucketId = Math.max(0, ...existingBuckets.map(bucket => Number(bucket.id || 0))) + 1
				const nextBucketPosition = Math.max(0, ...existingBuckets.map(bucket => Number(bucket.position || 0))) + 100
				const bucket = {
					id: nextBucketId,
					project_id: projectId,
					project_view_id: viewId,
					title,
					position: nextBucketPosition,
					limit: 0,
					tasks: [],
				}
				state.bucketsByViewId = {
					...state.bucketsByViewId,
					[viewId]: [...existingBuckets, bucket],
				}
				sendJson(res, 201, bucket)
				return
			}

			const projectViewTasksMatch = route.match(/^projects\/(-?\d+)\/views\/(\d+)\/tasks$/)
			if (projectViewTasksMatch && req.method === 'GET') {
				const projectId = Number(projectViewTasksMatch[1])
				const viewId = Number(projectViewTasksMatch[2])
				sendJson(res, 200, paginate(listTasksForProjectView(projectId, viewId, url.searchParams), url))
				return
			}

			const projectTasksMatch = route.match(/^projects\/(-?\d+)\/tasks$/)
			if (projectTasksMatch && req.method === 'GET') {
				const projectId = Number(projectTasksMatch[1])
				sendJson(res, 200, paginate(listTasksForProject(projectId, url.searchParams), url))
				return
			}

			if (projectTasksMatch && req.method === 'PUT') {
				const projectId = Number(projectTasksMatch[1])
				const task = buildTask({
					id: state.nextTaskId++,
					project_id: projectId,
					title: `${body?.title || ''}`.trim(),
					description: `${body?.description || ''}`.trim(),
					done: false,
					is_favorite: false,
					due_date: body?.due_date || null,
					start_date: body?.start_date || null,
					end_date: body?.end_date || null,
					done_at: null,
					position: getNextTaskPosition(projectId),
					priority: Number(body?.priority || 0),
					percent_done: Number(body?.percent_done || 0),
					reminders: body?.reminders || [],
					repeat_after: normalizeRepeatAfter(body?.repeat_after),
					repeat_from_current_date: Boolean(body?.repeat_from_current_date),
					assignees: normalizeTaskAssignees(body?.assignees),
					labelIds: [],
					parentTaskId: null,
				})
				state.tasks.push(task)
				sendJson(res, 201, serializeTask(task))
				return
			}

			const projectDuplicateMatch = route.match(/^projects\/(\d+)\/duplicate$/)
			if (projectDuplicateMatch && req.method === 'PUT') {
				const sourceProject = getProject(Number(projectDuplicateMatch[1]))
				const duplicateProject = {
					...sourceProject,
					id: state.nextProjectId++,
					title: `${sourceProject.title} (Copy)`,
					parent_project_id: Number(body?.parent_project_id ?? body?.parentProjectId ?? sourceProject.parent_project_id ?? 0),
					position: getNextProjectPosition(),
					max_permission: 2,
				}
				state.projects.push(duplicateProject)
				sendJson(res, 200, duplicateProject)
				return
			}

			const projectMatch = route.match(/^projects\/(-?\d+)$/)
			if (projectMatch && req.method === 'GET') {
				const projectId = Number(projectMatch[1])
				const project = getProject(projectId)
				sendJson(res, 200, project)
				return
			}

			if (projectMatch && req.method === 'POST') {
				const projectId = Number(projectMatch[1])
				const project = getProject(projectId)
				Object.assign(project, {
					...project,
					...body,
					id: projectId,
					parent_project_id: Number(body?.parent_project_id ?? project.parent_project_id ?? 0),
				})
				sendJson(res, 200, project)
				return
			}

			if (projectMatch && req.method === 'DELETE') {
				const projectId = Number(projectMatch[1])
				const removedProjectIds = new Set([projectId, ...collectChildProjectIds(projectId)])
				state.projects = state.projects.filter(project => !removedProjectIds.has(project.id))
				state.tasks = state.tasks.filter(task => !removedProjectIds.has(task.project_id))
				sendJson(res, 200, {ok: true})
				return
			}

			const subscriptionMatch = route.match(/^subscriptions\/([^/]+)\/(\d+)$/)
			if (subscriptionMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
				const entity = `${subscriptionMatch[1] || ''}`.trim()
				const entityId = Number(subscriptionMatch[2] || 0)
				const subscribed = req.method === 'PUT'
				if (entity === 'task') {
					const task = getTask(entityId)
					task.subscription = {subscribed}
					sendJson(res, 200, {ok: true, subscribed})
					return
				}
				if (entity === 'project') {
					const project = getProject(entityId)
					project.subscription = {subscribed}
					sendJson(res, 200, {ok: true, subscribed})
					return
				}
				sendJson(res, 412, {error: 'Invalid subscription entity.'})
				return
			}

			if (route === 'tasks' && req.method === 'GET') {
				sendJson(res, 200, paginate(filterTasks(url.searchParams), url))
				return
			}

			if (route === 'tasks/bulk' && req.method === 'POST') {
				const taskIds = Array.isArray(body?.task_ids)
					? body.task_ids.map(value => Number(value || 0)).filter(Boolean)
					: []
				const fields = Array.isArray(body?.fields) ? body.fields : []
				const values = body?.values && typeof body.values === 'object' && !Array.isArray(body.values) ? body.values : null
				const now = new Date().toISOString()

				if (taskIds.length === 0 || fields.length === 0 || !values) {
					sendJson(res, 400, {error: 'task_ids, fields, and values are required.'})
					return
				}

				for (const taskId of taskIds) {
					const task = getTask(taskId)
					task.updated = now
					fields.forEach(field => {
						const value = values[field]
						switch (`${field || ''}`) {
							case 'done':
								task.done = Boolean(value)
								task.done_at = task.done ? now : null
								break
							case 'project_id':
								task.project_id = Number(value || task.project_id)
								break
							case 'priority':
								task.priority = Number(value || 0)
								break
							case 'is_favorite':
								task.is_favorite = Boolean(value)
								break
							default:
								break
						}
					})
				}

				sendJson(res, 200, {ok: true})
				return
			}

			const taskMatch = route.match(/^tasks\/(\d+)$/)
			const taskReadMatch = route.match(/^tasks\/(\d+)\/read$/)
			if (taskReadMatch && req.method === 'POST') {
				const task = getTask(Number(taskReadMatch[1]))
				const readAt = new Date().toISOString()
				task.read = true
				task.read_at = readAt
				task.updated = readAt
				sendJson(res, 200, {ok: true})
				return
			}

			if (taskMatch && req.method === 'GET') {
				sendJson(res, 200, serializeTask(getTask(Number(taskMatch[1])), {includeComments: true, includeAttachments: true}))
				return
			}

			if (taskMatch && req.method === 'POST') {
				const taskId = Number(taskMatch[1])
				const task = getTask(taskId)
				const now = new Date().toISOString()
				const nextDone = body?.done === undefined ? Boolean(task.done) : Boolean(body.done)
				const previousDone = Boolean(task.done)
				const projectId = body?.project_id ? Number(body.project_id) : task.project_id

				Object.assign(task, {
					...task,
					id: taskId,
					project_id: projectId,
					title: body?.title === undefined ? task.title : `${body.title || ''}`.trim(),
					description: body?.description === undefined ? task.description : `${body.description || ''}`.trim(),
					done: nextDone,
					is_favorite: body?.is_favorite === undefined ? Boolean(task.is_favorite) : Boolean(body.is_favorite),
					due_date: body?.due_date === undefined ? task.due_date : body.due_date || null,
					start_date: body?.start_date === undefined ? task.start_date : body.start_date || null,
					end_date: body?.end_date === undefined ? task.end_date : body.end_date || null,
					done_at: body?.done_at === undefined
						? (previousDone !== nextDone ? (nextDone ? now : null) : (nextDone ? task.done_at || now : null))
						: body.done_at || null,
					read: body?.read === undefined ? Boolean(task.read) : Boolean(body.read),
					read_at: body?.read_at === undefined ? task.read_at || null : body.read_at || null,
					position: body?.position === undefined ? Number(task.position || 0) : Number(body.position || 0),
					priority: body?.priority === undefined ? Number(task.priority || 0) : Number(body.priority || 0),
					percent_done: body?.percent_done === undefined
						? normalizePercentDone(task.percent_done)
						: normalizePercentDone(body.percent_done),
					reminders: body?.reminders === undefined ? task.reminders : normalizeTaskReminders(body.reminders),
					repeat_after: body?.repeat_after === undefined
						? normalizeRepeatAfter(task.repeat_after)
						: normalizeRepeatAfter(body.repeat_after),
					repeat_from_current_date: body?.repeat_from_current_date === undefined
						? Boolean(task.repeat_from_current_date)
						: Boolean(body.repeat_from_current_date),
					assignees: body?.assignees === undefined ? normalizeTaskAssignees(task.assignees) : normalizeTaskAssignees(body.assignees),
					comments: body?.comments === undefined ? normalizeTaskComments(task.comments) : normalizeTaskComments(body.comments),
					attachments: body?.attachments === undefined ? normalizeTaskAttachments(task.attachments) : normalizeTaskAttachments(body.attachments),
					created: task.created || now,
					updated: now,
				})
				sendJson(res, 200, serializeTask(task, {includeComments: true, includeAttachments: true}))
				return
			}

			if (taskMatch && req.method === 'DELETE') {
				const taskId = Number(taskMatch[1])
				state.tasks = state.tasks.filter(task => task.id !== taskId && task.parentTaskId !== taskId)
				sendJson(res, 200, {ok: true})
				return
			}

			const taskPositionMatch = route.match(/^tasks\/(\d+)\/position$/)
			if (taskPositionMatch && req.method === 'POST') {
				const taskId = Number(taskPositionMatch[1])
				const task = getTask(taskId)
				task.position = Number(body?.position || task.position)
				sendJson(res, 200, {
					task_id: taskId,
					project_view_id: Number(body?.project_view_id || 0),
					position: task.position,
				})
				return
			}

			const taskDuplicateMatch = route.match(/^tasks\/(\d+)\/duplicate$/)
			if (taskDuplicateMatch && req.method === 'PUT') {
				const sourceTask = getTask(Number(taskDuplicateMatch[1]))
				const duplicateTask = buildTask({
					...sourceTask,
					id: state.nextTaskId++,
					title: `${sourceTask.title} (Copy)`,
					position: getNextTaskPosition(sourceTask.project_id),
					reminders: sourceTask.reminders,
					repeat_after: sourceTask.repeat_after,
					repeat_from_current_date: sourceTask.repeat_from_current_date,
					assignees: sourceTask.assignees,
					attachments: sourceTask.attachments,
					labelIds: [...sourceTask.labelIds],
				})
				state.tasks.push(duplicateTask)
				sendJson(res, 200, serializeTask(duplicateTask))
				return
			}

			const taskAssigneesMatch = route.match(/^tasks\/(\d+)\/assignees$/)
			if (taskAssigneesMatch && req.method === 'GET') {
				const task = getTask(Number(taskAssigneesMatch[1]))
				const search = `${url.searchParams.get('s') || ''}`.trim().toLowerCase()
				const assignees = normalizeTaskAssignees(task.assignees)
				const filtered = !search
					? assignees
					: assignees.filter(user => {
						const haystacks = [
							`${user.name || ''}`,
							`${user.username || ''}`,
							`${user.email || ''}`,
						]
						return haystacks.some(value => value.toLowerCase().includes(search))
					})
				sendJson(res, 200, paginate(filtered, url))
				return
			}

			if (taskAssigneesMatch && req.method === 'PUT') {
				const task = getTask(Number(taskAssigneesMatch[1]))
				const userId = Number(body?.user_id || body?.userId || 0)
				const user = getUser(userId)
				const nextAssignees = normalizeTaskAssignees([...normalizeTaskAssignees(task.assignees), user])
				task.assignees = nextAssignees
				sendJson(res, 201, {
					user_id: user.id,
					created: new Date().toISOString(),
				})
				return
			}

			const taskAssigneeMatch = route.match(/^tasks\/(\d+)\/assignees\/(\d+)$/)
			const taskAssigneesBulkMatch = route.match(/^tasks\/(\d+)\/assignees\/bulk$/)
			if (taskAssigneesBulkMatch && req.method === 'POST') {
				const task = getTask(Number(taskAssigneesBulkMatch[1]))
				task.assignees = normalizeTaskAssignees(body?.assignees)
				task.updated = new Date().toISOString()
				sendJson(res, 200, {ok: true, assignees: task.assignees})
				return
			}

			if (taskAssigneeMatch && req.method === 'DELETE') {
				const task = getTask(Number(taskAssigneeMatch[1]))
				const userId = Number(taskAssigneeMatch[2])
				task.assignees = normalizeTaskAssignees(task.assignees).filter(user => user.id !== userId)
				sendJson(res, 200, {ok: true})
				return
			}

			const taskCommentsMatch = route.match(/^tasks\/(\d+)\/comments$/)
			if (taskCommentsMatch && req.method === 'GET') {
				const task = getTask(Number(taskCommentsMatch[1]))
				sendJson(res, 200, paginate(normalizeTaskComments(task.comments), url))
				return
			}

			if (taskCommentsMatch && req.method === 'PUT') {
				const task = getTask(Number(taskCommentsMatch[1]))
				const commentText = `${body?.comment || ''}`.trim()
				if (!commentText) {
					sendJson(res, 400, {error: 'Comment is required.'})
					return
				}

				const now = new Date().toISOString()
				const comment = {
					id: state.nextCommentId++,
					comment: commentText,
					author: getUser(state.user.id),
					created: now,
					updated: now,
				}
				task.comments = normalizeTaskComments([...(task.comments || []), comment])
				task.updated = now
				sendJson(res, 201, {...comment})
				return
			}

			const taskCommentMatch = route.match(/^tasks\/(\d+)\/comments\/(\d+)$/)
			if (taskCommentMatch && req.method === 'GET') {
				const task = getTask(Number(taskCommentMatch[1]))
				const commentId = Number(taskCommentMatch[2])
				const comment = normalizeTaskComments(task.comments).find(entry => entry.id === commentId)
				if (!comment) {
					sendJson(res, 404, {error: 'Comment not found.'})
					return
				}
				sendJson(res, 200, comment)
				return
			}

			if (taskCommentMatch && req.method === 'POST') {
				const task = getTask(Number(taskCommentMatch[1]))
				const commentId = Number(taskCommentMatch[2])
				const commentText = `${body?.comment || ''}`.trim()
				const comments = normalizeTaskComments(task.comments)
				const existingComment = comments.find(entry => entry.id === commentId)
				if (!existingComment) {
					sendJson(res, 404, {error: 'Comment not found.'})
					return
				}
				if (!commentText) {
					sendJson(res, 400, {error: 'Comment is required.'})
					return
				}

				const updatedComment = {
					...existingComment,
					comment: commentText,
					updated: new Date().toISOString(),
				}
				task.comments = comments.map(entry => entry.id === commentId ? updatedComment : entry)
				task.updated = updatedComment.updated
				sendJson(res, 200, updatedComment)
				return
			}

			if (taskCommentMatch && req.method === 'DELETE') {
				const task = getTask(Number(taskCommentMatch[1]))
				const commentId = Number(taskCommentMatch[2])
				const nextComments = normalizeTaskComments(task.comments).filter(entry => entry.id !== commentId)
				if (nextComments.length === normalizeTaskComments(task.comments).length) {
					sendJson(res, 404, {error: 'Comment not found.'})
					return
				}
				task.comments = nextComments
				task.updated = new Date().toISOString()
				sendJson(res, 200, {ok: true})
				return
			}

			const taskAttachmentsMatch = route.match(/^tasks\/(\d+)\/attachments$/)
			if (taskAttachmentsMatch && req.method === 'GET') {
				const task = getTask(Number(taskAttachmentsMatch[1]))
				sendJson(res, 200, paginate(normalizeTaskAttachments(task.attachments), url))
				return
			}

			if (taskAttachmentsMatch && req.method === 'PUT') {
				const task = getTask(Number(taskAttachmentsMatch[1]))
				const uploadedFiles = parseMultipartFiles(await readRawBody(req), `${req.headers['content-type'] || ''}`)
				if (uploadedFiles.length === 0) {
					sendJson(res, 400, {error: 'At least one file is required.'})
					return
				}

				const createdAt = new Date().toISOString()
				const nextAttachments = uploadedFiles.map(file => ({
					id: state.nextAttachmentId++,
					task_id: task.id,
					created_by: getUser(state.user.id),
					file: {
						id: state.nextAttachmentFileId++,
						name: file.name,
						mime: file.mime,
						size: file.size,
					},
					created: createdAt,
				}))
				task.attachments = normalizeTaskAttachments([...(task.attachments || []), ...nextAttachments])
				task.updated = createdAt
				sendJson(res, 201, {
					success: nextAttachments.map(attachment => ({...attachment, created_by: {...attachment.created_by}, file: {...attachment.file}})),
				})
				return
			}

			const taskAttachmentMatch = route.match(/^tasks\/(\d+)\/attachments\/(\d+)$/)
			if (taskAttachmentMatch && req.method === 'GET') {
				const task = getTask(Number(taskAttachmentMatch[1]))
				const attachmentId = Number(taskAttachmentMatch[2])
				const attachment = normalizeTaskAttachments(task.attachments).find(entry => entry.id === attachmentId)
				if (!attachment) {
					sendJson(res, 404, {error: 'Attachment not found.'})
					return
				}

				const previewSize = `${url.searchParams.get('preview_size') || ''}`.trim()
				const responseBody = buildAttachmentPayload(attachment, previewSize)
				sendBuffer(res, 200, responseBody.body, responseBody.headers)
				return
			}

			if (taskAttachmentMatch && req.method === 'DELETE') {
				const task = getTask(Number(taskAttachmentMatch[1]))
				const attachmentId = Number(taskAttachmentMatch[2])
				const nextAttachments = normalizeTaskAttachments(task.attachments).filter(entry => entry.id !== attachmentId)
				if (nextAttachments.length === normalizeTaskAttachments(task.attachments).length) {
					sendJson(res, 404, {error: 'Attachment not found.'})
					return
				}
				task.attachments = nextAttachments
				task.updated = new Date().toISOString()
				sendJson(res, 200, {ok: true})
				return
			}

			const taskRelationsMatch = route.match(/^tasks\/(\d+)\/relations$/)
			if (taskRelationsMatch && req.method === 'PUT') {
				const taskId = Number(taskRelationsMatch[1])
				const relationKind = `${body?.relation_kind || ''}`
				const otherTaskId = Number(body?.other_task_id || 0)
				if (relationKind === 'subtask') {
					getTask(otherTaskId).parentTaskId = taskId
				} else if (relationKind === 'parenttask') {
					getTask(taskId).parentTaskId = otherTaskId
				}
				sendJson(res, 201, {ok: true})
				return
			}

			const taskRelationDeleteMatch = route.match(/^tasks\/(\d+)\/relations\/(\w+)\/(\d+)$/)
			if (taskRelationDeleteMatch && req.method === 'DELETE') {
				const taskId = Number(taskRelationDeleteMatch[1])
				const relationKind = taskRelationDeleteMatch[2]
				const otherTaskId = Number(taskRelationDeleteMatch[3])
				if (relationKind === 'subtask') {
					const childTask = getTask(otherTaskId)
					if (childTask.parentTaskId === taskId) {
						childTask.parentTaskId = null
					}
				} else if (relationKind === 'parenttask') {
					const task = getTask(taskId)
					if (task.parentTaskId === otherTaskId) {
						task.parentTaskId = null
					}
				}
				sendJson(res, 200, {ok: true})
				return
			}

			const taskLabelsMatch = route.match(/^tasks\/(\d+)\/labels$/)
			if (taskLabelsMatch && req.method === 'PUT') {
				const taskId = Number(taskLabelsMatch[1])
				const task = getTask(taskId)
				const labelId = Number(body?.label_id || 0)
				if (labelId && !task.labelIds.includes(labelId)) {
					task.labelIds.push(labelId)
				}
				sendJson(res, 200, {ok: true})
				return
			}

			const taskLabelMatch = route.match(/^tasks\/(\d+)\/labels\/(\d+)$/)
			const taskLabelsBulkMatch = route.match(/^tasks\/(\d+)\/labels\/bulk$/)
			if (taskLabelsBulkMatch && req.method === 'POST') {
				const task = getTask(Number(taskLabelsBulkMatch[1]))
				const labels = Array.isArray(body?.labels) ? body.labels : []
				task.labelIds = labels
					.map(label => Number(label?.id || 0))
					.filter(Boolean)
				task.updated = new Date().toISOString()
				sendJson(res, 200, {ok: true, labels: serializeTask(task).labels})
				return
			}

			if (taskLabelMatch && req.method === 'DELETE') {
				const task = getTask(Number(taskLabelMatch[1]))
				const labelId = Number(taskLabelMatch[2])
				task.labelIds = task.labelIds.filter(entry => entry !== labelId)
				sendJson(res, 200, {ok: true})
				return
			}

			if (route === 'labels' && req.method === 'GET') {
				sendJson(res, 200, paginate(state.labels, url))
				return
			}

			if (route === 'labels' && req.method === 'PUT') {
				const label = {
					id: state.nextLabelId++,
					title: `${body?.title || ''}`.trim(),
					hex_color: body?.hex_color || '#1973ff',
				}
				state.labels.push(label)
				sendJson(res, 201, label)
				return
			}

			const labelMatch = route.match(/^labels\/(\d+)$/)
			if (labelMatch && req.method === 'POST') {
				const label = getLabel(Number(labelMatch[1]))
				Object.assign(label, body || {})
				sendJson(res, 200, label)
				return
			}

			if (labelMatch && req.method === 'DELETE') {
				const labelId = Number(labelMatch[1])
				state.labels = state.labels.filter(label => label.id !== labelId)
				for (const task of state.tasks) {
					task.labelIds = task.labelIds.filter(entry => entry !== labelId)
				}
				sendJson(res, 200, {ok: true})
				return
			}

			sendJson(res, 404, {error: 'Route not found.'})
		} catch (error) {
			sendJson(res, error.statusCode || 500, {
				error: error.message || 'Mock Vikunja request failed.',
			})
		}
	})

	await listen(server)

	return {
		origin: `http://127.0.0.1:${server.address().port}`,
		reset() {
			state = buildMutableState(initialFixture)
		},
		getState() {
			return structuredClone(state)
		},
		close() {
			return new Promise((resolve, reject) => {
				server.close(error => {
					if (error) {
						reject(error)
						return
					}
					resolve()
				})
			})
		},
	}

	function listTasksForProject(projectId, searchParams = new URLSearchParams()) {
		if (projectId < 0) {
			const savedFilter = state.savedFilters.find(entry => entry.projectId === projectId)
			const filter = savedFilter?.filters?.filter || 'done = false'
			const searchText = `${savedFilter?.filters?.s || ''}`.trim().toLowerCase()
			const effectiveSearchParams = new URLSearchParams(searchParams)
			if (!effectiveSearchParams.getAll('sort_by').length && Array.isArray(savedFilter?.filters?.sort_by)) {
				for (const sortBy of savedFilter.filters.sort_by) {
					effectiveSearchParams.append('sort_by', `${sortBy}`)
				}
			}
			if (!effectiveSearchParams.getAll('order_by').length && Array.isArray(savedFilter?.filters?.order_by)) {
				for (const orderBy of savedFilter.filters.order_by) {
					effectiveSearchParams.append('order_by', `${orderBy}`)
				}
			}
			return sortTasks(
				state.tasks.filter(task => matchesSavedFilter(task, filter, state.labels, searchText)),
				effectiveSearchParams,
			).map(serializeTask)
		}

		return sortTasks(
			state.tasks.filter(task => task.project_id === projectId),
			searchParams,
		).map(serializeTask)
	}

	function listTasksForProjectView(projectId, viewId, searchParams = new URLSearchParams()) {
		return listTasksForProject(projectId, searchParams)
	}

	function filterTasks(searchParams) {
		const search = `${searchParams.get('s') || ''}`.trim().toLowerCase()
		const filter = `${searchParams.get('filter') || ''}`.trim()
		let tasks = state.tasks.slice()

		if (search) {
			tasks = tasks.filter(task =>
				`${task.title} ${task.description}`.toLowerCase().includes(search),
			)
		}

		if (filter) {
			if (filter.includes('done = false')) {
				tasks = tasks.filter(task => !task.done)
			}

			if (filter.includes('now+1d/d') && filter.includes('now+14d/d')) {
				const todayStart = startOfDay(new Date())
				const tomorrowStart = new Date(todayStart.getTime() + DAY_MS)
				const horizon = new Date(todayStart.getTime() + 14 * DAY_MS)
				tasks = tasks.filter(task => {
					const due = task.due_date ? new Date(task.due_date) : null
					return due && due >= tomorrowStart && due < horizon
				})
			}

			const boundaryMatch = filter.match(/due_date >= "([^"]+)" && due_date < "([^"]+)"/)
			if (boundaryMatch) {
				const start = new Date(boundaryMatch[1])
				const end = new Date(boundaryMatch[2])
				tasks = tasks.filter(task => {
					const due = task.due_date ? new Date(task.due_date) : null
					return due && due >= start && due < end
				})
			}
		}

		return sortTasks(tasks, searchParams).map(serializeTask)
	}

	function serializeTask(task, options = {}) {
		const includeComments = Boolean(options.includeComments)
		const includeAttachments = Boolean(options.includeAttachments)
		const labels = task.labelIds
			.map(labelId => state.labels.find(label => label.id === labelId))
			.filter(Boolean)
		const comments = normalizeTaskComments(task.comments)
		const attachments = normalizeTaskAttachments(task.attachments)
		const relatedTasks = Object.fromEntries(
			Object.entries(task.relatedTasks || {}).map(([relation, taskIds]) => [
				relation,
				Array.isArray(taskIds) ? taskIds.map(taskId => makeTaskRef(getTask(taskId))) : [],
			]),
		)

		return {
			id: task.id,
			project_id: task.project_id,
			title: task.title,
			description: task.description,
			done: task.done,
			is_favorite: Boolean(task.is_favorite),
			due_date: task.due_date,
			start_date: task.start_date || null,
			end_date: task.end_date || null,
			done_at: task.done_at || null,
			created: task.created || null,
			updated: task.updated || null,
			read: Boolean(task.read),
			read_at: normalizeDateString(task.read_at || null) || null,
			position: task.position,
			priority: task.priority,
			percent_done: normalizePercentDone(task.percent_done),
			reminders: task.reminders?.length ? task.reminders.map(reminder => ({...reminder})) : null,
			repeat_after: normalizeRepeatAfter(task.repeat_after),
			repeat_from_current_date: Boolean(task.repeat_from_current_date),
			assignees: task.assignees?.length ? task.assignees.map(assignee => ({...assignee})) : null,
			comments: includeComments ? comments.map(comment => ({...comment, author: {...comment.author}})) : null,
			comment_count: comments.length,
			attachments: includeAttachments ? attachments.map(attachment => ({...attachment, created_by: {...attachment.created_by}, file: {...attachment.file}})) : null,
			labels,
			subscription: task.subscription ? {subscribed: Boolean(task.subscription.subscribed)} : null,
			related_tasks: {
				...relatedTasks,
				parenttask: task.parentTaskId ? [makeTaskRef(getTask(task.parentTaskId))] : [],
				subtask: state.tasks
					.filter(entry => entry.parentTaskId === task.id)
					.sort(compareByPositionThenId)
					.map(makeTaskRef),
			},
		}
	}

	function getTask(taskId) {
		const task = state.tasks.find(entry => entry.id === taskId)
		if (!task) {
			const error = new Error(`Task ${taskId} not found.`)
			error.statusCode = 404
			throw error
		}
		return task
	}

	function getProject(projectId) {
		const project = state.projects.find(entry => entry.id === projectId)
		if (!project) {
			const error = new Error(`Project ${projectId} not found.`)
			error.statusCode = 404
			throw error
		}
		return project
	}

	function getSavedFilter(savedFilterId) {
		const savedFilter = state.savedFilters.find(entry => entry.id === savedFilterId)
		if (!savedFilter) {
			const error = new Error(`Saved filter ${savedFilterId} not found.`)
			error.statusCode = 404
			throw error
		}
		return savedFilter
	}

	function getNotification(notificationId) {
		const notification = state.notifications.find(entry => entry.id === notificationId)
		if (!notification) {
			const error = new Error(`Notification ${notificationId} not found.`)
			error.statusCode = 404
			throw error
		}
		return notification
	}

	function getLabel(labelId) {
		const label = state.labels.find(entry => entry.id === labelId)
		if (!label) {
			const error = new Error(`Label ${labelId} not found.`)
			error.statusCode = 404
			throw error
		}
		return label
	}

	function getUser(userId) {
		const user = state.users.find(entry => entry.id === userId)
		if (!user) {
			const error = new Error(`User ${userId} not found.`)
			error.statusCode = 404
			throw error
		}

		return {
			id: Number(user.id),
			name: `${user.name || ''}`.trim(),
			username: `${user.username || ''}`.trim(),
			email: `${user.email || ''}`.trim(),
		}
	}

	function getUserByUsername(username) {
		const normalizedUsername = `${username || ''}`.trim()
		const user = state.users.find(entry => entry.username === normalizedUsername)
		if (!user) {
			const error = new Error(`User ${normalizedUsername} not found.`)
			error.statusCode = 404
			throw error
		}
		return getUser(user.id)
	}

	function getUserProfileByUsername(username) {
		const normalizedUsername = `${username || ''}`.trim()
		const user =
			state.users.find(entry => `${entry?.username || ''}`.trim() === normalizedUsername) ||
			(`${state.user?.username || ''}`.trim() === normalizedUsername ? state.user : null)
		if (!user) {
			const error = new Error(`User profile ${normalizedUsername} not found.`)
			error.statusCode = 404
			throw error
		}

		return normalizeUserProfile(user)
	}

	function getAuthenticatedUsername(req) {
		const authorization = `${req.headers.authorization || ''}`.trim()
		const token = authorization.replace(/^Bearer\s+/i, '')
		const subject = decodeTokenSubject(token)
		if (subject && state.users.some(entry => `${entry?.username || ''}`.trim() === subject)) {
			return subject
		}
		return `${state.user?.username || ''}`.trim()
	}

	function issueRefreshToken(username, {reset = false} = {}) {
		if (reset) {
			state.refreshTokenSubjects = {}
			state.usedRefreshTokens = new Set()
			state.nextRefreshTokenId = 1
		}

		const token = rotateRefreshTokens
			? `mock-refresh-token-${state.nextRefreshTokenId++}`
			: 'mock-refresh-token'
		state.refreshTokenSubjects[token] = `${username || ''}`.trim()
		return token
	}

	function buildRefreshCookie(token) {
		return `${'vikunja_refresh_token'}=${token}; Path=/; HttpOnly`
	}

	function getRefreshTokenFromRequest(req) {
		const cookieHeader = `${req.headers.cookie || ''}`
		const match = cookieHeader.match(/(?:^|;\s*)vikunja_refresh_token=([^;]+)/)
		return match ? match[1] : ''
	}

	function getAuthenticatedUserProfile(req) {
		return getUserProfileByUsername(getAuthenticatedUsername(req))
	}

	function updateUserProfile(username, updater) {
		const normalizedUsername = `${username || ''}`.trim()
		const userIndex = state.users.findIndex(entry => `${entry?.username || ''}`.trim() === normalizedUsername)
		if (userIndex === -1) {
			const error = new Error(`User profile ${normalizedUsername} not found.`)
			error.statusCode = 404
			throw error
		}

		const currentProfile = normalizeUserProfile(state.users[userIndex])
		const nextProfile = normalizeUserProfile(updater(currentProfile))
		state.users[userIndex] = nextProfile
		if (`${state.user?.username || ''}`.trim() === normalizedUsername) {
			state.user = nextProfile
		}
		return nextProfile
	}

	function getTeam(teamId) {
		const team = state.teams.find(entry => Number(entry.id) === Number(teamId))
		if (!team) {
			const error = new Error(`Team ${teamId} not found.`)
			error.statusCode = 404
			throw error
		}
		return team
	}

	function getTeamMember(team, username) {
		const normalizedUsername = `${username || ''}`.trim()
		const member = Array.isArray(team.members)
			? team.members.find(entry => `${entry?.username || ''}`.trim() === normalizedUsername)
			: null
		if (!member) {
			const error = new Error(`Team member ${normalizedUsername} not found.`)
			error.statusCode = 404
			throw error
		}
		return member
	}

	function listProjectUsers(projectId) {
		const accessibleUserIds = new Set()
		for (const user of state.users) {
			if (user.id === state.user.id) {
				accessibleUserIds.add(Number(user.id))
			}
		}

		for (const task of state.tasks) {
			if (task.project_id !== projectId) {
				continue
			}

			for (const assignee of normalizeTaskAssignees(task.assignees)) {
				accessibleUserIds.add(Number(assignee.id))
			}
		}

		for (const share of state.projectUserShares) {
			if (Number(share.project_id) !== projectId) {
				continue
			}
			const user = state.users.find(entry => entry.username === share.username)
			if (user?.id) {
				accessibleUserIds.add(Number(user.id))
			}
		}

		for (const teamShare of state.projectTeamShares) {
			if (Number(teamShare.project_id) !== projectId) {
				continue
			}
			const team = state.teams.find(entry => entry.id === teamShare.team_id)
			for (const member of normalizeTeamMembers(team?.members)) {
				accessibleUserIds.add(Number(member.id))
			}
		}

		return state.users
			.filter(user => accessibleUserIds.has(Number(user.id)))
			.map(user => ({
				id: Number(user.id),
				name: `${user.name || ''}`.trim(),
				username: `${user.username || ''}`.trim(),
				email: `${user.email || ''}`.trim(),
			}))
			.sort((left, right) => left.id - right.id)
	}

	function getNextTaskPosition(projectId) {
		const tasks = state.tasks.filter(task => task.project_id === projectId)
		const maxPosition = tasks.reduce((max, task) => Math.max(max, Number(task.position || 0)), 0)
		return maxPosition + 100
	}

	function getNextProjectPosition() {
		const maxPosition = state.projects.reduce((max, project) => Math.max(max, Number(project.position || 0)), 0)
		return maxPosition + 100
	}

	function getProjectUserShare(projectId, username) {
		const entry = state.projectUserShares.find(share => share.project_id === projectId && share.username === username)
		if (!entry) {
			const error = new Error(`Project user share ${projectId}/${username} not found.`)
			error.statusCode = 404
			throw error
		}
		return entry
	}

	function getProjectTeamShare(projectId, teamId) {
		const entry = state.projectTeamShares.find(share => share.project_id === projectId && share.team_id === teamId)
		if (!entry) {
			const error = new Error(`Project team share ${projectId}/${teamId} not found.`)
			error.statusCode = 404
			throw error
		}
		return entry
	}

	function listProjectUserShares(projectId) {
		return state.projectUserShares
			.filter(entry => Number(entry.project_id) === projectId)
			.map(entry => serializeProjectUserShare(projectId, getUserByUsername(entry.username)))
			.sort((left, right) => left.id - right.id)
	}

	function listProjectTeamShares(projectId) {
		return state.projectTeamShares
			.filter(entry => Number(entry.project_id) === projectId)
			.map(entry => serializeProjectTeamShare(projectId, getTeam(entry.team_id)))
			.sort((left, right) => left.id - right.id)
	}

	function listProjectLinkShares(projectId) {
		return state.linkShares
			.filter(entry => Number(entry.project_id) === projectId)
			.map(entry => normalizeLinkShare(entry))
			.sort((left, right) => Number(right.id || 0) - Number(left.id || 0))
	}

	function serializeProjectUserShare(projectId, user) {
		const entry = getProjectUserShare(projectId, user.username)
		return {
			...user,
			permission: normalizeSharePermission(entry.permission),
			created: entry.created || null,
			updated: entry.updated || null,
		}
	}

	function serializeProjectTeamShare(projectId, team) {
		const entry = getProjectTeamShare(projectId, team.id)
		return {
			...serializeTeam(team),
			permission: normalizeSharePermission(entry.permission),
			created: entry.created || null,
			updated: entry.updated || null,
		}
	}

	function serializeTeam(team) {
		return {
			...team,
			id: Number(team.id),
			name: `${team.name || ''}`.trim(),
			description: `${team.description || ''}`.trim(),
			is_public: team.is_public === true,
			members: normalizeTeamMembers(team.members),
			created: team.created || null,
			updated: team.updated || null,
		}
	}

	function getViewsForProject(projectId) {
		if (state.viewsByProjectId[projectId]?.length) {
			return state.viewsByProjectId[projectId]
		}

		if (projectId < 0) {
			return [{id: 1000 + Math.abs(projectId), project_id: projectId, title: 'List', view_kind: 'list'}]
		}

		return []
	}

	function upsertSavedFilterProject(savedFilter) {
		const existingProject = state.projects.find(project => project.id === savedFilter.projectId)
		const baseProject = {
			id: savedFilter.projectId,
			title: savedFilter.title,
			description: savedFilter.description,
			parent_project_id: 0,
			position: existingProject?.position || getNextProjectPosition(),
			identifier: 'FILTER',
			is_favorite: Boolean(savedFilter.is_favorite),
			is_archived: false,
			max_permission: 2,
			created: savedFilter.created,
			updated: savedFilter.updated,
		}

		if (existingProject) {
			Object.assign(existingProject, baseProject)
		} else {
			state.projects.push(baseProject)
		}

		state.viewsByProjectId[savedFilter.projectId] = getViewsForProject(savedFilter.projectId)
	}

	function collectChildProjectIds(parentProjectId) {
		const childProjectIds = []
		const stack = [parentProjectId]

		while (stack.length > 0) {
			const currentId = stack.pop()
			for (const project of state.projects) {
				if (Number(project.parent_project_id || 0) !== currentId || childProjectIds.includes(project.id)) {
					continue
				}

				childProjectIds.push(project.id)
				stack.push(project.id)
			}
		}

		return childProjectIds
	}
}

function buildMutableState(fixture) {
	const state = cloneFixture(fixture)
	state.user = normalizeUserProfile(state.user)
	state.users = Array.isArray(state.users)
		? state.users.map(user =>
			`${user?.username || ''}`.trim() === `${state.user?.username || ''}`.trim()
				? normalizeUserProfile({
					...user,
					settings: state.user?.settings || buildDefaultUserSettings(),
				})
				: normalizeUserProfile(user),
		)
		: []
	state.currentPassword = 'smoke-password'
	state.passwordsByUsername = {
		'smoke-user': 'smoke-password',
	}
	state.refreshTokenSubjects = {}
	state.usedRefreshTokens = new Set()
	state.nextRefreshTokenId = 1
	state.passwordResetTokens = {}
	state.nextUserId = Math.max(0, ...(state.users || []).map(user => Number(user.id || 0))) + 1
	state.nextPasswordResetTokenId = 1
	state.nextProjectId = Math.max(...state.projects.filter(project => project.id > 0).map(project => project.id), 0) + 1
	state.nextTeamId = Math.max(0, ...(state.teams || []).map(team => Number(team.id || 0))) + 1
	state.nextLinkShareId = Math.max(0, ...(state.linkShares || []).map(share => Number(share.id || 0))) + 1
	state.nextWebhookId = Math.max(
		0,
		...((state.userWebhooks || []).map(webhook => Number(webhook.id || 0))),
		...Object.values(state.projectWebhooks || {}).flatMap(webhooks =>
			(Array.isArray(webhooks) ? webhooks : []).map(webhook => Number(webhook.id || 0)),
		),
	) + 1
	state.nextCaldavTokenId = Math.max(0, ...((state.caldavTokens || []).map(token => Number(token.id || 0)))) + 1
	state.nextApiTokenId = Math.max(0, ...((state.apiTokens || []).map(token => Number(token.id || 0)))) + 1
	state.nextTaskId = Math.max(...state.tasks.map(task => task.id), 0) + 1
	state.nextCommentId = Math.max(
		0,
		...state.tasks.flatMap(task => Array.isArray(task.comments) ? task.comments.map(comment => Number(comment.id || 0)) : []),
	) + 1
	state.nextAttachmentId = Math.max(
		0,
		...state.tasks.flatMap(task => Array.isArray(task.attachments) ? task.attachments.map(attachment => Number(attachment.id || 0)) : []),
	) + 1
	state.nextAttachmentFileId = Math.max(
		0,
		...state.tasks.flatMap(task => Array.isArray(task.attachments) ? task.attachments.map(attachment => Number(attachment?.file?.id || 0)) : []),
	) + 1
	state.nextLabelId = Math.max(...state.labels.map(label => label.id), 0) + 1
	state.nextSavedFilterId = Math.max(...(state.savedFilters || []).map(savedFilter => savedFilter.id), -1) + 1
	state.nextViewId = Math.max(
		0,
		...Object.values(state.viewsByProjectId || {}).flatMap(views =>
			(Array.isArray(views) ? views : []).map(view => Number(view.id || 0)),
		),
	) + 1
	state.nextBucketId = Math.max(
		0,
		...Object.values(state.bucketsByViewId || {}).flatMap(buckets =>
			(Array.isArray(buckets) ? buckets : []).map(bucket => Number(bucket.id || 0)),
		),
	) + 1
	state.projectBackgrounds = {}
	state.unsplashImages = [
		{
			id: 'unsplash-1',
			url: 'https://images.example.test/unsplash-1/full',
			thumb: 'https://images.example.test/unsplash-1/thumb',
			blur_hash: 'L5H2EC=PM+yV0g-mq.wG9c010J}I',
			info: {
				description: 'Mountain ridge at sunrise',
				alt_description: 'Sunrise over mountains',
				links: {html: 'https://unsplash.example.test/photos/unsplash-1'},
				user: {
					name: 'Alex Photographer',
					links: {html: 'https://unsplash.example.test/@alex'},
				},
			},
		},
		{
			id: 'unsplash-2',
			url: 'https://images.example.test/unsplash-2/full',
			thumb: 'https://images.example.test/unsplash-2/thumb',
			blur_hash: 'L9AS#7xut7t7~qofRjof?bRjt7ay',
			info: {
				description: 'Forest trail in morning fog',
				alt_description: 'Forest path',
				links: {html: 'https://unsplash.example.test/photos/unsplash-2'},
				user: {
					name: 'Jamie Lens',
					links: {html: 'https://unsplash.example.test/@jamie'},
				},
			},
		},
	]
	return state
}

function buildDefaultUserSettings() {
	return {
		default_project_id: 1,
		timezone: 'Europe/Amsterdam',
		avatar_provider: 'default',
		email_reminders_enabled: false,
		overdue_tasks_reminders_enabled: false,
		overdue_tasks_reminders_time: '07:00',
	}
}

function normalizeUserProfile(user) {
	return {
		...user,
		id: Number(user?.id || 0),
		name: `${user?.name || ''}`.trim(),
		username: `${user?.username || ''}`.trim(),
		email: `${user?.email || ''}`.trim(),
		deletion_scheduled_at:
			typeof user?.deletion_scheduled_at === 'string'
				? `${user.deletion_scheduled_at}`.trim() || null
				: null,
		is_local_user: user?.is_local_user !== false,
		auth_provider:
			typeof user?.auth_provider === 'string'
				? `${user.auth_provider}`.trim() || 'local'
				: 'local',
		settings: {
			...buildDefaultUserSettings(),
			...(user?.settings || {}),
		},
	}
}

function decodeTokenSubject(token) {
	const normalizedToken = `${token || ''}`.trim()
	if (!normalizedToken.includes('.')) {
		return ''
	}

	try {
		const payload = JSON.parse(Buffer.from(normalizedToken.split('.')[1], 'base64url').toString('utf8'))
		return `${payload?.sub || ''}`.trim()
	} catch {
		return ''
	}
}

function normalizeSharePermission(value) {
	const permission = Number(value)
	if (permission === 2) {
		return 2
	}
	if (permission === 1) {
		return 1
	}
	return 0
}

function normalizeWebhookEvents(value) {
	if (!Array.isArray(value)) {
		return []
	}

	return [...new Set(
		value
			.map(entry => `${entry || ''}`.trim())
			.filter(Boolean),
	)]
}

function normalizeWebhook(webhook) {
	return {
		id: Number(webhook?.id || 0),
		target_url: `${webhook?.target_url || webhook?.targetUrl || ''}`.trim(),
		events: normalizeWebhookEvents(webhook?.events),
		secret: typeof webhook?.secret === 'string' ? `${webhook.secret}`.trim() || null : null,
		created: normalizeDateString(webhook?.created || null),
		updated: normalizeDateString(webhook?.updated || null),
	}
}

function listProjectWebhooks(state, projectId) {
	return (Array.isArray(state.projectWebhooks?.[projectId]) ? state.projectWebhooks[projectId] : []).map(normalizeWebhook)
}

function getProjectWebhook(state, projectId, webhookId) {
	const webhooks = Array.isArray(state.projectWebhooks?.[projectId]) ? state.projectWebhooks[projectId] : []
	const webhook = webhooks.find(entry => Number(entry?.id || 0) === webhookId)
	if (!webhook) {
		const error = new Error('The project webhook does not exist.')
		error.statusCode = 404
		throw error
	}
	return webhook
}

function getUserWebhook(state, webhookId) {
	const webhook = (state.userWebhooks || []).find(entry => Number(entry?.id || 0) === webhookId)
	if (!webhook) {
		const error = new Error('The webhook does not exist.')
		error.statusCode = 404
		throw error
	}
	return webhook
}

function normalizeMigrationState(service, value) {
	const status = `${value?.status || ''}`.trim() || 'idle'
	const message = typeof value?.message === 'string' ? `${value.message}`.trim() || null : null
	return {
		service,
		status,
		message,
	}
}

function normalizeTeam(team) {
	return {
		...team,
		id: Number(team?.id || 0),
		name: `${team?.name || ''}`.trim(),
		description: `${team?.description || ''}`.trim(),
		is_public: team?.is_public === true,
		members: normalizeTeamMembers(team?.members),
		created: normalizeDateString(team?.created || null),
		updated: normalizeDateString(team?.updated || null),
	}
}

function normalizeTeamMembers(members) {
	if (!Array.isArray(members)) {
		return []
	}

	const byUsername = new Map()
	for (const member of members) {
		const username = `${member?.username || ''}`.trim()
		if (!username || byUsername.has(username)) {
			continue
		}

		byUsername.set(username, {
			id: Number(member?.id || 0),
			name: `${member?.name || ''}`.trim(),
			username,
			email: `${member?.email || ''}`.trim(),
			admin: member?.admin === true,
			created: normalizeDateString(member?.created || null),
			updated: normalizeDateString(member?.updated || null),
		})
	}

	return [...byUsername.values()].sort((left, right) => left.username.localeCompare(right.username))
}

function normalizeLinkShare(share) {
	return {
		id: Number(share?.id || 0),
		hash: `${share?.hash || ''}`.trim(),
		name: `${share?.name || ''}`.trim(),
		project_id: Number(share?.project_id || 0),
		permission: normalizeSharePermission(share?.permission),
		sharing_type: Number(share?.sharing_type || 0),
		expires: normalizeDateString(share?.expires || null),
		password_protected: Number(share?.sharing_type || 0) === 2 || Boolean(`${share?.password || ''}`),
		shared_by: normalizeTaskAssignee(share?.shared_by),
		created: normalizeDateString(share?.created || null),
		updated: normalizeDateString(share?.updated || null),
	}
}

function normalizeTotpState(totp) {
	return {
		enabled: Boolean(totp?.enabled),
		secret: `${totp?.secret || ''}`.trim() || null,
		url: `${totp?.url || totp?.totp_url || ''}`.trim() || null,
	}
}

function stripSecretTokenFields(token) {
	const nextToken = {...token}
	delete nextToken.token
	return nextToken
}

function normalizeApiToken(token) {
	return {
		id: Number(token?.id || 0),
		title: `${token?.title || ''}`.trim(),
		permissions: token?.permissions && typeof token.permissions === 'object' && !Array.isArray(token.permissions)
			? token.permissions
			: {},
		expires_at: normalizeDateString(token?.expires_at || null),
		created: normalizeDateString(token?.created || null) || new Date().toISOString(),
		token: `${token?.token || ''}`.trim() || null,
	}
}

function isValidApiTokenPayload(body, apiRoutes) {
	const title = `${body?.title || ''}`.trim()
	if (!title) {
		return false
	}

	if ('expires_at' in (body || {}) && (typeof body.expires_at !== 'string' || !body.expires_at.trim())) {
		return false
	}

	if (!body?.permissions || typeof body.permissions !== 'object' || Array.isArray(body.permissions)) {
		return false
	}

	const validPermissions = flattenApiRoutePermissions(apiRoutes)
	let selectedPermissionCount = 0
	for (const [resource, permissions] of Object.entries(body.permissions)) {
		if (!Array.isArray(permissions) || permissions.length === 0) {
			return false
		}

		const allowedPermissions = validPermissions.get(resource)
		if (!allowedPermissions) {
			return false
		}

		for (const permission of permissions) {
			if (typeof permission !== 'string' || !allowedPermissions.has(permission)) {
				return false
			}
			selectedPermissionCount += 1
		}
	}

	return selectedPermissionCount > 0
}

function flattenApiRoutePermissions(apiRoutes) {
	const permissions = new Map()

	if (Array.isArray(apiRoutes)) {
		for (const route of apiRoutes) {
			const resource = `${route?.key || ''}`.trim()
			const permission = `${route?.permission || ''}`.trim()
			if (!resource || !permission) {
				continue
			}

			if (!permissions.has(resource)) {
				permissions.set(resource, new Set())
			}
			permissions.get(resource)?.add(permission)
		}

		return permissions
	}

	if (!apiRoutes || typeof apiRoutes !== 'object') {
		return permissions
	}

	for (const [resource, routeGroup] of Object.entries(apiRoutes)) {
		if (!routeGroup || typeof routeGroup !== 'object' || Array.isArray(routeGroup)) {
			continue
		}

		const values = new Set()
		for (const [permissionKey, routeDetail] of Object.entries(routeGroup)) {
			if (
				typeof permissionKey === 'string' &&
				permissionKey.trim() &&
				routeDetail &&
				typeof routeDetail === 'object' &&
				typeof routeDetail.path === 'string' &&
				typeof routeDetail.method === 'string'
			) {
				values.add(permissionKey.trim())
			}
		}

		if (values.size > 0) {
			permissions.set(resource, values)
		}
	}

	return permissions
}

function listReactions(state, entity, entityId) {
	const entityStore = getReactionStore(state, entity)
	const current = Array.isArray(entityStore?.[entityId]) ? entityStore[entityId] : []
	return current.reduce((grouped, reaction) => {
		const value = `${reaction?.value || ''}`.trim()
		if (!value) {
			return grouped
		}

		grouped[value] = Array.isArray(grouped[value]) ? grouped[value] : []
		if (reaction?.user && typeof reaction.user === 'object') {
			grouped[value].push(reaction.user)
		}
		return grouped
	}, {})
}

function upsertReaction(state, entity, entityId, value, user) {
	const entityStore = getReactionStore(state, entity)
	const normalizedUser = normalizeUserProfile(user)
	const current = Array.isArray(entityStore[entityId]) ? entityStore[entityId] : []
	if (current.some(entry => `${entry?.value || ''}` === value && Number(entry?.user?.id || 0) === normalizedUser.id)) {
		return
	}
	entityStore[entityId] = [
		...current,
		{
			value,
			user: normalizedUser,
		},
	]
}

function removeReaction(state, entity, entityId, value, user) {
	const entityStore = getReactionStore(state, entity)
	const current = Array.isArray(entityStore[entityId]) ? entityStore[entityId] : []
	entityStore[entityId] = current.filter(entry =>
		!(
			`${entry?.value || ''}` === value &&
			Number(entry?.user?.id || 0) === Number(user?.id || 0)
		),
	)
}

function getReactionStore(state, entity) {
	state.reactions = state.reactions || {}
	state.reactions[entity] = state.reactions[entity] || {}
	return state.reactions[entity]
}

function normalizeNotifications(notifications) {
	if (!Array.isArray(notifications)) {
		return []
	}

	return notifications
		.map(notification => normalizeNotification(notification))
		.filter(notification => notification.id > 0)
		.sort((left, right) => right.id - left.id)
}

function normalizeNotification(notification) {
	return {
		id: Number(notification?.id || 0),
		name: `${notification?.name || ''}`.trim(),
		read: Boolean(notification?.read) || Boolean(normalizeDateString(notification?.read_at || null)),
		read_at: normalizeDateString(notification?.read_at || null) || null,
		created: normalizeDateString(notification?.created || null) || new Date().toISOString(),
		notification: normalizeNotificationPayload(notification?.notification),
	}
}

function normalizeNotificationPayload(payload) {
	if (!payload || typeof payload !== 'object') {
		return null
	}

	return {
		doer: normalizeTaskAssignee(payload.doer),
		task: payload.task?.id
			? {
					id: Number(payload.task.id),
					title: `${payload.task.title || ''}`.trim(),
					project_id: payload.task.project_id ? Number(payload.task.project_id) : null,
				}
			: null,
		project: payload.project?.id
			? {
					id: Number(payload.project.id),
					title: `${payload.project.title || ''}`.trim(),
				}
			: null,
		comment: payload.comment?.id
			? {
					id: Number(payload.comment.id),
					comment: `${payload.comment.comment || ''}`.trim(),
				}
			: null,
		assignee: normalizeTaskAssignee(payload.assignee),
		member: normalizeTaskAssignee(payload.member),
		team: payload.team?.id
			? {
					id: Number(payload.team.id),
					name: `${payload.team.name || ''}`.trim(),
				}
			: null,
	}
}

function normalizeTaskAssignee(assignee) {
	if (!assignee?.id) {
		return null
	}

	return {
		id: Number(assignee.id),
		name: `${assignee.name || ''}`.trim(),
		username: `${assignee.username || ''}`.trim(),
		email: `${assignee.email || ''}`.trim(),
	}
}

function buildTask(task) {
	const now = new Date().toISOString()
	const done = Boolean(task.done)
	return {
		id: Number(task.id),
		project_id: Number(task.project_id),
		title: `${task.title || ''}`.trim(),
		description: `${task.description || ''}`.trim(),
		done,
		is_favorite: Boolean(task.is_favorite),
		due_date: task.due_date || null,
		start_date: task.start_date || null,
		end_date: task.end_date || null,
		done_at: done ? task.done_at || now : task.done_at || null,
		created: task.created || now,
		updated: task.updated || task.created || now,
		read: Boolean(task.read),
		read_at: normalizeDateString(task.read_at || null) || null,
		position: Number(task.position || 0),
		priority: Number(task.priority || 0),
		percent_done: normalizePercentDone(task.percent_done),
		reminders: normalizeTaskReminders(task.reminders),
		repeat_after: normalizeRepeatAfter(task.repeat_after),
		repeat_from_current_date: Boolean(task.repeat_from_current_date),
		assignees: normalizeTaskAssignees(task.assignees),
		comments: normalizeTaskComments(task.comments),
		attachments: normalizeTaskAttachments(task.attachments),
		subscription: task?.subscription ? {subscribed: Boolean(task.subscription.subscribed)} : null,
		labelIds: Array.isArray(task.labelIds) ? task.labelIds.map(Number) : [],
		parentTaskId: task.parentTaskId ? Number(task.parentTaskId) : null,
	}
}

function normalizeTaskAssignees(assignees) {
	if (!Array.isArray(assignees)) {
		return []
	}

	const byId = new Map()
	for (const assignee of assignees) {
		const id = Number(assignee?.id || 0)
		if (!id || byId.has(id)) {
			continue
		}

		byId.set(id, {
			id,
			name: `${assignee?.name || ''}`.trim(),
			username: `${assignee?.username || ''}`.trim(),
			email: `${assignee?.email || ''}`.trim(),
		})
	}

	return [...byId.values()].sort((left, right) => left.id - right.id)
}

function normalizeTaskComments(comments) {
	if (!Array.isArray(comments)) {
		return []
	}

	const byId = new Map()
	for (const comment of comments) {
		const id = Number(comment?.id || 0)
		if (!id || byId.has(id)) {
			continue
		}

		byId.set(id, {
			id,
			comment: `${comment?.comment || ''}`.trim(),
			author: {
				id: Number(comment?.author?.id || 0),
				name: `${comment?.author?.name || ''}`.trim(),
				username: `${comment?.author?.username || ''}`.trim(),
				email: `${comment?.author?.email || ''}`.trim(),
			},
			created: normalizeDateString(comment?.created || null) || new Date().toISOString(),
			updated: normalizeDateString(comment?.updated || comment?.created || null) || new Date().toISOString(),
		})
	}

	return [...byId.values()].sort((left, right) => new Date(left.created).getTime() - new Date(right.created).getTime() || left.id - right.id)
}

function normalizeTaskAttachments(attachments) {
	if (!Array.isArray(attachments)) {
		return []
	}

	const byId = new Map()
	for (const attachment of attachments) {
		const id = Number(attachment?.id || 0)
		if (!id || byId.has(id)) {
			continue
		}

		byId.set(id, {
			id,
			task_id: Number(attachment?.task_id || 0),
			created_by: {
				id: Number(attachment?.created_by?.id || 0),
				name: `${attachment?.created_by?.name || ''}`.trim(),
				username: `${attachment?.created_by?.username || ''}`.trim(),
				email: `${attachment?.created_by?.email || ''}`.trim(),
			},
			file: {
				id: Number(attachment?.file?.id || 0),
				name: `${attachment?.file?.name || ''}`.trim(),
				mime: `${attachment?.file?.mime || ''}`.trim(),
				size: Number(attachment?.file?.size || 0),
			},
			created: normalizeDateString(attachment?.created || null) || new Date().toISOString(),
		})
	}

	return [...byId.values()].sort((left, right) => new Date(left.created).getTime() - new Date(right.created).getTime() || left.id - right.id)
}

function normalizeRepeatAfter(value) {
	const numeric = Number(value)
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return 0
	}

	return Math.max(0, Math.round(numeric))
}

function normalizeTaskReminders(reminders) {
	if (!Array.isArray(reminders)) {
		return []
	}

	return reminders
		.map(reminder => ({
			reminder: normalizeDateString(reminder?.reminder || null),
			relative_period: Number.isFinite(Number(reminder?.relative_period))
				? Number(reminder.relative_period)
				: 0,
			relative_to: normalizeRelativeTo(reminder?.relative_to),
		}))
		.filter(reminder => Boolean(reminder.reminder))
		.sort((left, right) => new Date(left.reminder).getTime() - new Date(right.reminder).getTime())
}

function normalizeDateString(value) {
	if (!value) {
		return ''
	}

	const raw = `${value}`.trim()
	if (!raw) {
		return ''
	}

	const date = new Date(raw)
	if (Number.isNaN(date.getTime())) {
		return ''
	}

	return date.toISOString()
}

function normalizeRelativeTo(value) {
	switch (`${value || ''}`) {
		case 'due_date':
		case 'start_date':
		case 'end_date':
			return `${value}`
		default:
			return ''
	}
}

function normalizePercentDone(value) {
	const numeric = Number(value)
	if (!Number.isFinite(numeric)) {
		return 0
	}

	return Math.min(100, Math.max(0, Math.round(numeric)))
}

function buildSavedFilter(savedFilter) {
	const id = Number(savedFilter.id || 0)
	const now = new Date().toISOString()

	return {
		id,
		projectId: Number.isInteger(Number(savedFilter.projectId))
			? Number(savedFilter.projectId)
			: (id + 1) * -1,
		title: `${savedFilter.title || ''}`.trim(),
		description: `${savedFilter.description || ''}`.trim(),
		is_favorite: Boolean(savedFilter.is_favorite),
		created: savedFilter.created || now,
		updated: savedFilter.updated || now,
		filters: {
			filter: `${savedFilter.filters?.filter || 'done = false'}`.trim(),
			filter_include_nulls: savedFilter.filters?.filter_include_nulls !== false,
			sort_by: Array.isArray(savedFilter.filters?.sort_by) && savedFilter.filters.sort_by.length > 0
				? savedFilter.filters.sort_by.map(entry => `${entry}`)
				: ['done', 'id'],
			order_by: Array.isArray(savedFilter.filters?.order_by) && savedFilter.filters.order_by.length > 0
				? savedFilter.filters.order_by.map(entry => `${entry}`)
				: ['asc', 'desc'],
			s: `${savedFilter.filters?.s || ''}`.trim(),
		},
	}
}

function hasInvalidSavedFilterSort(filters) {
	const sortBy = Array.isArray(filters?.sort_by)
		? filters.sort_by
		: Array.isArray(filters?.sortBy)
			? filters.sortBy
			: []
	return sortBy.some(entry => `${entry}`.trim() === 'position')
}

function matchesSavedFilter(task, filter, labels, searchText = '') {
	const normalizedFilter = `${filter || ''}`.trim()
	if (searchText) {
		const haystacks = [`${task.title || ''}`, `${task.description || ''}`]
		if (!haystacks.some(value => value.toLowerCase().includes(searchText))) {
			return false
		}
	}

	if (!normalizedFilter) {
		return true
	}

	if (normalizedFilter.includes('done = false') && task.done) {
		return false
	}

	if (normalizedFilter.includes('done = true') && !task.done) {
		return false
	}

	const projectMatch = normalizedFilter.match(/\bproject\s*=\s*(\d+)/i)
	if (projectMatch && Number(task.project_id || 0) !== Number(projectMatch[1])) {
		return false
	}

	const labelMatches = [...normalizedFilter.matchAll(/label\s*=\s*"([^"]+)"/g)]
	if (labelMatches.length > 0) {
		const taskLabelTitles = task.labelIds
			.map(labelId => labels.find(label => label.id === labelId)?.title || '')
			.filter(Boolean)
		const requiredLabels = labelMatches.map(match => match[1].trim().toLowerCase())
		if (!requiredLabels.every(labelTitle => taskLabelTitles.some(taskLabel => taskLabel.toLowerCase() === labelTitle))) {
			return false
		}
	}

	const labelIdMatches = [...normalizedFilter.matchAll(/labels\s+in\s+([\d,\s]+)/gi)]
	if (labelIdMatches.length > 0) {
		const requiredLabelIds = labelIdMatches
			.flatMap(match => `${match[1] || ''}`.split(','))
			.map(value => Number(value.trim()))
			.filter(Boolean)
		if (!requiredLabelIds.every(labelId => task.labelIds.includes(labelId))) {
			return false
		}
	}

	const priorityEqualsMatch = normalizedFilter.match(/\bpriority\s*=\s*(\d+)/i)
	if (priorityEqualsMatch && Number(task.priority || 0) !== Number(priorityEqualsMatch[1])) {
		return false
	}

	const priorityMatch = normalizedFilter.match(/priority\s*>=\s*(\d+)/)
	if (priorityMatch && Number(task.priority || 0) < Number(priorityMatch[1])) {
		return false
	}

	const titleLikeMatch = normalizedFilter.match(/\btitle\s+like\s+"((?:\\.|[^"])*)"/i)
	if (titleLikeMatch && !`${task.title || ''}`.toLowerCase().includes(unescapeFilterValue(titleLikeMatch[1]).toLowerCase())) {
		return false
	}

	const descriptionLikeMatch = normalizedFilter.match(/\bdescription\s+like\s+"((?:\\.|[^"])*)"/i)
	if (descriptionLikeMatch && !`${task.description || ''}`.toLowerCase().includes(unescapeFilterValue(descriptionLikeMatch[1]).toLowerCase())) {
		return false
	}

	if (normalizedFilter.includes('due_date = 0') && task.due_date) {
		return false
	}

	const dueTodayMatch = normalizedFilter.match(/\bdue_date\s*=\s*"([^"]+)"/i)
	if (dueTodayMatch) {
		const expected = `${dueTodayMatch[1] || ''}`.trim()
		const actual = task.due_date ? `${task.due_date}`.slice(0, 10) : ''
		if (actual !== expected) {
			return false
		}
	}

	const dueBeforeMatch = normalizedFilter.match(/\bdue_date\s*<\s*"([^"]+)"/i)
	if (dueBeforeMatch) {
		const actual = task.due_date ? `${task.due_date}`.slice(0, 10) : ''
		if (!actual || actual >= `${dueBeforeMatch[1] || ''}`.trim()) {
			return false
		}
	}

	const dueAfterMatch = normalizedFilter.match(/\bdue_date\s*>=\s*"([^"]+)"/i)
	if (dueAfterMatch) {
		const actual = task.due_date ? `${task.due_date}`.slice(0, 10) : ''
		if (!actual || actual < `${dueAfterMatch[1] || ''}`.trim()) {
			return false
		}
	}

	const dueUntilMatch = normalizedFilter.match(/\bdue_date\s*<=\s*"([^"]+)"/i)
	if (dueUntilMatch) {
		const actual = task.due_date ? `${task.due_date}`.slice(0, 10) : ''
		if (!actual || actual > `${dueUntilMatch[1] || ''}`.trim()) {
			return false
		}
	}

	return true
}

function unescapeFilterValue(value) {
	return `${value || ''}`.replace(/\\"/g, '"')
}

function makeTaskRef(task) {
	return {
		id: task.id,
		title: task.title,
		project_id: task.project_id,
		done: task.done,
		position: task.position,
	}
}

function compareByPositionThenId(a, b) {
	return Number(a.position || 0) - Number(b.position || 0) || Number(a.id || 0) - Number(b.id || 0)
}

function sortTasks(tasks, searchParams = new URLSearchParams()) {
	const sortBy = readMultiValueQueryParam(searchParams, 'sort_by')
	const orderBy = readMultiValueQueryParam(searchParams, 'order_by')
	if (sortBy.length === 0) {
		return tasks.slice().sort(compareByPositionThenId)
	}

	return tasks.slice().sort((a, b) => {
		for (let index = 0; index < sortBy.length; index += 1) {
			const field = sortBy[index]
			const direction = `${orderBy[index] || orderBy[orderBy.length - 1] || 'asc'}`.toLowerCase() === 'desc' ? -1 : 1
			const comparison = compareTaskField(a, b, field)
			if (comparison !== 0) {
				return comparison * direction
			}
		}

		return compareByPositionThenId(a, b)
	})
}

function compareTaskField(a, b, field) {
	switch (`${field || ''}`) {
		case 'title':
			return `${a.title || ''}`.localeCompare(`${b.title || ''}`)
		case 'priority':
		case 'percent_done':
		case 'position':
		case 'id':
			return Number(a[field] || 0) - Number(b[field] || 0)
		case 'due_date':
		case 'created':
		case 'updated':
		case 'done_at':
			return compareNullableDates(a[field], b[field])
		default:
			return 0
	}
}

function compareNullableDates(a, b) {
	if (!a && !b) {
		return 0
	}
	if (!a) {
		return 1
	}
	if (!b) {
		return -1
	}
	return new Date(a).getTime() - new Date(b).getTime()
}

function readMultiValueQueryParam(searchParams, key) {
	return searchParams.getAll(key).map(value => `${value || ''}`.trim()).filter(Boolean)
}

function paginate(items, url) {
	const page = Number(url.searchParams.get('page') || 1)
	const perPage = Number(url.searchParams.get('per_page') || 100)
	const start = Math.max(0, (page - 1) * perPage)
	return items.slice(start, start + perPage)
}

function startOfDay(value) {
	const date = new Date(value)
	date.setHours(0, 0, 0, 0)
	return date
}

async function readJsonBody(req) {
	const buffer = await readRawBody(req)
	if (buffer.byteLength === 0) {
		return {}
	}
	const raw = buffer.toString('utf8').trim()
	return raw ? JSON.parse(raw) : {}
}

async function readRawBody(req) {
	const chunks = []
	for await (const chunk of req) {
		chunks.push(chunk)
	}
	if (chunks.length === 0) {
		return Buffer.alloc(0)
	}
	return Buffer.concat(chunks)
}

function sendJson(res, statusCode, payload, headers = {}) {
	res.writeHead(statusCode, {
		'Content-Type': 'application/json',
		...headers,
	})
	res.end(JSON.stringify(payload))
}

function sendBuffer(res, statusCode, payload, headers = {}) {
	res.writeHead(statusCode, headers)
	res.end(payload)
}

function parseMultipartFiles(buffer, contentType) {
	const boundaryMatch = `${contentType || ''}`.match(/boundary=([^;]+)/i)
	if (!boundaryMatch) {
		return []
	}

	const boundary = `--${boundaryMatch[1]}`
	const raw = buffer.toString('latin1')
	const parts = raw.split(boundary)
	const files = []
	for (const part of parts) {
		if (!part.includes('Content-Disposition')) {
			continue
		}

		const [rawHeaders, rawValue] = part.split('\r\n\r\n')
		if (!rawHeaders || rawValue === undefined) {
			continue
		}

		const fileNameMatch = rawHeaders.match(/filename="([^"]+)"/i)
		if (!fileNameMatch) {
			continue
		}
		const mimeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)
		const bodyValue = rawValue.replace(/\r\n--$/, '').replace(/\r\n$/, '')
		files.push({
			name: fileNameMatch[1],
			mime: `${mimeMatch?.[1] || 'application/octet-stream'}`.trim(),
			size: Buffer.byteLength(bodyValue, 'latin1'),
		})
	}

	return files
}

function buildAttachmentPayload(attachment, previewSize) {
	const mime = `${attachment?.file?.mime || ''}`.trim() || 'application/octet-stream'
	const name = `${attachment?.file?.name || 'attachment.bin'}`.trim() || 'attachment.bin'
	if (previewSize && mime.startsWith('image/')) {
		return {
			body: Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9K8BP9QAAAABJRU5ErkJggg==',
				'base64',
			),
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'no-store',
			},
		}
	}

	return {
		body: Buffer.from(`Mock attachment: ${name}\n`),
		headers: {
			'Content-Type': mime,
			'Content-Disposition': `inline; filename="${name.replace(/"/g, '')}"`,
			'Cache-Control': 'no-store',
		},
	}
}

function buildToken(subject, lifetimeSeconds = 3600) {
	const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
	return `${encode({alg: 'none', typ: 'JWT'})}.${encode({sub: subject, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds})}.signature`
}

function listen(server) {
	return new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject)
			resolve()
		})
	})
}

const DAY_MS = 24 * 60 * 60 * 1000

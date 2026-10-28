/* Kept one-way: admin-http.mjs imports nothing, so there is no cycle back. */
import {probeServerAdmin} from './admin-http.mjs'
import {prepareRepeatBody, prepareV2Body} from './vikunja-v2-body.mjs'

/* Single place where an API version becomes part of an upstream URL.
 *
 * The configured base URL stays pinned to /api/v1 (operators may have set it
 * that way, and it is persisted in encrypted sessions), so this strips any
 * version suffix to recover the instance origin — including instances served
 * under a path prefix — and re-attaches the requested one. The trailing slash
 * matters: without it, `new URL('projects/2/views', base)` would drop the
 * version segment. */
export function resolveVersionedUrl(baseUrl, route, version = 'v1') {
	const origin = `${baseUrl || ''}`.trim().replace(/\/+$/, '').replace(/\/api\/v\d+$/, '')
	return new URL(`${route || ''}`.replace(/^\/+/, ''), `${origin}/api/${version}/`)
}

export async function loadVikunjaInstance(baseUrl, {signal} = {}) {
	for (const apiVersion of ['v2', 'v1']) {
		const response = await fetch(resolveVersionedUrl(baseUrl, 'info', apiVersion), {
			headers: {Accept: 'application/json'}, signal,
		})
		if (apiVersion === 'v2' && [404, 405].includes(response.status)) continue
		if (!response.ok) {
			const error = new Error(`Unable to load Vikunja info (${response.status}).`)
			error.statusCode = response.status
			throw error
		}
		return {info: await response.json(), apiVersion}
	}
}

export function instanceFeaturesFromInfo(info, apiVersion) {
	return {
		linkSharingEnabled: normalizeNullableBoolean(info?.link_sharing_enabled ?? info?.linkSharingEnabled ?? null),
		publicTeamsEnabled: normalizeNullableBoolean(info?.public_teams_enabled ?? info?.publicTeamsEnabled ?? null),
		frontendUrl: normalizeFrontendUrl(info?.frontend_url ?? info?.frontendUrl ?? null),
		emailRemindersEnabled: normalizeNullableBoolean(info?.email_reminders_enabled ?? info?.emailRemindersEnabled ?? null),
		enabledProFeatures: normalizeStringList(info?.enabled_pro_features ?? info?.enabledProFeatures ?? null),
		apiV2Available: apiVersion === 'v2',
		serverVersion: `${info?.version || ''}`,
	}
}

/* v2 list responses are an envelope; v1's fetchAllPages walks bare arrays and
 * would silently return page one of an envelope, so the two stay separate. */
export async function collectV2Pages(fetchPage, {perPage = 100, maxPages = 1000} = {}) {
	const items = []
	let page = 1

	while (page <= maxPages) {
		const envelope = await fetchPage({page, perPage})
		const pageItems = Array.isArray(envelope?.items) ? envelope.items : []
		items.push(...pageItems.map(stripSchemaField))

		const totalPages = Number(envelope?.total_pages || 0)
		if (totalPages > 0 ? page >= totalPages : pageItems.length < perPage) {
			return items
		}

		page += 1
	}

	return items
}

/* Huma stamps a `$schema` URL on v2 bodies; it is transport metadata, not data. */
export function stripSchemaField(payload) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return payload
	}

	const {$schema: _schema, ...rest} = payload
	return rest
}

export function createVikunjaClient({
	baseUrl,
	apiVersion = 'v1',
	authMode = 'apiToken',
	apiToken = '',
	accessToken = '',
	refreshCookie = '',
	getAuthState = null,
	coordinateRefresh = null,
	onAuthStateChange = null,
	onAuthFailure = null,
}) {
	let currentAccessToken = accessToken
	let currentRefreshCookie = refreshCookie

	return {
		requireConfig() {
			if (!baseUrl) {
				const error = new Error('Missing Vikunja base URL.')
				error.statusCode = 500
				throw error
			}

			if (authMode === 'password' && !currentAccessToken) {
				const error = new Error('Missing Vikunja access token.')
				error.statusCode = 401
				throw error
			}

			if (authMode === 'apiToken' && !apiToken) {
				const error = new Error('Missing Vikunja API token.')
				error.statusCode = 401
				throw error
			}
		},

		getAuthSnapshot() {
			return {
				baseUrl,
				authMode,
				apiToken,
				accessToken: currentAccessToken,
				refreshCookie: currentRefreshCookie,
			}
		},

		async getFreshAccessToken() {
			await ensureFreshAccessToken()
			return currentAccessToken
		},

		async fetchAllPages(route, params = {}, options = {}) {
			if ((options.apiVersion || apiVersion) === 'v2') {
				if (options.v2Route?.endsWith('/buckets/tasks')) return (await request(route, {...options, params})).items || []
				return this.fetchAllPagesV2(route, params, options)
			}
			const items = []
			let page = 1
			const perPage = 100
			const seenPageSignatures = new Set()

			for (;;) {
				const pageItems = await request(route, {
					...options,
					params: {
						...params,
						page,
						per_page: perPage,
					},
				})

				if (!Array.isArray(pageItems)) {
					return pageItems
				}

				if (pageItems.length === 0) {
					return items
				}

				const pageSignature = getPageSignature(pageItems)
				if (seenPageSignatures.has(pageSignature)) {
					return items
				}

				seenPageSignatures.add(pageSignature)
				items.push(...pageItems)
				page += 1
			}
		},

		async fetchAllPagesV2(route, params = {}, options = {}) {
			return collectV2Pages(({page, perPage}) => request(route, {
				...options,
				apiVersion: 'v2',
				params: {
					...params,
					page,
					per_page: perPage,
				},
			}))
		},

		async request(route, options = {}) {
			this.requireConfig()
			return request(route, options)
		},

		async requestRaw(route, options = {}) {
			this.requireConfig()
			return requestRaw(route, options)
		},

		async refreshUserToken() {
			return refreshUserToken()
		},

		getTodayRange() {
			const now = new Date()
			const start = new Date(now)
			start.setHours(0, 0, 0, 0)
			const end = new Date(start)
			end.setDate(end.getDate() + 1)

			return {
				startIso: start.toISOString(),
				endIso: end.toISOString(),
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
			}
		},
	}

	async function request(route, options = {}, attempt = 0) {
		const response = await requestRaw(route, options, attempt)
		const rawText = await response.text()
		const payload = tryParseJson(rawText)

		if (!response.ok) {
			const error = new Error(isUnrecoverableAuthError(response.status, payload)
				? 'Your Vikunja session is no longer valid. Sign in again.'
				: getVikunjaErrorMessage(payload, rawText, response.status))
			error.statusCode = response.status
			error.details = payload || rawText || null
			throw error
		}

		return stripSchemaField(payload)
	}

	async function requestRaw(route, options = {}, attempt = 0) {
		if (authMode === 'password') {
			await ensureFreshAccessToken()
		}

		const response = await doRequest(route, options)

		if (!response.ok) {
			const rawText = await response.clone().text()
			const payload = tryParseJson(rawText)
			if (shouldRefreshFromError(response.status, payload) && authMode === 'password' && attempt === 0) {
				await refreshUserToken()
				return requestRaw(route, options, attempt + 1)
			}

			// Modes without a refresh token cannot recover, so drop the session
			// instead of replaying the upstream string on every poll.
			if (isUnrecoverableAuthError(response.status, payload)) {
				onAuthFailure?.({
					statusCode: response.status,
					details: payload || rawText || null,
				})
			}
		}

		return response
	}

	async function doRequest(route, options = {}) {
		const version = options.apiVersion || apiVersion
		const requestUrl = resolveVersionedUrl(baseUrl, version === 'v2' ? options.v2Route || route : route, version)

		for (const [originalKey, value] of Object.entries(options.params || {})) {
			const key = version === 'v2' && originalKey === 's' ? 'q' : version === 'v2' && route === 'backgrounds/unsplash/search' && originalKey === 'p' ? 'page' : originalKey
			if (Array.isArray(value)) {
				value.forEach(entry => requestUrl.searchParams.append(key, formatParam(entry)))
			} else if (typeof value !== 'undefined' && value !== null && value !== '') {
				requestUrl.searchParams.append(key, formatParam(value))
			}
		}

		const headers = {
			Accept: 'application/json',
			...(options.body ? {'Content-Type': 'application/json'} : {}),
			...(options.headers || {}),
		}

		if (!options.skipAuth) {
			if (authMode === 'apiToken') {
				headers.Authorization = `Bearer ${apiToken}`
			}

			if (authMode === 'password') {
				headers.Authorization = `Bearer ${currentAccessToken}`
			}
		}

		const body = version === 'v2' ? prepareV2Body(route, options.body) : prepareRepeatBody(options.body)

		return fetch(requestUrl, {
			method: (version === 'v2' ? options.v2Method : null) || options.method || 'GET',
			headers,
			body: options.rawBody ?? (options.body ? JSON.stringify(body) : undefined),
		})
	}

	function syncAuthStateFromSource() {
		if (authMode !== 'password' || typeof getAuthState !== 'function') {
			return false
		}

		const latestState = getAuthState()
		if (!latestState || typeof latestState !== 'object') {
			return false
		}

		const nextAccessToken = `${latestState.accessToken || ''}`.trim()
		const nextRefreshCookie = `${latestState.refreshCookie || ''}`.trim()
		const changed =
			(Boolean(nextAccessToken) && nextAccessToken !== currentAccessToken) ||
			(Boolean(nextRefreshCookie) && nextRefreshCookie !== currentRefreshCookie)

		if (Boolean(nextAccessToken)) {
			currentAccessToken = nextAccessToken
		}
		if (Boolean(nextRefreshCookie)) {
			currentRefreshCookie = nextRefreshCookie
		}

		return changed
	}

	async function ensureFreshAccessToken() {
		syncAuthStateFromSource()

		if (!currentAccessToken) {
			return
		}

		const exp = getTokenExpiry(currentAccessToken)
		if (!exp) {
			return
		}

		const now = Math.floor(Date.now() / 1000)
		if (exp - now > 60) {
			return
		}

		await refreshUserToken()
	}

	/* Connect-time clients carry no session to drop, so they must keep the
	 * upstream reason instead of being told to sign in again. */
	function isUnrecoverableAuthError(status, payload) {
		return shouldRefreshFromError(status, payload)
			&& authMode !== 'password'
			&& typeof onAuthFailure === 'function'
	}

	async function refreshUserToken() {
		if (authMode !== 'password') {
			return null
		}

		const runRefresh = async () => {
			syncAuthStateFromSource()

			if (!currentRefreshCookie) {
				const error = new Error('No Vikunja refresh cookie is available.')
				error.statusCode = 401
				onAuthFailure?.({
					statusCode: error.statusCode,
					details: error.message,
				})
				throw error
			}

			const response = await fetch(resolveVersionedUrl(baseUrl, 'user/token/refresh', apiVersion), {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					Cookie: currentRefreshCookie,
				},
			})

			const rawText = await response.text()
			const payload = tryParseJson(rawText)

			if (!response.ok) {
				const error = new Error(`Vikunja refresh failed with ${response.status}`)
				error.statusCode = response.status
				error.details = payload || rawText || null

				// Another request may already have rotated the refresh cookie and
				// written the latest auth state back to the shared session.
				if (response.status === 401 && syncAuthStateFromSource()) {
					return currentAccessToken
				}

				if (response.status === 401) {
					onAuthFailure?.({
						statusCode: response.status,
						details: error.details,
					})
				}
				throw error
			}

			const nextToken = `${payload?.token || ''}`.trim()
			if (!nextToken) {
				const error = new Error('Vikunja refresh did not return a token.')
				error.statusCode = 502
				throw error
			}

			const nextRefreshCookie = extractRefreshCookie(response)
			currentAccessToken = nextToken
			if (nextRefreshCookie) {
				currentRefreshCookie = nextRefreshCookie
			}

			onAuthStateChange?.({
				accessToken: currentAccessToken,
				refreshCookie: currentRefreshCookie,
			})

			return currentAccessToken
		}

		if (typeof coordinateRefresh === 'function') {
			await coordinateRefresh(runRefresh)
			syncAuthStateFromSource()
			return currentAccessToken
		}

		return runRefresh()
	}
}

export async function createPasswordAccount({baseUrl, username, password, totpPasscode = '', longToken = false}) {
	const {info, apiVersion} = await loadVikunjaInstance(baseUrl)
	const nextTotpPasscode = `${totpPasscode || ''}`.trim()
	const response = await fetch(resolveVersionedUrl(baseUrl, 'login', apiVersion), {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			username,
			password,
			long_token: Boolean(longToken),
			...(nextTotpPasscode ? {totp_passcode: nextTotpPasscode} : {}),
		}),
	})

	const rawText = await response.text()
	const payload = tryParseJson(rawText)

	if (!response.ok) {
		const error = new Error(payload?.detail || payload?.message || payload?.error || payload?.title || `Vikunja login failed with ${response.status}`)
		error.statusCode = response.status
		error.details = payload || rawText || null
		throw error
	}

	const accessToken = `${payload?.token || ''}`.trim()
	const refreshCookie = extractRefreshCookie(response)
	if (!accessToken || !refreshCookie) {
		const error = new Error('Vikunja login did not return both an access token and a refresh cookie.')
		error.statusCode = 502
		throw error
	}

	const client = createVikunjaClient({
		baseUrl,
		apiVersion,
		authMode: 'password',
		accessToken,
		refreshCookie,
	})

	const [user, instanceFeatures, isServerAdmin] = await Promise.all([
		client.request('user'),
		instanceFeaturesFromInfo(info, apiVersion),
		probeServerAdmin(client),
	])
	return {
		authMode: 'password',
		baseUrl,
		accessToken,
		refreshCookie,
		instanceFeatures,
		isServerAdmin,
		user,
	}
}

export async function createOidcAccount({baseUrl, provider, code, redirectUrl}) {
	const {info, apiVersion} = await loadVikunjaInstance(baseUrl)
	const response = await fetch(resolveVersionedUrl(baseUrl, `auth/openid/${encodeURIComponent(provider)}/callback`, apiVersion), {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			code,
			redirect_url: redirectUrl,
		}),
	})

	const rawText = await response.text()
	const payload = tryParseJson(rawText)

	if (!response.ok) {
		const error = new Error(payload?.detail || payload?.message || payload?.error || payload?.title || `Vikunja OIDC login failed with ${response.status}`)
		error.statusCode = response.status
		error.details = payload || rawText || null
		throw error
	}

	const accessToken = `${payload?.token || ''}`.trim()
	const refreshCookie = extractRefreshCookie(response)
	if (!accessToken || !refreshCookie) {
		const error = new Error('Vikunja OIDC login did not return both an access token and a refresh cookie.')
		error.statusCode = 502
		throw error
	}

	const client = createVikunjaClient({
		baseUrl,
		apiVersion,
		authMode: 'password',
		accessToken,
		refreshCookie,
	})

	const [user, instanceFeatures, isServerAdmin] = await Promise.all([
		client.request('user'),
		instanceFeaturesFromInfo(info, apiVersion),
		probeServerAdmin(client),
	])

	return {
		authMode: 'password',
		baseUrl,
		accessToken,
		refreshCookie,
		instanceFeatures,
		isServerAdmin,
		user,
	}
}

export async function createApiTokenAccount({baseUrl, apiToken}) {
	const {info, apiVersion} = await loadVikunjaInstance(baseUrl)
	const client = createVikunjaClient({
		baseUrl,
		apiVersion,
		authMode: 'apiToken',
		apiToken,
	})

	const [user, instanceFeatures] = await Promise.all([
		client.request('user'),
		instanceFeaturesFromInfo(info, apiVersion),
	])
	return {
		authMode: 'apiToken',
		baseUrl,
		apiToken,
		instanceFeatures,
		user,
	}
}

export async function authenticateLinkShare({baseUrl, hash, password = ''}) {
	const {apiVersion} = await loadVikunjaInstance(baseUrl)
	const response = await fetch(resolveVersionedUrl(baseUrl, `shares/${encodeURIComponent(hash)}/auth`, apiVersion), {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			password,
		}),
	})

	const rawText = await response.text()
	const payload = tryParseJson(rawText)

	if (!response.ok) {
		const error = new Error(payload?.detail || payload?.message || payload?.error || payload?.title || `Vikunja link share auth failed with ${response.status}`)
		error.statusCode = response.status
		error.details = payload || rawText || null
		throw error
	}

	const token = `${payload?.token || ''}`.trim()
	const projectId = Number(payload?.project_id || payload?.projectId || 0)
	if (!token || !projectId) {
		const error = new Error('Vikunja link share auth did not return both a token and project id.')
		error.statusCode = 502
		throw error
	}

	return {
		token,
		projectId,
		payload,
	}
}

export async function createLinkShareAccount({baseUrl, token, projectId}) {
	const account = await createApiTokenAccount({
		baseUrl,
		apiToken: token,
	})

	return {
		...account,
		linkShareAuth: true,
		linkShareProjectId: projectId,
	}
}

function extractRefreshCookie(response) {
	const setCookies = getSetCookieHeaders(response)
	const cookie = setCookies.find(entry => entry.startsWith('vikunja_refresh_token='))
	return cookie ? cookie.split(';', 1)[0] : ''
}

function getSetCookieHeaders(response) {
	if (typeof response.headers.getSetCookie === 'function') {
		return response.headers.getSetCookie()
	}

	const single = response.headers.get('set-cookie')
	return single ? [single] : []
}

function getTokenExpiry(token) {
	try {
		const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
		return Number(payload.exp || 0) || null
	} catch {
		return null
	}
}

function shouldRefreshFromError(status, payload) {
	if (status !== 401) {
		return false
	}

	return Number(payload?.code || 0) === 11
}

function tryParseJson(value) {
	if (!value) {
		return null
	}

	try {
		return JSON.parse(value)
	} catch {
		return null
	}
}

function getVikunjaErrorMessage(payload, rawText, statusCode) {
	const directMessage = `${payload?.detail || payload?.message || payload?.error || payload?.title || ''}`.trim()
	if (directMessage) {
		return directMessage
	}

	if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
		const firstError = `${payload.errors[0]?.message || payload.errors[0]?.error || payload.errors[0] || ''}`.trim()
		if (firstError) {
			return firstError
		}
	}

	const fallbackText = `${rawText || ''}`.trim()
	if (fallbackText) {
		return fallbackText
	}

	return `Vikunja request failed with ${statusCode}`
}

function formatParam(value) {
	if (value instanceof Date) {
		return value.toISOString()
	}

	return `${value}`
}

function normalizeStringList(value) {
	if (!Array.isArray(value)) {
		return []
	}
	return value
		.map(entry => `${entry ?? ''}`.trim())
		.filter(entry => entry.length > 0)
}

function normalizeNullableBoolean(value) {
	if (typeof value === 'boolean') {
		return value
	}

	if (typeof value === 'number') {
		return value !== 0
	}

	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase()
		if (normalized === 'true') {
			return true
		}
		if (normalized === 'false') {
			return false
		}
	}

	return null
}

function normalizeFrontendUrl(value) {
	const normalized = `${value || ''}`.trim()
	return normalized || null
}

function getPageSignature(pageItems) {
	const first = pageItems[0] || null
	const last = pageItems[pageItems.length - 1] || null
	return JSON.stringify({
		length: pageItems.length,
		firstId: first?.id || null,
		firstUpdated: first?.updated || null,
		lastId: last?.id || null,
		lastUpdated: last?.updated || null,
	})
}

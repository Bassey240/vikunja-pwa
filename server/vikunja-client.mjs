export function createVikunjaClient({
	baseUrl,
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

		async fetchAllPages(route, params = {}) {
			const items = []
			let page = 1
			const perPage = 100
			const seenPageSignatures = new Set()

			for (;;) {
				const pageItems = await request(route, {
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
				const error = new Error(getVikunjaErrorMessage(payload, rawText, response.status))
				error.statusCode = response.status
				error.details = payload || rawText || null
				throw error
			}

		return payload
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
		}

		return response
	}

	async function doRequest(route, options = {}) {
		const requestUrl = new URL(route.replace(/^\/+/, ''), `${baseUrl}/`)

		for (const [key, value] of Object.entries(options.params || {})) {
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

		return fetch(requestUrl, {
			method: options.method || 'GET',
			headers,
			body: options.rawBody ?? (options.body ? JSON.stringify(options.body) : undefined),
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

			const response = await fetch(new URL('user/token/refresh', `${baseUrl}/`), {
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

export async function createPasswordAccount({baseUrl, username, password, totpPasscode = ''}) {
	const nextTotpPasscode = `${totpPasscode || ''}`.trim()
	const response = await fetch(new URL('login', `${baseUrl}/`), {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			username,
			password,
			...(nextTotpPasscode ? {totp_passcode: nextTotpPasscode} : {}),
		}),
	})

	const rawText = await response.text()
	const payload = tryParseJson(rawText)

	if (!response.ok) {
		const error = new Error(payload?.message || payload?.error || `Vikunja login failed with ${response.status}`)
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
		authMode: 'password',
		accessToken,
		refreshCookie,
	})

	const [user, instanceFeatures] = await Promise.all([
		client.request('user'),
		loadInstanceFeatures(client),
	])
	return {
		authMode: 'password',
		baseUrl,
		accessToken,
		refreshCookie,
		instanceFeatures,
		user,
	}
}

export async function createOidcAccount({baseUrl, provider, code, redirectUrl}) {
	const response = await fetch(new URL(`auth/openid/${encodeURIComponent(provider)}/callback`, `${baseUrl}/`), {
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
		const error = new Error(payload?.message || payload?.error || `Vikunja OIDC login failed with ${response.status}`)
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
		authMode: 'password',
		accessToken,
		refreshCookie,
	})

	const [user, instanceFeatures] = await Promise.all([
		client.request('user'),
		loadInstanceFeatures(client),
	])

	return {
		authMode: 'password',
		baseUrl,
		accessToken,
		refreshCookie,
		instanceFeatures,
		user,
	}
}

export async function createApiTokenAccount({baseUrl, apiToken}) {
	const client = createVikunjaClient({
		baseUrl,
		authMode: 'apiToken',
		apiToken,
	})

	const [user, instanceFeatures] = await Promise.all([
		client.request('user'),
		loadInstanceFeatures(client),
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
	const response = await fetch(new URL(`shares/${encodeURIComponent(hash)}/auth`, `${baseUrl}/`), {
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
		const error = new Error(payload?.message || payload?.error || `Vikunja link share auth failed with ${response.status}`)
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

async function loadInstanceFeatures(client) {
	try {
		const info = await client.request('info')
		return {
			linkSharingEnabled: normalizeNullableBoolean(
				info?.link_sharing_enabled ?? info?.linkSharingEnabled ?? null,
			),
			publicTeamsEnabled: normalizeNullableBoolean(
				info?.public_teams_enabled ?? info?.publicTeamsEnabled ?? null,
			),
			frontendUrl: normalizeFrontendUrl(info?.frontend_url ?? info?.frontendUrl ?? null),
			emailRemindersEnabled: normalizeNullableBoolean(
				info?.email_reminders_enabled ?? info?.emailRemindersEnabled ?? null,
			),
		}
	} catch {
		return {
			linkSharingEnabled: null,
			publicTeamsEnabled: null,
			frontendUrl: null,
			emailRemindersEnabled: null,
		}
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
	const directMessage = `${payload?.message || payload?.error || ''}`.trim()
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

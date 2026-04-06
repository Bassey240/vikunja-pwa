import assert from 'node:assert/strict'
import test from 'node:test'
import {startTestStack} from '../helpers/app-under-test.mjs'

const ONE_PIXEL_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6V1x8AAAAASUVORK5CYII='

let stack

test.before(async () => {
	stack = await startTestStack()
})

test.after(async () => {
	if (stack) {
		await stack.stop()
	}
})

test.beforeEach(() => {
	stack?.reset()
})

async function loginWithPasswordSession(targetStack, {
	username = 'smoke-user',
	password = 'smoke-password',
	totpPasscode = '',
} = {}) {
	const response = await fetch(new URL('/api/session/login', targetStack.appUrl), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			authMode: 'password',
			baseUrl: `${targetStack.mock.origin}/api/v1`,
			username,
			password,
			...(totpPasscode ? {totpPasscode} : {}),
		}),
	})

	assert.equal(response.status, 200)

	const sessionCookie = getAppSessionCookie(response)
	assert.ok(sessionCookie)
	return sessionCookie
}

test('password login forwards TOTP passcodes when a user has 2FA enabled', async () => {
	const authStack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {
			totpState: {
				enabled: true,
			},
		},
	})

	try {
		const missingTotpResponse = await fetch(new URL('/api/session/login', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				authMode: 'password',
				baseUrl: `${authStack.mock.origin}/api/v1`,
				username: 'smoke-user',
				password: 'smoke-password',
			}),
		})
		assert.equal(missingTotpResponse.status, 401)
		assert.equal((await missingTotpResponse.json()).error, 'Invalid totp passcode.')

		const sessionCookie = await loginWithPasswordSession(authStack, {
			totpPasscode: '123456',
		})
		assert.ok(sessionCookie)
	} finally {
		await authStack.stop()
	}
})

function getAppSessionCookie(response) {
	return response.headers
		.getSetCookie()
		.find(cookie => cookie.startsWith('vikunja_pwa_session='))
		?.split(';')[0]
}

function sameOriginHeaders(targetStack, sessionCookie, headers = {}) {
	return {
		Cookie: sessionCookie,
		Origin: targetStack.appUrl,
		...headers,
	}
}

function createMultipartUploadBody({
	filename,
	sizeBytes,
	contentType = 'application/octet-stream',
	fillByte = 0x61,
}) {
	const boundary = `----codex-boundary-${sizeBytes}`
	const prefix = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
		'utf8',
	)
	const fileBody = Buffer.alloc(sizeBytes, fillByte)
	const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
	return {
		body: Buffer.concat([prefix, fileBody, suffix]),
		contentType: `multipart/form-data; boundary=${boundary}`,
	}
}

test('config, session, saved filters, and project bootstrap routes respond', async () => {
	const healthResponse = await fetch(new URL('/health', stack.appUrl))
	assert.equal(healthResponse.status, 200)
	const health = await healthResponse.json()
	assert.equal(health.ok, true)
	assert.equal(health.vikunja.configured, true)
	assert.equal(health.vikunja.statusCode, 200)
	assert.match(health.buildId, /^\d{4}-\d{2}-\d{2}-/)

	const configResponse = await fetch(new URL('/api/config', stack.appUrl))
	assert.equal(configResponse.status, 200)
	assert.equal(configResponse.headers.get('cache-control'), 'no-store')
	const config = await configResponse.json()
	assert.equal(config.configured, true)
	assert.equal(config.baseUrl, `${stack.mock.origin}/api/v1`)
	assert.match(config.buildId, /^\d{4}-\d{2}-\d{2}-/)

	const sessionResponse = await fetch(new URL('/api/session', stack.appUrl))
	assert.equal(sessionResponse.status, 200)
	assert.equal(sessionResponse.headers.get('cache-control'), 'no-store')
	const session = await sessionResponse.json()
	assert.equal(session.connected, true)
	assert.equal(session.account.source, 'legacy')
	assert.equal(session.account.baseUrl, `${stack.mock.origin}/api/v1`)

	const user = await stack.api('/api/user')
	assert.equal(user.settings.default_project_id, 1)

	const projects = await stack.api('/api/projects')
	assert.equal(projects.length, 4)
	assert.ok(projects.some(project => project.id === -1 && project.title === 'Focused Work'))

	const filters = await stack.api('/api/filters')
	assert.equal(filters.filters.length, 1)
	assert.equal(filters.filters[0].title, 'Focused Work')
})

test('saved filter proxy routes support create read update and delete', async () => {
	const authStack = await startTestStack({legacyConfigured: false})

	try {
		const sessionCookie = await loginWithPasswordSession(authStack)

			const createResponse = await fetch(new URL('/api/filters', authStack.appUrl), {
				method: 'POST',
				headers: sameOriginHeaders(authStack, sessionCookie, {
					'Content-Type': 'application/json',
				}),
				body: JSON.stringify({
					title: 'Open Work',
					description: 'Cross-project open tasks',
					is_favorite: true,
					filters: {
						filter: 'done = false',
						filter_include_nulls: true,
						sort_by: ['position'],
						order_by: ['asc'],
					},
				}),
			})
			assert.equal(createResponse.status, 201)
			const createdFilter = (await createResponse.json()).filter
			assert.equal(createdFilter.title, 'Open Work')
			assert.deepEqual(createdFilter.filters.sort_by, ['done', 'id'])
			assert.deepEqual(createdFilter.filters.order_by, ['asc', 'desc'])

			const createdFilterDetail = await authStack.api(`/api/filters/${createdFilter.id}`, {
				headers: {
					Cookie: sessionCookie,
				},
			})
			assert.equal((createdFilterDetail.filter || createdFilterDetail).filters.filter, 'done = false')

		const updateResponse = await fetch(new URL(`/api/filters/${createdFilter.id}`, authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				title: 'Urgent Work',
				description: 'Updated saved filter',
				is_favorite: false,
				filters: {
					filter: 'project = 2 && priority = 4 && done = false',
					filter_include_nulls: false,
					sort_by: ['updated'],
					order_by: ['desc'],
				},
			}),
		})
		assert.equal(updateResponse.status, 200)
		const updatedFilter = (await updateResponse.json()).filter
		assert.equal(updatedFilter.title, 'Urgent Work')

		const deleteResponse = await fetch(new URL(`/api/filters/${createdFilter.id}`, authStack.appUrl), {
			method: 'DELETE',
			headers: sameOriginHeaders(authStack, sessionCookie),
		})
		assert.equal(deleteResponse.status, 200)

		const filtersAfterDelete = await authStack.api('/api/filters', {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(filtersAfterDelete.filters.some(filter => filter.title === 'Urgent Work'), false)
	} finally {
		await authStack.stop()
	}
})

test('task collection routes return search, today, and view-backed task trees', async () => {
	const todayTasks = await stack.api('/api/tasks/today')
	assert.deepEqual(
		todayTasks.map(task => task.title).sort(),
		['Buy milk', 'Prepare daily summary'].sort(),
	)

	const searchTasks = await stack.api('/api/tasks?s=travel')
	assert.deepEqual(searchTasks.map(task => task.title), ['Book flights'])

	const views = await stack.api('/api/projects/2/views')
	assert.ok(views.views.some(view => view.id === 12))

	const projectTasks = await stack.api('/api/projects/2/views/12/tasks')
	const releaseChecklist = projectTasks.find(task => task.id === 203)
	assert.ok(releaseChecklist)
	assert.deepEqual(
		releaseChecklist.related_tasks.subtask.map(task => task.id),
		[204],
	)
})

test('project view and background proxy routes support create delete upload and unsplash flows', async () => {
	const authStack = await startTestStack({legacyConfigured: false})

	try {
		const sessionCookie = await loginWithPasswordSession(authStack)

		const createViewResponse = await fetch(new URL('/api/projects/2/views', authStack.appUrl), {
			method: 'PUT',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				title: 'Filtered board',
				view_kind: 'kanban',
				filter: {
					filter: 'done = false',
					filter_timezone: 'Europe/Amsterdam',
				},
			}),
		})
		assert.equal(createViewResponse.status, 201)
		const createdView = (await createViewResponse.json()).view
		assert.equal(createdView.title, 'Filtered board')
		assert.equal(createdView.view_kind, 'kanban')

		const deleteViewResponse = await fetch(new URL(`/api/projects/2/views/${createdView.id}`, authStack.appUrl), {
			method: 'DELETE',
			headers: sameOriginHeaders(authStack, sessionCookie),
		})
		assert.equal(deleteViewResponse.status, 200)
		assert.equal((await authStack.mockApi('projects/2/views')).some(view => view.id === createdView.id), false)

		const uploadBody = new FormData()
		uploadBody.append('background', new Blob([Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64')], {type: 'image/png'}), 'bg.png')
		const uploadResponse = await fetch(new URL('/api/projects/2/backgrounds/upload', authStack.appUrl), {
			method: 'PUT',
			headers: {
				Cookie: sessionCookie,
				Origin: authStack.appUrl,
			},
			body: uploadBody,
		})
		assert.equal(uploadResponse.status, 200)
		assert.ok((await authStack.mockApi('projects/2')).background_information)

		const backgroundResponse = await fetch(new URL('/api/projects/2/background', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(backgroundResponse.status, 200)
		assert.match(backgroundResponse.headers.get('content-type') || '', /image\/png/)

		const unsplashSearchResponse = await fetch(new URL('/api/backgrounds/unsplash/search?s=mountain', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(unsplashSearchResponse.status, 200)
		const unsplashSearchPayload = await unsplashSearchResponse.json()
		assert.ok(Array.isArray(unsplashSearchPayload.results))
		assert.ok(unsplashSearchPayload.results.length > 0)

		const unsplashSetResponse = await fetch(new URL('/api/projects/2/backgrounds/unsplash', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify(unsplashSearchPayload.results[0]),
		})
		assert.equal(unsplashSetResponse.status, 200)
		assert.ok((await authStack.mockApi('projects/2')).background_information)

		const removeBackgroundResponse = await fetch(new URL('/api/projects/2/background', authStack.appUrl), {
			method: 'DELETE',
			headers: sameOriginHeaders(authStack, sessionCookie),
		})
		assert.equal(removeBackgroundResponse.status, 200)
		assert.equal((await authStack.mockApi('projects/2')).background_information, null)
	} finally {
		await authStack.stop()
	}
})

test('missing stale hashed bundles return a recovery response instead of a hard 404', async () => {
	const scriptResponse = await fetch(new URL('/assets/index-stale-build.js', stack.appUrl))
	assert.equal(scriptResponse.status, 200)
	assert.equal(scriptResponse.headers.get('content-type'), 'application/javascript; charset=utf-8')
	const scriptBody = await scriptResponse.text()
	assert.match(scriptBody, /serviceWorker/)
	assert.match(scriptBody, /caches\.keys\(\)/)
	assert.match(scriptBody, /location\.replace\('\/'\)/)

	const styleResponse = await fetch(new URL('/assets/index-stale-build.css', stack.appUrl))
	assert.equal(styleResponse.status, 200)
	assert.equal(styleResponse.headers.get('content-type'), 'text/css; charset=utf-8')
	const styleBody = await styleResponse.text()
	assert.match(styleBody, /stale asset recovery placeholder/)

	const imageResponse = await fetch(new URL('/assets/icon-stale-build.png', stack.appUrl))
	assert.equal(imageResponse.status, 404)
})

test('registration, password reset routes, and reset redirect work with an explicit base URL', async () => {
	const authStack = await startTestStack({legacyConfigured: false})

	try {
		const missingRegisterBaseUrl = await fetch(new URL('/api/session/register', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				username: 'new-user',
				email: 'new-user@example.test',
				password: 'registered-password',
			}),
		})
		assert.equal(missingRegisterBaseUrl.status, 400)
		assert.equal((await missingRegisterBaseUrl.json()).error, 'A Vikunja base URL is required.')

		const registerResponse = await fetch(new URL('/api/session/register', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				baseUrl: `${authStack.mock.origin}/api/v1`,
				username: 'new-user',
				email: 'new-user@example.test',
				password: 'registered-password',
			}),
		})
		assert.equal(registerResponse.status, 200)
		const registerCookie = registerResponse.headers
			.getSetCookie()
			.find(cookie => cookie.startsWith('vikunja_pwa_session='))
			?.split(';')[0]
		assert.ok(registerCookie)

		const sessionResponse = await fetch(new URL('/api/session', authStack.appUrl), {
			headers: {
				Cookie: registerCookie,
			},
		})
		assert.equal(sessionResponse.status, 200)
		const sessionPayload = await sessionResponse.json()
		assert.equal(sessionPayload.connected, true)
		assert.equal(sessionPayload.account.baseUrl, `${authStack.mock.origin}/api/v1`)
		assert.equal(sessionPayload.account.user.username, 'new-user')

		const unknownForgotResponse = await fetch(new URL('/api/session/forgot-password', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				baseUrl: `${authStack.mock.origin}/api/v1`,
				email: 'missing@example.test',
			}),
		})
		assert.equal(unknownForgotResponse.status, 200)
		assert.equal((await unknownForgotResponse.json()).ok, true)

		const forgotResponse = await fetch(new URL('/api/session/forgot-password', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				baseUrl: `${authStack.mock.origin}/api/v1`,
				email: 'new-user@example.test',
			}),
		})
		assert.equal(forgotResponse.status, 200)
		assert.equal((await forgotResponse.json()).ok, true)

		const passwordResetTokens = authStack.mock.getState().passwordResetTokens || {}
		const resetToken = Object.entries(passwordResetTokens).find(([, username]) => username === 'new-user')?.[0]
		assert.ok(resetToken)

		const redirectResponse = await fetch(new URL(`/user/password/reset/${encodeURIComponent(resetToken)}`, authStack.appUrl), {
			redirect: 'manual',
		})
		assert.equal(redirectResponse.status, 302)
		assert.equal(
			redirectResponse.headers.get('location'),
			`/auth/reset-password?token=${encodeURIComponent(resetToken)}&baseUrl=${encodeURIComponent(`${authStack.mock.origin}/api/v1`)}`,
		)

		const missingResetBaseUrl = await fetch(new URL('/api/session/reset-password', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				token: resetToken,
				password: 'updated-password',
			}),
		})
		assert.equal(missingResetBaseUrl.status, 400)
		assert.equal((await missingResetBaseUrl.json()).error, 'A Vikunja base URL is required.')

		const resetResponse = await fetch(new URL('/api/session/reset-password', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				baseUrl: `${authStack.mock.origin}/api/v1`,
				token: resetToken,
				password: 'updated-password',
			}),
		})
		assert.equal(resetResponse.status, 200)
		assert.equal((await resetResponse.json()).ok, true)

		const loginCookie = await loginWithPasswordSession(authStack, {
			username: 'new-user',
			password: 'updated-password',
		})
		assert.ok(loginCookie)
	} finally {
		await authStack.stop()
	}
})

test('oidc auth-url generation and callback create a normal password session', async () => {
	const authStack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {
			localAuthEnabled: false,
			registrationEnabled: false,
			oidcProviders: [
				{
					name: 'Acme SSO',
					key: 'acme',
					auth_url: '/mock-oidc/acme/authorize',
				},
			],
		},
	})

	try {
		const authUrlResponse = await fetch(
			new URL(
				`/api/session/openid/acme/auth-url?baseUrl=${encodeURIComponent(`${authStack.mock.origin}/api/v1`)}&redirectUri=${encodeURIComponent(`${authStack.appUrl}/auth/openid/callback`)}`,
				authStack.appUrl,
			),
		)
		assert.equal(authUrlResponse.status, 200)
		const authUrlPayload = await authUrlResponse.json()
		assert.ok(authUrlPayload.authUrl)

		const generatedAuthUrl = new URL(authUrlPayload.authUrl)
		assert.equal(generatedAuthUrl.pathname, '/mock-oidc/acme/authorize')
		assert.equal(generatedAuthUrl.searchParams.get('redirect_url'), `${authStack.appUrl}/auth/openid/callback`)
		assert.ok(generatedAuthUrl.searchParams.get('state'))
		assert.ok(generatedAuthUrl.searchParams.get('nonce'))

		const invalidCallbackResponse = await fetch(new URL('/api/session/openid/callback', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				code: 'invalid',
				state: 'unknown-state',
			}),
		})
		assert.equal(invalidCallbackResponse.status, 400)

		const callbackResponse = await fetch(new URL('/api/session/openid/callback', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				code: 'mock-oidc-code-acme',
				state: generatedAuthUrl.searchParams.get('state'),
			}),
		})
		assert.equal(callbackResponse.status, 200)
		const sessionCookie = getAppSessionCookie(callbackResponse)
		assert.ok(sessionCookie)

		const sessionResponse = await fetch(new URL('/api/session', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(sessionResponse.status, 200)
		const sessionPayload = await sessionResponse.json()
		assert.equal(sessionPayload.connected, true)
		assert.equal(sessionPayload.account.authMode, 'password')
		assert.equal(sessionPayload.account.user.username, 'smoke-user')
	} finally {
		await authStack.stop()
	}
})

test('webhook and migration proxy routes cover user, project, oauth, and file flows', async () => {
	const authStack = await startTestStack({legacyConfigured: false})

	try {
		const sessionCookie = await loginWithPasswordSession(authStack)

		const userEventsResponse = await fetch(new URL('/api/session/webhooks/events', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(userEventsResponse.status, 200)
		assert.equal((await userEventsResponse.json()).events.length > 0, true)

		const createUserWebhookResponse = await fetch(new URL('/api/session/webhooks', authStack.appUrl), {
			method: 'PUT',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				targetUrl: 'https://example.test/user-hook',
				events: ['task.created'],
				secret: 'top-secret',
			}),
		})
		assert.equal(createUserWebhookResponse.status, 201)

		const userWebhooksResponse = await fetch(new URL('/api/session/webhooks', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(userWebhooksResponse.status, 200)
		assert.equal((await userWebhooksResponse.json()).webhooks.length, 1)

		const projectEventsResponse = await fetch(new URL('/api/webhooks/events', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(projectEventsResponse.status, 200)
		assert.equal((await projectEventsResponse.json()).events.length > 0, true)

		const createProjectWebhookResponse = await fetch(new URL('/api/projects/2/webhooks', authStack.appUrl), {
			method: 'PUT',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				targetUrl: 'https://example.test/project-hook',
				events: ['task.updated'],
			}),
		})
		assert.equal(createProjectWebhookResponse.status, 201)

		const projectWebhooksResponse = await fetch(new URL('/api/projects/2/webhooks', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(projectWebhooksResponse.status, 200)
		assert.equal((await projectWebhooksResponse.json()).webhooks.length, 1)

		const migrationStatusResponse = await fetch(new URL('/api/migration/todoist/status', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(migrationStatusResponse.status, 200)
		assert.equal((await migrationStatusResponse.json()).status, 'idle')

		const migrationAuthResponse = await fetch(new URL('/api/migration/todoist/auth', authStack.appUrl), {
			headers: sameOriginHeaders(authStack, sessionCookie),
		})
		assert.equal(migrationAuthResponse.status, 200)
		assert.ok((await migrationAuthResponse.json()).authUrl)

		const oauthMigrationResponse = await fetch(new URL('/api/migration/todoist/migrate', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				code: 'oauth-import-code',
			}),
		})
		assert.equal(oauthMigrationResponse.status, 200)
		assert.equal((await oauthMigrationResponse.json()).status, 'running')

		const fileMigrationUpload = createMultipartUploadBody({
			filename: 'ticktick.csv',
			sizeBytes: 32,
			contentType: 'text/csv',
		})
		const fileMigrationResponse = await fetch(new URL('/api/migration/ticktick/migrate', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': fileMigrationUpload.contentType,
			}),
			body: fileMigrationUpload.body,
		})
		assert.equal(fileMigrationResponse.status, 200)
		assert.equal((await fileMigrationResponse.json()).status, 'running')
	} finally {
		await authStack.stop()
	}
})

test('auth info reflects registration availability and registration rejects disabled servers clearly', async () => {
	const authStack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {
			registrationEnabled: false,
		},
	})

	try {
		const authInfoResponse = await fetch(new URL(`/api/session/auth-info?baseUrl=${encodeURIComponent(`${authStack.mock.origin}/api/v1`)}`, authStack.appUrl))
		assert.equal(authInfoResponse.status, 200)
		assert.deepEqual(await authInfoResponse.json(), {
			baseUrl: `${authStack.mock.origin}/api/v1`,
			localEnabled: true,
			registrationEnabled: false,
		})

		const registerResponse = await fetch(new URL('/api/session/register', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				baseUrl: `${authStack.mock.origin}/api/v1`,
				username: 'new-user',
				email: 'new-user@example.test',
				password: 'registered-password',
			}),
		})
		assert.equal(registerResponse.status, 403)
		assert.equal((await registerResponse.json()).error, 'This Vikunja server does not allow self-registration.')
	} finally {
		await authStack.stop()
	}
})

test('authenticated follow-up requests refresh the sliding app-session cookie', async () => {
	const authStack = await startTestStack({legacyConfigured: false})

	try {
		const sessionCookie = await loginWithPasswordSession(authStack)

		const sessionResponse = await fetch(new URL('/api/session', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(sessionResponse.status, 200)
		const refreshedCookie = getAppSessionCookie(sessionResponse)
		assert.ok(refreshedCookie)
		assert.equal(refreshedCookie, sessionCookie)
	} finally {
		await authStack.stop()
	}
})

test('parallel authenticated requests survive refresh-token rotation races', async () => {
	const authStack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {
			loginAccessTokenLifetimeSeconds: 65,
			refreshAccessTokenLifetimeSeconds: 3600,
			rotateRefreshTokens: true,
			refreshResponseDelayMs: 50,
		},
	})

	try {
		const sessionCookie = await loginWithPasswordSession(authStack)

		await new Promise(resolve => {
			setTimeout(resolve, 6000)
		})

		const [userResponse, infoResponse] = await Promise.all([
			fetch(new URL('/api/user', authStack.appUrl), {
				headers: {
					Cookie: sessionCookie,
				},
			}),
			fetch(new URL('/api/info', authStack.appUrl), {
				headers: {
					Cookie: sessionCookie,
				},
			}),
		])

		assert.equal(userResponse.status, 200)
		assert.equal(infoResponse.status, 200)

		const sessionResponse = await fetch(new URL('/api/session', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(sessionResponse.status, 200)
		const sessionPayload = await sessionResponse.json()
		assert.equal(sessionPayload.connected, true)
	} finally {
		await authStack.stop()
	}
})

test('admin testmail route requires an admin session, returns bridge output, and reports bridge misconfiguration', async () => {
	const unauthorizedResponse = await fetch(new URL('/api/admin/testmail', stack.appUrl), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			email: 'test@example.com',
		}),
	})
	assert.equal(unauthorizedResponse.status, 401)
	const unauthorizedPayload = await unauthorizedResponse.json()
	assert.equal(unauthorizedPayload.error, 'An account-backed session is required for this action.')

	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
	})

	try {
		const sessionCookie = await loginWithPasswordSession(bridgeStack)

		const testmailResponse = await fetch(new URL('/api/admin/testmail', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				email: 'test@example.com',
			}),
		})
		assert.equal(testmailResponse.status, 200)
		const testmailPayload = await testmailResponse.json()
		assert.deepEqual(
			Object.keys(testmailPayload).sort(),
			['stderr', 'stdout', 'success'],
		)
		assert.equal(testmailPayload.success, true)
		assert.match(testmailPayload.stdout || '', /test mail queued/i)
		assert.equal(testmailPayload.stderr, null)

		const doctorResponse = await fetch(new URL('/api/admin/doctor', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie),
		})
		assert.equal(doctorResponse.status, 200)
		const doctorPayload = await doctorResponse.json()
		assert.equal(doctorPayload.exitCode, 0)
		assert.match(doctorPayload.stdout || '', /doctor ok/i)
		assert.equal(doctorPayload.stderr, null)
	} finally {
		await bridgeStack.stop()
	}

	const falseSuccessStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			testmail: {
				exitCode: 0,
				stdout: [
					'time=2026-03-30T12:21:48.606Z level=INFO msg="Sending testmail..."',
					'time=2026-03-30T12:21:49.916Z level=ERROR msg="Error sending test mail: dial failed: SMTP AUTH failed: 535 5.7.0 Invalid login or password"',
				].join('\n'),
				stderr: '2026/03/30 12:21:48 failed to create modcache index dir: mkdir /.cache: permission denied\n',
			},
		},
	})

	try {
		const sessionCookie = await loginWithPasswordSession(falseSuccessStack)
		const response = await fetch(new URL('/api/admin/testmail', falseSuccessStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(falseSuccessStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				email: 'test@example.com',
			}),
		})
		assert.equal(response.status, 200)
		const payload = await response.json()
		assert.equal(payload.success, false)
		assert.match(payload.stdout || '', /error sending test mail/i)
		assert.match(payload.stderr || '', /modcache index dir/i)
	} finally {
		await falseSuccessStack.stop()
	}

	const noBridgeStack = await startTestStack({legacyConfigured: false})

	try {
		const sessionCookie = await loginWithPasswordSession(noBridgeStack)
		const response = await fetch(new URL('/api/admin/testmail', noBridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(noBridgeStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				email: 'test@example.com',
			}),
		})
		assert.equal(response.status, 503)
		const payload = await response.json()
		assert.equal(payload.error, 'The Vikunja admin bridge is not configured correctly.')
	} finally {
		await noBridgeStack.stop()
	}
})

test('admin bridge routes require an allowed operator email', async () => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
		envOverrides: {
			ADMIN_BRIDGE_ALLOWED_EMAILS: 'someone-else@example.test',
		},
	})

	try {
		const sessionCookie = await loginWithPasswordSession(bridgeStack)
		const response = await fetch(new URL('/api/admin/runtime/health', bridgeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(response.status, 403)
		const payload = await response.json()
		assert.equal(payload.error, 'This action requires an authorized operator account.')
	} finally {
		await bridgeStack.stop()
	}
})

test('operator allowlist still works when the authenticated user payload omits email', async () => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
		mockVikunjaOptions: {
			hideAuthenticatedUserEmail: true,
		},
	})

	try {
		const sessionCookie = await loginWithPasswordSession(bridgeStack)

		const sessionResponse = await fetch(new URL('/api/session', bridgeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(sessionResponse.status, 200)
		const sessionPayload = await sessionResponse.json()
		assert.equal(sessionPayload.connected, true)
		assert.equal(sessionPayload.account.canUseAdminBridge, true)
		assert.equal(sessionPayload.account.user.email, 'smoke@example.test')

		const response = await fetch(new URL('/api/admin/runtime/health', bridgeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(response.status, 200)
		const payload = await response.json()
		assert.equal(payload.admin.canUseAdminBridge, true)
		assert.equal(payload.admin.user.email, 'smoke@example.test')
	} finally {
		await bridgeStack.stop()
	}
})

test('admin runtime status is available to any signed-in password session for bridge messaging', async () => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
		envOverrides: {
			ADMIN_BRIDGE_ALLOWED_EMAILS: 'someone-else@example.test',
		},
	})
	bridgeStack.adminBridge?.setState({containerRunning: false})

	try {
		const sessionCookie = await loginWithPasswordSession(bridgeStack)
		const response = await fetch(new URL('/api/admin/runtime/status', bridgeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(response.status, 200)
		const payload = await response.json()
		assert.equal(payload.enabled, true)
		assert.equal(payload.mode, 'docker-exec')
		assert.equal(payload.vikunjaContainerFound, false)
		assert.equal(payload.vikunjaCliReachable, false)
	} finally {
		await bridgeStack.stop()
	}
})

test('admin mailer config routes expose read-only vs file-backed capabilities and persist when configured', async () => {
	const unauthorizedResponse = await fetch(new URL('/api/admin/config/mailer', stack.appUrl))
	assert.equal(unauthorizedResponse.status, 401)
	const unauthorizedPayload = await unauthorizedResponse.json()
	assert.equal(unauthorizedPayload.error, 'An account-backed session is required for this action.')

	const readOnlyStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			envVars: {
				VIKUNJA_MAILER_ENABLED: 'true',
				VIKUNJA_MAILER_HOST: 'smtp.env-only.local',
				VIKUNJA_MAILER_FROMEMAIL: 'vikunja@env-only.local',
			},
		},
	})

	try {
		const sessionCookie = await loginWithPasswordSession(readOnlyStack)
		const configResponse = await fetch(new URL('/api/admin/config/mailer', readOnlyStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(configResponse.status, 200)
		const configPayload = await configResponse.json()
		assert.equal(configPayload.enabled, true)
		assert.equal(configPayload.host, 'smtp.env-only.local')
		assert.equal(configPayload.fromEmail, 'vikunja@env-only.local')
		assert.deepEqual(configPayload.capabilities, {
			canInspect: true,
			canWrite: false,
			canApply: false,
			reasonCode: 'no_config_path',
		})

		const saveResponse = await fetch(new URL('/api/admin/config/mailer', readOnlyStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(readOnlyStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				enabled: true,
				host: 'smtp.should-not-save.local',
				port: 587,
				authType: 'plain',
				username: 'readonly@test.local',
				password: '',
				skipTlsVerify: false,
				fromEmail: 'readonly@test.local',
				forceSsl: false,
			}),
		})
		assert.equal(saveResponse.status, 409)
		const savePayload = await saveResponse.json()
		assert.equal(savePayload.error, 'SMTP settings are read-only because no writable deployment config source is configured.')
		assert.equal(savePayload.details?.reasonCode, 'no_config_path')
	} finally {
		await readOnlyStack.stop()
	}

	const composeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			composePathEnabled: true,
			initialComposeYaml: `services:
  vikunja:
    image: vikunja/vikunja
    environment:
      VIKUNJA_SERVICE_PUBLICURL: https://vikunja.example.test
      VIKUNJA_MAILER_ENABLED: "false"
      VIKUNJA_MAILER_HOST: smtp.compose.initial
      VIKUNJA_MAILER_PORT: "587"
      VIKUNJA_MAILER_AUTHTYPE: plain
      VIKUNJA_MAILER_USERNAME: compose@test.local
      VIKUNJA_MAILER_FROMEMAIL: vikunja@compose.initial
      VIKUNJA_MAILER_SKIPTLSVERIFY: "false"
      VIKUNJA_MAILER_FORCESSL: "false"
`,
		},
	})

	try {
		const sessionCookie = await loginWithPasswordSession(composeStack)

		const configResponse = await fetch(new URL('/api/admin/config/mailer', composeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(configResponse.status, 200)
		const configPayload = await configResponse.json()
		assert.equal(configPayload.enabled, false)
		assert.equal(configPayload.host, 'smtp.compose.initial')
		assert.equal(configPayload.port, 587)
		assert.equal(configPayload.authType, 'plain')
		assert.equal(configPayload.username, 'compose@test.local')
		assert.equal(configPayload.fromEmail, 'vikunja@compose.initial')
		assert.deepEqual(configPayload.envOverrides, [])
		assert.deepEqual(configPayload.capabilities, {
			canInspect: true,
			canWrite: true,
			canApply: true,
			reasonCode: null,
		})

		const saveResponse = await fetch(new URL('/api/admin/config/mailer', composeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(composeStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				enabled: true,
				host: 'smtp.compose.test.local',
				port: 465,
				authType: 'login',
				username: 'compose-updated@test.local',
				password: 'compose-secret',
				skipTlsVerify: true,
				fromEmail: 'vikunja@compose.test.local',
				forceSsl: true,
			}),
		})
		assert.equal(saveResponse.status, 200)
		const savePayload = await saveResponse.json()
		assert.equal(savePayload.enabled, true)
		assert.equal(savePayload.host, 'smtp.compose.test.local')
		assert.equal(savePayload.port, 465)
		assert.equal(savePayload.authType, 'login')
		assert.equal(savePayload.username, 'compose-updated@test.local')
		assert.equal(savePayload.passwordConfigured, true)
		assert.equal(savePayload.skipTlsVerify, true)
		assert.equal(savePayload.fromEmail, 'vikunja@compose.test.local')
		assert.equal(savePayload.forceSsl, true)
		assert.deepEqual(savePayload.envOverrides, [])

		const applyResponse = await fetch(new URL('/api/admin/config/mailer/apply', composeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(composeStack, sessionCookie),
		})
		assert.equal(applyResponse.status, 200)
		const applyPayload = await applyResponse.json()
		assert.equal(applyPayload.restarted, true)
		assert.equal(applyPayload.config.host, 'smtp.compose.test.local')
		assert.equal(applyPayload.config.forceSsl, true)

		const composeState = composeStack.adminBridge?.getState()
		assert.ok(composeState)
		assert.equal(Number(composeState.metrics?.composeApplyCount || 0), 1)
		assert.match(composeStack.adminBridge?.readComposeConfig() || '', /VIKUNJA_MAILER_HOST: smtp\.compose\.test\.local/)
		assert.match(composeStack.adminBridge?.readComposeConfig() || '', /VIKUNJA_MAILER_PASSWORD: compose-secret/)
	} finally {
		await composeStack.stop()
	}

	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			hostConfigPathEnabled: true,
			initialConfigYaml: `mailer:
  enabled: false
  host: smtp.initial.local
  port: 587
  authtype: plain
  username: initial@test.local
  fromemail: vikunja@initial.local
  skiptlsverify: false
  forcessl: false
`,
			envVars: {
				VIKUNJA_MAILER_FORCESSL: 'true',
			},
		},
	})

	try {
		const sessionCookie = await loginWithPasswordSession(bridgeStack)

		const configResponse = await fetch(new URL('/api/admin/config/mailer', bridgeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(configResponse.status, 200)
		const configPayload = await configResponse.json()
		assert.equal(configPayload.enabled, false)
		assert.equal(configPayload.host, 'smtp.initial.local')
		assert.equal(configPayload.port, 587)
		assert.equal(configPayload.authType, 'plain')
		assert.equal(configPayload.username, 'initial@test.local')
		assert.equal(configPayload.passwordConfigured, false)
		assert.equal(configPayload.skipTlsVerify, false)
		assert.equal(configPayload.fromEmail, 'vikunja@initial.local')
		assert.equal(configPayload.forceSsl, true)
		assert.deepEqual(configPayload.envOverrides, ['forceSsl'])
		assert.deepEqual(configPayload.capabilities, {
			canInspect: true,
			canWrite: true,
			canApply: true,
			reasonCode: null,
		})

		const saveResponse = await fetch(new URL('/api/admin/config/mailer', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				enabled: true,
				host: 'smtp.test.local',
				port: 465,
				authType: 'login',
				username: 'test@test.local',
				password: 'secret',
				skipTlsVerify: true,
				fromEmail: 'vikunja@test.local',
				forceSsl: false,
			}),
		})
		assert.equal(saveResponse.status, 200)
		const savePayload = await saveResponse.json()
		assert.equal(savePayload.enabled, true)
		assert.equal(savePayload.host, 'smtp.test.local')
		assert.equal(savePayload.port, 465)
		assert.equal(savePayload.authType, 'login')
		assert.equal(savePayload.username, 'test@test.local')
		assert.equal(savePayload.passwordConfigured, true)
		assert.equal(savePayload.skipTlsVerify, true)
		assert.equal(savePayload.fromEmail, 'vikunja@test.local')
		assert.equal(savePayload.forceSsl, true)
		assert.deepEqual(savePayload.envOverrides, ['forceSsl'])

		const rereadResponse = await fetch(new URL('/api/admin/config/mailer', bridgeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(rereadResponse.status, 200)
		const rereadPayload = await rereadResponse.json()
		assert.equal(rereadPayload.host, 'smtp.test.local')
		assert.equal(rereadPayload.port, 465)
		assert.equal(rereadPayload.passwordConfigured, true)

		const applyResponse = await fetch(new URL('/api/admin/config/mailer/apply', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie),
		})
		assert.equal(applyResponse.status, 200)
		const applyPayload = await applyResponse.json()
		assert.equal(applyPayload.restarted, true)
		assert.equal(applyPayload.config.host, 'smtp.test.local')
		assert.equal(applyPayload.config.forceSsl, true)

		const bridgeState = bridgeStack.adminBridge?.getState()
		assert.ok(bridgeState)
		assert.match(bridgeStack.adminBridge?.readHostConfig() || '', /host: smtp\.test\.local/)
		assert.match(bridgeStack.adminBridge?.readHostConfig() || '', /password: secret/)
	} finally {
		await bridgeStack.stop()
	}
})

test('admin migration importer config routes expose read-only vs file-backed capabilities and persist when configured', async () => {
	const readOnlyStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			envVars: {
				VIKUNJA_MIGRATION_TODOIST_ENABLE: 'true',
				VIKUNJA_MIGRATION_TODOIST_CLIENTID: 'todoist-env-id',
				VIKUNJA_MIGRATION_TODOIST_REDIRECTURL: 'https://pwa.example.test/migrate/todoist',
			},
		},
	})

	try {
		const sessionCookie = await loginWithPasswordSession(readOnlyStack)
		const configResponse = await fetch(new URL('/api/admin/config/migration-importers', readOnlyStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(configResponse.status, 200)
		const configPayload = await configResponse.json()
		assert.equal(configPayload.todoist.enabled, true)
		assert.equal(configPayload.todoist.clientId, 'todoist-env-id')
		assert.equal(configPayload.todoist.redirectUrl, 'https://pwa.example.test/migrate/todoist')
		assert.deepEqual(configPayload.todoist.envOverrides, ['enabled', 'clientId', 'redirectUrl'])
		assert.deepEqual(configPayload.capabilities, {
			canInspect: true,
			canWrite: false,
			canApply: false,
			reasonCode: 'no_config_path',
		})

		const saveResponse = await fetch(new URL('/api/admin/config/migration-importers', readOnlyStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(readOnlyStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				todoist: {
					enabled: false,
					clientId: 'todoist-updated',
					clientSecret: '',
					redirectUrl: 'https://app.example.test/migrate/todoist',
				},
				trello: {
					enabled: true,
					key: 'trello-key',
					redirectUrl: 'https://app.example.test/migrate/trello',
				},
				microsoftTodo: {
					enabled: true,
					clientId: 'ms-id',
					clientSecret: '',
					redirectUrl: 'https://app.example.test/migrate/microsoft-todo',
				},
			}),
		})
		assert.equal(saveResponse.status, 409)
		const savePayload = await saveResponse.json()
		assert.equal(savePayload.error, 'Migration importer settings are read-only because no writable deployment config source is configured.')
		assert.equal(savePayload.details?.reasonCode, 'no_config_path')
	} finally {
		await readOnlyStack.stop()
	}

	const composeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			composePathEnabled: true,
			initialComposeYaml: `services:
  vikunja:
    image: vikunja/vikunja
    environment:
      VIKUNJA_MIGRATION_TODOIST_ENABLE: "false"
      VIKUNJA_MIGRATION_TODOIST_CLIENTID: todoist-compose-initial
      VIKUNJA_MIGRATION_TODOIST_REDIRECTURL: https://legacy.example.test/migrate/todoist
      VIKUNJA_MIGRATION_TRELLO_ENABLE: "false"
      VIKUNJA_MIGRATION_TRELLO_KEY: trello-compose-initial
      VIKUNJA_MIGRATION_TRELLO_REDIRECTURL: https://legacy.example.test/migrate/trello
      VIKUNJA_MIGRATION_MICROSOFTTODO_ENABLE: "false"
      VIKUNJA_MIGRATION_MICROSOFTTODO_CLIENTID: microsoft-compose-initial
      VIKUNJA_MIGRATION_MICROSOFTTODO_REDIRECTURL: https://legacy.example.test/migrate/microsoft-todo
`,
		},
	})

	try {
		const sessionCookie = await loginWithPasswordSession(composeStack)
		const configResponse = await fetch(new URL('/api/admin/config/migration-importers', composeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(configResponse.status, 200)
		const configPayload = await configResponse.json()
		assert.equal(configPayload.todoist.enabled, false)
		assert.equal(configPayload.todoist.clientId, 'todoist-compose-initial')
		assert.equal(configPayload.trello.key, 'trello-compose-initial')
		assert.equal(configPayload.microsoftTodo.clientId, 'microsoft-compose-initial')
		assert.deepEqual(configPayload.capabilities, {
			canInspect: true,
			canWrite: true,
			canApply: true,
			reasonCode: null,
		})

		const saveResponse = await fetch(new URL('/api/admin/config/migration-importers', composeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(composeStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				todoist: {
					enabled: true,
					clientId: 'todoist-compose-updated',
					clientSecret: 'todoist-secret',
					redirectUrl: 'https://pwa.example.test/migrate/todoist',
				},
				trello: {
					enabled: true,
					key: 'trello-compose-updated',
					redirectUrl: 'https://pwa.example.test/migrate/trello',
				},
				microsoftTodo: {
					enabled: true,
					clientId: 'microsoft-compose-updated',
					clientSecret: 'microsoft-secret',
					redirectUrl: 'https://pwa.example.test/migrate/microsoft-todo',
				},
			}),
		})
		assert.equal(saveResponse.status, 200)
		const savePayload = await saveResponse.json()
		assert.equal(savePayload.todoist.enabled, true)
		assert.equal(savePayload.todoist.clientId, 'todoist-compose-updated')
		assert.equal(savePayload.todoist.clientSecretConfigured, true)
		assert.equal(savePayload.todoist.redirectUrl, 'https://pwa.example.test/migrate/todoist')
		assert.equal(savePayload.trello.key, 'trello-compose-updated')
		assert.equal(savePayload.microsoftTodo.clientId, 'microsoft-compose-updated')
		assert.equal(savePayload.microsoftTodo.clientSecretConfigured, true)

		const applyResponse = await fetch(new URL('/api/admin/config/migration-importers/apply', composeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(composeStack, sessionCookie),
		})
		assert.equal(applyResponse.status, 200)
		const applyPayload = await applyResponse.json()
		assert.equal(applyPayload.restarted, true)
		assert.equal(applyPayload.config.todoist.redirectUrl, 'https://pwa.example.test/migrate/todoist')

		assert.match(composeStack.adminBridge?.readComposeConfig() || '', /VIKUNJA_MIGRATION_TODOIST_ENABLE:\s*"?true"?/)
		assert.match(composeStack.adminBridge?.readComposeConfig() || '', /VIKUNJA_MIGRATION_TODOIST_CLIENTSECRET: todoist-secret/)
		assert.match(composeStack.adminBridge?.readComposeConfig() || '', /VIKUNJA_MIGRATION_TRELLO_KEY: trello-compose-updated/)
		assert.match(composeStack.adminBridge?.readComposeConfig() || '', /VIKUNJA_MIGRATION_MICROSOFTTODO_REDIRECTURL: https:\/\/pwa\.example\.test\/migrate\/microsoft-todo/)
	} finally {
		await composeStack.stop()
	}

	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			hostConfigPathEnabled: true,
			initialConfigYaml: `migration:
  todoist:
    enable: false
    clientid: todoist-initial
    redirecturl: https://legacy.example.test/migrate/todoist
  trello:
    enable: true
    key: trello-initial
    redirecturl: https://legacy.example.test/migrate/trello
  microsofttodo:
    enable: false
    clientid: microsoft-initial
    redirecturl: https://legacy.example.test/migrate/microsoft-todo
`,
			envVars: {
				VIKUNJA_MIGRATION_MICROSOFTTODO_ENABLE: 'true',
			},
		},
	})

	try {
		const sessionCookie = await loginWithPasswordSession(bridgeStack)
		const configResponse = await fetch(new URL('/api/admin/config/migration-importers', bridgeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(configResponse.status, 200)
		const configPayload = await configResponse.json()
		assert.equal(configPayload.todoist.clientId, 'todoist-initial')
		assert.equal(configPayload.trello.enabled, true)
		assert.equal(configPayload.microsoftTodo.enabled, true)
		assert.deepEqual(configPayload.microsoftTodo.envOverrides, ['enabled'])

		const saveResponse = await fetch(new URL('/api/admin/config/migration-importers', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				todoist: {
					enabled: true,
					clientId: 'todoist-updated',
					clientSecret: 'todoist-host-secret',
					redirectUrl: 'https://pwa.example.test/migrate/todoist',
				},
				trello: {
					enabled: false,
					key: 'trello-updated',
					redirectUrl: 'https://pwa.example.test/migrate/trello',
				},
				microsoftTodo: {
					enabled: false,
					clientId: 'microsoft-updated',
					clientSecret: 'microsoft-host-secret',
					redirectUrl: 'https://pwa.example.test/migrate/microsoft-todo',
				},
			}),
		})
		assert.equal(saveResponse.status, 200)
		const savePayload = await saveResponse.json()
		assert.equal(savePayload.todoist.enabled, true)
		assert.equal(savePayload.todoist.clientSecretConfigured, true)
		assert.equal(savePayload.trello.enabled, false)
		assert.equal(savePayload.microsoftTodo.enabled, true)
		assert.equal(savePayload.microsoftTodo.clientSecretConfigured, true)

		const applyResponse = await fetch(new URL('/api/admin/config/migration-importers/apply', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie),
		})
		assert.equal(applyResponse.status, 200)
		const applyPayload = await applyResponse.json()
		assert.equal(applyPayload.restarted, true)
		assert.equal(applyPayload.config.trello.key, 'trello-updated')

		assert.match(bridgeStack.adminBridge?.readHostConfig() || '', /clientid: todoist-updated/)
		assert.match(bridgeStack.adminBridge?.readHostConfig() || '', /clientsecret: todoist-host-secret/)
		assert.match(bridgeStack.adminBridge?.readHostConfig() || '', /key: trello-updated/)
		assert.match(bridgeStack.adminBridge?.readHostConfig() || '', /redirecturl: https:\/\/pwa\.example\.test\/migrate\/microsoft-todo/)
	} finally {
		await bridgeStack.stop()
	}
})

test('account-backed sessions expose email reminder availability from Vikunja info', async () => {
	const passwordStack = await startTestStack({legacyConfigured: false})

	try {
		const sessionCookie = await loginWithPasswordSession(passwordStack)
		const response = await fetch(new URL('/api/session', passwordStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(response.status, 200)
		const payload = await response.json()
		assert.equal(payload.connected, true)
		assert.equal(payload.account.instanceFeatures.emailRemindersEnabled, true)
	} finally {
		await passwordStack.stop()
	}
})

test('task creation and task relation routes proxy mutations through the backend', async () => {
	const created = await stack.api('/api/projects/2/tasks', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			title: 'Generated smoke task',
			parentTaskId: 203,
		}),
	})

	assert.equal(created.task.title, 'Generated smoke task')

	const afterCreate = await stack.api('/api/projects/2/tasks')
	const newTask = afterCreate.find(task => task.title === 'Generated smoke task')
	assert.ok(newTask)
	assert.deepEqual(newTask.related_tasks.parenttask.map(task => task.id), [203])

	const relationResult = await stack.api('/api/tasks/203/relations', {
		method: 'PUT',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			other_task_id: 202,
			relation_kind: 'subtask',
		}),
	})
	assert.equal(relationResult.ok, true)

	const withRelation = await stack.api('/api/projects/2/tasks')
	const childTask = withRelation.find(task => task.id === 202)
	assert.deepEqual(childTask.related_tasks.parenttask.map(task => task.id), [203])

	const positionResult = await stack.api('/api/tasks/202/position', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			project_view_id: 12,
			position: 450,
		}),
	})
	assert.equal(positionResult.taskPosition.position, 450)

	const deleteResult = await stack.api('/api/tasks/203/relations/subtask/202', {
		method: 'DELETE',
	})
	assert.equal(deleteResult.ok, true)

	const afterDelete = await stack.api('/api/projects/2/tasks')
	const orphanedTask = afterDelete.find(task => task.id === 202)
	assert.equal(orphanedTask.related_tasks.parenttask.length, 0)
})

test('unsafe api writes reject untrusted browser origins', async () => {
	const response = await fetch(new URL('/api/projects/2/tasks', stack.appUrl), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Origin: 'https://evil.example',
		},
		body: JSON.stringify({
			title: 'Blocked by origin policy',
		}),
	})

	assert.equal(response.status, 403)
	const payload = await response.json()
	assert.equal(payload.error, 'Origin is not allowed.')
})

test('unsafe api writes allow current same-origin browser requests', async () => {
	const sameOriginStack = await startTestStack()

	try {
		const response = await fetch(new URL('/api/projects/2/tasks', sameOriginStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Origin: sameOriginStack.appUrl,
			},
			body: JSON.stringify({
				title: 'Allowed same-origin mutation',
			}),
		})

		assert.equal(response.status, 201)
		const payload = await response.json()
		assert.equal(payload.task.title, 'Allowed same-origin mutation')
	} finally {
		await sameOriginStack.stop()
	}
})

test('cookie-authenticated unsafe writes require an Origin or Referer header', async () => {
	const authStack = await startTestStack({legacyConfigured: false})

	try {
		const sessionCookie = await loginWithPasswordSession(authStack)
		const response = await fetch(new URL('/api/projects/2/tasks', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: sessionCookie,
			},
			body: JSON.stringify({
				title: 'Blocked missing origin',
			}),
		})

		assert.equal(response.status, 403)
		assert.equal((await response.json()).error, 'Origin header required for cookie-authenticated requests.')
	} finally {
		await authStack.stop()
	}
})

test('unsafe writes without cookies still allow non-browser clients that omit origin headers', async () => {
	const authStack = await startTestStack()

	try {
		const response = await fetch(new URL('/api/projects/2/tasks', authStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				title: 'Allowed without cookie and origin',
			}),
		})

		assert.equal(response.status, 201)
		const payload = await response.json()
		assert.equal(payload.task.title, 'Allowed without cookie and origin')
	} finally {
		await authStack.stop()
	}
})

test('unsafe api writes honor forwarded host and protocol when proxy trust is enabled', async () => {
	const proxiedStack = await startTestStack({
		envOverrides: {
			APP_TRUST_PROXY: 'true',
		},
	})

	try {
		const response = await fetch(new URL('/api/projects/2/tasks', proxiedStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'https://tasks.example.test',
				'X-Forwarded-Host': 'tasks.example.test',
				'X-Forwarded-Proto': 'https',
			},
			body: JSON.stringify({
				title: 'Allowed proxied same-origin mutation',
			}),
		})

		assert.equal(response.status, 201)
		const payload = await response.json()
		assert.equal(payload.task.title, 'Allowed proxied same-origin mutation')
	} finally {
		await proxiedStack.stop()
	}
})

test('login route is rate limited', async () => {
	const attempt = () => fetch(new URL('/api/session/login', stack.appUrl), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({}),
	})

	const first = await attempt()
	assert.equal(first.status, 400)

	const second = await attempt()
	assert.equal(second.status, 400)

	const third = await attempt()
	assert.equal(third.status, 429)
	assert.equal(third.headers.get('retry-after'), '60')
	assert.equal(third.headers.get('x-ratelimit-limit'), '2')
	const payload = await third.json()
	assert.equal(payload.error, 'Too many requests. Please try again later.')
})

test('password change route is rate limited', async () => {
	const passwordStack = await startTestStack({legacyConfigured: false})

	try {
		const loginResponse = await fetch(new URL('/api/session/login', passwordStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				authMode: 'password',
				baseUrl: `${passwordStack.mock.origin}/api/v1`,
				username: 'smoke-user',
				password: 'smoke-password',
			}),
		})
		assert.equal(loginResponse.status, 200)

		const sessionCookie = loginResponse.headers
			.getSetCookie()
			.find(cookie => cookie.startsWith('vikunja_pwa_session='))
			?.split(';')[0]
		assert.ok(sessionCookie)

		const attempt = () => fetch(new URL('/api/session/password', passwordStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(passwordStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				oldPassword: 'wrong-password',
				newPassword: 'updated-password',
			}),
		})

		for (let index = 0; index < 5; index += 1) {
			const response = await attempt()
			assert.equal(response.status, 401)
		}

		const blocked = await attempt()
		assert.equal(blocked.status, 429)
		assert.equal(blocked.headers.get('retry-after'), '60')
		assert.equal(blocked.headers.get('x-ratelimit-limit'), '5')
		const payload = await blocked.json()
		assert.equal(payload.error, 'Too many requests. Please try again later.')
	} finally {
		await passwordStack.stop()
	}
})

test('avatar proxy returns an image for backends using the /avatar/{username} route style', async () => {
	const avatarStack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {
			avatarRouteStyle: 'prefix',
		},
	})

	try {
		const loginResponse = await fetch(new URL('/api/session/login', avatarStack.appUrl), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				authMode: 'password',
				baseUrl: `${avatarStack.mock.origin}/api/v1`,
				username: 'smoke-user',
				password: 'smoke-password',
			}),
		})
		assert.equal(loginResponse.status, 200)

		const sessionCookie = loginResponse.headers
			.getSetCookie()
			.find(cookie => cookie.startsWith('vikunja_pwa_session='))
			?.split(';')[0]
		assert.ok(sessionCookie)

		const avatarResponse = await fetch(new URL('/api/avatar/smoke-user?size=64', avatarStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(avatarResponse.status, 200)
		assert.match(avatarResponse.headers.get('content-type') || '', /^image\//)
		const avatarBody = Buffer.from(await avatarResponse.arrayBuffer())
		assert.ok(avatarBody.length > 0)
	} finally {
		await avatarStack.stop()
	}
})

test('avatar upload and task attachments enforce route-specific raw body limits', async () => {
	const uploadStack = await startTestStack({legacyConfigured: false})

	try {
		const sessionCookie = await loginWithPasswordSession(uploadStack)

		const avatarUpload = createMultipartUploadBody({
			filename: 'avatar.png',
			sizeBytes: 1024,
			contentType: 'image/png',
		})
		const avatarResponse = await fetch(new URL('/api/session/settings/avatar/upload', uploadStack.appUrl), {
			method: 'PUT',
			headers: sameOriginHeaders(uploadStack, sessionCookie, {
				'Content-Type': avatarUpload.contentType,
			}),
			body: avatarUpload.body,
		})
		assert.equal(avatarResponse.status, 200)
		assert.equal(uploadStack.mock.getState().user.settings.avatar_provider, 'upload')

		const oversizedAvatarUpload = createMultipartUploadBody({
			filename: 'avatar-too-large.png',
			sizeBytes: 5 * 1024 * 1024,
			contentType: 'image/png',
		})
		const oversizedAvatarResponse = await fetch(new URL('/api/session/settings/avatar/upload', uploadStack.appUrl), {
			method: 'PUT',
			headers: sameOriginHeaders(uploadStack, sessionCookie, {
				'Content-Type': oversizedAvatarUpload.contentType,
			}),
			body: oversizedAvatarUpload.body,
		})
		assert.equal(oversizedAvatarResponse.status, 413)
		assert.equal((await oversizedAvatarResponse.json()).error, 'Request body exceeds the 5 MB limit.')

		const attachmentUpload = createMultipartUploadBody({
			filename: 'notes.txt',
			sizeBytes: 1024,
			contentType: 'text/plain',
		})
		const attachmentResponse = await fetch(new URL('/api/tasks/201/attachments', uploadStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(uploadStack, sessionCookie, {
				'Content-Type': attachmentUpload.contentType,
			}),
			body: attachmentUpload.body,
		})
		assert.equal(attachmentResponse.status, 201)
		assert.equal((await attachmentResponse.json()).attachments.length, 1)

		const oversizedAttachmentUpload = createMultipartUploadBody({
			filename: 'too-large.bin',
			sizeBytes: 20 * 1024 * 1024,
		})
		const oversizedAttachmentResponse = await fetch(new URL('/api/tasks/201/attachments', uploadStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(uploadStack, sessionCookie, {
				'Content-Type': oversizedAttachmentUpload.contentType,
			}),
			body: oversizedAttachmentUpload.body,
		})
		assert.equal(oversizedAttachmentResponse.status, 413)
		assert.equal((await oversizedAttachmentResponse.json()).error, 'Request body exceeds the 20 MB limit.')
	} finally {
		await uploadStack.stop()
	}
})

test('instance info and account self-service proxy routes work end-to-end', async () => {
	const authStack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {
			oidcProviders: [
				{
					name: 'Acme SSO',
					key: 'acme',
					auth_url: 'https://sso.example.test/login',
				},
			],
		},
	})

	try {
		const instanceInfoResponse = await fetch(new URL(`/api/instance-info?baseUrl=${encodeURIComponent(`${authStack.mock.origin}/api/v1`)}`, authStack.appUrl))
		assert.equal(instanceInfoResponse.status, 200)
		const instanceInfo = await instanceInfoResponse.json()
		assert.equal(instanceInfo.version, 'test')
		assert.equal(instanceInfo.motd, 'Smoke suite MOTD')
		assert.deepEqual(instanceInfo.enabled_background_providers, ['unsplash'])
		assert.equal(instanceInfo.auth.openid.providers[0].name, 'Acme SSO')

		const sessionCookie = await loginWithPasswordSession(authStack)

		const infoResponse = await fetch(new URL('/api/info', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(infoResponse.status, 200)
		assert.equal((await infoResponse.json()).version, 'test')

		const emailResponse = await fetch(new URL('/api/session/settings/email', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				password: 'smoke-password',
				newEmail: 'updated-smoke@example.test',
			}),
		})
		assert.equal(emailResponse.status, 200)
		assert.equal(authStack.mock.getState().pendingEmailChange.newEmail, 'updated-smoke@example.test')

		const exportRequestResponse = await fetch(new URL('/api/user/export/request', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				password: 'smoke-password',
			}),
		})
		assert.equal(exportRequestResponse.status, 200)

		const exportStatusResponse = await fetch(new URL('/api/user/export', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(exportStatusResponse.status, 200)
		assert.deepEqual(await exportStatusResponse.json(), {
			status: 'ready',
			createdAt: authStack.mock.getState().dataExport.createdAt,
		})

		const exportDownloadResponse = await fetch(new URL('/api/user/export/download', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				password: 'smoke-password',
			}),
		})
		assert.equal(exportDownloadResponse.status, 200)
		assert.match(exportDownloadResponse.headers.get('content-type') || '', /application\/zip/)
		assert.ok(Buffer.from(await exportDownloadResponse.arrayBuffer()).length > 0)

		const deletionRequestResponse = await fetch(new URL('/api/user/deletion/request', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				password: 'smoke-password',
			}),
		})
		assert.equal(deletionRequestResponse.status, 200)
		assert.equal(authStack.mock.getState().accountDeletion.pending, true)

		const deletionCancelResponse = await fetch(new URL('/api/user/deletion/cancel', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				password: 'smoke-password',
			}),
		})
		assert.equal(deletionCancelResponse.status, 200)
		assert.equal(authStack.mock.getState().accountDeletion.pending, false)

		await fetch(new URL('/api/user/deletion/request', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				password: 'smoke-password',
			}),
		})
		const deletionToken = authStack.mock.getState().accountDeletion.token
		assert.ok(deletionToken)

		const deletionConfirmResponse = await fetch(new URL('/api/user/deletion/confirm', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				token: deletionToken,
			}),
		})
		assert.equal(deletionConfirmResponse.status, 200)
		assert.match(`${authStack.mock.getState().accountDeletion.scheduledAt || ''}`, /^\d{4}-\d{2}-\d{2}T/)
	} finally {
		await authStack.stop()
	}
})

test('security proxy routes cover totp, caldav tokens, api tokens, and route permissions', async () => {
	const authStack = await startTestStack({legacyConfigured: false})

	try {
		const sessionCookie = await loginWithPasswordSession(authStack)

		const totpStatusResponse = await fetch(new URL('/api/session/totp', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(totpStatusResponse.status, 200)
		assert.deepEqual(await totpStatusResponse.json(), {
			enabled: false,
			secret: null,
			url: null,
		})

		const enrollResponse = await fetch(new URL('/api/session/totp/enroll', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie),
		})
		assert.equal(enrollResponse.status, 200)
		const enrollPayload = await enrollResponse.json()
		assert.equal(enrollPayload.secret, 'SMOKE-TOTP-SECRET')
		assert.match(enrollPayload.url, /^otpauth:\/\//)

		const qrResponse = await fetch(new URL('/api/session/totp/qrcode', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(qrResponse.status, 200)
		assert.match(qrResponse.headers.get('content-type') || '', /^image\//)

		const enableResponse = await fetch(new URL('/api/session/totp/enable', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				passcode: '123456',
			}),
		})
		assert.equal(enableResponse.status, 200)
		assert.equal(authStack.mock.getState().totp.enabled, true)

		const disableResponse = await fetch(new URL('/api/session/totp/disable', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				password: 'smoke-password',
			}),
		})
		assert.equal(disableResponse.status, 200)
		assert.equal(authStack.mock.getState().totp.enabled, false)

		const initialCaldavResponse = await fetch(new URL('/api/session/caldav-tokens', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(initialCaldavResponse.status, 200)
		assert.deepEqual(await initialCaldavResponse.json(), {tokens: []})

		const createCaldavResponse = await fetch(new URL('/api/session/caldav-tokens', authStack.appUrl), {
			method: 'PUT',
			headers: sameOriginHeaders(authStack, sessionCookie),
		})
		assert.equal(createCaldavResponse.status, 200)
		assert.equal((await createCaldavResponse.json()).token, 'caldav-token-1')

		const listedCaldavResponse = await fetch(new URL('/api/session/caldav-tokens', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal((await listedCaldavResponse.json()).tokens.length, 1)

		const deleteCaldavResponse = await fetch(new URL('/api/session/caldav-tokens/1', authStack.appUrl), {
			method: 'DELETE',
			headers: sameOriginHeaders(authStack, sessionCookie),
		})
		assert.equal(deleteCaldavResponse.status, 200)

		const routesResponse = await fetch(new URL('/api/routes', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(routesResponse.status, 200)
		const routesPayload = await routesResponse.json()
		assert.equal(typeof routesPayload.routes, 'object')
		assert.equal(routesPayload.routes.projects.read_all.path, '/api/v1/projects')
		assert.equal(routesPayload.routes.projects.read_all.method, 'GET')

		const createApiTokenResponse = await fetch(new URL('/api/tokens', authStack.appUrl), {
			method: 'PUT',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				title: 'Smoke API token',
				permissions: {
					projects: ['read_all'],
				},
				expires_at: '2026-12-31T23:59:59.000Z',
			}),
		})
		assert.equal(createApiTokenResponse.status, 200)
		assert.equal((await createApiTokenResponse.json()).token, 'api-token-1')

		const apiTokensResponse = await fetch(new URL('/api/tokens', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(apiTokensResponse.status, 200)
		assert.equal((await apiTokensResponse.json()).tokens.length, 1)

		const deleteApiTokenResponse = await fetch(new URL('/api/tokens/1', authStack.appUrl), {
			method: 'DELETE',
			headers: sameOriginHeaders(authStack, sessionCookie),
		})
		assert.equal(deleteApiTokenResponse.status, 200)
		assert.equal(authStack.mock.getState().apiTokens.length, 0)
	} finally {
		await authStack.stop()
	}
})

test('share detail, reactions, and bulk task routes forward correctly', async () => {
	const authStack = await startTestStack({legacyConfigured: false})

	try {
		const sessionCookie = await loginWithPasswordSession(authStack)

		const createShareResponse = await fetch(new URL('/api/projects/2/shares', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				name: 'Proxy share',
				password: 'secret123',
				permission: 1,
			}),
		})
		assert.equal(createShareResponse.status, 201)
		const createdShare = (await createShareResponse.json()).share
		assert.ok(createdShare.id)

		const shareDetailResponse = await fetch(new URL(`/api/projects/2/shares/${createdShare.id}`, authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(shareDetailResponse.status, 200)
		assert.equal((await shareDetailResponse.json()).share.password_protected, true)

		const initialReactionsResponse = await fetch(new URL('/api/comments/1/reactions', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(initialReactionsResponse.status, 200)
		assert.deepEqual(await initialReactionsResponse.json(), {reactions: []})

		const addReactionResponse = await fetch(new URL('/api/comments/1/reactions', authStack.appUrl), {
			method: 'PUT',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				value: '🎉',
			}),
		})
		assert.equal(addReactionResponse.status, 200)

		const reactionsResponse = await fetch(new URL('/api/comments/1/reactions', authStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		const reactionsPayload = await reactionsResponse.json()
		assert.equal(reactionsPayload.reactions.length, 1)
		assert.equal(reactionsPayload.reactions[0].value, '🎉')

		const removeReactionResponse = await fetch(new URL('/api/comments/1/reactions/delete', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				value: '🎉',
			}),
		})
		assert.equal(removeReactionResponse.status, 200)

		const assigneesBulkResponse = await fetch(new URL('/api/tasks/201/assignees/bulk', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				assignees: [
					{id: 1, name: 'Smoke User', username: 'smoke-user', email: 'smoke@example.test'},
					{id: 2, name: 'Alex Partner', username: 'apartner', email: 'alex@example.test'},
				],
			}),
		})
		assert.equal(assigneesBulkResponse.status, 200)
		assert.equal((await authStack.mockApi('tasks/201')).assignees.length, 2)

		const labelsBulkResponse = await fetch(new URL('/api/tasks/201/labels/bulk', authStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(authStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				labels: [
					{id: 1, title: 'Urgent'},
					{id: 2, title: 'Personal'},
				],
			}),
		})
		assert.equal(labelsBulkResponse.status, 200)
		assert.equal((await authStack.mockApi('tasks/201')).labels.length, 2)
	} finally {
		await authStack.stop()
	}
})

test('admin dump, restore, migration, and repair routes work with the mock bridge', async () => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
	})

	try {
		const sessionCookie = await loginWithPasswordSession(bridgeStack)

		const migrationsResponse = await fetch(new URL('/api/admin/migrate/list', bridgeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(migrationsResponse.status, 200)
		assert.equal((await migrationsResponse.json()).migrations.length, 2)

		const migrateResponse = await fetch(new URL('/api/admin/migrate', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie),
		})
		assert.equal(migrateResponse.status, 200)
		assert.ok(bridgeStack.adminBridge.getState().migrations.every(migration => migration.applied === true))

		const rollbackResponse = await fetch(new URL('/api/admin/migrate/rollback', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie, {
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				name: '002_add_tokens',
			}),
		})
		assert.equal(rollbackResponse.status, 200)
		assert.equal(
			bridgeStack.adminBridge.getState().migrations.find(migration => migration.name === '002_add_tokens')?.applied,
			false,
		)

		const dumpResponse = await fetch(new URL('/api/admin/dump', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie),
		})
		assert.equal(dumpResponse.status, 200)
		assert.match(dumpResponse.headers.get('content-type') || '', /application\/zip/)
		assert.match(dumpResponse.headers.get('content-disposition') || '', /vikunja-dump-smoke\.zip/)
		assert.ok(Buffer.from(await dumpResponse.arrayBuffer()).length > 0)

		const restoreResponse = await fetch(new URL('/api/admin/restore', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie, {
				'Content-Type': 'application/octet-stream',
			}),
			body: Buffer.from('mock-restore-zip', 'utf8'),
		})
		assert.equal(restoreResponse.status, 200)
		assert.ok(bridgeStack.adminBridge.getState().restore.lastUploadedBase64)

		const largeRestoreResponse = await fetch(new URL('/api/admin/restore', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie, {
				'Content-Type': 'application/octet-stream',
			}),
			body: Buffer.alloc((100 * 1024 * 1024) + 1, 0x61),
		})
		assert.equal(largeRestoreResponse.status, 413)
		assert.equal((await largeRestoreResponse.json()).error, 'Request body exceeds the 100 MB limit.')

		const repairResponse = await fetch(new URL('/api/admin/repair/projects', bridgeStack.appUrl), {
			method: 'POST',
			headers: sameOriginHeaders(bridgeStack, sessionCookie),
		})
		assert.equal(repairResponse.status, 200)
		assert.equal((await repairResponse.json()).success, true)
	} finally {
		await bridgeStack.stop()
	}
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {startTestStack} from '../helpers/app-under-test.mjs'

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
		}),
	})

	assert.equal(response.status, 200)

	const sessionCookie = getAppSessionCookie(response)
	assert.ok(sessionCookie)
	return sessionCookie
}

function getAppSessionCookie(response) {
	return response.headers
		.getSetCookie()
		.find(cookie => cookie.startsWith('vikunja_pwa_session='))
		?.split(';')[0]
}

test('config, session, saved filters, and project bootstrap routes respond', async () => {
	const healthResponse = await fetch(new URL('/health', stack.appUrl))
	assert.equal(healthResponse.status, 200)
	const health = await healthResponse.json()
	assert.equal(health.ok, true)
	assert.equal(health.vikunja.configured, true)
	assert.equal(health.vikunja.statusCode, 200)
	assert.match(health.buildId, /^\d{4}-\d{2}-\d{2}-/)

	const config = await stack.api('/api/config')
	assert.equal(config.configured, true)
	assert.equal(config.baseUrl, `${stack.mock.origin}/api/v1`)
	assert.match(config.buildId, /^\d{4}-\d{2}-\d{2}-/)

	const session = await stack.api('/api/session')
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
			headers: {
				'Content-Type': 'application/json',
				Cookie: sessionCookie,
			},
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
			headers: {
				Cookie: sessionCookie,
			},
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
			headers: {
				'Content-Type': 'application/json',
				Cookie: sessionCookie,
			},
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
			headers: {
				'Content-Type': 'application/json',
				Cookie: sessionCookie,
			},
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
		assert.equal(sessionPayload.account.isAdmin, true)
		assert.equal(sessionPayload.account.user.email, 'smoke@example.test')

		const response = await fetch(new URL('/api/admin/runtime/health', bridgeStack.appUrl), {
			headers: {
				Cookie: sessionCookie,
			},
		})
		assert.equal(response.status, 200)
		const payload = await response.json()
		assert.equal(payload.admin.isAdmin, true)
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
			headers: {
				'Content-Type': 'application/json',
				Cookie: sessionCookie,
			},
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
			headers: {
				'Content-Type': 'application/json',
				Cookie: sessionCookie,
			},
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
			headers: {
				Cookie: sessionCookie,
			},
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
			headers: {
				'Content-Type': 'application/json',
				Cookie: sessionCookie,
			},
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
			headers: {
				Cookie: sessionCookie,
			},
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
			headers: {
				'Content-Type': 'application/json',
				Cookie: sessionCookie,
			},
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

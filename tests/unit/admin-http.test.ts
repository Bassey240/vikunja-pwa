import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
	ADMIN_USER_STATUS,
	createAdminHttpApi,
	describeAdminUserStatus,
	normalizeAdminHttpUser,
	probeServerAdmin,
	resolveAdminUserId,
} from '../../server/admin-http.mjs'

function recordingClient(responses = {}) {
	const calls = []
	return {
		calls,
		async request(route, options = {}) {
			calls.push({route, ...options})
			const handler = responses[route]
			if (typeof handler === 'function') {
				return handler(options)
			}
			return handler ?? null
		},
		async fetchAllPages(route, params = {}) {
			calls.push({route, params, paged: true})
			return responses[route] ?? []
		},
	}
}

test('a user record keeps the vocabulary the CLI bridge already produced', () => {
	const user = normalizeAdminHttpUser({
		id: 7,
		username: 'ada',
		email: 'ada@example.test',
		name: 'Ada L',
		status: ADMIN_USER_STATUS.active,
		is_admin: true,
		bot_owner_id: 0,
		auth_provider: 'local',
	})

	assert.equal(user.id, 7)
	assert.equal(user.status, 'active')
	assert.equal(user.enabled, true)
	assert.equal(user.isAdmin, true)
	assert.equal(user.botOwnerId, 0)
	assert.equal(user.name, 'Ada L')
})

test('only the disabled status turns a user off', () => {
	const statuses = [
		[ADMIN_USER_STATUS.active, true],
		[ADMIN_USER_STATUS.emailConfirmationRequired, true],
		[ADMIN_USER_STATUS.disabled, false],
		[ADMIN_USER_STATUS.accountLocked, true],
	]

	for (const [status, expected] of statuses) {
		const user = normalizeAdminHttpUser({id: 1, username: 'u', status})
		assert.equal(user.enabled, expected, `status ${status}`)
	}
})

test('status labels cover every value the server enumerates', () => {
	assert.equal(describeAdminUserStatus(0), 'active')
	assert.equal(describeAdminUserStatus(1), 'email-confirmation-required')
	assert.equal(describeAdminUserStatus(2), 'disabled')
	assert.equal(describeAdminUserStatus(3), 'locked')
	assert.equal(describeAdminUserStatus(99), '')
})

test('records without an id or username are dropped rather than half-built', () => {
	assert.equal(normalizeAdminHttpUser({username: 'nobody'}), null)
	assert.equal(normalizeAdminHttpUser({id: 4}), null)
	assert.equal(normalizeAdminHttpUser(null), null)
})

test('the admin probe answers yes only when the server serves the overview', async () => {
	assert.equal(await probeServerAdmin(recordingClient({'admin/overview': {users: 1}})), true)

	const denied = {
		async request() {
			const error = new Error('forbidden')
			error.statusCode = 403
			throw error
		},
	}
	assert.equal(await probeServerAdmin(denied), false)
	assert.equal(await probeServerAdmin(null), false)
})

test('setting a password is refused rather than sent to a v1-only instance', async () => {
	const api = createAdminHttpApi({client: recordingClient(), apiV2Available: false})
	assert.equal(api.supports('setUserPassword'), false)
	await assert.rejects(() => api.setUserPassword(3, 'hunter22'), /v2 API/)
})

test('setting a password uses the v2 route when the instance serves it', async () => {
	const client = recordingClient()
	const api = createAdminHttpApi({client, apiV2Available: true})
	assert.equal(api.supports('setUserPassword'), true)

	await api.setUserPassword(3, 'hunter22')
	assert.deepEqual(client.calls.at(-1), {
		route: 'admin/users/3/password',
		method: 'PATCH',
		apiVersion: 'v2',
		body: {new_password: 'hunter22'},
	})
})

test('user listing works without v2 because only v1 exposes the route', () => {
	const api = createAdminHttpApi({client: recordingClient(), apiV2Available: false})
	assert.equal(api.supports('listUsers'), true)
	assert.equal(api.supports('renameUser'), false)
})

test('disabling a user sends the status the server enumerates, not a boolean', async () => {
	const client = recordingClient({
		'admin/users/9/status': {id: 9, username: 'ada', status: ADMIN_USER_STATUS.disabled},
	})
	const api = createAdminHttpApi({client, apiV2Available: true})

	const user = await api.setUserEnabled(9, false)
	assert.deepEqual(client.calls.at(-1).body, {status: ADMIN_USER_STATUS.disabled})
	assert.equal(user.enabled, false)
})

test('deletion asks for the immediate mode the operator pressed the button for', async () => {
	const client = recordingClient()
	const api = createAdminHttpApi({client, apiV2Available: true})

	await api.deleteUser(11)
	assert.equal(client.calls.at(-1).route, 'admin/users/11')
	assert.equal(client.calls.at(-1).method, 'DELETE')
	assert.deepEqual(client.calls.at(-1).params, {mode: 'now'})
})

test('a numeric identifier is used directly, without a lookup round trip', async () => {
	let looked = false
	const api = {
		async listUsers() {
			looked = true
			return []
		},
	}

	assert.equal(await resolveAdminUserId(api, '42'), 42)
	assert.equal(looked, false)
})

test('a username or email resolves to the id the admin routes need', async () => {
	const api = {
		async listUsers() {
			return [
				{id: 5, username: 'ada', email: 'ada@example.test'},
				{id: 6, username: 'grace', email: 'grace@example.test'},
			]
		},
	}

	assert.equal(await resolveAdminUserId(api, 'grace'), 6)
	assert.equal(await resolveAdminUserId(api, 'ADA@example.test'), 5)
	await assert.rejects(() => resolveAdminUserId(api, 'nobody'), /No Vikunja user matches/)
	await assert.rejects(() => resolveAdminUserId(api, ''), /required/)
})

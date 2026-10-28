import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {test} from 'node:test'
import {streamVikunjaEvents} from '../../server/vikunja-events.mjs'
import {createVikunjaClient} from '../../server/vikunja-client.mjs'

class Socket extends EventTarget {
	static instances: Socket[] = []
	sent: unknown[] = []
	closed = false
	constructor() {
		super()
		Socket.instances.push(this)
	}
	send(data: string) { this.sent.push(JSON.parse(data)) }
	close() { this.closed = true }
	message(payload: unknown) { this.dispatchEvent(new MessageEvent('message', {data: JSON.stringify(payload)})) }
}

class ResponseStub extends EventEmitter {
	status = 0
	headers = {}
	body = ''
	writableEnded = false
	destroyed = false
	writeHead(status: number, headers: object) { this.status = status; this.headers = headers }
	flushHeaders() {}
	write(data: string) { this.body += data }
	end() { this.writableEnded = true; this.emit('close') }
}

async function connect(t, overrides = {}) {
	const original = globalThis.WebSocket
	globalThis.WebSocket = Socket as unknown as typeof WebSocket
	const res = new ResponseStub()
	t.after(() => { res.end(); globalThis.WebSocket = original })
	let failures = 0
	await streamVikunjaEvents({
		res, url: new URL('ws://vikunja.test/api/v2/ws'),
		getAccessToken: async () => 'private-jwt', timersEnabled: false,
		isSessionValid: () => true, onAuthFailure: () => { failures++ }, ...overrides,
	})
	return {res, socket: Socket.instances.at(-1)!, failures: () => failures}
}

test('auth precedes subscription; SSE forwards only supported event names', async t => {
	const {res, socket} = await connect(t)
	assert.deepEqual(socket.sent, [])
	socket.dispatchEvent(new Event('open'))
	assert.deepEqual(socket.sent, [{action: 'auth', token: 'private-jwt'}])
	socket.message({event: 'notification.created', data: 'before-auth'})
	assert.equal(res.body, '')
	socket.message({action: 'auth.success', success: true})
	assert.deepEqual(socket.sent.slice(1), [{action: 'subscribe', event: 'notification.created'}])
	socket.message({event: 'notification.created', data: {token: 'private-jwt'}})
	socket.message({event: 'timer.created'})
	socket.message({event: 'task.updated'})
	assert.equal(res.body, 'event: ready\ndata: {}\n\nevent: notification.created\ndata: {}\n\n')
	assert.equal(res.status, 200)
	assert.equal(res.headers['X-Accel-Buffering'], 'no')
	res.end()
	assert.equal(socket.closed, true)
})

test('licensed sessions subscribe to all timer events', async t => {
	const {res, socket} = await connect(t, {timersEnabled: true})
	socket.message({action: 'auth.success', success: true})
	assert.deepEqual(socket.sent.map(message => message.event), [
		'notification.created', 'timer.created', 'timer.updated', 'timer.deleted',
	])
	for (const event of ['timer.created', 'timer.updated', 'timer.deleted']) socket.message({event})
	assert.match(res.body, /event: timer.deleted/)
})

test('invalid JWT terminates the session and emits auth-error', async t => {
	const {res, socket, failures} = await connect(t)
	socket.message({error: 'invalid_token'})
	assert.equal(failures(), 1)
	assert.equal(res.body, 'event: auth-error\ndata: {}\n\n')
	assert.equal(res.writableEnded, true)
	assert.equal(socket.closed, true)
})

test('logout prevents delivery on an existing stream', async t => {
	let valid = true
	const {res, socket} = await connect(t, {isSessionValid: () => valid})
	socket.message({action: 'auth.success', success: true})
	valid = false
	socket.message({event: 'notification.created'})
	assert.doesNotMatch(res.body, /event: notification.created/)
	assert.match(res.body, /event: auth-error/)
	assert.equal(socket.closed, true)
})

test('transient close ends SSE without invalidating authentication', async t => {
	const {res, socket, failures} = await connect(t)
	socket.dispatchEvent(new Event('close'))
	assert.equal(res.writableEnded, true)
	assert.equal(failures(), 0)
	assert.doesNotMatch(res.body, /auth-error/)
})

test('a stalled authentication closes after ten seconds', async t => {
	t.mock.timers.enable({apis: ['setTimeout', 'setInterval']})
	const {res, socket, failures} = await connect(t)
	t.mock.timers.tick(10_000)
	assert.equal(res.writableEnded, true)
	assert.equal(socket.closed, true)
	assert.equal(failures(), 0)
})

test('keepalive detects logout even when upstream sends no events', async t => {
	t.mock.timers.enable({apis: ['setTimeout', 'setInterval']})
	let valid = true
	const {res, socket} = await connect(t, {isSessionValid: () => valid})
	socket.message({action: 'auth.success', success: true})
	t.mock.timers.tick(30_000)
	assert.match(res.body, /: keepalive/)
	valid = false
	t.mock.timers.tick(30_000)
	assert.match(res.body, /event: auth-error/)
	assert.equal(res.writableEnded, true)
	assert.equal(socket.closed, true)
})

for (const statusCode of [401, 503]) {
	test(`refresh failure ${statusCode} ${statusCode === 401 ? 'rejects authentication' : 'allows retry'}`, async t => {
		const {res, failures} = await connect(t, {
			getAccessToken: async () => { throw Object.assign(new Error('Refresh failed'), {statusCode}) },
		})
		assert.equal(res.status, 200)
		assert.equal(res.writableEnded, true)
		assert.equal(failures(), statusCode === 401 ? 1 : 0)
	})
}

test('reconnecting clients reuse the persisted fresh JWT and refresh cookie', async t => {
	const originalFetch = globalThis.fetch
	t.after(() => { globalThis.fetch = originalFetch })
	const jwt = exp => `header.${Buffer.from(JSON.stringify({exp})).toString('base64url')}.signature`
	let authState = {accessToken: jwt(1), refreshCookie: 'vikunja_refresh_token=old'}
	let refreshes = 0
	globalThis.fetch = async (_url, options) => {
		refreshes++
		assert.equal(options.headers.Cookie, authState.refreshCookie)
		return new Response(JSON.stringify({token: jwt(Math.floor(Date.now() / 1000) + 3600)}), {
			status: 200, headers: {'Set-Cookie': 'vikunja_refresh_token=fresh; Path=/'},
		})
	}
	const client = () => createVikunjaClient({
		baseUrl: 'https://vikunja.test', authMode: 'password', ...authState,
		getAuthState: () => authState,
		onAuthStateChange: patch => { authState = {...authState, ...patch} },
	})
	const firstToken = await client().getFreshAccessToken()
	assert.equal(await client().getFreshAccessToken(), firstToken)
	assert.equal(refreshes, 1)
	assert.equal(authState.refreshCookie, 'vikunja_refresh_token=fresh')
})

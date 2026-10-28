import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'

// Run only against a disposable instance: the lifecycle test creates users
// and changes their settings. No existing account or credentials are used.
const baseUrl = process.env.VIKUNJA_V2_TEST_URL
const {operations} = JSON.parse(readFileSync(new URL('../helpers/vikunja-v2-operations.json', import.meta.url)))
const documentedRoutes = JSON.parse(readFileSync(new URL('../helpers/vikunja-v2-routes.json', import.meta.url)))
const unsupported = [
	['/migration/todoist/', 'Todoist OAuth provider is not configured'],
	['/time-entries', 'Time tracking requires a Pro license'],
	['/projects/{project_id}/time-entries', 'Time tracking requires a Pro license'],
	['/tasks/{task_id}/time-entries', 'Time tracking requires a Pro license'],
]
const publicErrors = {
	'POST /invite-links/check': [404],
	'POST /login': [400, 422],
	'POST /oauth/token': [400, 422],
	'POST /register': [400, 422],
	'POST /shares/{share}/auth': [400, 404],
	'POST /user/confirm': [412],
	'POST /user/password/reset': [400, 422],
	'POST /user/password/token': [400, 422],
	'POST /user/token/refresh': [401],
}

async function request(method, path, {body, token, contentType = 'application/json'} = {}) {
	const response = await fetch(`${baseUrl}${path}`, {
		method,
		headers: {...(token ? {Authorization: `Bearer ${token}`} : {}), ...(body !== undefined && !(body instanceof FormData) ? {'Content-Type': contentType} : {})},
		...(body === undefined ? {} : {body: body instanceof FormData ? body : contentType === 'application/x-www-form-urlencoded' ? new URLSearchParams(body) : JSON.stringify(body)}),
		signal: AbortSignal.timeout(10000),
	})
	const text = await response.text()
	const payload = text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text
	return {response, payload}
}

test('inventory accounts for every documented v2 operation', () => {
	assert.equal(operations.length, 205)
	assert.equal(new Set(operations.map(op => `${op.method} ${op.path}`)).size, 205)
	for (const {method, path, public: isPublic} of operations) {
		assert.ok(documentedRoutes[path]?.includes(method), `${method} ${path} is absent from route contracts`)
		if (isPublic && method !== 'GET') assert.ok(publicErrors[`${method} ${path}`], `Missing public-input expectations for ${method} ${path}`)
	}
})

for (const operation of operations) {
	const {method, path, public: isPublic, contentType} = operation
	test(`${method} ${path} — ${isPublic ? method === 'GET' ? 'public response' : 'invalid public input' : 'authentication required'}`, {skip: !baseUrl && 'Set VIKUNJA_V2_TEST_URL to a disposable instance'}, async t => {
		const concretePath = path.replace(/\{entitykind\}/g, 'tasks').replace(/\{entity\}/g, 'task').replace(/\{relationKind\}/g, 'subtask').replace(/\{username\}/g, 'missing-user').replace(/\{[^}]+\}/g, '99999999')
		const {response, payload} = await request(method, concretePath, {contentType, ...(method === 'GET' || method === 'DELETE' ? {} : {body: {}})})
		const feature = unsupported.find(([prefix]) => path.startsWith(prefix))
		if (response.status === 404 && feature) { t.skip(feature[1]); return }
		const expected = isPublic ? method === 'GET' ? [200] : publicErrors[`${method} ${path}`] : [401]
		assert.ok(expected.includes(response.status), `${method} ${path}: expected ${expected}, received ${response.status}: ${JSON.stringify(payload)}`)
		if (response.status >= 400) {
			assert.ok(payload && typeof payload === 'object', 'Errors must be JSON')
			assert.ok(payload.detail || payload.message || payload.error, 'Errors must contain an explanation')
		}
	})
}

test('authenticated v2 resource lifecycle persists writes', {skip: !baseUrl && 'Set VIKUNJA_V2_TEST_URL to a disposable instance'}, async t => {
	const successfulOperations = new Set()
	const suffix = Date.now()
	const password = 'V2-endpoint-test-password-123!'
	const username = `v2test${suffix}`
	const success = async (method, path, body, token) => {
		const {response, payload} = await request(method, path, {body, token})
		assert.ok(response.ok, `${method} ${path}: ${response.status}: ${JSON.stringify(payload)}`)
		const operation = operations.find(op => op.method === method && new RegExp('^' + op.path.replace(/\{[^}]+\}/g, '[^/]+') + '$').test(path.split('?')[0]))
		assert.ok(operation, `${method} ${path} must have a documented operation`)
		successfulOperations.add(`${method} ${operation.path}`)
		return payload
	}
	await success('POST', '/register', {username, email: `${username}@example.invalid`, password})
	const login = await success('POST', '/login', {username, password})
	const token = login.token
	assert.ok(token)
	const api = (method, path, body) => success(method, path, body, token)
	const user = await api('GET', '/user')
	const project = await api('POST', '/projects', {title: 'Endpoint verification'})
	const projectPath = `/projects/${project.id}`
	await api('GET', '/projects')
	await api('GET', projectPath)
	await api('PUT', projectPath, {title: 'PUT project', description: '<p>Keep HTML</p>'})
	await api('PATCH', projectPath, {title: 'PATCH project'})
	assert.equal((await api('GET', projectPath)).title, 'PATCH project')
	const task = await api('POST', `${projectPath}/tasks`, {title: 'Endpoint task'})
	const taskPath = `/tasks/${task.id}`
	await api('GET', '/tasks')
	await api('GET', `${projectPath}/tasks`)
	await api('GET', `${projectPath}/tasks/by-index/${task.index}`)
	await api('PUT', taskPath, {title: 'PUT task', description: '<p>Keep HTML</p>', project_id: project.id})
	await api('PATCH', taskPath, {done: true, priority: 3})
	assert.equal((await api('GET', taskPath)).done, true)
	await api('PATCH', taskPath, {done: false})
	await api('PUT', `${taskPath}/read`, {})
	await api('POST', `${taskPath}/duplicate`, {})
	await api('POST', `${projectPath}/tasks/bulk`, {tasks: [{title: 'Bulk-created task'}]})
	await api('PUT', '/tasks/bulk', {task_ids: [task.id], fields: ['priority'], values: {priority: 4}})
	assert.equal((await api('GET', taskPath)).priority, 4)

	const label = await api('POST', '/labels', {title: 'Endpoint label'})
	await api('GET', '/labels')
	await api('GET', `/labels/${label.id}`)
	await api('PUT', `/labels/${label.id}`, {title: 'PUT label'})
	await api('PATCH', `/labels/${label.id}`, {title: 'PATCH label'})
	await api('POST', `${taskPath}/labels`, {label_id: label.id})
	await api('GET', `${taskPath}/labels`)
	await api('DELETE', `${taskPath}/labels/${label.id}`)
	await api('PUT', `${taskPath}/labels/bulk`, {labels: [{id: label.id}]})
	await api('POST', `${taskPath}/assignees`, {user_id: user.id})
	await api('GET', `${taskPath}/assignees`)
	await api('DELETE', `${taskPath}/assignees/${user.id}`)
	await api('PUT', `${taskPath}/assignees/bulk`, {assignees: [{id: user.id}]})
	const comment = await api('POST', `${taskPath}/comments`, {comment: '<p>Comment</p>'})
	const commentPath = `${taskPath}/comments/${comment.id}`
	await api('GET', `${taskPath}/comments`)
	await api('GET', commentPath)
	await api('PUT', commentPath, {comment: '<p>PUT comment</p>'})
	await api('PATCH', commentPath, {comment: '<p>PATCH comment</p>'})
	await api('GET', `${taskPath}/attachments`)
	const attachmentForm = new FormData()
	attachmentForm.append('files', new Blob(['Endpoint attachment']), 'test.txt')
	const uploaded = await api('POST', `${taskPath}/attachments`, attachmentForm)
	assert.equal(uploaded.success.length, 1)
	const attachmentPath = `${taskPath}/attachments/${uploaded.success[0].id}`
	assert.equal(await api('GET', attachmentPath), 'Endpoint attachment')
	await api('DELETE', attachmentPath)
	const image = readFileSync(new URL('../../public/icons/icon-192.png', import.meta.url))
	const imageForm = field => {
		const form = new FormData()
		form.append(field, new Blob([image], {type: 'image/png'}), 'test.png')
		return form
	}
	await api('PUT', `${projectPath}/backgrounds/upload`, imageForm('background'))
	await api('GET', `${projectPath}/background`)
	await api('DELETE', `${projectPath}/background`)
	await api('PUT', '/user/settings/avatar', imageForm('avatar'))
	await api('GET', `/avatar/${username}`)
	const child = await api('POST', `${projectPath}/tasks`, {title: 'Related task'})
	await api('POST', `${taskPath}/relations`, {other_task_id: child.id, relation_kind: 'subtask'})
	await api('DELETE', `${taskPath}/relations/subtask/${child.id}`)
	await api('POST', `/tasks/${task.id}/reactions`, {value: '👍'})
	await api('GET', `/tasks/${task.id}/reactions`)
	await api('POST', `/tasks/${task.id}/reactions/delete`, {value: '👍'})

	const views = await api('GET', `${projectPath}/views`)
	assert.ok((views.items || views).length)
	const view = await api('POST', `${projectPath}/views`, {title: 'Test board', view_kind: 'kanban', filter: {}})
	const viewPath = `${projectPath}/views/${view.id}`
	await api('GET', viewPath)
	await api('PUT', viewPath, {title: 'PUT board', view_kind: 'kanban', filter: {}})
	await api('PATCH', viewPath, {title: 'PATCH board'})
	await api('GET', `${viewPath}/tasks`)
	const bucket = await api('POST', `${viewPath}/buckets`, {title: 'Endpoint bucket'})
	await api('GET', `${viewPath}/buckets`)
	await api('GET', `${viewPath}/buckets/tasks`)
	await api('PUT', `${viewPath}/buckets/${bucket.id}`, {title: 'Edited bucket'})
	await api('PUT', `${viewPath}/buckets/${bucket.id}/tasks`, {task_id: task.id})
	await api('PUT', `${taskPath}/position`, {project_view_id: view.id, position: 200})
	await api('DELETE', `${viewPath}/buckets/${bucket.id}`)
	await api('DELETE', viewPath)

	const filter = await api('POST', '/filters', {title: 'Endpoint filter', filters: {filter: 'done = false'}})
	await api('GET', `/filters/${filter.id}`)
	await api('PUT', `/filters/${filter.id}`, {title: 'PUT filter', filters: {filter: 'priority = 4'}})
	await api('PATCH', `/filters/${filter.id}`, {title: 'PATCH filter'})
	const team = await api('POST', '/teams', {name: 'Endpoint team'})
	await api('GET', '/teams')
	await api('GET', `/teams/${team.id}`)
	await api('PUT', `/teams/${team.id}`, {name: 'PUT team'})
	await api('PATCH', `/teams/${team.id}`, {name: 'PATCH team'})
	await api('POST', `${projectPath}/teams`, {team_id: team.id, permission: 1})
	await api('GET', `${projectPath}/teams`)
	await api('PUT', `${projectPath}/teams/${team.id}`, {permission: 2})
	await api('DELETE', `${projectPath}/teams/${team.id}`)
	const share = await api('POST', `${projectPath}/shares`, {name: 'Test share', permission: 0})
	await api('GET', `${projectPath}/shares`)
	await api('GET', `${projectPath}/shares/${share.id}`)
	await api('DELETE', `${projectPath}/shares/${share.id}`)
	await api('GET', `${projectPath}/users`)
	await api('GET', `${projectPath}/users/search?q=${username}`)
	await api('GET', '/users')
	await api('DELETE', `/subscriptions/task/${task.id}`)
	await api('POST', `/subscriptions/task/${task.id}`, {})
	await api('DELETE', `/subscriptions/task/${task.id}`)
	await api('GET', '/webhooks/events')
	await api('GET', '/user/settings/webhooks/events')
	for (const owner of [projectPath, '/user/settings']) {
		const events = await api('GET', owner === projectPath ? '/webhooks/events' : '/user/settings/webhooks/events')
		assert.ok(events.length, 'The webhook owner must expose supported events')
		const hook = await api('POST', `${owner}/webhooks`, {target_url: 'https://example.invalid/hook', events: [events[0]], secret: ''})
		await api('GET', `${owner}/webhooks`)
		await api('PUT', `${owner}/webhooks/${hook.id}`, {target_url: 'https://example.invalid/edited', events: [events[0]], secret: ''})
		await api('DELETE', `${owner}/webhooks/${hook.id}`)
	}
	await api('GET', '/user/settings/general')
	await api('PUT', '/user/settings/general', {name: 'PUT user', timezone: 'Europe/Amsterdam', overdue_tasks_reminders_time: '09:00'})
	await api('PATCH', '/user/settings/general', {name: 'PATCH user'})
	assert.equal((await api('GET', '/user/settings/general')).name, 'PATCH user')
	await api('GET', '/user/timezones')
	await api('GET', '/user/sessions')
	await api('GET', '/user/settings/avatar/provider')
	await api('PUT', '/user/settings/avatar/provider', {avatar_provider: 'initials'})
	await api('PATCH', '/user/settings/avatar/provider', {avatar_provider: 'default'})
	await api('GET', '/tokens')
	await api('GET', '/token/test')
	await api('POST', '/token/test', {})
	await api('GET', '/notifications')
	await api('POST', '/notifications', {})
	await api('DELETE', '/notifications')
	await api('GET', '/user/bots')
	const bot = await api('POST', '/user/bots', {username: `bot-${suffix}`, name: 'Test bot'})
	await api('GET', `/user/bots/${bot.id}`)
	await api('PUT', `/user/bots/${bot.id}`, {username: bot.username, name: 'PUT bot', status: bot.status})
	await api('PATCH', `/user/bots/${bot.id}`, {name: 'PATCH bot'})
	await api('DELETE', `/user/bots/${bot.id}`)
	const apiToken = await api('POST', '/tokens', {title: 'Test token', permissions: {projects: ['read_all']}, expires_at: new Date(Date.now() + 86400000).toISOString()})
	await success('GET', '/projects', undefined, apiToken.token)
	await api('DELETE', `/tokens/${apiToken.id}`)
	await api('POST', '/user/settings/totp/enroll', {})
	await api('GET', '/user/settings/totp')
	await api('GET', '/user/settings/totp/qrcode')
	await api('POST', '/user/settings/totp/disable', {password})
	await api('GET', '/user/settings/token/caldav')
	const caldavToken = await api('POST', '/user/settings/token/caldav', {})
	await api('DELETE', `/user/settings/token/caldav/${caldavToken.id}`)
	for (const migrator of ['csv', 'planka', 'ticktick', 'vikunja-file', 'wekan']) await api('GET', `/migration/${migrator}/status`)
	await api('GET', '/routes')
	await api('GET', '/mcp/info')
	await api('POST', `${projectPath}/duplicate`, {parent_project_id: 0})
	await api('DELETE', commentPath)
	await api('DELETE', `/labels/${label.id}`)
	await api('DELETE', `/filters/${filter.id}`)
	await api('DELETE', `/teams/${team.id}`)
	await api('DELETE', taskPath)
	await api('DELETE', projectPath)
	await api('POST', '/logout', {})
	t.diagnostic(`Successful operation coverage: ${successfulOperations.size}/205; other operations have authentication/public-input checks only.`)
	t.diagnostic(`No successful-workflow test: ${operations.filter(op => !successfulOperations.has(`${op.method} ${op.path}`)).map(op => `${op.method} ${op.path}`).join(', ')}`)
})

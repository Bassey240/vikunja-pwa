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

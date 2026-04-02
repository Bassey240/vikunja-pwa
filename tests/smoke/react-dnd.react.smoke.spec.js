import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

let stack

test.describe.configure({mode: 'serial'})

test.beforeAll(async () => {
	stack = await startTestStack({legacyConfigured: false})
})

test.afterAll(async () => {
	await stack.stop()
})

test.beforeEach(async ({page}) => {
	stack.reset()
	await page.setViewportSize({width: 900, height: 900})
	await page.goto(stack.appUrl)
	await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible({timeout: 15_000})
	await page.locator('[data-action="set-account-auth-mode"][data-auth-mode="apiToken"]').click()
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="apiToken"]').fill('smoke-token')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
})

async function openProjects(page) {
	await page.goto(`${stack.appUrl}/projects`)
	await expect.poll(() => page.evaluate(() => window.location.pathname === '/projects')).toBe(true)
}

async function openProject(page, projectId, projectTitle) {
	await openProjects(page)
	await page.locator(`.workspace-screen.is-active [data-action="select-project"][data-project-id="${projectId}"]`).click()
	await expect(page.getByRole('heading', {name: projectTitle})).toBeVisible()
}

async function getCenterPoint(locator) {
	const box = await locator.boundingBox()
	if (!box) {
		throw new Error('Target bounding box is not available.')
	}

	return {
		x: box.x + box.width / 2,
		y: box.y + box.height / 2,
	}
}

async function getEdgePoint(locator, edge) {
	const box = await locator.boundingBox()
	if (!box) {
		throw new Error('Target bounding box is not available.')
	}

	return {
		x: box.x + box.width / 2,
		y: edge === 'top'
			? box.y + Math.max(4, box.height * 0.06)
			: box.y + box.height - Math.max(4, box.height * 0.06),
	}
}

async function dragHandleToPoint(page, handleLocator, point) {
	const start = await getCenterPoint(handleLocator)
	await page.mouse.move(start.x, start.y)
	await page.mouse.down()
	await page.waitForTimeout(260)
	await page.mouse.move(start.x + 2, start.y + 2, {steps: 4})
	await page.mouse.move(point.x, point.y, {steps: 18})
	await page.waitForTimeout(220)
	await page.mouse.move(point.x + 1, point.y + 1, {steps: 3})
	await page.waitForTimeout(180)
	await page.mouse.up()
	await page.waitForTimeout(700)
}

async function dragProjectToProjectCenter(page, sourceProjectId, targetProjectId) {
	const handle = page.locator(`.workspace-screen.is-active [data-project-node-id="${sourceProjectId}"] > .project-node-row .project-drag-handle`)
	const target = page.locator(`.workspace-screen.is-active [data-project-node-id="${targetProjectId}"] > .project-node-row .project-drag-handle`)
	await dragHandleToPoint(page, handle, await getCenterPoint(target))
}

async function dragProjectToProjectEdge(page, sourceProjectId, targetProjectId, edge = 'top') {
	const handle = page.locator(`.workspace-screen.is-active [data-project-node-id="${sourceProjectId}"] > .project-node-row .project-drag-handle`)
	const target = page.locator(`.workspace-screen.is-active [data-project-node-id="${targetProjectId}"] > .project-node-row`)
	await dragHandleToPoint(page, handle, await getEdgePoint(target, edge))
}

async function dragProjectToTaskEdge(page, sourceProjectId, targetTaskId, edge = 'top') {
	const handle = page.locator(`.workspace-screen.is-active [data-project-node-id="${sourceProjectId}"] > .project-node-row .project-drag-handle`)
	const target = page.locator(`.workspace-screen.is-active [data-task-row-id="${targetTaskId}"]`)
	await dragHandleToPoint(page, handle, await getEdgePoint(target, edge))
}

async function dragTaskToTaskCenter(page, sourceTaskId, targetTaskId) {
	const handle = page.locator(`.workspace-screen.is-active [data-task-branch-id="${sourceTaskId}"] > .task-row .drag-handle`)
	const target = page.locator(`.workspace-screen.is-active [data-task-branch-id="${targetTaskId}"] > .task-row .drag-handle`)
	await dragHandleToPoint(page, handle, await getCenterPoint(target))
}

async function dragTaskToTaskEdge(page, sourceTaskId, targetTaskId, edge = 'top') {
	const handle = page.locator(`.workspace-screen.is-active [data-task-branch-id="${sourceTaskId}"] > .task-row .drag-handle`)
	const target = page.locator(`.workspace-screen.is-active [data-task-row-id="${targetTaskId}"]`)
	await dragHandleToPoint(page, handle, await getEdgePoint(target, edge))
}

async function dragTaskToProjectCenter(page, sourceTaskId, targetProjectId) {
	const handle = page.locator(`.workspace-screen.is-active [data-task-branch-id="${sourceTaskId}"] > .task-row .drag-handle`)
	const target = page.locator(`.workspace-screen.is-active [data-project-node-id="${targetProjectId}"] > .project-node-row .project-drag-handle`)
	await dragHandleToPoint(page, handle, await getCenterPoint(target))
}

async function dragTaskToProjectEdge(page, sourceTaskId, targetProjectId, edge = 'top') {
	const handle = page.locator(`.workspace-screen.is-active [data-task-branch-id="${sourceTaskId}"] > .task-row .drag-handle`)
	const target = page.locator(`.workspace-screen.is-active [data-project-node-id="${targetProjectId}"] > .project-node-row`)
	await dragHandleToPoint(page, handle, await getEdgePoint(target, edge))
}

async function createTodayTask(title) {
	const now = new Date()
	now.setHours(10, 0, 0, 0)

	const task = await stack.mockApi('projects/1/tasks', {
		method: 'PUT',
		headers: {'content-type': 'application/json'},
		body: JSON.stringify({
			title,
			due_date: now.toISOString(),
		}),
	})

	return task.id
}

async function createTodayTaskInUi(page, title) {
	await page.locator('[data-action="open-root-composer"]:visible').click()
	await expect(page.locator('.workspace-screen.is-active [data-form="root-task-inline"]')).toBeVisible()
	await page.locator('.workspace-screen.is-active [data-root-input]').fill(title)
	await page.locator('.workspace-screen.is-active [data-form="root-task-inline"] .composer-submit').click()
	const row = page.locator(`.workspace-screen.is-active .task-row:has(.task-title:text-is("${title}"))`).last()
	await expect(row).toBeVisible()
	return await row.evaluate(node => Number(node?.dataset?.taskRowId || 0) || null)
}

async function rootProjectIds(page) {
	return page.locator('.workspace-screen.is-active .screen-body > .project-node[data-project-node-id]').evaluateAll(nodes =>
		nodes.map(node => Number(node.dataset.projectNodeId || 0)),
	)
}

async function rootTaskIds(page) {
	return page.locator('.workspace-screen.is-active .task-tree > .task-branch > .task-row[data-task-row-id]').evaluateAll(rows =>
		rows.map(row => Number(row.dataset.taskRowId || 0)),
	)
}

async function previewTaskIds(page, projectId) {
	return page.locator(`.workspace-screen.is-active [data-project-node-id="${projectId}"] .task-tree > .task-branch > .task-row[data-task-row-id]`).evaluateAll(rows =>
		rows.map(row => Number(row.dataset.taskRowId || 0)),
	)
}

async function enableDragPerf(page) {
	await page.evaluate(() => {
		window.localStorage.setItem('vikunja-mobile-poc:drag-perf-debug', '1')
		window.__vikunjaDragPerf = {
			activeTaskDrop: null,
			activeProjectDrop: null,
			history: [],
		}
	})
}

test('can reorder root projects by drag', async ({page}) => {
	await openProjects(page)
	await expect.poll(() => rootProjectIds(page)).toEqual([1, 2])

	await dragProjectToProjectEdge(page, 2, 1, 'top')

	await expect.poll(() => rootProjectIds(page)).toEqual([2, 1])
	await expect.poll(async () => {
		const projects = await stack.mockApi('projects')
		const work = projects.find(project => project.id === 2)
		const inbox = projects.find(project => project.id === 1)
		return Number(work.position) < Number(inbox.position)
	}).toBe(true)
})

test('project drag writes live perf history entries', async ({page}) => {
	await openProjects(page)
	await enableDragPerf(page)
	await expect.poll(() => rootProjectIds(page)).toEqual([1, 2])

	await dragProjectToProjectEdge(page, 2, 1, 'top')

	await expect.poll(async () => {
		return page.evaluate(() => window.__vikunjaDragPerf?.history?.[0] || null)
	}).not.toBeNull()

	const trace = await page.evaluate(() => window.__vikunjaDragPerf?.history?.[0] || null)
	const phases = trace?.phases?.map(phase => phase.name) || []
	expect(trace?.kind).toBe('project')
	expect(phases).toContain('first-destination-paint')
	expect(phases).toContain('async-resolved')
	expect(phases).toContain('skip-full-refresh-for-visible-project-drop')
	expect(phases).not.toContain('refresh-current-collections-start')
	expect(phases.indexOf('first-destination-paint')).toBeGreaterThan(phases.indexOf('optimistic-set-end'))
})

test('can move a root project into another project and promote it back to root', async ({page}) => {
	await openProjects(page)

	await dragProjectToProjectCenter(page, 2, 1)

	await expect.poll(async () => {
		const projects = await stack.mockApi('projects')
		return projects.find(project => project.id === 2)?.parent_project_id
	}).toBe(1)
	await expect(page.locator('.screen-body > .project-node[data-project-node-id="2"]')).toHaveCount(0)

	await page.locator('[data-action="toggle-project"][data-project-id="1"]').click()
	await expect(page.locator('[data-project-node-id="2"] .project-node-row')).toBeVisible()
	await dragProjectToProjectEdge(page, 2, 1, 'top')

	await expect.poll(async () => {
		const projects = await stack.mockApi('projects')
		return projects.find(project => project.id === 2)?.parent_project_id
	}).toBe(0)
	await expect.poll(async () => (await rootProjectIds(page)).includes(2)).toBe(true)
})

test('can reorder root tasks by drag', async ({page}) => {
	await openProject(page, 2, 'Work')
	await expect.poll(() => rootTaskIds(page)).toEqual([201, 202, 203])

	await dragTaskToTaskEdge(page, 203, 201, 'top')

	await expect.poll(() => rootTaskIds(page)).toEqual([203, 201, 202])
	await expect.poll(async () => {
		const result = await stack.mockApi('projects/2/tasks')
		const moved = result.find(task => task.id === 203)
		const formerFirst = result.find(task => task.id === 201)
		return Number(moved.position) < Number(formerFirst.position)
	}).toBe(true)
})

test('inbox drag uses the inbox view id for position updates', async ({page}) => {
	await page.getByRole('button', {name: 'Inbox'}).click()
	await expect(page.getByRole('heading', {name: 'Inbox'})).toBeVisible()
	await expect.poll(() => rootTaskIds(page)).toEqual([101, 102])

	let positionPayload = null
	await page.route('**/api/tasks/102/position', async route => {
		positionPayload = route.request().postDataJSON()
		await route.continue()
	})

	await dragTaskToTaskEdge(page, 102, 101, 'top')

	await expect.poll(() => positionPayload?.project_view_id || null).toBe(11)
	await expect.poll(() => rootTaskIds(page)).toEqual([102, 101])
})

test('inbox drag position persists after background refresh', async ({page}) => {
	await page.getByRole('button', {name: 'Inbox'}).click()
	await expect(page.getByRole('heading', {name: 'Inbox'})).toBeVisible()
	await expect.poll(() => rootTaskIds(page)).toEqual([101, 102])

	await dragTaskToTaskEdge(page, 102, 101, 'top')

	await expect.poll(() => rootTaskIds(page)).toEqual([102, 101])
	await expect.poll(async () => {
		const tasks = await stack.mockApi('projects/1/tasks')
		const moved = tasks.find(task => task.id === 102)
		const other = tasks.find(task => task.id === 101)
		return Number(moved.position) < Number(other.position)
	}).toBe(true)
})

test('drag after switching projects uses the correct project view id', async ({page}) => {
	// Navigate to project 1 first (view 11) to set currentProjectViewId
	await openProject(page, 1, 'Inbox')
	await expect.poll(() => rootTaskIds(page)).toEqual([101, 102])

	// Now switch to project 2 (view 12) and drag
	await openProject(page, 2, 'Work')
	await expect.poll(() => rootTaskIds(page)).toEqual([201, 202, 203])

	let positionPayload = null
	await page.route('**/api/tasks/203/position', async route => {
		positionPayload = route.request().postDataJSON()
		await route.continue()
	})

	await dragTaskToTaskEdge(page, 203, 201, 'top')

	// Must use project 2's view (12), NOT project 1's stale view (11)
	await expect.poll(() => positionPayload?.project_view_id || null).toBe(12)
})

test('task position updates use the active selected project view id', async ({page}) => {
	await openProject(page, 2, 'Work')
	await page.getByRole('button', {name: 'View'}).click()
	await page.getByRole('button', {name: 'Alt List'}).click()
	await expect.poll(() => rootTaskIds(page)).toEqual([201, 202, 203])

	let positionPayload = null
	await page.route('**/api/tasks/203/position', async route => {
		positionPayload = route.request().postDataJSON()
		await route.continue()
	})

	await dragTaskToTaskEdge(page, 203, 201, 'top')

	await expect.poll(() => positionPayload?.project_view_id || null).toBe(16)
})

test('drag reorder applies the persisted backend position before the refresh completes', async ({page}) => {
	await openProject(page, 2, 'Work')
	await expect.poll(() => rootTaskIds(page)).toEqual([201, 202, 203])

	let delayedRefreshSeen = false
	await page.route('**/api/tasks/203/position', async route => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				taskPosition: {
					task_id: 203,
					project_view_id: 12,
					position: 250,
				},
			}),
		})
	})

	await page.route('**/api/projects/2/views/12/tasks**', async route => {
		delayedRefreshSeen = true
		const tasks = await stack.mockApi('projects/2/tasks')
		const payload = tasks
			.map(task => task.id === 203 ? {...task, position: 250} : task)
			.sort((left, right) => Number(left.position || 0) - Number(right.position || 0) || left.id - right.id)
		await new Promise(resolve => setTimeout(resolve, 1200))
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(payload),
		})
	})

	await dragTaskToTaskEdge(page, 203, 201, 'top')

	await expect.poll(() => delayedRefreshSeen).toBe(true)
	await expect.poll(() => rootTaskIds(page), {timeout: 800}).toEqual([201, 202, 203])
})

test('can move a task into a child project by drag', async ({page}) => {
	await openProject(page, 2, 'Work')
	let projectMovePayload = null

	await page.route('**/api/tasks/202', async route => {
		if (route.request().method() === 'POST') {
			projectMovePayload = route.request().postDataJSON()
		}
		await route.continue()
	})

	await dragTaskToProjectCenter(page, 202, 3)

	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/202')
		return task.project_id
	}).toBe(3)
	expect(projectMovePayload?.due_date).toBeTruthy()
	await expect(page.locator('[data-task-row-id="202"]')).toHaveCount(0)
})

test('can place a task at a specific edge position in another project task list', async ({page}) => {
	await openProject(page, 2, 'Work')
	await page.locator('[data-action="toggle-project"][data-project-id="3"]').click()
	await expect.poll(() => previewTaskIds(page, 3)).toEqual([301])

	await dragTaskToTaskEdge(page, 202, 301, 'top')

	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/202')
		return task.project_id
	}).toBe(3)
	await expect.poll(() => previewTaskIds(page, 3)).toEqual([202, 301])
})

test('projects overview cross-project drops paint before background refresh completes', async ({page}) => {
	await openProjects(page)
	await enableDragPerf(page)
	await page.locator('.workspace-screen.is-active [data-action="toggle-project"][data-project-id="1"]').click()
	await page.locator('.workspace-screen.is-active [data-action="toggle-project"][data-project-id="2"]').click()
	await expect.poll(() => previewTaskIds(page, 1)).toEqual([101, 102, 103])
	await expect.poll(() => previewTaskIds(page, 2)).toEqual([201, 202, 203])

	await dragTaskToProjectCenter(page, 102, 2)

	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.project_id
	}).toBe(2)
	await expect.poll(async () => (await previewTaskIds(page, 2)).includes(102)).toBe(true)
	await expect.poll(async () => {
		return page.evaluate(() => window.__vikunjaDragPerf?.history?.[0] || null)
	}).not.toBeNull()

	const trace = await page.evaluate(() => window.__vikunjaDragPerf?.history?.[0] || null)
	const phases = trace?.phases?.map(phase => phase.name) || []
	expect(trace?.kind).toBe('task')
	expect(phases).toContain('skip-full-refresh-for-visible-task-drop')
	expect(phases).toContain('first-destination-paint')
	expect(phases).not.toContain('refresh-current-collections-start')
	expect(phases.indexOf('first-destination-paint')).toBeGreaterThan(phases.indexOf('optimistic-set-end'))
	expect(phases.indexOf('async-resolved')).toBeGreaterThan(phases.indexOf('optimistic-set-end'))
})

test('project drag ignores task-edge preview targets', async ({page}) => {
	await openProject(page, 2, 'Work')
	await expect.poll(() => rootTaskIds(page)).toEqual([201, 202, 203])

	await dragProjectToTaskEdge(page, 3, 201, 'top')

	await expect.poll(async () => {
		const projects = await stack.mockApi('projects')
		return projects.find(project => project.id === 3)?.parent_project_id
	}).toBe(2)
	await expect.poll(() => rootTaskIds(page)).toEqual([201, 202, 203])
})

test('task drag ignores project-edge preview targets', async ({page}) => {
	await openProject(page, 2, 'Work')
	await expect.poll(() => rootTaskIds(page)).toEqual([201, 202, 203])

	await dragTaskToProjectEdge(page, 201, 3, 'top')

	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/201')
		return task.project_id
	}).toBe(2)
	await expect.poll(() => rootTaskIds(page)).toEqual([201, 202, 203])
})

test('keeps a collapsed parent task collapsed after a subtask drop', async ({page}) => {
	await openProject(page, 2, 'Work')
	await expect(page.locator('[data-action="toggle-task"][data-task-id="203"]')).toHaveText('▸')
	await expect(page.locator('[data-task-row-id="204"]')).toHaveCount(0)
	await expect(page.locator('[data-task-row-id="203"] .task-card-meta')).toContainText('1 subtask')

	await dragTaskToTaskCenter(page, 202, 203)

	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/202')
		return task.related_tasks.parenttask.map(entry => entry.id)
	}).toEqual([203])
	await expect(page.locator('[data-action="toggle-task"][data-task-id="203"]')).toHaveText('▸')
	await expect(page.locator('[data-task-row-id="204"]')).toHaveCount(0)
	await expect(page.locator('[data-task-row-id="202"]')).toHaveCount(0)
	await expect(page.locator('[data-task-row-id="203"] .task-card-meta')).toContainText('2 subtasks')
})

test('can make a task a subtask and promote a subtask back to root by drag', async ({page}) => {
	await openProject(page, 2, 'Work')
	await page.locator('[data-action="toggle-task"][data-task-id="203"]').click()
	await expect(page.locator('[data-task-row-id="204"]')).toBeVisible()

	await dragTaskToTaskCenter(page, 202, 203)

	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/202')
		return task.related_tasks.parenttask.map(entry => entry.id)
	}).toEqual([203])
	await expect(page.locator('[data-action="toggle-task"][data-task-id="203"]')).toHaveText('▾')
	await expect(page.locator('[data-task-branch-id="203"] .task-children-wrap [data-task-row-id="204"]')).toBeVisible()
	await expect(page.locator('[data-task-branch-id="203"] .task-children-wrap [data-task-row-id="202"]')).toBeVisible()

	await dragTaskToTaskEdge(page, 204, 201, 'top')

	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/204')
		return task.related_tasks.parenttask.length
	}).toBe(0)
	await expect.poll(async () => (await rootTaskIds(page)).includes(204)).toBe(true)
})

test('today branch promotion keeps the root task due date after nested moves', async ({page}) => {
	const parentTaskId = await createTodayTask('Today parent task')
	const childTaskId = await createTodayTask('Today child task')
	const targetTaskId = await createTodayTask('Today target task')

	await page.reload()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
	await expect(page.locator(`[data-task-branch-id="${parentTaskId}"] [data-task-due-date="true"]`)).toHaveCount(1)

	await dragTaskToTaskCenter(page, childTaskId, parentTaskId)
	await expect.poll(async () => {
		const task = await stack.mockApi(`tasks/${childTaskId}`)
		return task.related_tasks.parenttask.map(entry => entry.id)
	}).toEqual([parentTaskId])

	await dragTaskToTaskCenter(page, parentTaskId, targetTaskId)
	await expect.poll(async () => {
		const task = await stack.mockApi(`tasks/${parentTaskId}`)
		return task.related_tasks.parenttask.map(entry => entry.id)
	}).toEqual([targetTaskId])

	await page.locator(`[data-action="toggle-task"][data-task-id="${targetTaskId}"]`).click()
	await expect(page.locator(`[data-task-branch-id="${targetTaskId}"] .task-children-wrap [data-task-row-id="${parentTaskId}"]`)).toBeVisible()

	for (let attempt = 0; attempt < 2; attempt += 1) {
		await dragTaskToTaskEdge(page, parentTaskId, targetTaskId, 'top')
		try {
			await expect.poll(async () => {
				const task = await stack.mockApi(`tasks/${parentTaskId}`)
				return task.related_tasks.parenttask.length
			}, {timeout: 2500}).toBe(0)
			break
		} catch (error) {
			if (attempt === 1) {
				throw error
			}
		}
	}
	await expect.poll(async () => (await rootTaskIds(page)).includes(parentTaskId)).toBe(true)
	await expect(page.locator(`[data-task-branch-id="${parentTaskId}"] [data-task-due-date="true"]`)).toHaveCount(1)
})

test('today screen drag reorder preserves order after background refresh', async ({page}) => {
	const taskA = await createTodayTask('Today task A')
	const taskB = await createTodayTask('Today task B')
	const taskC = await createTodayTask('Today task C')

	await page.reload()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
	// Default today tasks (101, 102) appear first
	await expect.poll(() => rootTaskIds(page)).toEqual([101, 102, taskA, taskB, taskC])

	// Drag C above A — reorder to 101, 102, C, A, B
	await dragTaskToTaskEdge(page, taskC, taskA, 'top')
	await expect.poll(() => rootTaskIds(page)).toEqual([101, 102, taskC, taskA, taskB])

	// Wait for background refresh to complete and verify order is preserved
	await page.waitForTimeout(2000)
	await expect.poll(() => rootTaskIds(page)).toEqual([101, 102, taskC, taskA, taskB])
})

test('today branch promotion keeps the root task due date for UI-created tasks', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900})
	const stamp = Date.now()
	const parentTaskId = await createTodayTaskInUi(page, `UI parent ${stamp}`)
	const childTaskId = await createTodayTaskInUi(page, `UI child ${stamp}`)
	const targetTaskId = await createTodayTaskInUi(page, `UI target ${stamp}`)

	await expect(page.locator(`[data-task-branch-id="${parentTaskId}"] [data-task-due-date="true"]`)).toHaveCount(1)

	await dragTaskToTaskCenter(page, childTaskId, parentTaskId)
	await expect.poll(async () => {
		const task = await stack.mockApi(`tasks/${childTaskId}`)
		return task.related_tasks.parenttask.map(entry => entry.id)
	}).toEqual([parentTaskId])

	await dragTaskToTaskCenter(page, parentTaskId, targetTaskId)
	await expect.poll(async () => {
		const task = await stack.mockApi(`tasks/${parentTaskId}`)
		return task.related_tasks.parenttask.map(entry => entry.id)
	}).toEqual([targetTaskId])

	await page.locator(`[data-action="toggle-task"][data-task-id="${targetTaskId}"]`).click()
	await expect(page.locator(`[data-task-branch-id="${targetTaskId}"] .task-children-wrap [data-task-row-id="${parentTaskId}"]`)).toBeVisible()

	await dragTaskToTaskEdge(page, parentTaskId, targetTaskId, 'top')

	await expect.poll(async () => {
		const task = await stack.mockApi(`tasks/${parentTaskId}`)
		return task.related_tasks.parenttask.length
	}).toBe(0)
	await expect.poll(async () => (await rootTaskIds(page)).includes(parentTaskId)).toBe(true)
	await expect(page.locator(`[data-task-branch-id="${parentTaskId}"] [data-task-due-date="true"]`)).toHaveCount(1)
})

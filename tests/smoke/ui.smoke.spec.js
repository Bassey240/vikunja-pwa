import {test, expect} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

let stack

test.describe.configure({mode: 'serial'})

test.beforeAll(async () => {
	stack = await startTestStack()
})

test.afterAll(async () => {
	await stack.stop()
})

test.beforeEach(async ({page}) => {
	stack.reset()
	await page.goto(stack.appUrl)
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
})

async function openProjects(page) {
	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Projects'}).click()
	await expect(page.getByRole('heading', {name: 'Projects'})).toBeVisible()
}

async function openProject(page, projectId, projectTitle) {
	await openProjects(page)
	await page.locator(`.workspace-screen.is-active [data-action="select-project"][data-project-id="${projectId}"]`).click()
	await expect(page.getByRole('heading', {name: projectTitle})).toBeVisible()
}

async function applyTaskSort(page, sortBy, sortOrder = 'asc') {
	await page.locator('.workspace-screen.is-active .topbar [data-action="toggle-task-filters"]').click()
	await page.locator('[data-task-filter-field="sortBy"]').selectOption(sortBy)
	if (sortBy !== 'position') {
		await page.locator('[data-task-filter-field="sortOrder"]').selectOption(sortOrder)
	}
	await page.locator('[data-action="apply-task-filters"]').click()
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
	await page.waitForTimeout(350)
}

async function dragSeparator(page, label, deltaX) {
	const handle = page.getByRole('separator', {name: label})
	const box = await handle.boundingBox()
	if (!box) {
		throw new Error(`Missing separator: ${label}`)
	}

	const startX = box.x + box.width / 2
	const startY = box.y + box.height / 2
	await page.mouse.move(startX, startY)
	await page.mouse.down()
	await page.mouse.move(startX + deltaX, startY, {steps: 12})
	await page.mouse.up()
	await page.waitForTimeout(250)
}

async function dragProjectToProjectCenter(page, sourceProjectId, targetProjectId) {
	const handle = page.locator(`.workspace-screen.is-active [data-project-node-id="${sourceProjectId}"] > .project-node-row .project-drag-handle`)
	const target = page.locator(`.workspace-screen.is-active [data-project-node-id="${targetProjectId}"] > .project-node-row .project-drag-handle`)
	await dragHandleToPoint(page, handle, await getCenterPoint(target))
}

async function dragProjectToProjectEdge(page, sourceProjectId, targetProjectId, edge = 'top') {
	const handle = page.locator(`.workspace-screen.is-active [data-project-node-id="${sourceProjectId}"] > .project-node-row .project-drag-handle`)
	const target = page.locator(`.workspace-screen.is-active [data-project-node-id="${targetProjectId}"] .project-node-row`)
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
	const target = page.locator(`.workspace-screen.is-active [data-project-node-id="${targetProjectId}"] > .project-node-row`)
	await dragHandleToPoint(page, handle, await getCenterPoint(target))
}

async function dragTaskToSidebarProjectCenter(page, sourceTaskId, targetProjectId) {
	const handle = page.locator(`.workspace-screen.is-active [data-task-branch-id="${sourceTaskId}"] > .task-row .drag-handle`)
	const target = page.locator(`.wide-sidebar [data-project-node-id="${targetProjectId}"] > .wide-sidebar-project-row .wide-sidebar-project-link`)
	await dragHandleToPoint(page, handle, await getCenterPoint(target))
}

async function moveTaskToSidebarProject(page, sourceTaskId, targetProjectId) {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await dragTaskToSidebarProjectCenter(page, sourceTaskId, targetProjectId)
		try {
			await expect.poll(async () => {
				const task = await stack.api(`/api/tasks/${sourceTaskId}`)
				return task.task.project_id
			}, {timeout: 2500}).toBe(targetProjectId)
			return
		} catch (error) {
			if (attempt === 1) {
				throw error
			}
		}
	}
}

async function dragProjectToSidebarProjectCenter(page, sourceProjectId, targetProjectId) {
	const handle = page.locator(`.workspace-screen.is-active [data-project-node-id="${sourceProjectId}"] > .project-node-row .project-drag-handle`)
	const target = page.locator(`.wide-sidebar [data-project-node-id="${targetProjectId}"] > .wide-sidebar-project-row .wide-sidebar-project-link`)
	await dragHandleToPoint(page, handle, await getCenterPoint(target))
}

async function rootProjectIds(page) {
	return page.locator('.workspace-screen.is-active .screen-body > .project-node[data-project-node-id]').evaluateAll(nodes =>
		nodes
			.map(node => Number(node.dataset.projectNodeId || 0))
			.filter(projectId => projectId > 0),
	)
}

async function rootTaskIds(page) {
	return page.locator('.workspace-screen.is-active .task-tree > .task-branch > .task-row[data-task-row-id]').evaluateAll(rows =>
		rows.map(row => Number(row.dataset.taskRowId || 0)),
	)
}

test('boots into Today and exposes the bottom navigation shell', async ({page}) => {
	await expect(page.getByText('Buy milk')).toBeVisible()
	const primaryNav = page.getByRole('navigation', {name: 'Primary'})
	await expect(primaryNav).toBeVisible()
	await expect(primaryNav.getByRole('button', {name: 'Today'})).toBeVisible()
	await expect(primaryNav.getByRole('button', {name: 'Inbox'})).toBeVisible()
	await expect(primaryNav.getByRole('button', {name: 'Projects'})).toBeVisible()
})

test('projects search returns both project and task hits and can navigate into a result', async ({page}) => {
	await page.getByRole('button', {name: 'Projects'}).click()
	await expect(page.getByRole('heading', {name: 'Projects'})).toBeVisible()

	await page.locator('.workspace-screen.is-active .topbar [data-action="go-search"]').click()
	await page.locator('[data-search-input]').fill('travel')
	await page.getByRole('button', {name: 'Find'}).click()

	await expect(page.locator('[data-action="open-search-project-result"]')).toContainText('Travel')
	await expect(page.locator('[data-action="open-search-task-result"]')).toContainText('Book flights')

	await page.locator('[data-action="open-search-project-result"]').click()
	await expect(page.getByRole('heading', {name: 'Travel'})).toBeVisible()
	await expect(page.locator('[data-search-input]')).toHaveCount(0)
})

test('project filters can narrow the visible project tree by project name', async ({page}) => {
	await page.getByRole('button', {name: 'Projects'}).click()
	await page.locator('.workspace-screen.is-active .topbar [data-action="toggle-project-filters"]').click()
	await page.locator('[data-project-filter-field="title"]').fill('Work')
	await page.locator('[data-action="apply-project-filters"]').click()

	await expect(page.locator('[data-action="select-project"][data-project-id="2"]')).toContainText('Work')
	await expect(page.locator('[data-action="select-project"][data-project-id="1"]')).toHaveCount(0)
})

test('can reorder root projects by drag', async ({page}) => {
	await openProjects(page)
	await expect.poll(() => rootProjectIds(page)).toEqual([1, 2])

	await dragProjectToProjectEdge(page, 2, 1, 'top')

	await expect.poll(() => rootProjectIds(page)).toEqual([2, 1])
	await expect.poll(async () => {
		const projects = await stack.api('/api/projects')
		const work = projects.find(project => project.id === 2)
		const inbox = projects.find(project => project.id === 1)
		return Number(work.position) < Number(inbox.position)
	}).toBe(true)
})

test('can move a root project into another project', async ({page}) => {
	await openProjects(page)

	await dragProjectToProjectCenter(page, 2, 1)

	await expect.poll(async () => {
		const projects = await stack.api('/api/projects')
		return projects.find(project => project.id === 2)?.parent_project_id
	}).toBe(1)
	await expect(page.locator('.screen-body > .project-node[data-project-node-id="2"]')).toHaveCount(0)
})

test('can promote a subproject back to root by inserting between root projects', async ({page}) => {
	await openProjects(page)
	await page.locator('[data-action="toggle-project"][data-project-id="2"]').click()
	await expect(page.locator('[data-project-node-id="3"] .project-node-row')).toBeVisible()

	await dragProjectToProjectEdge(page, 3, 1, 'top')

	await expect.poll(async () => {
		const projects = await stack.api('/api/projects')
		return projects.find(project => project.id === 3)?.parent_project_id
	}).toBe(0)
	await expect.poll(async () => (await rootProjectIds(page)).includes(3)).toBe(true)
})

test('can reorder root tasks by drag', async ({page}) => {
	await openProject(page, 2, 'Work')
	await expect.poll(() => rootTaskIds(page)).toEqual([201, 202, 203])

	await dragTaskToTaskEdge(page, 203, 201, 'top')

	await expect.poll(() => rootTaskIds(page)).toEqual([203, 201, 202])
	await expect.poll(async () => {
		const result = await stack.api('/api/projects/2/tasks')
		const moved = result.find(task => task.id === 203)
		const formerFirst = result.find(task => task.id === 201)
		return Number(moved.position) < Number(formerFirst.position)
	}).toBe(true)
})

test('non-manual task sort changes visible order and blocks same-list reorder', async ({page}) => {
	await openProject(page, 2, 'Work')
	await applyTaskSort(page, 'title', 'asc')
	await expect.poll(() => rootTaskIds(page)).toEqual([202, 203, 201])

	await dragTaskToTaskEdge(page, 201, 202, 'top')

	await expect.poll(() => rootTaskIds(page)).toEqual([202, 203, 201])
	await expect.poll(async () => {
		const result = await stack.api('/api/projects/2/tasks')
		const rollout = result.find(task => task.id === 201)
		const coverage = result.find(task => task.id === 202)
		return Number(rollout?.position) < Number(coverage?.position)
	}).toBe(true)
})

test('can move a task into a child project by drag', async ({page}) => {
	test.fixme(true, 'Covered more reliably in react-dnd.react.smoke.spec.js; legacy shell project-preview center drops are flaky.')
	await openProject(page, 2, 'Work')

	await dragTaskToProjectCenter(page, 202, 3)

	await expect.poll(async () => {
		const task = await stack.api('/api/tasks/202')
		return task.task.project_id
	}).toBe(3)
	await expect(page.locator('[data-task-row-id="202"]')).toHaveCount(0)
})

test('non-manual task sort still allows moving a task into another project', async ({page}) => {
	test.fixme(true, 'Covered more reliably in react-dnd.react.smoke.spec.js; legacy shell project-preview center drops are flaky.')
	await openProject(page, 2, 'Work')
	await applyTaskSort(page, 'title', 'asc')
	await expect.poll(() => rootTaskIds(page)).toEqual([202, 203, 201])

	await dragTaskToProjectCenter(page, 202, 3)

	await expect.poll(async () => {
		const task = await stack.api('/api/tasks/202')
		return task.task.project_id
	}).toBe(3)
	await expect(page.locator('[data-task-row-id="202"]')).toHaveCount(0)
})

test('can make a task a subtask by dropping onto a parent row', async ({page}) => {
	await openProject(page, 2, 'Work')
	await page.locator('[data-action="toggle-task"][data-task-id="203"]').click()
	await expect(page.locator('[data-task-row-id="204"]')).toBeVisible()

	await dragTaskToTaskCenter(page, 202, 203)

	await expect.poll(async () => {
		const task = await stack.api('/api/tasks/202')
		return task.task.related_tasks.parenttask.map(entry => entry.id)
	}).toEqual([203])
	await expect(page.locator('[data-task-branch-id="203"] .task-children-wrap [data-task-row-id="202"]')).toBeVisible()
})

test('non-manual task sort still allows making a task a subtask', async ({page}) => {
	await openProject(page, 2, 'Work')
	await page.locator('[data-action="toggle-task"][data-task-id="203"]').click()
	await expect(page.locator('[data-task-row-id="204"]')).toBeVisible()
	await applyTaskSort(page, 'title', 'asc')
	await expect.poll(() => rootTaskIds(page)).toEqual([202, 203, 201])

	await dragTaskToTaskCenter(page, 202, 203)

	await expect.poll(async () => {
		const task = await stack.api('/api/tasks/202')
		return task.task.related_tasks.parenttask.map(entry => entry.id)
	}).toEqual([203])
	await expect(page.locator('[data-task-branch-id="203"] .task-children-wrap [data-task-row-id="202"]')).toBeVisible()
})

test('can promote a subtask back to root by inserting between root tasks', async ({page}) => {
	await openProject(page, 2, 'Work')
	await page.locator('[data-action="toggle-task"][data-task-id="203"]').click()
	await expect(page.locator('[data-task-row-id="204"]')).toBeVisible()

	await dragTaskToTaskEdge(page, 204, 201, 'top')

	await expect.poll(async () => {
		const task = await stack.api('/api/tasks/204')
		return task.task.related_tasks.parenttask.length
	}).toBe(0)
	await expect.poll(async () => (await rootTaskIds(page)).includes(204)).toBe(true)
})

test('wide shell stays active at tablet landscape width and falls back below the breakpoint', async ({page}) => {
	await page.setViewportSize({width: 1024, height: 900})
	await expect(page.locator('.shell-wide')).toBeVisible()
	await expect(page.locator('.wide-sidebar')).toBeVisible()
	await expect(page.locator('.bottom-nav-wrap')).toHaveCount(0)

	await page.setViewportSize({width: 900, height: 900})
	await expect(page.locator('.shell-wide')).toHaveCount(0)
	await expect(page.locator('.bottom-nav-wrap')).toBeVisible()
})

test('desktop shell persists pane resize and collapse state', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900})
	await expect(page.locator('.shell-wide')).toBeVisible()

	const sidebar = page.locator('.wide-sidebar')
	const initialSidebarWidth = (await sidebar.boundingBox())?.width || 0
	await dragSeparator(page, 'Resize sidebar', 72)
	await expect
		.poll(async () => Math.round((await sidebar.boundingBox())?.width || 0))
		.toBeGreaterThan(Math.round(initialSidebarWidth + 40))

	const storedSidebarWidth = await page.evaluate(() => window.localStorage.getItem('vikunja-mobile-poc:wide-sidebar-width'))
	expect(Number(storedSidebarWidth)).toBeGreaterThan(320)

	await page.getByRole('button', {name: 'Collapse sidebar'}).click()
	await expect(page.locator('.shell.has-collapsed-sidebar')).toBeVisible()
	await page.reload()

	await expect(page.locator('.shell.has-collapsed-sidebar')).toBeVisible()
	await expect(page.getByRole('button', {name: 'Expand sidebar'})).toBeVisible()
	await expect
		.poll(() => page.evaluate(() => window.localStorage.getItem('vikunja-mobile-poc:wide-sidebar-collapsed')))
		.toBe('1')
})

test('wide inspector opens for project and task selection and releases on menu navigation', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900})
	await openProjects(page)

	await page.locator('[data-action="select-project"][data-project-id="2"]').click()
	await expect(page.locator('.shell-inspector-region')).toContainText('Project Detail')

	await page.locator('[data-action="open-task-focus"][data-task-id="201"]').click()
	await expect(page.locator('.shell-inspector-region')).toContainText('Task Detail')

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Today'}).click()
	await expect(page.locator('.shell-inspector-empty-state')).toContainText('Select a task or project to see details')
})

test('narrow desktop inspector wraps comment reactions without horizontal overflow', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900})
	await page.evaluate(() => {
		window.localStorage.setItem('vikunja-mobile-poc:wide-inspector-width', '296')
	})
	await page.reload()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()

	await openProject(page, 2, 'Work')
	await page.locator('[data-action="open-task-focus"][data-task-id="201"]').click()
	await expect(page.locator('.shell-inspector-region')).toContainText('Task Detail')
	await page.locator('.shell-inspector-region [data-detail-section-toggle="comments"]').click()
	await page.locator('.shell-inspector-region [data-action="toggle-comment-reaction-picker"][data-task-comment-id="1"]').click()

	const commentRow = page.locator('.shell-inspector-region [data-task-comment="1"]')
	await expect(commentRow).toBeVisible()
	await expect
		.poll(() =>
			commentRow.evaluate(element => {
				const rowFits = element.scrollWidth <= element.clientWidth + 1
				const actions = Array.from(element.querySelectorAll('.detail-inline-actions'))
				const actionsFit = actions.every(action => action.scrollWidth <= action.clientWidth + 1)
				return rowFits && actionsFit
			}),
		)
		.toBe(true)
})

test('desktop add flows stay inline in the active pane', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900})

	await page.locator('.workspace-screen.is-active .topbar-primary-pill[data-action="open-root-composer"]').click()
	await expect(page.locator('.workspace-screen.is-active [data-form="root-task-inline"]')).toBeVisible()

	await openProjects(page)
	await page.locator('.workspace-screen.is-active [data-action="open-projects-menu"]').click()
	await page.getByRole('button', {name: 'Add project'}).click()
	await expect(page.locator('.workspace-screen.is-active [data-form="project-inline"]')).toBeVisible()

	await page.locator('.wide-sidebar-projects-menu-button').click()
	await page.getByRole('button', {name: 'Add project'}).click()
	await expect(page.locator('.wide-sidebar [data-form="project-inline"]')).toBeVisible()

	await page.locator('[data-project-node-id="2"] [data-action="toggle-project-menu"]').click()
	await page.locator('[data-menu-root="true"] .menu-item', {hasText: 'Add task'}).click()
	await expect(page.locator('[data-project-node-id="2"] [data-form="root-task-inline"]')).toBeVisible()
})

test('project menu add task opens the mobile task sheet on narrow layouts', async ({page}) => {
	await page.setViewportSize({width: 430, height: 932})

	await openProject(page, 2, 'Work')
	await page.locator('.workspace-screen.is-active [data-action="open-project-tasks-menu"]').click()
	await page.locator('[data-menu-root="true"] .menu-item', {hasText: 'Add task'}).click()

	await expect(page.locator('.composer-backdrop .composer-sheet')).toBeVisible()
	await expect(page.locator('.composer-backdrop [data-form="root-task"]')).toBeVisible()
})

test('desktop shell accepts task drops onto sidebar projects', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900})

	await openProject(page, 2, 'Work')
	await moveTaskToSidebarProject(page, 202, 1)
	await expect(page.locator('.workspace-screen.is-active [data-task-row-id="202"]')).toHaveCount(0)
	await page.waitForTimeout(700)
	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Inbox'}).click()
	await expect(page.locator('.workspace-screen.is-active [data-task-row-id="202"]')).toHaveCount(1)
	await page.locator('.workspace-screen.is-active [data-task-branch-id="202"] [data-action="toggle-task-menu"]').click()
	await expect(page.locator('[data-menu-root="true"] .menu-item', {hasText: 'Duplicate'})).toBeVisible()
})

test('desktop shell accepts project drops onto sidebar projects', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900})

	await openProjects(page)
	await dragProjectToSidebarProjectCenter(page, 2, 1)

	await expect.poll(async () => {
		const projects = await stack.api('/api/projects')
		return projects.find(project => project.id === 2)?.parent_project_id
	}).toBe(1)
	await expect(page.locator('.workspace-screen.is-active .screen-body > [data-project-node-id="2"]')).toHaveCount(0)
})

test('desktop sidebar project drops block parent tasks with subtasks across projects', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900})
	await openProject(page, 2, 'Work')
	await page.locator('.workspace-screen.is-active [data-action="toggle-task"][data-task-id="203"]').click()
	await expect(page.locator('.workspace-screen.is-active [data-task-row-id="204"]')).toBeVisible()

	await dragTaskToSidebarProjectCenter(page, 203, 1)

	await expect.poll(async () => {
		const task = await stack.api('/api/tasks/203')
		return task.task.project_id
	}).toBe(2)
	await expect(page.locator('.workspace-screen.is-active [data-task-row-id="203"]')).toHaveCount(1)
	if (!(await page.locator('.workspace-screen.is-active [data-task-row-id="204"]').isVisible())) {
		await page.locator('.workspace-screen.is-active [data-action="toggle-task"][data-task-id="203"]').click()
	}
	await expect(page.locator('.workspace-screen.is-active [data-task-row-id="204"]')).toBeVisible()
	await page.waitForTimeout(700)
	await page.locator('.workspace-screen.is-active [data-task-branch-id="203"] > .task-row [data-action="open-task-focus"]').click()
	await expect(page.locator('.shell-inspector-region')).toContainText('Task Detail')
})

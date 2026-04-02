import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'
import {getOfflineMutations, getOfflineSnapshot} from '../helpers/offline-storage.mjs'

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
	await page.locator('[data-action="set-account-auth-mode"][data-auth-mode="apiToken"]').click()
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="apiToken"]').fill('smoke-token')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
})

async function createMockLinkShare(projectId, {name = 'Smoke link', password = '', permission = 1, ...rest} = {}) {
	return stack.mockApi(`projects/${projectId}/shares`, {
		method: 'PUT',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			name,
			password,
			permission,
			...rest,
		}),
	})
}

async function openProjects(page) {
	await page.goto(`${stack.appUrl}/projects`)
	await expect
		.poll(async () => page.evaluate(() => window.location.pathname))
		.toBe('/projects')
	await expect(page.getByRole('heading', {name: 'Projects'})).toBeVisible()
}

async function openScreenMenu(page) {
	await page.locator('.topbar [data-action="open-projects-menu"]').click()
	await expect(page.locator('[data-menu-root="true"]')).toBeVisible()
}

test('projects screen renders hierarchy and project detail saves edits', async ({page}) => {
	await openProjects(page)

	const workNode = page.locator('[data-project-node-id="2"]')
	await expect(workNode.locator('.project-card-meta')).toContainText('1 project')
	await expect(workNode.locator('.project-card-meta')).toContainText('5 tasks')

	await workNode.locator('[data-action="toggle-project"]').click()
	await expect(workNode).toContainText('Travel')
	await expect(workNode).toContainText('Smoke suite rollout')

	const travelNode = workNode.locator('[data-project-node-id="3"]')
	await travelNode.locator('[data-action="toggle-project-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="edit-project"][data-project-id="3"]').click()
	await expect(page.locator('[data-project-detail-title]')).toHaveValue('Travel')

	const titleInput = page.locator('[data-project-detail-title]')
	await titleInput.fill('Travel Plans')
	await titleInput.blur()
	await expect(page.locator('.panel-title').filter({hasText: 'Travel Plans'})).toBeVisible()

	const identifierInput = page.locator('[data-project-detail-identifier]')
	await identifierInput.fill('TRIP')
	await identifierInput.blur()
	await expect(page.locator('[data-project-detail-identifier]')).toHaveValue('TRIP')

	const descriptionInput = page.locator('[data-project-detail-description]')
	await descriptionInput.fill('Vacation planning board')
	await descriptionInput.blur()
	await expect(page.locator('[data-project-detail-description]')).toHaveValue('Vacation planning board')

	await page.locator('[data-project-detail-color]').fill('#123456')
	await expect(page.locator('[data-project-detail-color]')).toHaveValue('#123456')

	await page.locator('[data-action="toggle-project-favorite"]').click()
	await expect.poll(async () => {
		const projects = await stack.mockApi('projects')
		return projects.find(project => project.id === 3)?.is_favorite
	}).toBe(true)

	await page.locator('[data-project-detail-parent]').selectOption('0')
	await page.locator('.workspace-screen.is-active .topbar [data-action="close-detail-overlay"]').click()
	await expect(page.locator('.screen-body > .project-node').filter({hasText: 'Travel Plans'})).toHaveCount(1)
})

test('project composer creates projects and project menu duplicate move-root and delete work', async ({page}) => {
	await openProjects(page)

	await page.getByRole('button', {name: 'Add'}).click()
	await expect(page.locator('[data-form="root-task"]')).toBeVisible()
	await page.locator('[data-action="close-root-composer"]').click({position: {x: 12, y: 12}})
	await expect(page.locator('[data-form="root-task"]')).toHaveCount(0)
	await openScreenMenu(page)
	await page.locator('[data-menu-root="true"] [data-action="open-project-composer"]').click()
	await expect(page.locator('[data-form="project"]')).toBeVisible()
	await page.locator('[data-action="close-project-composer-button"]').click()

	await openScreenMenu(page)
	await page.locator('[data-menu-root="true"] [data-action="open-project-composer"]').click()
	await expect(page.locator('[data-form="project"] [data-project-input]')).toBeVisible()
	await page.locator('[data-project-input]').fill('Phase 6 Root')
	await page.locator('[data-form="project"]').getByRole('button', {name: 'Add'}).click()
	await expect(page.locator('.screen-body > .project-node').filter({hasText: 'Phase 6 Root'})).toHaveCount(1)
	await page.locator('[data-action="close-project-composer-button"]').click()

	const workNode = page.locator('[data-project-node-id="2"]')
	await workNode.locator('[data-action="toggle-project-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="open-project-composer"][data-parent-project-id="2"]').click()
	await page.locator('[data-project-input]').fill('Phase 6 Child')
	await page.locator('[data-form="project"]').getByRole('button', {name: 'Add'}).click()
	await page.locator('[data-action="close-project-composer-button"]').click()

	await workNode.locator('[data-action="toggle-project"]').click()
	const childNode = workNode.locator('.project-preview .project-node').filter({hasText: 'Phase 6 Child'})
	await expect(childNode).toHaveCount(1)

	await childNode.locator('[data-action="toggle-project-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="duplicate-project"]').click()
	const childCopyNode = workNode.locator('.project-preview .project-node').filter({hasText: 'Phase 6 Child (Copy)'})
	await expect(childCopyNode).toHaveCount(1)
	const childCopyId = await childCopyNode.getAttribute('data-project-node-id')

	await childCopyNode.locator('[data-action="toggle-project-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="move-project-to-root"]').click()
	const rootCopyNode = page.locator(`.screen-body > .project-node[data-project-node-id="${childCopyId}"]`)
	await expect(rootCopyNode).toHaveCount(1)

	page.once('dialog', dialog => dialog.accept())
	await rootCopyNode.locator('[data-action="toggle-project-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="delete-project"]').evaluate(element => element.click())
	await expect(page.locator(`.screen-body > .project-node[data-project-node-id="${childCopyId}"]`)).toHaveCount(0)
})

test('project delete can be undone before the deferred commit runs', async ({page}) => {
	await openProjects(page)

	await openScreenMenu(page)
	await page.locator('[data-menu-root="true"] [data-action="open-project-composer"]').click()
	await page.locator('[data-project-input]').fill('Undo Project')
	await page.locator('[data-form="project"]').getByRole('button', {name: 'Add'}).click()
	await page.locator('[data-action="close-project-composer-button"]').click()

	const projectNode = page.locator('.screen-body > .project-node').filter({hasText: 'Undo Project'})
	await expect(projectNode).toHaveCount(1)

	page.once('dialog', dialog => dialog.accept())
	await projectNode.locator('[data-action="toggle-project-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="delete-project"]').evaluate(element => element.click())

	await expect(page.locator('.screen-body > .project-node').filter({hasText: 'Undo Project'})).toHaveCount(0)
	await expect(page.locator('.task-completion-toast')).toContainText('Project deleted')
	await page.locator('.task-completion-toast .ghost-button').filter({hasText: 'Undo'}).click()
	await expect(page.locator('.task-completion-toast')).toHaveCount(0)
	await expect(page.locator('.screen-body > .project-node').filter({hasText: 'Undo Project'})).toHaveCount(1)
})

test('project detail manages direct shares team shares and link shares', async ({page}) => {
	await openProjects(page)
	await expect(page.locator('.workspace-screen.is-active .screen-body')).toBeVisible()

	const workNode = page.locator('[data-project-node-id="2"]')
	await workNode.locator('[data-action="toggle-project-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="share-project"][data-project-id="2"]').click()
	await expect(page.getByText('Shared Users')).toBeVisible()
	await expect(page.locator('.detail-label').filter({hasText: 'Link Shares'})).toBeVisible()
	await expect(page.locator('[data-action="toggle-project-subscription"]')).toHaveText('Subscribe')
	await page.locator('[data-action="toggle-project-subscription"]').click()
	await expect(page.locator('[data-action="toggle-project-subscription"]')).toHaveText('Subscribed')
	await expect.poll(async () => {
		const project = await stack.mockApi('projects/2')
		return project.subscription?.subscribed ?? null
	}).toBe(true)
	await page.locator('[data-detail-section-toggle="sharedUsers"]').click()
	await expect(page.locator('[data-detail-section-toggle="sharedUsers"]')).toHaveAttribute('aria-expanded', 'true')
	await expect(page.locator('[data-detail-section-toggle="project"]')).toHaveAttribute('aria-expanded', 'false')
	await page.locator('input[placeholder="Search users"]').fill('jamie')
	const jamieResult = page.locator('.detail-assignee-search-result').filter({hasText: 'Jamie Rivers'})
	await expect(jamieResult).toBeVisible()
	await expect(jamieResult.locator('img.user-avatar')).toHaveCount(1)
	await jamieResult.click()
	await expect(page.locator('.project-share-row').filter({hasText: 'Jamie Rivers'})).toBeVisible()
	await expect(page.locator('.project-share-row').filter({hasText: 'Jamie Rivers'}).locator('img.user-avatar')).toHaveCount(1)
	await expect.poll(async () => {
		const shares = await stack.mockApi('projects/2/users')
		return shares.some(user => user.username === 'jamie')
	}).toBe(true)

	await page.locator('[data-detail-section-toggle="sharedTeams"]').click()
	await expect(page.locator('[data-detail-section-toggle="sharedTeams"]')).toHaveAttribute('aria-expanded', 'true')
	await expect(page.locator('[data-detail-section-toggle="sharedUsers"]')).toHaveAttribute('aria-expanded', 'false')
	await page.locator('input[placeholder="Search teams"]').fill('Home')
	const homeTeamResult = page.locator('.detail-assignee-search-result').filter({hasText: 'Home Team'})
	await expect(homeTeamResult).toBeVisible()
	await homeTeamResult.click()
	await expect(page.locator('.project-share-row').filter({hasText: 'Home Team'})).toBeVisible()
	await expect.poll(async () => {
		const shares = await stack.mockApi('projects/2/teams')
		return shares.some(team => team.id === 1)
	}).toBe(true)

	await page.locator('[data-detail-section-toggle="linkShares"]').click()
	await expect(page.locator('[data-detail-section-toggle="linkShares"]')).toHaveAttribute('aria-expanded', 'true')
	await expect(page.locator('[data-detail-section-toggle="sharedTeams"]')).toHaveAttribute('aria-expanded', 'false')
	await page.locator('[data-project-link-share-name]').fill('Groceries link')
	await page.locator('[data-action="create-project-link-share"]').click()
	const createdShareRow = page.locator('[data-project-link-share-row]').filter({hasText: 'Groceries link'})
	await expect(createdShareRow).toBeVisible()
	await expect(createdShareRow.locator('[data-action="copy-project-link-share-summary"]')).toBeVisible()
	await expect.poll(async () => {
		const shares = await stack.mockApi('projects/2/shares')
		return shares.some(share => share.name === 'Groceries link')
	}).toBe(true)
	await createdShareRow.locator('[data-action="toggle-project-link-share"]').click()
	await expect(createdShareRow.locator('[data-project-link-share-detail]')).toContainText('Groceries link')
	await expect(page.getByText('The project share does not exist.')).toHaveCount(0)
})

test('project link share inline details show password protection and expiry metadata', async ({page}) => {
	await createMockLinkShare(2, {
		name: 'Protected detail link',
		password: 'secret123',
		expires: '2026-06-01T12:00:00Z',
	})

	await openProjects(page)
	const workNode = page.locator('[data-project-node-id="2"]')
	await workNode.locator('[data-action="toggle-project-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="share-project"][data-project-id="2"]').click()
	await page.locator('[data-detail-section-toggle="linkShares"]').click()

	const shareRow = page.locator('[data-project-link-share-row]').filter({hasText: 'Protected detail link'})
	await expect(shareRow).toBeVisible()
	await shareRow.locator('[data-action="toggle-project-link-share"]').click()

	const detailSheet = shareRow.locator('[data-project-link-share-detail]')
	await expect(detailSheet).toBeVisible()
	await expect(detailSheet).toContainText('Password protected')
	await expect(detailSheet).toContainText('Yes')
	await expect(detailSheet).not.toContainText('Never')
	await expect(detailSheet).toContainText('Hash')

	await page.locator('[data-detail-section-toggle="linkShares"]').click()
	await expect(page.locator('[data-project-link-share-detail]')).toHaveCount(0)
	await page.locator('[data-detail-section-toggle="linkShares"]').click()
	await expect(page.locator('[data-project-link-share-detail]')).toHaveCount(0)
})

test('gantt renders dependency arrows and drag release does not open task focus', async ({page}) => {
	await page.setViewportSize({width: 1440, height: 900})
	await openProjects(page)

	const workNode = page.locator('[data-project-node-id="2"]')
	await workNode.locator('[data-action="select-project"][data-project-id="2"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()

	await page.locator('[data-action="toggle-project-view-menu"]').click()
	await page.locator('[data-action="select-project-view"][data-view-id="17"]').click()

	const ganttBar = page.locator('[data-gantt-task-id="201"]').first()
	await expect(ganttBar).toBeVisible()
	await expect(page.locator('.project-gantt-dependency-path')).toHaveCount(1)
	await expect(ganttBar.locator('.gantt-bar-label-chip')).toHaveCount(1)
	await expect(ganttBar.locator('.gantt-bar-avatars .user-avatar')).toHaveCount(1)

	await ganttBar.click({position: {x: 32, y: 16}})
	await expect(page.locator('[data-detail-title]')).toBeVisible()
	await expect(page.locator('.task-focus-shell')).toHaveCount(0)

	await ganttBar.locator('[data-action="toggle-gantt-task-menu"]').click()
	await page.locator('[data-action="open-gantt-task-focus"][data-task-id="201"]').click()
	await expect(page.locator('.task-focus-summary-title').filter({hasText: 'Smoke suite rollout'})).toBeVisible()
	await page.locator('[data-action="close-focused-task"]').click()
	await expect(page.locator('.task-focus-summary-title').filter({hasText: 'Smoke suite rollout'})).toHaveCount(0)

	const barBox = await ganttBar.boundingBox()
	expect(barBox).not.toBeNull()
	await page.mouse.move((barBox?.x || 0) + (barBox?.width || 0) - 6, (barBox?.y || 0) + (barBox?.height || 0) / 2)
	await page.mouse.down()
	await page.mouse.move((barBox?.x || 0) + (barBox?.width || 0) + 50, (barBox?.y || 0) + (barBox?.height || 0) / 2, {steps: 8})
	await page.mouse.up()

	await expect(page.locator('.task-focus-shell')).toHaveCount(0)
	await expect(page.locator('[data-gantt-task-id="201"]')).toBeVisible()
})

test('switching projects closes out-of-scope focused tasks without crashing the app shell', async ({page}) => {
	const pageErrors = []
	page.on('pageerror', error => {
		pageErrors.push(error.message)
	})

	await openProjects(page)
	const workNode = page.locator('[data-project-node-id="2"]')
	await workNode.locator('[data-action="select-project"][data-project-id="2"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()

	await page.locator('.task-row').filter({hasText: 'Smoke suite rollout'}).locator('[data-action="open-task-focus"]').click()
	await expect(page.locator('.task-focus-summary-title').filter({hasText: 'Smoke suite rollout'})).toBeVisible()

	await page.goto(`${stack.appUrl}/projects/3`)
	await expect(page.getByRole('heading', {name: 'Travel'})).toBeVisible()
	await expect(page.locator('.task-focus-summary-title').filter({hasText: 'Smoke suite rollout'})).toHaveCount(0)
	expect(pageErrors).toEqual([])
})

test('search project results expose the share menu entry point', async ({page}) => {
	await openProjects(page)
	await expect(page.locator('.workspace-screen.is-active .screen-body')).toBeVisible()
	await page.locator('[data-action="go-search"]').click()
	await expect(page.locator('[data-search-input]')).toBeVisible()

	await page.locator('[data-search-input]').fill('Work')
	await page.locator('[data-search-input]').press('Enter')
	const resultMenuButton = page.locator('.search-result-card-project [data-action="toggle-project-menu"][data-project-id="2"]')
	await expect(resultMenuButton).toBeVisible()
	await resultMenuButton.click()
	await page.locator('[data-menu-root="true"]').last().locator('[data-action="share-project"][data-project-id="2"]').click()
	await expect(page.getByText('Shared Users')).toBeVisible()
})

test('offline project navigation reuses cached project tasks without surfacing generic load failures', async ({page}) => {
	await openProjects(page)
	const workNode = page.locator('[data-project-node-id="2"]')
	await expect(workNode).toBeVisible()
	await workNode.locator('[data-action="select-project"][data-project-id="2"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()
	await expect(page.getByText('Smoke suite rollout')).toBeVisible()

	await page.context().setOffline(true)
	await page.getByRole('button', {name: 'Today'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
	await expect(page.locator('.topbar-runtime-status-banner').first()).toContainText('saved locally and will sync')

	await openProjects(page)
	await expect(workNode).toBeVisible()
	await workNode.locator('[data-action="select-project"][data-project-id="2"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()
	await expect(page.getByText('Smoke suite rollout')).toBeVisible()
	await expect(page.getByText('Load failed')).toHaveCount(0)
})

test('offline project navigation can open an unvisited project from the global cache', async ({page}) => {
	await openProjects(page)
	await expect(page.locator('.workspace-screen.is-active .screen-body')).toBeVisible()
	await expect
		.poll(async () => Boolean((await getOfflineSnapshot(page))?.projectFilterTasksLoaded))
		.toBe(true)

	await page.context().setOffline(true)
	await page.evaluate(() => {
		window.history.pushState({}, '', '/projects/3')
		window.dispatchEvent(new PopStateEvent('popstate'))
	})
	await expect(page.getByRole('heading', {name: 'Travel'})).toBeVisible()
	await expect(page.getByText('Book flights')).toBeVisible()
	await expect(page.getByText('This project is not cached for offline viewing yet.')).toHaveCount(0)
	await expect(page.getByText('Load failed')).toHaveCount(0)
})

test('project focus keeps completed preview subtasks visible after optimistic completion', async ({page}) => {
	await openProjects(page)

	const workNode = page.locator('[data-project-node-id="2"]')
	await workNode.locator('[data-action="toggle-project"]').click()
	await expect(workNode.locator('[data-task-row-id="203"]')).toBeVisible()

	const parentTaskRow = workNode.locator('[data-task-row-id="203"]')
	await parentTaskRow.locator('[data-action="toggle-task"]').click()
	const childTaskRow = workNode.locator('[data-task-row-id="204"]')
	await expect(childTaskRow).toBeVisible()

	await childTaskRow.locator('[data-action="toggle-done"]').click()
	await expect(childTaskRow).toContainText('Verify nested task rendering')

	await parentTaskRow.locator('[data-action="open-task-focus"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()
	await expect(page.locator('.task-focus-summary-title').filter({hasText: 'Release checklist'})).toBeVisible()
	const focusChildTaskRow = page.locator('.task-focus-tree [data-task-row-id="204"]')
	await expect(focusChildTaskRow).toContainText('Verify nested task rendering')

	await focusChildTaskRow.locator('[data-action="toggle-done"]').click()
	await expect(focusChildTaskRow.locator('[data-action="toggle-done"]')).toHaveAttribute('aria-checked', 'false')
	await page.waitForTimeout(900)
	await expect(focusChildTaskRow).toContainText('Verify nested task rendering')
	await expect(focusChildTaskRow.locator('[data-action="toggle-done"]')).toHaveAttribute('aria-checked', 'false')
})

test('offline task completion queues locally and replays after reconnect', async ({page}) => {
	await openProjects(page)
	const workNode = page.locator('[data-project-node-id="2"]')
	await workNode.locator('[data-action="select-project"][data-project-id="2"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()
	const taskRow = page.locator('[data-task-row-id]').filter({hasText: 'Smoke suite rollout'}).first()
	await expect(taskRow).toBeVisible()

	await page.context().setOffline(true)
	await taskRow.locator('[data-action="toggle-done"]').click()
	await expect(taskRow).toHaveCount(0)
	await expect(page.locator('.topbar .offline-queue-badge').first()).toHaveText('1')
	await expect
		.poll(async () => {
			const mutations = await getOfflineMutations(page)
			return mutations.length === 1 ? mutations[0]?.metadata?.description || '' : ''
		})
		.toBe('Complete "Smoke suite rollout"')

	await page.context().setOffline(false)
	await page.evaluate(() => {
		window.dispatchEvent(new Event('online'))
	})
	await expect(page.locator('.topbar .offline-queue-badge')).toHaveCount(0, {timeout: 10_000})
	await expect.poll(async () => (await getOfflineMutations(page)).length).toBe(0)
	await expect
		.poll(async () => {
			const task = await stack.mockApi('tasks/201')
			return Boolean(task.done || task.done_at)
		})
		.toBe(true)
	await expect(page.getByText('Load failed')).toHaveCount(0)
})

test('shared link shell keeps header compact after filters and switches views from anchored menu', async ({page}) => {
	const share = await createMockLinkShare(2, {name: 'Public desktop link'})

	await page.context().clearCookies()
	await page.setViewportSize({width: 1440, height: 1080})
	await page.goto(`${stack.appUrl}/share/${share.hash}/auth`)

	await expect(page.locator('.shared-project-shell')).toBeVisible()
	await expect(page.locator('.shared-project-title')).toHaveText('Work')

	const header = page.locator('.shared-project-header-card')
	const filtersButton = page.getByRole('button', {name: 'Filters'})
	const viewButton = page.getByRole('button', {name: 'View: list'})
	const initialHeaderBox = await header.boundingBox()
	expect(initialHeaderBox).not.toBeNull()

	await filtersButton.click()
	const filterPanel = page.locator('.shared-project-filter-panel')
	await expect(filterPanel).toBeVisible()
	const filterPanelBox = await filterPanel.boundingBox()
	expect(filterPanelBox).not.toBeNull()
	expect(filterPanelBox.y).toBeGreaterThan((initialHeaderBox?.y || 0) + (initialHeaderBox?.height || 0) - 1)

	await page.locator('[data-action="reset-task-filter-draft"]').click()
	await filtersButton.click()
	await expect(filterPanel).toHaveCount(0)

	const finalHeaderBox = await header.boundingBox()
	expect(finalHeaderBox).not.toBeNull()
	expect(Math.abs((finalHeaderBox?.height || 0) - (initialHeaderBox?.height || 0))).toBeLessThanOrEqual(6)

	await viewButton.click()
	const viewMenu = page.locator('.shared-project-view-menu')
	await expect(viewMenu).toBeVisible()
	const viewButtonBox = await viewButton.boundingBox()
	const viewMenuBox = await viewMenu.boundingBox()
	expect(viewButtonBox).not.toBeNull()
	expect(viewMenuBox).not.toBeNull()
	expect(viewMenuBox.y).toBeGreaterThanOrEqual((viewButtonBox?.y || 0) + (viewButtonBox?.height || 0) - 1)
	expect(Math.abs(((viewMenuBox?.x || 0) + (viewMenuBox?.width || 0)) - ((viewButtonBox?.x || 0) + (viewButtonBox?.width || 0)))).toBeLessThanOrEqual(20)

	await viewMenu.getByRole('button', {name: 'Board'}).click()
	await expect(page.getByRole('button', {name: 'View: kanban'})).toBeVisible()
	await expect(page.locator('.kanban-lane-head').first()).toBeVisible()
})

test('password-protected shared link asks for a password and opens after correct authentication', async ({page}) => {
	const share = await createMockLinkShare(2, {name: 'Protected link', password: 'secret123'})

	await page.context().clearCookies()
	await page.goto(`${stack.appUrl}/share/${share.hash}/auth`)

	await expect(page.getByText('This shared project requires a password.')).toBeVisible()
	await page.locator('input[type="password"]').fill('wrong-secret')
	await page.getByRole('button', {name: 'Open shared project'}).click()
	await expect(page.getByText('Invalid password.')).toBeVisible()

	await page.locator('input[type="password"]').fill('secret123')
	await page.getByRole('button', {name: 'Open shared project'}).click()
	await expect(page.locator('.shared-project-shell')).toBeVisible()
	await expect(page.locator('.shared-project-title')).toHaveText('Work')
})

test('shared link mobile view menu stays inside the viewport and kanban content aligns with the header width', async ({page}) => {
	const share = await createMockLinkShare(2, {name: 'Mobile link'})

	await page.context().clearCookies()
	await page.setViewportSize({width: 390, height: 844})
	await page.goto(`${stack.appUrl}/share/${share.hash}/auth`)

	await expect(page.locator('.shared-project-shell')).toBeVisible()
	const viewButton = page.getByRole('button', {name: 'View: list'})
	await viewButton.click()
	const viewMenu = page.locator('.shared-project-view-menu')
	await expect(viewMenu).toBeVisible()

	const viewButtonBox = await viewButton.boundingBox()
	const viewMenuBox = await viewMenu.boundingBox()
	expect(viewButtonBox).not.toBeNull()
	expect(viewMenuBox).not.toBeNull()
	expect(viewMenuBox.x).toBeGreaterThanOrEqual(0)
	expect((viewMenuBox?.x || 0) + (viewMenuBox?.width || 0)).toBeLessThanOrEqual(390)
	expect(viewMenuBox.y).toBeGreaterThanOrEqual((viewButtonBox?.y || 0) - 4)

	await viewMenu.getByRole('button', {name: 'Board'}).click()
	await expect(page.getByRole('button', {name: 'View: kanban'})).toBeVisible()
	const headerBox = await page.locator('.shared-project-header-card').boundingBox()
	const firstLaneBox = await page.locator('.kanban-lane-head').first().boundingBox()
	expect(headerBox).not.toBeNull()
	expect(firstLaneBox).not.toBeNull()
	expect((firstLaneBox?.x || 0)).toBeGreaterThanOrEqual((headerBox?.x || 0) - 6)
	expect((firstLaneBox?.x || 0) + (firstLaneBox?.width || 0)).toBeLessThanOrEqual((headerBox?.x || 0) + (headerBox?.width || 0) + 6)
})

test('kanban completion and reactivation do not surface bucket ownership errors', async ({page}) => {
	const pageErrors = []
	page.on('pageerror', error => {
		pageErrors.push(error.message)
	})

	await openProjects(page)

	const workNode = page.locator('[data-project-node-id="2"]')
	await workNode.locator('[data-action="select-project"][data-project-id="2"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()

	await page.locator('[data-action="toggle-project-view-menu"]').click()
	await page.locator('[data-action="select-project-view"][data-project-id="2"][data-view-id="15"]').click()
	await expect(page.locator('.kanban-lane-head').first()).toBeVisible()

	const todoLaneTask = page.locator('[data-kanban-lane-id="151"] [data-task-row-id="201"]')
	const doneLaneTask = page.locator('[data-kanban-lane-id="152"] [data-task-row-id="201"]')
	const errorCard = page.locator('.status-card.danger')

	await expect(todoLaneTask).toHaveCount(1)
	await todoLaneTask.locator('[data-action="toggle-done"]').click()
	await expect(errorCard).toHaveCount(0)
	await expect(doneLaneTask).toHaveCount(1)

	await page.waitForTimeout(4500)
	await expect(errorCard).toHaveCount(0)

	await doneLaneTask.locator('[data-action="toggle-done"]').click()
	await expect(errorCard).toHaveCount(0)
	await expect(todoLaneTask).toHaveCount(1)

	await page.waitForTimeout(4500)
	await expect(errorCard).toHaveCount(0)
	expect(pageErrors).toEqual([])
})

test('kanban tasks can move to a non-done bucket by drag and bucket menu', async ({page}) => {
	const pageErrors = []
	page.on('pageerror', error => {
		pageErrors.push(error.message)
	})

	await openProjects(page)

	const workNode = page.locator('[data-project-node-id="2"]')
	await workNode.locator('[data-action="select-project"][data-project-id="2"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()

	await page.locator('[data-action="toggle-project-view-menu"]').click()
	await page.locator('[data-action="select-project-view"][data-project-id="2"][data-view-id="15"]').click()
	await expect(page.locator('.kanban-lane-head').first()).toBeVisible()

	await page.getByRole('button', {name: 'Create bucket'}).click()
	await page.locator('.kanban-create-bucket .detail-input').fill('Doing')
	await page.locator('.kanban-create-bucket').getByRole('button', {name: 'Add bucket'}).click()
	const doingLane = page.locator('.kanban-lane').filter({has: page.locator('.kanban-lane-title', {hasText: 'Doing'})})
	await expect(doingLane).toBeVisible()

	const todoLaneTask = page.locator('[data-kanban-lane-id="151"] [data-task-row-id="201"]')
	const dragHandle = todoLaneTask.locator('.kanban-drag-handle')
	const targetDropZone = doingLane.locator('.kanban-bucket-tasks')
	const targetFooter = doingLane.locator('.kanban-bucket-footer')
	const sourceBox = await dragHandle.boundingBox()
	const targetBox = await targetDropZone.boundingBox()
	if (!sourceBox || !targetBox) {
		throw new Error('Kanban drag geometry could not be measured.')
	}

	await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
	await page.mouse.down()
	await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 18, {steps: 12})
	await page.mouse.up()

	const movedTask = doingLane.locator('[data-task-row-id="201"]')
	await expect(movedTask).toHaveCount(1)
	await expect(todoLaneTask).toHaveCount(0)

	const movedTaskBox = await movedTask.boundingBox()
	const targetFooterBox = await targetFooter.boundingBox()
	if (!movedTaskBox || !targetFooterBox) {
		throw new Error('Kanban post-drop geometry could not be measured.')
	}
	expect(movedTaskBox.y).toBeLessThan(targetFooterBox.y)

	await page.waitForTimeout(700)
	await movedTask.locator('[data-action="toggle-task-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="move-to-bucket"]').click()
	await page.locator('[data-menu-root="true"] .menu-item').filter({hasText: 'To Do'}).click()

	await expect(page.locator('[data-kanban-lane-id="151"] [data-task-row-id="201"]')).toHaveCount(1)
	await expect(movedTask).toHaveCount(0)
	expect(pageErrors).toEqual([])
})

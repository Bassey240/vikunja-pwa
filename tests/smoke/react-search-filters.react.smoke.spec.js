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
	await page.locator('[data-action="set-account-auth-mode"][data-auth-mode="apiToken"]').click()
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="apiToken"]').fill('smoke-token')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
})

test('projects overview inline search and project filters work', async ({page}) => {
	await page.getByRole('button', {name: 'Projects'}).click()
	await expect(page.getByRole('heading', {name: 'Projects'})).toBeVisible()

	await page.getByRole('button', {name: 'Search'}).click()
	await page.locator('.overview-search-panel [data-search-input]').fill('Work')
	await page.locator('.overview-search-panel [data-form="global-search"]').getByRole('button', {name: 'Find'}).click()
	await expect(page.locator('[data-action="open-search-project-result"][data-project-id="2"]')).toContainText('Work')
	await page.locator('[data-action="open-search-project-result"][data-project-id="2"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()

	await page.locator('button[aria-label="Back"]').click()
	await expect(page.getByRole('heading', {name: 'Projects'})).toBeVisible()

	await page.getByRole('button', {name: 'Filters'}).click()
	await page.locator('[data-project-filter-field="favorite"]').selectOption('only')
	await page.locator('[data-action="apply-project-filters"]').click()
	await expect(page.locator('[data-project-node-id="1"]')).toContainText('Inbox')
	await expect(page.locator('[data-project-node-id="2"]')).toHaveCount(0)
})

test('project tasks screen view switcher and task filters work', async ({page}) => {
	await page.getByRole('button', {name: 'Projects'}).click()
	await page.locator('[data-project-node-id="2"] [data-action="select-project"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()

	await page.getByRole('button', {name: 'View'}).click()
	await page.locator('[data-menu-root="true"] [data-action="select-project-view"][data-view-id="15"]').click()
	await page.getByRole('button', {name: 'View'}).click()
	await expect(page.locator('[data-menu-root="true"] [data-action="select-project-view"][data-view-id="15"]')).toHaveClass(/is-active/)
	await page.locator('[data-menu-root="true"] [data-action="select-project-view"][data-view-id="12"]').click()

	await page.getByRole('button', {name: 'Filters'}).click()
	await page.locator('[data-task-filter-field="priority"]').selectOption('5')
	await page.locator('[data-action="apply-task-filters"]').click()
	await expect(page.locator('.task-row').filter({hasText: 'Smoke suite rollout'})).toHaveCount(1)
	await expect(page.locator('.task-row').filter({hasText: 'Backend proxy coverage'})).toHaveCount(0)
})

test('dedicated search screen shows only global search results', async ({page}) => {
	await page.locator('nav[aria-label="Primary"] [data-action="toggle-screen-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="go-search"]').click()
	await expect(page.getByRole('heading', {name: 'Search'})).toBeVisible()

	await page.locator('[data-form="global-search"] [data-search-input]').fill('Book')
	await page.locator('[data-form="global-search"]').getByRole('button', {name: 'Search'}).click()
	await expect(page.locator('.task-row').filter({hasText: 'Book flights'})).toHaveCount(1)
	await expect(page.locator('.saved-filter-card')).toHaveCount(0)
})

test('project filter panel exposes saved filters and opens the filter project route', async ({page}) => {
	await page.getByRole('button', {name: 'Projects'}).click()
	await expect(page.getByRole('heading', {name: 'Projects'})).toBeVisible()

	await page.getByRole('button', {name: 'Filters'}).click()
	await expect(page.locator('[data-saved-filter-select]')).toBeVisible()
	await expect(page.locator('[data-saved-filter-select] option[value="-1"]')).toContainText('Focused Work')
	await page.locator('[data-saved-filter-select]').selectOption('-1')

	await expect(page).toHaveURL(/\/projects\/-1$/)
	await expect(page.locator('.workspace-screen.is-active .panel-title, .workspace-screen.is-active .project-screen-title').first()).toContainText('Focused Work')
	await expect(page.locator('.workspace-screen.is-active .filter-project-chip').first()).toContainText('Filter')
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Smoke suite rollout'})).toHaveCount(1)
})

test('filters screen can create edit and delete saved filters from the structured builder', async ({page}) => {
	await page.locator('nav[aria-label="Primary"] [data-action="toggle-screen-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="go-filters"]').click()
	await expect(page.getByRole('heading', {name: 'Filters'})).toBeVisible()
	await expect(page.locator('.workspace-screen.is-active .surface-content .count-chip')).toContainText('1')

	await page.locator('.workspace-screen.is-active .panel-action-row [data-action="open-saved-filter-create"]').first().click()
	await expect(page.locator('[data-form="saved-filter-builder"]')).toBeVisible()
	await expect(page.locator('[data-saved-filter-preview]')).toContainText('Matching tasks right now:')
	await expect(page.locator('.workspace-screen.is-active .saved-filter-list')).toHaveCount(0)
	await page.locator('[data-saved-filter-field="title"]').fill('Open Work')
	await page.locator('[data-action="submit-saved-filter"]').click()

	await expect(page.locator('.workspace-screen.is-active .surface-content .count-chip')).toContainText('2')
	await expect(page.locator('.workspace-screen.is-active .saved-filter-card').filter({hasText: 'Open Work'})).toHaveCount(1)
	await expect(page.locator('.workspace-screen.is-active [data-form="saved-filter-builder"]')).toHaveCount(0)
	await expect(page.locator('.workspace-screen.is-active [data-action="goto-saved-filter-project"]')).toHaveCount(2)
	await expect(page.getByText('Vikunja request failed with 400')).toHaveCount(0)

	await page.locator('.workspace-screen.is-active .saved-filter-card-stack', {hasText: 'Open Work'}).locator('[data-action="open-saved-filter-edit"]').click()
	await expect(page.locator('.workspace-screen.is-active .saved-filter-editor-title')).toContainText('Open Work')
	await expect(page.locator('.workspace-screen.is-active .saved-filter-list')).toHaveCount(0)
	await page.locator('[data-saved-filter-field="title"]').fill('Priority Work')
	await page.locator('[data-task-filter-field="projectId"]').selectOption('2')
	await page.locator('[data-task-filter-field="priority"]').selectOption('5')
	await page.locator('[data-saved-filter-field="favorite"]').check()
	await expect(page.locator('[data-saved-filter-preview]')).toContainText('Matching tasks right now:')
	await page.locator('[data-action="submit-saved-filter"]').click()

	await expect(page.locator('.workspace-screen.is-active .surface-content .count-chip')).toContainText('2')
	await expect(page.locator('.workspace-screen.is-active .saved-filter-card').filter({hasText: 'Priority Work'})).toHaveCount(1)
	await page.locator('.workspace-screen.is-active .saved-filter-card-stack', {hasText: 'Priority Work'}).locator('[data-action="goto-saved-filter-project"]').click()
	await expect(page).toHaveURL(/\/projects\/-2$/)
	await expect(page.locator('.workspace-screen.is-active .panel-title, .workspace-screen.is-active .project-screen-title').first()).toContainText('Priority Work')
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Smoke suite rollout'})).toHaveCount(1)
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Buy milk'})).toHaveCount(0)

	await page.goBack()
	await expect(page.getByRole('heading', {name: 'Filters'})).toBeVisible()

	await page.locator('.workspace-screen.is-active .saved-filter-card-stack', {hasText: 'Priority Work'}).locator('[data-action="open-saved-filter-edit"]').click()
	await expect(page.locator('.workspace-screen.is-active .saved-filter-editor-title')).toContainText('Priority Work')
	await page.locator('[data-saved-filter-field="title"]').fill('Urgent Work')
	await page.locator('[data-task-filter-field="priority"]').selectOption('3')
	await page.locator('[data-action="submit-saved-filter"]').click()

	await expect(page.locator('.workspace-screen.is-active .saved-filter-card').filter({hasText: 'Urgent Work'})).toHaveCount(1)
	await page.locator('.workspace-screen.is-active .saved-filter-card-stack', {hasText: 'Urgent Work'}).locator('[data-action="goto-saved-filter-project"]').click()
	await expect(page).toHaveURL(/\/projects\/-2$/)
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Backend proxy coverage'})).toHaveCount(1)
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Smoke suite rollout'})).toHaveCount(0)

	await page.goBack()
	await expect(page.getByRole('heading', {name: 'Filters'})).toBeVisible()

	page.once('dialog', dialog => dialog.accept())
	await page.locator('.workspace-screen.is-active .saved-filter-card-stack', {hasText: 'Urgent Work'}).locator('[data-action="delete-saved-filter"]').click()
	await expect(page.locator('.workspace-screen.is-active .saved-filter-card').filter({hasText: 'Urgent Work'})).toHaveCount(0)
	await expect(page.locator('.workspace-screen.is-active .surface-content .count-chip')).toContainText('1')
})

test('projects tree renders saved filters with normal project row controls and opens them in the normal task workspace', async ({page}) => {
	await page.getByRole('button', {name: 'Projects'}).click()
	await expect(page.getByRole('heading', {name: 'Projects'})).toBeVisible()
	await expect(page.locator('[data-project-node-id="-1"][data-saved-filter-project="true"]')).toContainText('Focused Work')
	await expect(page.locator('[data-project-node-id="-1"] .filter-project-chip')).toHaveCount(0)
	await expect(page.locator('[data-project-node-id="-1"] .project-card-meta')).toContainText('Saved filter')
	await expect(page.locator('[data-project-node-id="-1"] [data-action="toggle-project"]')).toBeVisible()
	await expect(page.locator('[data-project-node-id="-1"] .project-drag-handle')).toBeVisible()
	await expect(page.locator('[data-project-node-id="-1"] [data-action="toggle-project-menu"]')).toBeVisible()

	await page.locator('[data-project-node-id="-1"] [data-action="toggle-project"]').click()
	await expect(page.locator('[data-project-node-id="-1"] .project-preview .task-row').filter({hasText: 'Smoke suite rollout'})).toHaveCount(1)
	await page.locator('[data-project-node-id="-1"] [data-action="toggle-project-menu"]').click()
	await expect(page.locator('[data-menu-root="true"] [data-action="edit-saved-filter-project"]')).toHaveCount(1)

	await page.locator('[data-project-node-id="-1"] [data-action="select-project"]').click()
	await expect(page).toHaveURL(/\/projects\/-1$/)
	await expect(page.locator('.workspace-screen.is-active .panel-title, .workspace-screen.is-active .project-screen-title').first()).toContainText('Focused Work')
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Smoke suite rollout'})).toHaveCount(1)
})

test('saved filter builder stays within the viewport width on mobile', async ({page}) => {
	await page.setViewportSize({width: 390, height: 844})
	await page.locator('nav[aria-label="Primary"] [data-action="toggle-screen-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="go-filters"]').click()
	await page.locator('.workspace-screen.is-active .panel-action-row [data-action="open-saved-filter-create"]').first().click()
	await expect(page.locator('[data-form="saved-filter-builder"]')).toBeVisible()

	const overflow = await page.evaluate(() => {
		const surface = document.querySelector('.workspace-screen.is-active .surface-content')
		if (!surface) {
			return null
		}
		return {
			clientWidth: surface.clientWidth,
			scrollWidth: surface.scrollWidth,
		}
	})

	expect(overflow).not.toBeNull()
	expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2)
})

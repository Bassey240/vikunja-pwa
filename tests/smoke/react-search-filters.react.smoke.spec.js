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

test('project filter panel exposes saved filters and opens the filters screen', async ({page}) => {
	await page.getByRole('button', {name: 'Projects'}).click()
	await expect(page.getByRole('heading', {name: 'Projects'})).toBeVisible()

	await page.getByRole('button', {name: 'Filters'}).click()
	await expect(page.locator('[data-saved-filter-select]')).toBeVisible()
	await expect(page.locator('[data-saved-filter-select] option[value="-1"]')).toContainText('Focused Work')
	await page.locator('[data-saved-filter-select]').selectOption('-1')

	await expect(page.getByRole('heading', {name: 'Filters'})).toBeVisible()
	await expect(page.locator('.saved-filter-card.is-active')).toContainText('Focused Work')
	await expect(page.locator('.saved-filter-card-actions')).toBeVisible()
	await expect(page.getByRole('button', {name: 'Close'})).toBeVisible()
	await expect(page.locator('[data-action="open-saved-filter-create"]')).toHaveCount(0)
	await expect(page.locator('[data-action="open-saved-filter-edit"]')).toHaveCount(0)
	await expect(page.locator('.saved-filter-results .task-row').filter({hasText: 'Smoke suite rollout'})).toHaveCount(1)
})

test('filters screen is browse-only for existing saved filters', async ({page}) => {
	await page.locator('nav[aria-label="Primary"] [data-action="toggle-screen-menu"]').click()
	await page.locator('[data-menu-root="true"] [data-action="go-filters"]').click()
	await expect(page.getByRole('heading', {name: 'Filters'})).toBeVisible()
	await expect(page.locator('[data-action="open-saved-filter-create"]')).toHaveCount(0)
	await expect(page.locator('[data-action="open-saved-filter-edit"]')).toHaveCount(0)
	await expect(page.locator('.workspace-screen.is-active .surface-content .count-chip')).toContainText('1')
	await expect(page.locator('.workspace-screen.is-active .saved-filter-card').filter({hasText: 'Focused Work'})).toHaveCount(1)

	await page.locator('.workspace-screen.is-active .saved-filter-card', {hasText: 'Focused Work'}).click()
	await expect(page.locator('.workspace-screen.is-active .saved-filter-card.is-active')).toContainText('Focused Work')
	await expect(page.locator('.workspace-screen.is-active .saved-filter-results .task-row').filter({hasText: 'Smoke suite rollout'})).toHaveCount(1)
	await expect(page.locator('.workspace-screen.is-active .saved-filter-results .task-row').filter({hasText: 'Backend proxy coverage'})).toHaveCount(0)

	await page.getByRole('button', {name: 'Close'}).click()
	await expect(page.locator('.workspace-screen.is-active .saved-filter-results')).toHaveCount(0)
	await expect(page.locator('.workspace-screen.is-active .saved-filter-card.is-active')).toHaveCount(0)
})

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

test('today tasks render and checkbox plus menu actions update the collection', async ({page}) => {
	await expect(page.locator('.workspace-screen.is-active .task-tree')).toBeVisible()
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Buy milk'})).toHaveCount(1)
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary'})).toHaveCount(1)

	await page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Buy milk'}).locator('[data-action="toggle-done"]').click()
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Buy milk'})).toHaveCount(0)

	const summaryRow = page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary'})
	await summaryRow.locator('[data-action="toggle-task-menu"]').click()
	await page.locator('[data-action="duplicate-task"][data-task-id="102"]').click()
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary (Copy)'})).toHaveCount(1)

	page.once('dialog', dialog => dialog.accept())
	await page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary (Copy)'}).locator('[data-action="toggle-task-menu"]').click()
	await page.locator('[data-action="delete-task"]').filter({hasText: 'Delete task'}).click()
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary (Copy)'})).toHaveCount(0)
})

test('upcoming subtasks expand and collapse', async ({page}) => {
	await page.getByRole('button', {name: 'Inbox'}).click()
	await expect(page.getByRole('heading', {name: 'Inbox'})).toBeVisible()
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Buy milk'})).toHaveCount(1)
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary'})).toHaveCount(1)

	await page.locator('[data-action="toggle-screen-menu"]').click()
	await page.locator('[data-action="go-upcoming"]').click()
	await expect(page.getByRole('heading', {name: 'Upcoming'})).toBeVisible()
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Release checklist'})).toHaveCount(1)
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Verify nested task rendering'})).toHaveCount(0)

	await page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Release checklist'}).locator('[data-action="toggle-task"]').click()
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Verify nested task rendering'})).toHaveCount(1)
	await page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Release checklist'}).locator('[data-action="toggle-task"]').click()
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Verify nested task rendering'})).toHaveCount(0)
})

test('inbox show completed reveals completed inbox tasks', async ({page}) => {
	await page.getByRole('button', {name: 'Inbox'}).click()
	await expect(page.getByRole('heading', {name: 'Inbox'})).toBeVisible()

	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Archive receipts'})).toHaveCount(0)

	await page.locator('[data-action="toggle-inbox-menu"]').click()
	await page.getByRole('button', {name: 'Show completed'}).click()

	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Archive receipts'})).toHaveCount(1)
})

test('task delete can be undone before the deferred commit runs', async ({page}) => {
	const summaryRow = page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary'})
	await summaryRow.locator('[data-action="toggle-task-menu"]').click()
	await page.locator('[data-action="duplicate-task"][data-task-id="102"]').click()
	const copiedRow = page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary (Copy)'})
	await expect(copiedRow).toHaveCount(1)

	page.once('dialog', dialog => dialog.accept())
	await copiedRow.locator('[data-action="toggle-task-menu"]').click()
	await page.locator('[data-action="delete-task"]').filter({hasText: 'Delete task'}).click()

	await expect(copiedRow).toHaveCount(0)
	await expect(page.locator('.task-completion-toast')).toContainText('Task deleted')
	await page.locator('.task-completion-toast .ghost-button').filter({hasText: 'Undo'}).click()
	await expect(page.locator('.task-completion-toast')).toHaveCount(0)
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary (Copy)'})).toHaveCount(1)
})

test('quick consecutive completions replace the undo notice without blocking the next task', async ({page}) => {
	const firstRow = page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Buy milk'})
	const secondRow = page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary'})

	await firstRow.locator('[data-action="toggle-done"]').click()
	await secondRow.locator('[data-action="toggle-done"]').click()

	await expect(page.locator('.task-completion-toast')).toContainText('Prepare daily summary')
})

test('today bulk edit marks selected tasks completed', async ({page}) => {
	await page.locator('[data-action="toggle-today-menu"]').click()
	await page.locator('[data-action="open-bulk-task-editor"]').click()
	await expect(page.locator('[data-form="bulk-task-editor"]')).toBeVisible()

	await page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Buy milk'}).locator('[data-action="toggle-bulk-select"]').click()
	await page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary'}).locator('[data-action="toggle-bulk-select"]').click()
	await expect(page.locator('.bulk-task-editor-form')).toContainText('2 tasks selected')

	await page.locator('[data-action="bulk-edit-apply"]').click()

	await expect(page.locator('[data-form="bulk-task-editor"]')).toHaveCount(0)
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Buy milk'})).toHaveCount(0)
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary'})).toHaveCount(0)
	await expect(page.locator('.workspace-screen.is-active .empty-state').filter({hasText: 'No tasks due today.'})).toBeVisible()
})

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
	await page.locator('nav[aria-label="Primary"] [data-action="toggle-screen-menu"]').click()
	await page.locator('[data-action="open-labels"]').click()
	await expect(page.getByRole('heading', {name: 'Manage Labels'})).toBeVisible()
})

test('labels screen renders, sorts, creates, edits, and deletes labels', async ({page}) => {
	const chipTexts = await page.locator('.label-page-list .label-chip span').allTextContents()
	expect(chipTexts).toEqual(['Personal', 'Urgent'])

	await page.locator('[data-label-title-input]').fill('Alpha')
	await page.locator('[data-form="create-label"]').getByRole('button', {name: 'Add'}).click()
	await expect(page.locator('.label-page-list .label-chip span').first()).toHaveText('Alpha')

	const alphaRow = page.locator('.label-list-item-wrap').filter({hasText: 'Alpha'})
	await alphaRow.locator('[data-action="toggle-label-menu"]').click()
	await page.locator('[data-action="edit-label"][data-label-id]').click()
	await expect(page.getByText('Label Detail')).toBeVisible()

	const titleInput = page.locator('[data-label-detail-title]')
	await titleInput.fill('Alpha Prime')
	await titleInput.blur()
	await expect(page.locator('.panel-title').filter({hasText: 'Alpha Prime'})).toBeVisible()
	await expect(page.locator('.label-page-list .label-chip span').first()).toHaveText('Alpha Prime')

	await page.locator('[data-label-detail-color]').fill('#123456')
	await expect(page.locator('.label-chip span').filter({hasText: 'Alpha Prime'})).toBeVisible()

	page.once('dialog', dialog => dialog.accept())
	await page.locator('[data-action="delete-label"][data-label-id]').click()
	await expect(page.locator('.label-page-list .label-chip span').filter({hasText: 'Alpha Prime'})).toHaveCount(0)
})

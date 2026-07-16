import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

let stack

test.describe.configure({mode: 'serial'})

test.beforeAll(async () => {
	stack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {unauthorizedGetRoutes: ['teams']},
	})
})

test.afterAll(async () => {
	if (stack) {
		await stack.stop()
	}
})

// Regression: an invalid token once produced 27k+ GET /api/teams in minutes
// because the settings effect re-fired on every teamsLoading flip.
test('a 401 on the teams load stops after one request instead of looping', async ({page}) => {
	await page.setViewportSize({width: 900, height: 900})
	await page.goto(stack.appUrl)
	await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible({timeout: 15_000})

	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="username"]').fill('smoke-user')
	await page.locator('[data-account-field="password"]').fill('smoke-password')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()

	let teamsRequests = 0
	page.on('request', request => {
		if (new URL(request.url()).pathname === '/api/teams') {
			teamsRequests += 1
		}
	})

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

	await page.waitForTimeout(3_000)
	expect(teamsRequests, `saw ${teamsRequests} GET /api/teams in 3s`).toBeLessThanOrEqual(2)
	expect(teamsRequests).toBeGreaterThanOrEqual(1)
	await expect(page.locator('.status-card.danger').first()).toContainText('invalid token provided')
})

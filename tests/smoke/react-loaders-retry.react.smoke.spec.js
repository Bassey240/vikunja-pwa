import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

test.describe.configure({mode: 'serial'})

async function loginWithPassword(page, stack) {
	await page.setViewportSize({width: 900, height: 900})
	await page.goto(stack.appUrl)
	await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible({timeout: 15_000})
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="username"]').fill('smoke-user')
	await page.locator('[data-account-field="password"]').fill('smoke-password')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
}

async function openSettings(page) {
	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
}

function countRequests(page, pathname, counter) {
	page.on('request', request => {
		if (request.method() === 'GET' && new URL(request.url()).pathname === pathname) {
			counter.count += 1
		}
	})
}

// Regression: like the /api/teams storm, these settings effects re-fire on
// every loading-flag flip, so an ungated load failure loops hot.
test.describe('account sessions load retry', () => {
	let stack

	test.beforeAll(async () => {
		stack = await startTestStack({
			legacyConfigured: false,
			mockVikunjaOptions: {unauthorizedGetRoutes: ['user/sessions']},
		})
	})

	test.afterAll(async () => {
		if (stack) {
			await stack.stop()
		}
	})

	test('a 401 on the sessions load stops after one request instead of looping', async ({page}) => {
		const sessions = {count: 0}
		countRequests(page, '/api/session/sessions', sessions)

		// The sessions load first fires during the login bootstrap, so the
		// counter must be attached before connecting.
		await loginWithPassword(page, stack)
		await openSettings(page)

		await page.waitForTimeout(3_000)
		expect(sessions.count, `saw ${sessions.count} GET /api/session/sessions`).toBeLessThanOrEqual(2)
		expect(sessions.count).toBeGreaterThanOrEqual(1)
	})
})

test.describe('admin loaders retry', () => {
	let stack

	test.beforeAll(async () => {
		stack = await startTestStack({
			legacyConfigured: false,
			mockAdminBridge: {
				userListError: 'mock user list failure',
				migrateListError: 'mock migrate list failure',
			},
		})
	})

	test.afterAll(async () => {
		if (stack) {
			await stack.stop()
		}
	})

	test('failing admin user and migration loads stay bounded instead of looping', async ({page}) => {
		await loginWithPassword(page, stack)
		await openSettings(page)

		const adminUsers = {count: 0}
		const migrations = {count: 0}
		countRequests(page, '/api/admin/users', adminUsers)
		countRequests(page, '/api/admin/migrate/list', migrations)

		const section = page.locator('.settings-section[data-settings-section="userAdministration"]')
		await section.locator('[data-settings-section-toggle="userAdministration"]').first().click()
		await expect.poll(() => adminUsers.count, {timeout: 10_000}).toBeGreaterThanOrEqual(1)

		await page.waitForTimeout(3_000)
		expect(adminUsers.count, `saw ${adminUsers.count} GET /api/admin/users`).toBeLessThanOrEqual(2)
		expect(migrations.count, `saw ${migrations.count} GET /api/admin/migrate/list`).toBeLessThanOrEqual(2)
		expect(migrations.count).toBeGreaterThanOrEqual(1)
	})
})

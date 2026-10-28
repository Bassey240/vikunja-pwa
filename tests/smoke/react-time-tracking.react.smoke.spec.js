import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

let stack

test.describe.configure({mode: 'serial'})

test.beforeAll(async () => {
	stack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {enabledProFeatures: ['time_tracking']},
	})
})

test.afterAll(async () => {
	await stack.stop()
})

test.beforeEach(async ({page}) => {
	stack.reset()
	await page.setViewportSize({width: 900, height: 900})
	await page.goto(stack.appUrl)
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="username"]').fill('smoke-user')
	await page.locator('[data-account-field="password"]').fill('smoke-password')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
})

async function openTimeTrackingSection(page) {
	await page.locator('.task-row').filter({hasText: 'Buy milk'}).locator('[data-action="open-task-focus"]').click()
	await page.locator('[data-action="open-focused-task-detail"]').click()
	await expect(page.locator('[data-detail-title]')).toBeVisible()
	const toggle = page.locator('[data-detail-section-toggle="timeTracking"]')
	await expect(toggle).toBeVisible()
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
		await toggle.click()
	}
	await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}

test('a licensed instance tracks time on a task and shows the running timer globally', async ({page}) => {
	const pageErrors = []
	page.on('pageerror', error => {
		pageErrors.push(error.message)
	})

	await openTimeTrackingSection(page)
	await expect(page.locator('[data-time-entry="1"]')).toContainText('Reviewed the intake list')
	await expect(page.locator('[data-running-timer-bar]')).toHaveCount(0)

	await page.locator('[data-action="start-task-timer"]').click()
	const bar = page.locator('[data-running-timer-bar]')
	await expect(bar).toBeVisible()
	await expect(bar).toContainText('Buy milk')
	await expect(page.locator('[data-running-timer-clock]')).toHaveText(/^\d{2}:\d{2}:\d{2}$/)
	await expect(page.locator('.detail-time-duration.is-running')).toHaveCount(1)

	// The local clock ticks without a poll; the second reading must be later.
	const firstClock = await page.locator('[data-running-timer-clock]').textContent()
	await expect.poll(
		async () => page.locator('[data-running-timer-clock]').textContent(),
		{timeout: 5000},
	).not.toBe(firstClock)

	await page.locator('[data-action="stop-task-timer"]').click()
	await expect(page.locator('[data-running-timer-bar]')).toHaveCount(0)
	await expect(page.locator('.detail-time-duration.is-running')).toHaveCount(0)
	await expect(page.locator('[data-time-entry]')).toHaveCount(2)

	expect(pageErrors).toEqual([])
})

test('an existing entry can be edited and deleted', async ({page}) => {
	await openTimeTrackingSection(page)

	const row = page.locator('[data-time-entry="1"]')
	await row.locator('[data-action="edit-time-entry"]').click()
	await row.locator('[data-time-entry-comment]').fill('Edited from the smoke test')
	await row.locator('[data-action="save-time-entry"]').click()
	await expect(page.locator('[data-time-entry="1"]')).toContainText('Edited from the smoke test')

	await page.locator('[data-time-entry="1"] [data-action="delete-time-entry"]').click()
	await expect(page.locator('[data-time-entry="1"]')).toHaveCount(0)
	await expect(page.locator('[data-time-entry]')).toHaveCount(0)
})

test('a manual entry can be added with its own start and end', async ({page}) => {
	await openTimeTrackingSection(page)

	await page.locator('[data-action="toggle-time-entry-form"]').click()
	await page.locator('[data-time-entry-start]').fill('2026-03-02T09:00')
	await page.locator('[data-time-entry-end]').fill('2026-03-02T10:30')
	await page.locator('[data-time-entry-comment]').fill('Backfilled session')
	await page.locator('[data-action="create-time-entry"]').click()

	await expect(page.locator('[data-time-entry]')).toHaveCount(2)
	await expect(page.locator('.detail-time-card')).toContainText('Backfilled session')
	await expect(page.locator('.detail-time-card')).toContainText('1h 30m')
	await expect(page.locator('[data-running-timer-bar]')).toHaveCount(0)
})

test.describe('without the licence', () => {
	let unlicensedStack

	test.beforeAll(async () => {
		unlicensedStack = await startTestStack({legacyConfigured: false})
	})

	test.afterAll(async () => {
		await unlicensedStack.stop()
	})

	test('the time tracking section never renders on an unlicensed instance', async ({page}) => {
		unlicensedStack.reset()
		await page.setViewportSize({width: 900, height: 900})
		await page.goto(unlicensedStack.appUrl)
		await page.locator('[data-account-field="baseUrl"]').fill(`${unlicensedStack.mock.origin}/api/v1`)
		await page.locator('[data-account-field="username"]').fill('smoke-user')
		await page.locator('[data-account-field="password"]').fill('smoke-password')
		await page.getByRole('button', {name: 'Connect'}).click()
		await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()

		await page.locator('.task-row').filter({hasText: 'Buy milk'}).locator('[data-action="open-task-focus"]').click()
		await page.locator('[data-action="open-focused-task-detail"]').click()
		await expect(page.locator('[data-detail-title]')).toBeVisible()
		await expect(page.locator('[data-detail-section-toggle="attachments"]')).toBeVisible()
		await expect(page.locator('[data-detail-section-toggle="timeTracking"]')).toHaveCount(0)
		await expect(page.locator('[data-running-timer-bar]')).toHaveCount(0)
	})
})

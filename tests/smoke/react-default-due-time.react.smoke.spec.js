import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

test.use({timezoneId: 'Europe/Amsterdam'})

async function openPreferences(page) {
	await page.goto(new URL('/settings?section=preferences', page.url()).href)
	const section = page.locator('[data-settings-section="preferences"]')
	await expect(section.locator('[data-setting-field="default-due-time"]')).toBeVisible()
	return section
}

async function addTask(page, title) {
	await page.locator('[data-action="open-root-composer"]:visible').first().click()
	const form = page.locator('form:has([data-root-input]):visible')
	await form.locator('[data-root-input]').fill(title)
	await form.getByRole('button', {name: 'Add', exact: true}).click()
	await expect(form.locator('[data-root-input]')).toHaveValue('')
	await form.getByRole('button', {name: 'Done', exact: true}).click()
}

for (const version of ['v2.7.0', 'v2.3.0']) {
	test(`default due time saves, survives reload and applies to task entry on ${version}`, async ({page}) => {
		test.setTimeout(60_000)
		const stack = await startTestStack({legacyConfigured: false, mockVikunjaOptions: {
			serverVersion: version, apiV2Enabled: version === 'v2.7.0', apiV1Enabled: version === 'v2.3.0',
		}})
		try {
			await page.setViewportSize({width: 390, height: 844})
			await page.goto(stack.appUrl)
			await page.locator('[data-account-field="baseUrl"]').fill(stack.mock.origin)
			await page.locator('[data-account-field="username"]').fill('smoke-user')
			await page.locator('[data-account-field="password"]').fill('smoke-password')
			await page.getByRole('button', {name: 'Connect'}).click()
			await expect(page.getByRole('heading', {name: 'Today', exact: true})).toBeVisible()
			const originalSettings = (await (await page.request.get(`${stack.appUrl}/api/user`)).json()).settings
			let section = await openPreferences(page)
			await section.locator('[data-setting-field="default-due-time"]').fill('17:45')
			const save = page.waitForRequest(request => request.url().endsWith('/api/session/settings/general') && request.method() === 'POST')
			await section.getByRole('button', {name: 'Save default due time'}).click()
			expect((await save).postDataJSON()).toEqual({...originalSettings, name: 'Smoke User', frontend_settings: {...originalSettings.frontend_settings, default_due_time: '17:45'}})
			await expect(page.getByText('Default due time updated.')).toBeVisible()
			await page.reload()
			section = await openPreferences(page)
			await expect(section.locator('[data-setting-field="default-due-time"]')).toHaveValue('17:45')
			expect((await (await page.request.get(`${stack.appUrl}/api/user`)).json()).name).toBe('Smoke User')

			await page.goto(`${stack.appUrl}/`)
			await addTask(page, 'Preferred baseline')
			await addTask(page, 'Preferred tomorrow tomorrow')
			await addTask(page, 'Preferred evening tonight')
			const created = stack.mock.getState().tasks.filter(task => task.title.startsWith('Preferred '))
			expect(created.map(task => new Date(task.due_date).toLocaleTimeString('en-GB', {timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit'}))).toEqual(['17:45', '17:45', '21:00'])

			await page.getByRole('button', {name: 'Inbox', exact: true}).click()
			await addTask(page, 'Preferred picker')
			const row = page.locator('.workspace-screen.is-active [data-task-row-id]').filter({hasText: 'Preferred picker'})
			await row.locator('[data-action="open-task-focus"]').click()
			await page.locator('[data-action="open-focused-task-detail"]').click()
			await page.locator('[data-detail-section-toggle="planning"]').click()
			const due = page.locator('.detail-date-row').filter({has: page.getByRole('button', {name: 'Open Due calendar'})})
			await due.locator('.compact-date-picker-input').fill('12/11/2026')
			await due.locator('.compact-date-picker-input').press('Tab')
			await expect(due.locator('.compact-date-picker-input')).toHaveValue('12/11/2026 17:45')
			const taskId = stack.mock.getState().tasks.find(task => task.title === 'Preferred picker').id
			await expect.poll(() => stack.mock.getState().tasks.find(task => task.id === taskId).due_date).toBe('2026-11-12T16:45:00.000Z')
			await due.locator('.compact-date-picker-input').fill('12/11/2026 08:15')
			await due.locator('.compact-date-picker-input').press('Tab')
			await expect.poll(() => stack.mock.getState().tasks.find(task => task.id === taskId).due_date).toBe('2026-11-12T07:15:00.000Z')
			await due.getByRole('button', {name: 'Open Due calendar'}).click()
			await due.locator('.compact-date-picker-day:not(.is-muted)').filter({hasText: /^13$/}).click()
			await expect.poll(() => stack.mock.getState().tasks.find(task => task.id === taskId).due_date).toBe('2026-11-13T07:15:00.000Z')
			await page.locator('[data-action="close-task-detail"]').click()

			section = await openPreferences(page)
			await section.locator('[data-setting-field="default-due-time"]').fill('09:30')
			await page.route('**/api/session/settings/general', route => route.fulfill({status: 503, json: {error: 'Settings unavailable'}}))
			await section.getByRole('button', {name: 'Save default due time'}).click()
			await expect(page.locator('.status-card.danger:visible')).toContainText('Settings unavailable')
			await page.unroute('**/api/session/settings/general')
			await page.reload()
			section = await openPreferences(page)
			await expect(section.locator('[data-setting-field="default-due-time"]')).toHaveValue('17:45')
			await section.getByRole('button', {name: 'Clear', exact: true}).click()
			await section.getByRole('button', {name: 'Save default due time'}).click()
			await expect(page.getByText('Default due time cleared.')).toBeVisible()
			await page.reload()
			section = await openPreferences(page)
			await expect(section.locator('[data-setting-field="default-due-time"]')).toHaveValue('')
			await page.goto(`${stack.appUrl}/`)
			await addTask(page, 'Original noon tomorrow')
			const restored = stack.mock.getState().tasks.find(task => task.title === 'Original noon')
			expect(new Date(restored.due_date).toLocaleTimeString('en-GB', {timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit'})).toBe('12:00')
		} finally {await stack.stop()}
	})
}

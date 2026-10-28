import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

let stack
test.describe.configure({mode: 'serial'})
test.beforeAll(async () => {
	stack = await startTestStack({legacyConfigured: false, mockVikunjaOptions: {enabledProFeatures: ['time_tracking']}})
})
test.afterAll(async () => { await stack.stop() })
test.beforeEach(async ({page}) => {
	stack.reset()
	await page.addInitScript(() => {
		window.eventSources = []
		window.EventSource = class extends EventTarget {
			constructor(url) {
				super()
				this.url = url
				this.closed = false
				window.eventSources.push(this)
			}
			close() { this.closed = true }
		}
	})
	await page.setViewportSize({width: 900, height: 900})
	await page.goto(stack.appUrl)
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="username"]').fill('smoke-user')
	await page.locator('[data-account-field="password"]').fill('smoke-password')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
	await expect.poll(() => page.evaluate(() => window.eventSources.filter(source => !source.closed).length)).toBe(1)
})

async function emit(page, name) {
	await page.evaluate(event => window.eventSources.at(-1).dispatchEvent(new Event(event)), name)
}

test('notification events refresh the visible tray without manual refresh', async ({page}) => {
	await page.locator('[data-action="toggle-notifications"]').click()
	await expect(page.locator('[data-notification-panel]')).toBeVisible()
	const notifications = stack.mock.getState().notifications
	notifications[0].notification.task.title = 'Live notification arrived'
	await page.route('**/api/notifications', route => route.fulfill({json: notifications}))
	await emit(page, 'notification.created')
	await expect(page.locator('[data-notification-panel]')).toContainText('Live notification arrived')
	expect(await page.evaluate(() => window.eventSources.at(-1).url)).toBe('/api/events')
})

test('timer events refresh the running timer and currently open task; ready catches missed changes', async ({page}) => {
	await page.locator('.task-row').filter({hasText: 'Buy milk'}).locator('[data-action="open-task-focus"]').click()
	await page.locator('[data-action="open-focused-task-detail"]').click()
	await expect(page.locator('[data-detail-title]')).toBeVisible()
	const requests = []
	page.on('request', request => requests.push(new URL(request.url()).pathname))
	for (const event of ['timer.created', 'timer.updated', 'timer.deleted', 'ready']) {
		requests.length = 0
		await emit(page, event)
		await expect.poll(() => requests.includes('/api/time-entries')).toBe(true)
		await expect.poll(() => requests.includes('/api/tasks/101/time-entries')).toBe(true)
		if (event === 'ready') await expect.poll(() => requests.includes('/api/notifications')).toBe(true)
	}
})

test('offline transition closes the stream, online opens one, logout closes it', async ({page, context}) => {
	await context.setOffline(true)
	await expect.poll(() => page.evaluate(() => window.eventSources.every(source => source.closed))).toBe(true)
	await context.setOffline(false)
	await expect.poll(() => page.evaluate(() => window.eventSources.filter(source => !source.closed).length)).toBe(1)
	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
	await page.getByRole('button', {name: 'Expand Account', exact: true}).click()
	page.once('dialog', dialog => dialog.accept())
	await page.locator('[data-action="logout-account"]').click()
	await expect(page.locator('[data-account-field="username"]')).toBeVisible()
	await expect.poll(() => page.evaluate(() => window.eventSources.every(source => source.closed))).toBe(true)
})

test('auth-error reloads session status and closes the stream', async ({page}) => {
	await page.route('**/api/session', route => route.fulfill({json: {connected: false, account: null}}))
	await emit(page, 'auth-error')
	await expect(page.locator('[data-account-field="username"]')).toBeVisible()
	expect(await page.evaluate(() => window.eventSources.every(source => source.closed))).toBe(true)
})

test('event endpoint rejects foreign origins and missing sessions; API tokens opt out', async ({page, request}) => {
	const foreign = await page.request.get(`${stack.appUrl}/api/events`, {headers: {Origin: 'https://foreign.test'}})
	expect(foreign.status()).toBe(403)
	const noOrigin = await page.request.get(`${stack.appUrl}/api/events`)
	expect(noOrigin.status()).toBe(403)
	const login = await page.request.post(`${stack.appUrl}/api/session/login`, {
		headers: {Origin: stack.appUrl},
		data: {baseUrl: `${stack.mock.origin}/api/v1`, authMode: 'apiToken', apiToken: 'smoke-api-token'},
	})
	expect(login.status()).toBe(200)
	const tokenStream = await page.request.get(`${stack.appUrl}/api/events`, {headers: {Origin: stack.appUrl}})
	expect(tokenStream.status()).toBe(204)
	await emit(page, 'auth-error')
	await expect.poll(() => page.evaluate(() => window.eventSources.every(source => source.closed))).toBe(true)
	const missing = await request.get(`${stack.appUrl}/api/events`, {headers: {Origin: stack.appUrl}})
	expect(missing.status()).toBe(401)
})

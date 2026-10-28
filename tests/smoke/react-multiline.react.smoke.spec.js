import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'
import {getOfflineMutations} from '../helpers/offline-storage.mjs'

async function openComposer(page) {
	await page.locator('[data-action="open-root-composer"]:visible').first().click()
	const form = page.locator('form:has([data-root-input]):visible')
	await form.getByRole('checkbox', {name: 'Multiple tasks'}).check()
	return form
}

for (const version of ['v2.7.0', 'v2.4.0', 'v2.3.0']) {
	test.describe(`multiline on ${version}`, () => {
		let stack
		test.beforeAll(async () => {
			stack = await startTestStack({legacyConfigured: false, mockVikunjaOptions: {
				serverVersion: version, apiV2Enabled: version !== 'v2.3.0', apiV1Enabled: version === 'v2.3.0',
			}})
		})
		test.afterAll(async () => { await stack.stop() })
		test.beforeEach(async ({page}) => {
			stack.reset()
			await page.setViewportSize({width: 430, height: 900})
			await page.goto(stack.appUrl)
			await page.locator('[data-action="set-account-auth-mode"][data-auth-mode="apiToken"]').click()
			await page.locator('[data-account-field="baseUrl"]').fill(stack.mock.origin)
			await page.locator('[data-account-field="apiToken"]').fill('smoke-token')
			await page.getByRole('button', {name: 'Connect'}).click()
			await expect(page.getByRole('heading', {name: 'Today', exact: true})).toBeVisible()
		})

		test('creates ordered lines with project, defaults and per-line quick add', async ({page}) => {
			const writes = []
			page.on('request', request => {
				if (request.method() === 'POST' && /\/api\/projects\/\d+\/tasks(?:\/bulk)?$/.test(new URL(request.url()).pathname)) writes.push(request)
			})
			const form = await openComposer(page)
			await form.locator('[data-composer-project]').selectOption('2')
			await form.locator('textarea').fill('Line first !3 *batch @apartner\n\n Line second tomorrow \nLine third every day')
			await form.getByRole('button', {name: 'Add', exact: true}).click()
			await expect(form.locator('textarea')).toHaveValue('')
			const created = stack.mock.getState().tasks.filter(task => task.title.startsWith('Line '))
			expect(created.map(task => task.title)).toEqual(['Line first', 'Line second', 'Line third'])
			expect(created.map(task => task.project_id)).toEqual([2, 2, 2])
			expect(created[0].due_date).toBeTruthy()
			expect(new Date(created[1].due_date).getTime()).toBeGreaterThan(new Date(created[0].due_date).getTime())
			expect(created[0].priority).toBe(3)
			expect(created[0].labelIds).toHaveLength(1)
			expect(created[0].assignees.map(user => user.username)).toEqual(['apartner'])
			expect(created[2].repeat_after).toBe(86400)
			expect(writes).toHaveLength(version === 'v2.7.0' ? 1 : 3)
			expect(writes.map(request => new URL(request.url()).pathname)).toEqual(version === 'v2.7.0'
				? ['/api/projects/2/tasks/bulk'] : Array(3).fill('/api/projects/2/tasks'))
			await form.getByRole('button', {name: 'Done', exact: true}).click()
			await expect(page.locator('.workspace-screen.is-active [data-task-row-id]').filter({hasText: 'Line first'})).toHaveCount(1)
		})

		if (version === 'v2.4.0') {
			test('partial sequential failure keeps only uncreated lines and retry does not duplicate', async ({page}) => {
				const form = await openComposer(page)
				await form.locator('textarea').fill('Retry first\nRetry second\nRetry third')
				await page.route('**/api/projects/*/tasks', async route => {
					if (route.request().method() === 'POST' && route.request().postDataJSON().title === 'Retry second') {
						await route.fulfill({status: 503, json: {error: 'Creation unavailable'}})
					} else await route.continue()
				})
				await form.getByRole('button', {name: 'Add', exact: true}).click()
				await expect(form.locator('textarea')).toHaveValue('Retry second\nRetry third')
				await expect(page.locator('.status-card.danger:visible')).toContainText('Creation unavailable')
				expect(stack.mock.getState().tasks.filter(task => task.title.startsWith('Retry ')).map(task => task.title)).toEqual(['Retry first'])
				await page.unroute('**/api/projects/*/tasks')
				await form.getByRole('button', {name: 'Add', exact: true}).click()
				await expect(form.locator('textarea')).toHaveValue('')
				expect(stack.mock.getState().tasks.filter(task => task.title.startsWith('Retry ')).map(task => task.title)).toEqual(['Retry first', 'Retry second', 'Retry third'])
			})
		}

		if (version === 'v2.7.0') {
			test('desktop inline composer creates multiple tasks', async ({page}) => {
				await page.setViewportSize({width: 1280, height: 900})
				const form = await openComposer(page)
				await expect(form).toHaveAttribute('data-form', 'root-task-inline')
				await form.locator('textarea').fill('Desktop first\nDesktop second')
				await form.getByRole('button', {name: 'Add', exact: true}).click()
				await expect(form.locator('textarea')).toHaveValue('')
				expect(stack.mock.getState().tasks.filter(task => task.title.startsWith('Desktop ')).map(task => task.title)).toEqual(['Desktop first', 'Desktop second'])
			})

			test('bulk failure keeps every line and does not replay single writes', async ({page}) => {
				const form = await openComposer(page)
				await form.locator('textarea').fill('Failed first\nFailed second')
				let singleWrites = 0
				page.on('request', request => { if (request.method() === 'POST' && /\/projects\/\d+\/tasks$/.test(request.url())) singleWrites++ })
				await page.route('**/api/projects/*/tasks/bulk', route => route.fulfill({status: 422, json: {error: 'Invalid task'}}))
				await form.getByRole('button', {name: 'Add', exact: true}).click()
				await expect(page.locator('.status-card.danger:visible')).toContainText('Invalid task')
				await expect(form.locator('textarea')).toHaveValue('Failed first\nFailed second')
				expect(stack.mock.getState().tasks.filter(task => task.title.startsWith('Failed '))).toHaveLength(0)
				expect(singleWrites).toBe(0)
			})

			test('offline multiline uses existing ordered queue and replays on reconnect', async ({page}) => {
				const form = await openComposer(page)
				await form.locator('textarea').fill('Offline first\nOffline second')
				await page.context().setOffline(true)
				await form.getByRole('button', {name: 'Add', exact: true}).click()
				await expect(form.locator('textarea')).toHaveValue('')
				expect((await getOfflineMutations(page)).map(mutation => mutation.body.title)).toEqual(['Offline first', 'Offline second'])
				await page.context().setOffline(false)
				await page.evaluate(() => window.dispatchEvent(new Event('online')))
				await expect.poll(() => stack.mock.getState().tasks.filter(task => task.title.startsWith('Offline ')).map(task => task.title)).toEqual(['Offline first', 'Offline second'])
				await expect.poll(async () => (await getOfflineMutations(page)).length).toBe(0)
			})
		}
	})
}

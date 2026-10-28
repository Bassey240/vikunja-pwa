import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

async function openSummary(page) {
	if (!await page.locator('[data-action="open-focused-task-detail"]').isVisible()) {
		await page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Prepare daily summary'}).locator('[data-action="open-task-focus"]').click()
	}
	await page.locator('[data-action="open-focused-task-detail"]').click()
	await expect(page.locator('[data-detail-title]')).toHaveValue('Prepare daily summary')
}

for (const version of ['v2.7.0', 'v2.3.0']) {
	test(`task-link pills render and navigate without changing content on ${version}`, async ({page}) => {
		const stack = await startTestStack({legacyConfigured: false, mockVikunjaOptions: {
			serverVersion: version, apiV2Enabled: version === 'v2.7.0', apiV1Enabled: version === 'v2.3.0',
		}})
		try {
			const href = `${stack.mock.origin}/tasks/201?comment=3#details`
			const denied = `${stack.mock.origin}/tasks/999`
			const missing = `${stack.mock.origin}/tasks/998`
			const external = 'https://other.test/tasks/201'
			const html = `<p>See <a href="${href}">${href}</a>.</p><p><a href="/tasks/101">/tasks/101</a></p><p><a href="${denied}">${denied}</a> <a href="${missing}">${missing}</a></p><p><a href="${external}">${external}</a> <a href="${href}">Read this task</a></p><pre><code>${href}</code></pre>`
			await stack.mockApi('tasks/102', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({description: html})})
			await stack.mockApi('tasks/201', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({done: true})})
			await stack.mockApi('tasks/102/comments', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({comment: `Follow up: ${href}.`})})
			await page.route('**/api/tasks/999', route => route.fulfill({status: 403, json: {error: 'Task access denied'}}))
			// Include a project identifier in the existing task response.
			await page.route('**/api/tasks/201', async route => {
				const response = await route.fetch()
				const data = await response.json()
				await route.fulfill({response, json: {...data, task: {...data.task, identifier: 'WORK-7'}}})
			})
			await page.setViewportSize({width: 390, height: 844})
			await page.goto(stack.appUrl)
			await page.locator('[data-action="set-account-auth-mode"][data-auth-mode="apiToken"]').click()
			await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
			await page.locator('[data-account-field="apiToken"]').fill('smoke-token')
			await page.getByRole('button', {name: 'Connect', exact: true}).click()
			await expect(page.getByRole('heading', {name: 'Today', exact: true})).toBeVisible()
			await openSummary(page)
			const requests = []
			page.on('request', request => requests.push(new URL(request.url()).pathname))
			const deniedResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/tasks/999')
			const missingResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/tasks/998')
			await page.locator('[data-detail-section-toggle="description"]').click()
			const description = page.locator('.detail-description-read')
			const pill = description.locator('.rich-text-task-link').filter({hasText: 'WORK-7'})
			await expect(pill).toHaveCount(1)
			await expect(pill).toHaveClass(/is-done/)
			await expect(pill).toContainText('Smoke suite rollout')
			await expect(description.locator('.rich-text-task-link').filter({hasText: '#101'})).toContainText('Buy milk')
			expect((await deniedResponse).status()).toBe(403)
			expect((await missingResponse).status()).toBe(404)
			await expect(description.locator('a[href="'+denied+'"]')).not.toHaveClass(/rich-text-task-link/)
			await expect(description.locator('a[href="'+missing+'"]')).not.toHaveClass(/rich-text-task-link/)
			await expect(description.getByRole('link', {name: 'Read this task', exact: true})).not.toHaveClass(/rich-text-task-link/)
			await expect(description.locator('a[href="'+external+'"]')).toHaveText(external)
			await expect(description.locator('pre code')).toHaveText(href)
			await expect(description.locator('pre a')).toHaveCount(0)
			expect(requests).toContain('/api/tasks/201')
			expect(requests.filter(path => path === '/api/tasks' || /^\/api\/projects\/\d+\/tasks$/.test(path))).toEqual([])
			await expect(page.locator('[data-detail-description]')).toHaveCount(0)
			const fallbackTab = page.waitForEvent('popup')
			await description.locator(`a[href="${missing}"]`).click()
			const popup = await fallbackTab
			await expect(popup).toHaveURL(missing)
			await popup.close()
			await expect(page.locator('[data-detail-description]')).toHaveCount(0)
			await pill.click()
			await expect(page.locator('[data-detail-title]')).toHaveValue('Smoke suite rollout')
			await expect(page.locator('[data-detail-description]')).toHaveCount(0)
			expect((await stack.mockApi('tasks/102')).description).toBe(html)

			await page.locator('[data-action="close-task-detail"]').click()
			await openSummary(page)
			await page.locator('[data-detail-section-toggle="comments"]').click()
			const commentPill = page.locator('.detail-comment-body .rich-text-task-link')
			await expect(commentPill).toHaveCount(1)
			await expect(page.locator('.detail-comment-body')).toContainText('Follow up:')
			await commentPill.focus()
			await page.keyboard.press('Enter')
			await expect(page.locator('[data-detail-title]')).toHaveValue('Smoke suite rollout')
			expect((await stack.mockApi('tasks/102')).comments[0].comment).toBe(`Follow up: ${href}.`)

			await page.locator('[data-action="close-task-detail"]').click()
			await openSummary(page)
			await page.locator('[data-detail-section-toggle="description"]').click()
			await page.locator('[data-action="edit-task-description"]').focus()
			await page.keyboard.press('Enter')
			await expect(page.locator('[data-detail-description]')).toHaveValue(html)
			await page.locator('[data-detail-description]').fill(`Next: ${href}.`)
			await page.locator('[data-detail-description]').blur()
			await expect(page.locator('.detail-description-read .rich-text-task-link')).toContainText('WORK-7')
			await expect.poll(async () => (await stack.mockApi('tasks/102')).description).toBe(`Next: ${href}.`)
		} finally { await stack.stop() }
	})
}

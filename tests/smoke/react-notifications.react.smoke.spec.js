import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

let stack

test.describe.configure({mode: 'serial'})

test.beforeAll(async () => {
	stack = await startTestStack()
})

test.afterAll(async () => {
	await stack.stop()
})

test.beforeEach(async ({page}) => {
	stack.reset()
	await page.goto(stack.appUrl)
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
})

test('notification bell shows unread count and routes into task detail', async ({page}) => {
	await expect(page.locator('.topbar [data-action="toggle-notifications"]')).toBeVisible()
	await expect(page.locator('.topbar-notification-badge')).toHaveText('2')

	await page.locator('.topbar [data-action="toggle-notifications"]').click()
	await expect(page.locator('[data-notification-panel="true"]')).toContainText('Alex Partner commented on Smoke suite rollout')
	await expect(page.locator('[data-notification-panel="true"]')).toContainText('Reminder for Buy milk')
	await expect(page.locator('[data-notification-panel="true"]')).not.toContainText('created Travel')
	await expect(page.locator('[data-notification-panel="true"]')).not.toContainText('I already handled this one.')

	await page.locator('[data-action="mark-notification-read"][data-notification-id="1"]').click()
	await expect(page.locator('.topbar-notification-badge')).toHaveText('1')
	await expect.poll(async () => {
		const notifications = await stack.mockApi('notifications')
		return notifications.find(notification => notification.id === 1)?.read_at || null
	}).not.toBeNull()

	await page.locator('[data-action="open-notification"][data-notification-id="2"]').click()
	await expect(page.getByRole('heading', {name: 'Inbox'})).toBeVisible()
	await expect(page.locator('[data-detail-title]')).toHaveValue('Buy milk')
	await expect(page.locator('.topbar-notification-badge')).toHaveCount(0)
})

test('mark all notifications read clears the unread badge', async ({page}) => {
	await page.locator('.topbar [data-action="toggle-notifications"]').click()
	await page.locator('[data-action="mark-all-notifications-read"]').click()

	await expect(page.locator('.topbar-notification-badge')).toHaveCount(0)
	await expect(page.locator('[data-action="mark-all-notifications-read"]')).toHaveCount(0)
	await expect.poll(async () => {
		const notifications = await stack.mockApi('notifications')
		return {
			commentReadAt: notifications.find(notification => notification.id === 1)?.read_at || null,
			reminderReadAt: notifications.find(notification => notification.id === 2)?.read_at || null,
			projectReadAt: notifications.find(notification => notification.id === 3)?.read_at || null,
			selfCommentReadAt: notifications.find(notification => notification.id === 4)?.read_at || null,
		}
	}).toEqual({
		commentReadAt: expect.any(String),
		reminderReadAt: expect.any(String),
		projectReadAt: null,
		selfCommentReadAt: null,
	})
})

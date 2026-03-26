import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

let stack

test.describe.configure({mode: 'serial'})

test.beforeAll(async () => {
	stack = await startTestStack({legacyConfigured: false})
})

test.afterAll(async () => {
	if (stack) {
		await stack.stop()
	}
})

test.beforeEach(async ({page}) => {
	stack.reset()
	await page.setViewportSize({width: 900, height: 900})
	await page.goto(stack.appUrl)
	await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
})

async function loginWithPassword(page) {
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="username"]').fill('smoke-user')
	await page.locator('[data-account-field="password"]').fill('smoke-password')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
}

async function expandSettingsSection(page, sectionId) {
	const section = page.locator(`.settings-section[data-settings-section="${sectionId}"]`)
	await section.locator(`[data-settings-section-toggle="${sectionId}"]`).first().click()
	return section
}

test('password login loads the auth shell, sessions, and disconnect flow', async ({page}) => {
	await loginWithPassword(page)

	await expect(page.getByRole('navigation', {name: 'Primary'})).toBeVisible()
	await expect(page.getByRole('button', {name: 'Today'})).toBeVisible()
	await expect(page.getByRole('button', {name: 'Inbox'})).toBeVisible()
	await expect(page.getByRole('button', {name: 'Projects'})).toBeVisible()
	await expect(page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'})).toBeVisible()

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
	await expect(page.getByText('Account & Security')).toBeVisible()
	const accountSection = await expandSettingsSection(page, 'account')
	await expect(accountSection.getByText('Session login')).toBeVisible()
	await expect(accountSection.locator('.detail-value').filter({hasText: 'Smoke User'})).toBeVisible()
	await expect(accountSection.locator('.settings-session-row')).toHaveCount(2)
	page.once('dialog', dialog => dialog.accept())
	await accountSection.locator('[data-action="revoke-account-session"]').first().click()
	await expect(accountSection.locator('.settings-session-row')).toHaveCount(1)

	await expandSettingsSection(page, 'preferences')
	await expect(page.locator('[data-setting-field="timezone"]')).toHaveValue('Europe/Amsterdam')
	await page.locator('[data-setting-field="timezone"]').selectOption('UTC')
	await expect(page.getByText('Timezone updated.')).toBeVisible()

	await expandSettingsSection(page, 'account')
	await page.locator('[data-password-field="oldPassword"]').fill('smoke-password')
	await page.locator('[data-password-field="newPassword"]').fill('smoke-password-2')
	await page.locator('[data-password-field="confirmPassword"]').fill('smoke-password-2')
	await accountSection.locator('[data-form="change-password"]').getByRole('button', {name: 'Change password'}).click()
	await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
	await expect(page.getByText('Password updated. Sign in again with the new password.')).toBeVisible()
	await expect(page.getByRole('navigation', {name: 'Primary'})).toHaveCount(0)

	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="username"]').fill('smoke-user')
	await page.locator('[data-account-field="password"]').fill('smoke-password-2')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
})

test('api token login works and bottom navigation routes between placeholder screens', async ({page}) => {
	await page.locator('[data-action="set-account-auth-mode"][data-auth-mode="apiToken"]').click()
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="apiToken"]').fill('smoke-token')
	await page.getByRole('button', {name: 'Connect'}).click()

	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
	await page.getByRole('button', {name: 'Inbox'}).click()
	await expect(page.getByRole('heading', {name: 'Inbox'})).toBeVisible()
	await page.getByRole('button', {name: 'Projects'}).click()
	await expect(page.getByRole('heading', {name: 'Projects'})).toBeVisible()

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-action="open-labels"]').click()
	await expect(page.getByRole('heading', {name: 'Manage Labels'})).toBeVisible()

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
	const accountSection = await expandSettingsSection(page, 'account')
	await expect(accountSection.locator('.detail-value').filter({hasText: 'API token'})).toBeVisible()
	await expect(accountSection.locator('.settings-session-row')).toHaveCount(0)
	await expect(accountSection.locator('[data-form="change-password"]')).toHaveCount(0)
	await expandSettingsSection(page, 'preferences')
	await page.locator('[data-action="set-theme"][data-theme-option="light"]').click()
	await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
	await page.reload()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
	await expandSettingsSection(page, 'preferences')
	await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
})

test('offline auth blocks live sign-in cleanly', async ({page}) => {
	await page.context().setOffline(true)
	await expect(page.getByText("You're offline.")).toBeVisible()
	await expect(page.getByRole('button', {name: 'Offline'})).toBeDisabled()
})

test('offline reload restores the last signed-in shell in read-only mode', async ({page}) => {
	await loginWithPassword(page)
	await page.evaluate(async () => {
		if ('serviceWorker' in navigator) {
			await navigator.serviceWorker.ready
		}
	})
	await expect
		.poll(() =>
			page.evaluate(() => window.localStorage.getItem('vikunja-mobile-poc:offline-snapshot') !== null),
		)
		.toBe(true)

	await page.context().setOffline(true)
	await page.reload()

	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
	await expect(page.getByText('read-only mode')).toBeVisible()
})

test('offline and browser notification runtime status renders in Settings', async ({page}) => {
	await loginWithPassword(page)

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

	const offlineSection = await expandSettingsSection(page, 'offline')
	await expect(offlineSection.locator('.detail-label').filter({hasText: 'Connection'})).toBeVisible()
	await expect(offlineSection.locator('.detail-label').filter({hasText: 'Offline shell'})).toBeVisible()
	await expect(offlineSection.locator('.detail-label').filter({hasText: 'Cache updates'})).toBeVisible()

	await expect
		.poll(async () => offlineSection.locator('.detail-item.detail-field', {hasText: 'Offline shell'}).textContent())
		.toContain('Ready')
	const notificationsSection = await expandSettingsSection(page, 'notifications')
	await expect(notificationsSection.locator('.detail-label').filter({hasText: 'Browser notifications'})).toBeVisible()
	await expect(notificationsSection.locator('.detail-label').filter({hasText: 'Secure context'})).toBeVisible()
	await expect(notificationsSection.locator('.detail-label').filter({hasText: 'Installed app mode'})).toBeVisible()
	await expect(notificationsSection.locator('.detail-label').filter({hasText: 'Push API'})).toBeVisible()
	await expect(notificationsSection.locator('.detail-item.detail-field', {hasText: 'Secure context'})).toContainText('Yes')
	await expect(notificationsSection.locator('.detail-item.detail-field', {hasText: 'Installed app mode'})).toContainText('No')
	await expect(notificationsSection.locator('.detail-item.detail-field', {hasText: 'Push API'})).toContainText('Supported')
})

test('notification preferences save and affect the notification center', async ({page}) => {
	await loginWithPassword(page)

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

	const section = await expandSettingsSection(page, 'notifications')
	const projectCreationToggle = section.locator('[data-setting-field="notification-projectCreation-center"]')
	await expect(projectCreationToggle).not.toBeChecked()

	await projectCreationToggle.check()
	await section.getByRole('button', {name: 'Save notification preferences'}).click()
	await expect(page.getByText('Notification preferences updated.')).toBeVisible()

	await page.reload()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
	const reloadedSection = await expandSettingsSection(page, 'notifications')
	await expect(reloadedSection.locator('[data-setting-field="notification-projectCreation-center"]')).toBeChecked()

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Today'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
	await page.locator('.topbar [data-action="toggle-notifications"]').first().click()
	await expect(page.locator('.topbar-notification-badge').first()).toHaveText('3')
	await expect(page.locator('[data-notification-panel="true"]').first()).toContainText('Jamie Rivers created Travel')
})

test('granted browser notification permission exposes the test notification action', async ({page}) => {
	await loginWithPassword(page)
	await page.evaluate(() => {
		if (!('Notification' in window)) {
			return
		}

		Object.defineProperty(window.Notification, 'permission', {
			configurable: true,
			get: () => 'granted',
		})
	})

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

	const section = await expandSettingsSection(page, 'notifications')
	await section.getByRole('button', {name: 'Refresh'}).click()
	await expect(section.locator('.detail-item.detail-field', {hasText: 'Browser notifications'})).toContainText('Enabled')
	await expect(section.getByRole('button', {name: 'Send test notification'})).toBeVisible()
})

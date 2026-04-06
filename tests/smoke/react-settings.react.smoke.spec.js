import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'
import {getOfflineSnapshot} from '../helpers/offline-storage.mjs'

let stack
const ONE_PIXEL_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6V1x8AAAAASUVORK5CYII=',
	'base64',
)

test.describe.configure({mode: 'serial'})

test.beforeAll(async () => {
	stack = await startTestStack({
		legacyConfigured: false,
		envOverrides: {
			SESSION_MUTATION_RATE_LIMIT_MAX: '50',
		},
	})
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
	await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible({timeout: 15_000})
})

async function loginWithPassword(page, targetStack = stack) {
	await page.locator('[data-account-field="baseUrl"]').fill(`${targetStack.mock.origin}/api/v1`)
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

async function expandSettingsSection(page, sectionId) {
	const section = page.locator(`.settings-section[data-settings-section="${sectionId}"]`)
	await section.locator(`[data-settings-section-toggle="${sectionId}"]`).first().click()
	return section
}

async function expandSecuritySubsection(securitySection, subsectionId) {
	const subsection = securitySection.locator(`[data-settings-subsection="${subsectionId}"]`)
	await subsection.locator(`[data-settings-subsection-toggle="${subsectionId}"]`).click()
	return subsection
}

async function hasCachedOfflineShell(page) {
	return page.evaluate(async () => {
		if (typeof window === 'undefined' || !('caches' in window)) {
			return false
		}

		const cacheKeys = await caches.keys()
		const shellCacheName = cacheKeys.find(name => name.startsWith('vikunja-pwa-shell'))
		const staticCacheName = cacheKeys.find(name => name.startsWith('vikunja-pwa-static'))
		if (!shellCacheName || !staticCacheName) {
			return false
		}

		const shellCache = await caches.open(shellCacheName)
		const staticCache = await caches.open(staticCacheName)
		const runtimeUrls = [
			'/',
			'/index.html',
			...Array.from(document.querySelectorAll('script[src], link[rel="stylesheet"][href]'))
				.map(element => {
					const href = element instanceof HTMLScriptElement ? element.src : element.getAttribute('href')
					if (!href) {
						return null
					}

					try {
						const url = new URL(href, window.location.origin)
						return url.origin === window.location.origin ? `${url.pathname}${url.search}` : null
					} catch {
						return null
					}
				})
				.filter(Boolean),
		]

		if (!await shellCache.match('/')) {
			return false
		}
		if (!await shellCache.match('/index.html')) {
			return false
		}

		for (const url of runtimeUrls) {
			if (!url) {
				continue
			}

			if (url === '/' || url === '/index.html') {
				if (!await shellCache.match(url)) {
					return false
				}
				continue
			}

			if (!await staticCache.match(url)) {
				return false
			}
		}

		return true
	})
}

async function expectActiveWorkspaceScreen(page, {path, screen, title}) {
	await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe(path)
	const activeScreen = page.locator(`.workspace-screen.is-active[data-screen="${screen}"]`)
	await expect(activeScreen).toBeVisible()
	if (title) {
		await expect(activeScreen.locator('.panel-title').first()).toHaveText(title)
	}
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
	await expect(page.getByText('Account')).toBeVisible()
	const accountSection = await expandSettingsSection(page, 'account')
	await expect(accountSection.getByText('Session login')).toBeVisible()
	await expect(accountSection.locator('.detail-core-card').first().locator('.detail-value').filter({hasText: 'Smoke User'})).toBeVisible()
	await expect(accountSection.locator('.settings-session-row')).toHaveCount(2)
	page.once('dialog', dialog => dialog.accept())
	await accountSection.locator('[data-action="revoke-account-session"]').first().click()
	await expect(accountSection.locator('.settings-session-row')).toHaveCount(1)

	await expandSettingsSection(page, 'preferences')
	await expect(page.locator('[data-setting-field="timezone"]')).toHaveValue('Europe/Amsterdam')
	await page.locator('[data-setting-field="timezone"]').selectOption('UTC')
	await expect(page.locator('[data-timezone-notice]')).toContainText('Timezone updated.')
	await expect(page.locator('.settings-notice')).toHaveCount(0)

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

test('avatar settings switch providers and upload a custom avatar', async ({page}) => {
	await loginWithPassword(page)

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

	let accountSection = await expandSettingsSection(page, 'account')
	await expect(accountSection.locator('[data-avatar-provider-option="default"]')).toHaveAttribute('aria-pressed', 'true')

	await accountSection.locator('[data-avatar-provider-option="gravatar"]').click()
	await expect(page.getByText('Avatar provider updated.')).toBeVisible()
	await expect(accountSection.locator('[data-avatar-provider-option="gravatar"]')).toHaveAttribute('aria-pressed', 'true')

	await page.reload()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
	accountSection = await expandSettingsSection(page, 'account')
	await expect(accountSection.locator('[data-avatar-provider-option="gravatar"]')).toHaveAttribute('aria-pressed', 'true')
	await expect(accountSection.locator('.settings-avatar-row img.user-avatar')).toHaveCount(1)
	await expect(accountSection.locator('.settings-avatar-row .user-avatar-initials')).toHaveCount(0)

	await accountSection.locator('[data-avatar-provider-option="initials"]').click()
	await expect(page.getByText('Avatar provider updated.')).toBeVisible()
	await expect(accountSection.locator('.settings-avatar-row .user-avatar-initials')).toHaveCount(1)

	await accountSection.locator('[data-avatar-upload-input]').setInputFiles({
		name: 'avatar.png',
		mimeType: 'image/png',
		buffer: ONE_PIXEL_PNG,
	})
	await expect(page.getByText('Avatar uploaded.')).toBeVisible()
	await expect(accountSection.locator('[data-avatar-provider-option="upload"]')).toHaveAttribute('aria-pressed', 'true')
	await expect(accountSection.locator('.settings-avatar-row img.user-avatar')).toHaveCount(1)
})

test('account settings cover email change, export, and deletion flows', async ({page}) => {
	await loginWithPassword(page)
	await openSettings(page)

	const accountSection = await expandSettingsSection(page, 'account')
	await accountSection.locator('[data-email-field="password"]').fill('smoke-password')
	await accountSection.locator('[data-email-field="newEmail"]').fill('updated-smoke@example.test')
	await accountSection.locator('[data-form="change-email"]').getByRole('button', {name: 'Update email'}).click()
	await expect(accountSection.locator('[data-change-email-notice]')).toContainText(
		'Email update requested. Check your inbox for a confirmation link.',
	)
	await expect(page.locator('.settings-notice')).toHaveCount(0)

	await accountSection.locator('[data-form="request-export"] input[type="password"]').fill('smoke-password')
	await accountSection.locator('[data-form="request-export"]').getByRole('button', {name: 'Request export'}).click()
	await expect(accountSection.locator('[data-data-export-notice]')).toContainText(
		'Export requested. Vikunja will email you when it is ready to download.',
	)
	await expect(accountSection.getByText('Your export is ready to download.')).toBeVisible()

	await accountSection.locator('[data-form="request-deletion"] input[type="text"]').fill('DELETE')
	await accountSection.locator('[data-form="request-deletion"] input[type="password"]').fill('smoke-password')
	await accountSection.locator('[data-form="request-deletion"]').getByRole('button', {name: 'Send deletion confirmation email'}).click()
	await expect(accountSection.locator('[data-account-deletion-notice]')).toContainText(
		'Deletion requested. Check your email for the confirmation link.',
	)
	await expect(page.locator('.settings-notice')).toHaveCount(0)
	await expect(accountSection.locator('[data-form="request-deletion"]')).toBeVisible()

	await page.goto(`${stack.appUrl}/?accountDeletionConfirm=delete-token-1`)
	await expect(page).toHaveURL(/\/settings$/)
	const reopenedAccountSection = await expandSettingsSection(page, 'account')
	await expect(reopenedAccountSection.locator('[data-account-deletion-notice]')).toContainText(
		'Deletion confirmed. Vikunja will delete your account in three days unless you cancel it first.',
	)
	await expect(reopenedAccountSection.getByText(/scheduled this account for deletion on/i)).toBeVisible()
	await reopenedAccountSection.locator('[data-form="cancel-deletion"] input[type="password"]').fill('smoke-password')
	await reopenedAccountSection.getByRole('button', {name: 'Cancel scheduled deletion'}).click()
	await expect(reopenedAccountSection.locator('[data-account-deletion-notice]')).toContainText('Account deletion cancelled.')
	await expect(page.getByText(/scheduled for deletion/i)).toHaveCount(0)
	await expect(reopenedAccountSection.getByText(/scheduled this account for deletion on/i)).toHaveCount(0)
	await expect(reopenedAccountSection.locator('[data-form="request-deletion"]')).toBeVisible()

	await page.reload()
	await expect(page.getByText(/scheduled for deletion/i)).toHaveCount(0)
	const reloadedAccountSection = await expandSettingsSection(page, 'account')
	await expect(reloadedAccountSection.getByText(/scheduled this account for deletion on/i)).toHaveCount(0)
	await expect(reloadedAccountSection.locator('[data-form="request-deletion"]')).toBeVisible()
})

test('settings webhooks create and update user webhook subscriptions', async ({page}) => {
	await loginWithPassword(page)
	await openSettings(page)

	const webhooksSection = await expandSettingsSection(page, 'webhooks')
	await webhooksSection.locator('[data-webhook-target-url="user"]').fill('https://example.test/user-webhook')
	await webhooksSection.locator('[data-webhook-event="user-create:task.created"]').check({force: true})
	await webhooksSection.locator('[data-action="create-webhook"][data-webhook-scope-action="user"]').click()

	await expect.poll(async () => {
		const hooks = await stack.mockApi('user/settings/webhooks')
		return hooks.length
	}).toBe(1)

	const createdWebhook = webhooksSection.locator('[data-webhook-row]').first()
	await expect(createdWebhook).toContainText('https://example.test/user-webhook')
	await webhooksSection.locator('[data-webhook-event="user-existing-1:task.updated"]').check({force: true})
	await webhooksSection.locator('[data-action="save-webhook-events"][data-webhook-id="1"]').click()

	await expect.poll(async () => {
		const hooks = await stack.mockApi('user/settings/webhooks')
		return hooks[0]?.events || []
	}).toEqual(['task.created', 'task.updated'])
})

test('migration settings support file uploads and oauth callback completion', async ({page}) => {
	await loginWithPassword(page)
	await openSettings(page)

	const migrationSection = await expandSettingsSection(page, 'migration')
	await expect(migrationSection.getByText(/If that callback still points at the original Vikunja frontend/i)).toBeVisible()
	await expect(migrationSection.getByText(/developer app must also use the same callback URL/i)).toBeVisible()
	await expect(migrationSection.getByText(new RegExp(`${stack.appUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/migrate/todoist`))).toBeVisible()
	await expect(migrationSection.locator('[data-migration-service="todoist"]')).toContainText('Ready to import from Todoist.')
	await expect(migrationSection.locator('[data-migration-service="ticktick"]')).toContainText('Upload a TickTick export file to begin.')

	await migrationSection.locator('[data-migration-file-input="ticktick"]').setInputFiles({
		name: 'ticktick.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from('title,content\nSmoke import,Task\n', 'utf8'),
	})
	await migrationSection.locator('[data-migration-service="ticktick"]').getByRole('button', {name: 'Upload & Import'}).click()

	await expect.poll(async () => {
		const status = await stack.mockApi('migration/ticktick/status')
		return status.status
	}).toBe('running')
	await expect(migrationSection.locator('[data-migration-service="ticktick"]')).toContainText('Import file uploaded. Vikunja is processing it.')

	await page.goto(`${stack.appUrl}/migrate/todoist?code=oauth-import-code`)
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
	const reopenedMigrationSection = page.locator('.settings-section[data-settings-section="migration"]')
	await expect(reopenedMigrationSection.locator('.settings-section-title')).toHaveAttribute('aria-expanded', 'true')
	await expect(reopenedMigrationSection.locator('[data-migration-service="todoist"]')).toContainText('Import started. Vikunja is processing it.')
})

test('migration settings keep disabled importers visible and link operators to provider settings', async ({page}) => {
	const limitedStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
		mockVikunjaOptions: {
			availableMigrators: ['todoist', 'ticktick', 'vikunja-file'],
		},
		envOverrides: {
			SESSION_MUTATION_RATE_LIMIT_MAX: '50',
		},
	})

	try {
		await page.goto(limitedStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible({timeout: 15_000})
		await loginWithPassword(page, limitedStack)
		await openSettings(page)

		const migrationSection = await expandSettingsSection(page, 'migration')
		await expect(migrationSection.locator('[data-migration-service="todoist"]')).toBeVisible()
		await expect(migrationSection.locator('[data-migration-service="ticktick"]')).toBeVisible()
		await expect(migrationSection.locator('[data-migration-service="vikunja-file"]')).toBeVisible()
		await expect(migrationSection.locator('[data-migration-service="trello"][data-migration-available="false"]')).toBeVisible()
		await expect(migrationSection.locator('[data-migration-service="microsoft-todo"][data-migration-available="false"]')).toBeVisible()
		await expect(migrationSection.locator('[data-migration-service="trello"]')).toContainText('Not enabled')
		await migrationSection.locator('[data-migration-service="trello"]').getByRole('button', {name: 'Enable provider'}).click()
		const adminSection = page.locator('.settings-section[data-settings-section="userAdministration"]')
		await expect(adminSection.locator('.settings-section-title')).toHaveAttribute('aria-expanded', 'true')
		await expect(adminSection.locator('[data-form="migration-importer-config"]')).toHaveCount(1)
		await expect(migrationSection.getByText('Not Found')).toHaveCount(0)
	} finally {
		await limitedStack.stop()
	}
})

test('migration importer settings can enable providers and set PWA callback URLs', async ({page}) => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			hostConfigPathEnabled: true,
			initialConfigYaml: `migration:
  todoist:
    enable: false
    clientid: todoist-initial
    redirecturl: https://legacy.example.test/migrate/todoist
  trello:
    enable: false
    key: trello-initial
    redirecturl: https://legacy.example.test/migrate/trello
  microsofttodo:
    enable: false
    clientid: microsoft-initial
    redirecturl: https://legacy.example.test/migrate/microsoft-todo
`,
		},
	})

	try {
		await page.goto(bridgeStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, bridgeStack)
		await openSettings(page)

		const section = await expandSettingsSection(page, 'userAdministration')
		await expect(section.locator('[data-form="migration-importer-config"]')).toHaveCount(1)

		await section.locator('[data-migration-importer-field="todoist-enabled"]').check()
		await section.locator('[data-migration-importer-field="todoist-client-id"]').fill('todoist-updated')
		await section.locator('[data-migration-importer-field="todoist-client-secret"]').fill('todoist-secret')
		const todoistProvider = section.locator('[data-migration-importer-provider="todoist"]')
		await todoistProvider.getByRole('button', {name: 'Use PWA callback'}).click()
		await expect(section.locator('[data-migration-importer-field="todoist-redirect-url"]')).toHaveValue(`${bridgeStack.appUrl}/migrate/todoist`)
		await expect(todoistProvider.getByText(/developer app must use this exact same OAuth redirect URL/i)).toBeVisible()

		await section.locator('[data-migration-importer-field="trello-enabled"]').check()
		await section.locator('[data-migration-importer-field="trello-key"]').fill('trello-updated')
		await section.locator('[data-migration-importer-provider="trello"]').getByRole('button', {name: 'Use PWA callback'}).click()
		await expect(section.locator('[data-migration-importer-field="trello-redirect-url"]')).toHaveValue(`${bridgeStack.appUrl}/migrate/trello`)

		await section.locator('[data-action="save-migration-importer-config"]').click()
		await expect(page.getByText('Migration importer settings saved.')).toBeVisible()
		await expect(section.locator('[data-action="apply-migration-importer-config"]')).toBeEnabled()
		await section.locator('[data-action="apply-migration-importer-config"]').click()
		await expect(page.getByText('Migration importer settings applied.')).toBeVisible()

		await expect.poll(() => bridgeStack.adminBridge?.readHostConfig() || '').toContain('clientid: todoist-updated')
		await expect(bridgeStack.adminBridge?.readHostConfig() || '').toContain(`redirecturl: ${bridgeStack.appUrl}/migrate/todoist`)
		await expect(bridgeStack.adminBridge?.readHostConfig() || '').toContain('key: trello-updated')
		await expect(bridgeStack.adminBridge?.readHostConfig() || '').toContain(`redirecturl: ${bridgeStack.appUrl}/migrate/trello`)
	} finally {
		await bridgeStack.stop()
	}
})

test('security settings cover totp, caldav tokens, and api tokens', async ({page}) => {
	test.setTimeout(60_000)
	await loginWithPassword(page)
	await openSettings(page)

	const securitySection = await expandSettingsSection(page, 'security')
	const caldavSection = await expandSecuritySubsection(securitySection, 'caldav')
	await expect(caldavSection.locator('[data-security-output="caldav-base-url"]')).toHaveValue(`${stack.mock.origin}/dav/`)
	await expect(caldavSection.locator('[data-security-output="caldav-discovery-url"]')).toHaveValue(
		`${stack.mock.origin}/dav/principals/smoke-user/`,
	)
	await expect(caldavSection.locator('[data-security-output="caldav-username"]')).toHaveValue('smoke-user')
	await expect(caldavSection.getByText('Generated CalDAV tokens are shown once. Copy and save them before clearing this panel.')).toBeVisible()
	await expect(caldavSection.locator('[data-copy-field="caldav-base-url"]')).toBeVisible()
	await expect(caldavSection.locator('[data-copy-field="caldav-discovery-url"]')).toBeVisible()
	await expect(caldavSection.locator('[data-copy-field="caldav-username"]')).toBeVisible()
	const totpSection = await expandSecuritySubsection(securitySection, 'totp')
	await expect(securitySection.locator('[data-settings-subsection="caldav"] [data-security-output="caldav-base-url"]')).toHaveCount(0)
	await totpSection.locator('[data-action="enroll-totp"]').click()
	await expect(totpSection.locator('[data-form="enable-totp"]')).toBeVisible()
	await expect(totpSection.locator('[data-security-output="totp-secret"]')).toHaveValue('SMOKE-TOTP-SECRET')
	await expect(totpSection.locator('[data-security-output="totp-url"]')).toHaveValue(
		'otpauth://totp/Vikunja:smoke-user?secret=SMOKE-TOTP-SECRET&issuer=Vikunja',
	)
	await expect(totpSection.locator('[data-copy-field="totp-secret"]')).toBeVisible()
	await expect(totpSection.locator('[data-copy-field="totp-url"]')).toBeVisible()

	await page.reload()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
	const reloadedSecuritySection = await expandSettingsSection(page, 'security')
	const reloadedTotpSection = await expandSecuritySubsection(reloadedSecuritySection, 'totp')
	await expect(reloadedTotpSection.locator('[data-form="enable-totp"]')).toBeVisible()
	await expect(reloadedTotpSection.locator('[data-action="enroll-totp"]')).toHaveCount(0)
	await expect(reloadedTotpSection.locator('[data-security-output="totp-secret"]')).toHaveValue('SMOKE-TOTP-SECRET')
	await expect(reloadedTotpSection.locator('[data-security-output="totp-url"]')).toHaveValue(
		'otpauth://totp/Vikunja:smoke-user?secret=SMOKE-TOTP-SECRET&issuer=Vikunja',
	)
	await reloadedTotpSection.locator('[data-totp-field="cancel-password"]').fill('smoke-password')
	await reloadedTotpSection.locator('[data-form="cancel-totp-enrollment"]').getByRole('button', {name: 'Cancel setup'}).click()
	await expect(reloadedTotpSection.locator('[data-action="enroll-totp"]')).toBeVisible()
	await expect(reloadedTotpSection.locator('[data-form="enable-totp"]')).toHaveCount(0)

	await reloadedTotpSection.locator('[data-action="enroll-totp"]').click()
	await expect(reloadedTotpSection.locator('[data-form="enable-totp"]')).toBeVisible()
	await reloadedTotpSection.locator('[data-totp-field="passcode"]').fill('123456')
	await reloadedTotpSection.locator('[data-form="enable-totp"]').getByRole('button', {name: 'Activate 2FA'}).click()
	await expect(reloadedTotpSection.getByText('2FA is active for this Vikunja account.')).toBeVisible()
	await reloadedTotpSection.locator('[data-totp-field="password"]').fill('smoke-password')
	await reloadedTotpSection.locator('[data-form="disable-totp"]').getByRole('button', {name: 'Disable 2FA'}).click()
	await expect(reloadedTotpSection.locator('[data-action="enroll-totp"]')).toBeVisible()

	const reloadedCaldavSection = await expandSecuritySubsection(reloadedSecuritySection, 'caldav')
	await expect(reloadedSecuritySection.locator('[data-settings-subsection="totp"] [data-action="enroll-totp"]')).toHaveCount(0)
	await reloadedCaldavSection.locator('[data-action="create-caldav-token"]').click()
	await expect(reloadedCaldavSection.locator('[data-security-output="new-caldav-token"]')).toHaveValue('caldav-token-1')
	await expect(reloadedCaldavSection.locator('[data-copy-field="new-caldav-token"]')).toBeVisible()
	await reloadedCaldavSection.locator('[data-action="clear-caldav-token"]').click()
	await expect(reloadedCaldavSection.getByText('Token #1')).toBeVisible()
	await reloadedCaldavSection.locator('[data-action="delete-caldav-token"][data-token-id="1"]').click()
	await expect(reloadedCaldavSection.getByText('No CalDAV tokens yet.')).toBeVisible()

	const reloadedApiSection = await expandSecuritySubsection(reloadedSecuritySection, 'apiTokens')
	await expect(reloadedSecuritySection.locator('[data-settings-subsection="caldav"] [data-action="create-caldav-token"]')).toHaveCount(0)
	await expect(reloadedApiSection.locator('[data-form="create-api-token-sheet"]')).toHaveCount(0)
	await reloadedApiSection.locator('[data-action="open-api-token-dialog"]').click()
	const apiTokenSheet = page.locator('[data-form="create-api-token-sheet"]')
	await expect(apiTokenSheet).toBeVisible()
	await expect(apiTokenSheet.getByRole('button', {name: 'Create API token'})).toBeDisabled()
	await apiTokenSheet.locator('[data-api-token-field="title"]').fill('Settings smoke token')
	await expect(apiTokenSheet.getByRole('button', {name: 'Create API token'})).toBeDisabled()
	await apiTokenSheet.getByRole('button', {name: 'Cancel'}).click()
	await expect(apiTokenSheet).toHaveCount(0)
	await reloadedApiSection.locator('[data-action="open-api-token-dialog"]').click()
	await expect(apiTokenSheet).toBeVisible()
	await apiTokenSheet.locator('[data-action="select-all-api-token-permissions"]').click()
	await expect(apiTokenSheet.getByRole('button', {name: 'Create API token'})).toBeDisabled()
	await apiTokenSheet.locator('[data-api-token-field="title"]').fill('Settings smoke token')
	await expect(apiTokenSheet.locator('[data-api-token-permission="projects:read_all"]')).toBeChecked()
	await expect(apiTokenSheet.getByRole('button', {name: 'Create API token'})).toBeDisabled()
	await apiTokenSheet.locator('[data-api-token-field="expiry"]').fill('30/04/2026')
	await apiTokenSheet.locator('[data-api-token-field="expiry"]').press('Tab')
	await expect(apiTokenSheet.getByRole('button', {name: 'Create API token'})).toBeEnabled()
	await apiTokenSheet.getByRole('button', {name: 'Create API token'}).click()
	await expect(apiTokenSheet).toHaveCount(0)
	await expect(reloadedApiSection.locator('[data-security-output="new-api-token"]')).toHaveValue('api-token-1')
	await expect(reloadedApiSection.locator('[data-copy-field="new-api-token"]')).toBeVisible()
	await reloadedApiSection.locator('[data-action="clear-api-token"]').click()
	await expect(reloadedApiSection.getByText('Settings smoke token')).toBeVisible()
	await reloadedApiSection.locator('[data-action="delete-api-token"][data-token-id="1"]').click()
	await expect(reloadedApiSection.getByText('No API tokens yet.')).toBeVisible()
})

test('app data settings surface version, motd, and auth provider state', async ({page}) => {
	await loginWithPassword(page)
	await openSettings(page)

	const appDataSection = await expandSettingsSection(page, 'appData')
	await expect(appDataSection.getByText('Vikunja version: test')).toBeVisible()
	await expect(appDataSection.getByText('MOTD: Smoke suite MOTD')).toBeVisible()
	await expect(appDataSection.getByText('Background providers: unsplash')).toBeVisible()
	await expect(appDataSection.getByText('Auth methods: Local enabled · OIDC disabled')).toBeVisible()
})

test('teams section blocks non-admins from managing teams and other members', async ({page}) => {
	await stack.mockApi('teams/1/members', {
		method: 'PUT',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			username: 'jamie',
		}),
	})
	await stack.mockApi('teams/1/members/jamie/admin', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({}),
	})
	await stack.mockApi('teams/1/members', {
		method: 'PUT',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			username: 'apartner',
		}),
	})
	await stack.mockApi('teams/1/members/smoke-user/admin', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({}),
	})

	await loginWithPassword(page)
	await openSettings(page)

	const teamsSection = await expandSettingsSection(page, 'teams')
	const homeTeamCard = teamsSection.locator('.settings-team-card').filter({hasText: 'Home Team'})
	await expect(homeTeamCard).toBeVisible()

	await homeTeamCard.getByRole('button', {name: 'Manage Home Team'}).click()
	await expect(page.locator('.menu-note').filter({hasText: 'Only team admins can manage this team.'})).toBeVisible()
	await expect(page.getByRole('button', {name: 'Edit team'})).toHaveCount(0)
	await expect(page.getByRole('button', {name: 'Add member'})).toHaveCount(0)
	await expect(page.getByRole('button', {name: 'Delete team'})).toHaveCount(0)
	await homeTeamCard.getByRole('button', {name: 'Manage Home Team'}).click()
	await expect(page.locator('.menu-note').filter({hasText: 'Only team admins can manage this team.'})).toHaveCount(0)

	const alexRow = homeTeamCard.locator('.settings-team-member-row').filter({hasText: 'Alex Partner'})
	await expect(alexRow).toBeVisible()
	await alexRow.getByRole('button', {name: 'Manage apartner'}).click()
	await expect(page.locator('.menu-note').filter({hasText: 'Only team admins can manage other members.'})).toBeVisible()
	await expect(page.getByRole('button', {name: 'Make admin'})).toHaveCount(0)
	await expect(page.getByRole('button', {name: 'Remove from team'})).toHaveCount(0)
})

test('teams section shows current access and uses dialogs for team editing and member invites', async ({page}) => {
	await loginWithPassword(page)
	await openSettings(page)

	const teamsSection = await expandSettingsSection(page, 'teams')
	const homeTeamCard = teamsSection.locator('.settings-team-card').filter({hasText: 'Home Team'})
	await expect(homeTeamCard).toBeVisible()
	await expect(homeTeamCard.getByText('Your access: Admin')).toBeVisible()

	await homeTeamCard.getByRole('button', {name: 'Manage Home Team'}).click()
	await page.getByRole('button', {name: 'Edit team'}).click()
	const teamDialog = page.locator('[data-form="team-dialog"]')
	await expect(teamDialog).toBeVisible()
	await expect(teamDialog.locator('[data-team-field="name"]')).toHaveValue('Home Team')
	await expect(teamDialog.locator('[data-team-field="description"]')).toHaveValue('Shared household team')
	await teamDialog.locator('[data-team-field="name"]').fill('Home Team Updated')
	await teamDialog.locator('[data-team-field="description"]').fill('Updated description for the household team')
	await teamDialog.locator('[data-action="submit-team-dialog"]').click()

	const updatedTeamCard = teamsSection.locator('.settings-team-card').filter({hasText: 'Home Team Updated'})
	await expect(updatedTeamCard).toBeVisible()
	await expect(updatedTeamCard).toContainText('Updated description for the household team')

	await updatedTeamCard.getByRole('button', {name: 'Manage Home Team Updated'}).click()
	await page.getByRole('button', {name: 'Add member'}).click()
	await expect(teamDialog).toBeVisible()
	await teamDialog.locator('[data-team-field="username"]').fill('jamie')
	await teamDialog.locator('[data-action="submit-team-dialog"]').click()

	await expect(updatedTeamCard.locator('.settings-team-member-row').filter({hasText: 'Jamie Rivers'})).toBeVisible()
})

test('api token login works and bottom navigation routes between workspace screens', async ({page}) => {
	await page.locator('[data-action="set-account-auth-mode"][data-auth-mode="apiToken"]').click()
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="apiToken"]').fill('smoke-token')
	await page.getByRole('button', {name: 'Connect'}).click()

	const primaryNav = page.getByRole('navigation', {name: 'Primary'})
	await expectActiveWorkspaceScreen(page, {path: '/', screen: 'today', title: 'Today'})
	await primaryNav.getByRole('button', {name: 'Inbox'}).click()
	await expectActiveWorkspaceScreen(page, {path: '/inbox', screen: 'inbox', title: 'Inbox'})
	await primaryNav.getByRole('button', {name: 'Projects'}).click()
	await expectActiveWorkspaceScreen(page, {path: '/projects', screen: 'projects', title: 'Projects'})

	await primaryNav.getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-action="open-labels"]').click()
	await expect(page.getByRole('heading', {name: 'Manage Labels'})).toBeVisible()

	await primaryNav.getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-action="go-settings"]').click()
	await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe('/settings')
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

test('user administration explains when the CLI bridge is not configured', async ({page}) => {
	const localStack = await startTestStack({
		legacyConfigured: false,
		envOverrides: {
			ADMIN_BRIDGE_ALLOWED_EMAILS: '',
		},
	})

	try {
		await page.goto(localStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, localStack)

		await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
		await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
		await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

		const section = await expandSettingsSection(page, 'userAdministration')
		await expect(section.getByText('User administration requires the Vikunja CLI bridge to be configured and reachable on the server.')).toBeVisible()
		await expect(section.getByText('Only authorized operator accounts can manage instance users from the PWA app.')).toHaveCount(0)
	} finally {
		await localStack.stop()
	}
})

test('user administration explains when the configured CLI bridge is unreachable', async ({page}) => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
		envOverrides: {
			ADMIN_BRIDGE_ALLOWED_EMAILS: '',
		},
	})
	bridgeStack.adminBridge?.setState({containerRunning: false})

	try {
		await page.goto(bridgeStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, bridgeStack)

		await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
		await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
		await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

		const section = await expandSettingsSection(page, 'userAdministration')
		await expect(section.getByText('User administration requires the Vikunja CLI bridge to be configured and reachable on the server.')).toBeVisible()
		await expect(section.getByText('Only authorized operator accounts can manage instance users from the PWA app.')).toHaveCount(0)
	} finally {
		await bridgeStack.stop()
	}
})

test('user administration explains when the operator account is not allowlisted', async ({page}) => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
		envOverrides: {
			ADMIN_BRIDGE_ALLOWED_EMAILS: '',
		},
	})

	try {
		await page.goto(bridgeStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, bridgeStack)

		await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
		await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
		await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

		const section = await expandSettingsSection(page, 'userAdministration')
		await expect(section.getByText('Only authorized operator accounts can manage instance users from the PWA app.')).toBeVisible()
		await expect(section.getByText('User administration requires the Vikunja CLI bridge to be configured and reachable on the server.')).toHaveCount(0)
	} finally {
		await bridgeStack.stop()
	}
})

test('user administration stays available when Vikunja omits the authenticated email', async ({page}) => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
		mockVikunjaOptions: {
			hideAuthenticatedUserEmail: true,
		},
	})

	try {
		await page.goto(bridgeStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, bridgeStack)

		await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
		await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
		await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

		const section = await expandSettingsSection(page, 'userAdministration')
		await expect(section.getByText('Only authorized operator accounts can manage instance users from the PWA app.')).toHaveCount(0)
		await expect(section.getByRole('button', {name: 'Create user'})).toBeVisible()
	} finally {
		await bridgeStack.stop()
	}
})

test('user administration shows operator access status and bridge capability limits', async ({page}) => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
	})

	try {
		await page.goto(bridgeStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, bridgeStack)
		await openSettings(page)

		const section = await expandSettingsSection(page, 'userAdministration')
		const operatorStatus = section.locator('[data-admin-operator-status="active"]')
		await expect(operatorStatus).toBeVisible()
		await expect(section.getByText('Operator access active')).toBeVisible()
		await expect(section.getByText('Bridge ready')).toBeVisible()
		await expect(operatorStatus.locator('.detail-value')).toHaveText('smoke-user')
		await expect(operatorStatus.locator('.detail-meta')).toHaveText('smoke@example.test · smoke-user')
		await expect(
			section.getByText(
				'Instance user roles are not exposed by the current Vikunja CLI bridge. This UI currently supports user lifecycle operations only: create, edit identity, enable or disable, reset password, and delete.',
			),
		).toBeVisible()
	} finally {
		await bridgeStack.stop()
	}
})

test('mobile user administration stays within the viewport width', async ({page}) => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
	})

	try {
		await page.setViewportSize({width: 390, height: 844})
		await page.goto(bridgeStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, bridgeStack)
		await openSettings(page)

		const section = await expandSettingsSection(page, 'userAdministration')
		await expect(section.getByRole('button', {name: 'Create user'})).toBeVisible()

		const sectionMetrics = await section.locator('.settings-section-content').evaluate(node => ({
			clientWidth: node.clientWidth,
			scrollWidth: node.scrollWidth,
		}))
		expect(sectionMetrics.scrollWidth).toBeLessThanOrEqual(sectionMetrics.clientWidth + 1)

		await section.getByRole('button', {name: /Manage /}).first().click()
		const userDetailMetrics = await page.locator('.settings-admin-user-sheet').evaluate(node => ({
			clientWidth: node.clientWidth,
			scrollWidth: node.scrollWidth,
		}))
		expect(userDetailMetrics.scrollWidth).toBeLessThanOrEqual(userDetailMetrics.clientWidth + 1)
		await page.locator('[data-action="close-admin-user-detail"]').click()

		await section.getByRole('button', {name: 'Create user'}).click()
		const dialogMetrics = await page.locator('[data-form="admin-user-dialog"]').evaluate(node => ({
			clientWidth: node.clientWidth,
			scrollWidth: node.scrollWidth,
		}))
		expect(dialogMetrics.scrollWidth).toBeLessThanOrEqual(dialogMetrics.clientWidth + 1)
	} finally {
		await bridgeStack.stop()
	}
})

test('mobile migration importer settings stay within the viewport width', async ({page}) => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: true,
	})

	try {
		await page.setViewportSize({width: 390, height: 844})
		await page.goto(bridgeStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, bridgeStack)
		await openSettings(page)

		const section = await expandSettingsSection(page, 'userAdministration')
		const providerCard = section.locator('[data-migration-importer-provider="microsofttodo"]')
		await expect(providerCard).toBeVisible()

		const sectionMetrics = await section.locator('.settings-section-content').evaluate(node => ({
			clientWidth: node.clientWidth,
			scrollWidth: node.scrollWidth,
		}))
		expect(sectionMetrics.scrollWidth).toBeLessThanOrEqual(sectionMetrics.clientWidth + 1)

		const providerMetrics = await providerCard.evaluate(node => ({
			clientWidth: node.clientWidth,
			scrollWidth: node.scrollWidth,
		}))
		expect(providerMetrics.scrollWidth).toBeLessThanOrEqual(providerMetrics.clientWidth + 1)
	} finally {
		await bridgeStack.stop()
	}
})

test('SMTP form stays hidden when the admin bridge is unavailable', async ({page}) => {
	await loginWithPassword(page)

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

	const section = await expandSettingsSection(page, 'userAdministration')
	await expect(section.getByText('SMTP inspection requires the Vikunja admin bridge to be configured and reachable.')).toBeVisible()
	await expect(section.locator('[data-form="mailer-config"]')).toHaveCount(0)
})

test('SMTP config becomes read-only when no writable host config path is configured', async ({page}) => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			envVars: {
				VIKUNJA_MAILER_ENABLED: 'true',
				VIKUNJA_MAILER_HOST: 'smtp.readonly.local',
				VIKUNJA_MAILER_FROMEMAIL: 'readonly@example.test',
			},
		},
	})

	try {
		await page.goto(bridgeStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, bridgeStack)

		await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
		await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
		await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

		const section = await expandSettingsSection(page, 'userAdministration')
		await expect(section.locator('[data-form="mailer-config"]')).toHaveCount(1)
		await expect(section.getByText('SMTP settings are read-only because no writable deployment config source is configured on the server.')).toBeVisible()
		await expect(section.locator('[data-mailer-field="host"]')).toHaveValue('smtp.readonly.local')
		await expect(section.locator('[data-mailer-field="host"]')).toBeDisabled()
		await expect(section.locator('[data-action="save-mailer-config"]')).toHaveCount(0)
		await expect(section.locator('[data-action="apply-mailer-config"]')).toHaveCount(0)
	} finally {
		await bridgeStack.stop()
	}
})

test('SMTP config load failure only retries when Reload is pressed', async ({page}) => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			hostConfigPathEnabled: true,
			hostConfigPathMode: 'directory',
		},
	})

	try {
		let mailerRequestCount = 0
		page.on('response', response => {
			if (response.url().endsWith('/api/admin/config/mailer')) {
				mailerRequestCount += 1
			}
		})

		await page.goto(bridgeStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, bridgeStack)

		await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
		await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
		await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

		const section = await expandSettingsSection(page, 'userAdministration')
		await expect(section.getByText('SMTP configuration could not be loaded. Use Reload after fixing bridge access or config-file access.')).toBeVisible()
		await expect(section.locator('[data-form="mailer-config"]')).toHaveCount(0)
		await expect.poll(() => mailerRequestCount).toBe(1)
		await page.waitForTimeout(700)
		expect(mailerRequestCount).toBe(1)

		await section.locator('[data-action="reload-admin-users"]').click()
		await expect.poll(() => mailerRequestCount).toBe(2)
	} finally {
		await bridgeStack.stop()
	}
})

test('mail diagnostics show failure when Vikunja testmail logs an SMTP error despite exiting successfully', async ({page}) => {
	const bridgeStack = await startTestStack({
		legacyConfigured: false,
		mockAdminBridge: {
			testmail: {
				exitCode: 0,
				stdout: [
					'time=2026-03-30T12:21:48.606Z level=INFO msg="Sending testmail..."',
					'time=2026-03-30T12:21:49.916Z level=ERROR msg="Error sending test mail: dial failed: SMTP AUTH failed: 535 5.7.0 Invalid login or password"',
				].join('\n'),
				stderr: 'warning: diagnostic noise\n',
			},
		},
	})

	try {
		await page.goto(bridgeStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await loginWithPassword(page, bridgeStack)

		await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
		await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
		await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()

		const section = await expandSettingsSection(page, 'userAdministration')
		await section.locator('[data-admin-field="testmail-email"]').fill('test@example.com')
		await section.locator('[data-action="send-testmail"]').click()

		await expect(section.getByText('Mail delivery failed')).toBeVisible()
		await expect(section.getByText('Mail sent successfully')).toHaveCount(0)
		await expect(section.getByText(/smtp auth failed/i)).toBeVisible()
	} finally {
		await bridgeStack.stop()
	}
})

test('sign-in form keeps the server and username after reload and session loss', async ({page}) => {
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="username"]').fill('smoke-user')
	await page.locator('[data-account-field="password"]').fill('smoke-password')
	await page.reload()

	await expect(page.locator('[data-account-field="baseUrl"]')).toHaveValue(`${stack.mock.origin}/api/v1`)
	await expect(page.locator('[data-account-field="username"]')).toHaveValue('smoke-user')
	await expect(page.locator('[data-account-field="password"]')).toHaveValue('')

	await page.locator('[data-account-field="password"]').fill('smoke-password')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()

	await page.context().clearCookies()
	await page.reload()

	await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
	await expect(page.locator('[data-account-field="baseUrl"]')).toHaveValue(`${stack.mock.origin}/api/v1`)
	await expect(page.locator('[data-account-field="username"]')).toHaveValue('smoke-user')
	await expect(page.locator('[data-account-field="password"]')).toHaveValue('')
})

test('offline reload restores the last signed-in shell from the cached snapshot', async ({page}) => {
	await loginWithPassword(page)
	await page.evaluate(async () => {
		if ('serviceWorker' in navigator) {
			await navigator.serviceWorker.ready
		}
	})
	if (!await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))) {
		await page.reload({waitUntil: 'domcontentloaded'})
		await expect(page.getByRole('navigation', {name: 'Primary'})).toBeVisible({timeout: 15_000})
	}
	await expect
		.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)))
		.toBe(true)
	await expect
		.poll(async () => Boolean(await getOfflineSnapshot(page)))
		.toBe(true)
	await expect
		.poll(async () => Boolean(await hasCachedOfflineShell(page)))
		.toBe(true)

	await page.context().setOffline(true)
	await page.reload({waitUntil: 'domcontentloaded'})

	await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe('/')
	await expect(page.getByRole('navigation', {name: 'Primary'})).toBeVisible({timeout: 15_000})
	await expect(page.getByRole('button', {name: 'Today'})).toBeVisible()
	await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toHaveCount(0)
})

test('offline reload restores the last signed-in shell even when online status is stale during boot', async ({page}) => {
	await loginWithPassword(page)
	await page.evaluate(async () => {
		if ('serviceWorker' in navigator) {
			await navigator.serviceWorker.ready
		}
	})
	if (!await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))) {
		await page.reload({waitUntil: 'domcontentloaded'})
		await expect(page.getByRole('navigation', {name: 'Primary'})).toBeVisible({timeout: 15_000})
	}
	await expect
		.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)))
		.toBe(true)
	await expect
		.poll(async () => Boolean(await getOfflineSnapshot(page)))
		.toBe(true)
	await expect
		.poll(async () => Boolean(await hasCachedOfflineShell(page)))
		.toBe(true)

	await page.addInitScript(() => {
		Object.defineProperty(window.navigator, 'onLine', {
			configurable: true,
			get() {
				return true
			},
		})
	})
	await page.context().setOffline(true)
	await page.reload({waitUntil: 'domcontentloaded'})

	await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe('/')
	await expect(page.getByRole('navigation', {name: 'Primary'})).toBeVisible({timeout: 15_000})
	await expect(page.getByRole('button', {name: 'Today'})).toBeVisible()
	await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toHaveCount(0)
	await expect(page.locator('.runtime-status-banner').first()).toContainText('saved locally and will sync')
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
	await expect(offlineSection.locator('.detail-label').filter({hasText: 'Queued changes'})).toBeVisible()
	await expect(offlineSection.locator('.detail-label').filter({hasText: 'Failed syncs'})).toBeVisible()
	await expect(offlineSection.getByText('Pending offline changes')).toBeVisible()
	await expect(offlineSection.getByText('No pending changes.')).toBeVisible()

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
	const emailRemindersToggle = section.locator('[data-setting-field="email-reminders-enabled"]')
	const overdueEmailToggle = section.locator('[data-setting-field="overdue-tasks-reminders-enabled"]')
	await expect(projectCreationToggle).not.toBeChecked()
	await expect(emailRemindersToggle).not.toBeChecked()
	await expect(overdueEmailToggle).not.toBeChecked()

	await projectCreationToggle.check()
	await emailRemindersToggle.check()
	await overdueEmailToggle.check()
	await section.getByRole('button', {name: 'Save notification preferences'}).click()
	await expect(page.getByText('Notification preferences updated.')).toBeVisible()

	await page.reload()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
	const reloadedSection = await expandSettingsSection(page, 'notifications')
	await expect(reloadedSection.locator('[data-setting-field="notification-projectCreation-center"]')).toBeChecked()
	await expect(reloadedSection.locator('[data-setting-field="email-reminders-enabled"]')).toBeChecked()
	await expect(reloadedSection.locator('[data-setting-field="overdue-tasks-reminders-enabled"]')).toBeChecked()

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

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

test('registration flow creates an account and signs in', async ({page}) => {
	await expect(page.getByRole('button', {name: 'Create account'})).toBeVisible()
	await page.getByRole('button', {name: 'Create account'}).click()
	await expect(page.locator('[data-form="account-register"]')).toBeVisible()

	await page.locator('[data-registration-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-registration-field="username"]').fill('new-user')
	await page.locator('[data-registration-field="email"]').fill('new-user@example.test')
	await page.locator('[data-registration-field="password"]').fill('registered-password')
	await page.locator('[data-registration-field="confirmPassword"]').fill('registered-password')
	await page.getByRole('button', {name: 'Create Account'}).click()

	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
})

test('forgot-password and reset-password flows accept a new password', async ({page}) => {
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.getByRole('button', {name: 'Forgot password?'}).click()
	await expect(page.locator('[data-form="forgot-password"]')).toBeVisible()

	await page.locator('[data-forgot-password-field="email"]').fill('smoke@example.test')
	await page.getByRole('button', {name: 'Send Reset Link'}).click()
	await expect(page.getByText('If an account with that email exists, a reset link has been sent.')).toBeVisible()

	const passwordResetTokens = stack.mock.getState().passwordResetTokens || {}
	const resetToken = Object.entries(passwordResetTokens).find(([, username]) => username === 'smoke-user')?.[0]
	expect(resetToken).toBeTruthy()

	await page.goto(
		`${stack.appUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}&baseUrl=${encodeURIComponent(`${stack.mock.origin}/api/v1`)}`,
	)
	await expect(page.locator('[data-form="reset-password"]')).toBeVisible()

	await page.locator('[data-reset-password-field="password"]').fill('smoke-password-2')
	await page.locator('[data-reset-password-field="confirmPassword"]').fill('smoke-password-2')
	await page.getByRole('button', {name: 'Set New Password'}).click()
	await expect(page.getByText('Password updated. Redirecting to sign in…')).toBeVisible()
	await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible({timeout: 6000})

	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="username"]').fill('smoke-user')
	await page.locator('[data-account-field="password"]').fill('smoke-password-2')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
})

test('password login prompts for a TOTP code when the account has 2FA enabled', async ({browser}) => {
	const totpStack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {
			totpState: {
				enabled: true,
			},
		},
	})

	const page = await browser.newPage()

	try {
		await page.setViewportSize({width: 900, height: 900})
		await page.goto(totpStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await expect(page.getByRole('button', {name: 'Dark'})).toHaveCount(0)
		await expect(page.getByRole('button', {name: 'Light'})).toHaveCount(0)
		await expect(page.getByRole('button', {name: 'Continue with server fallback'})).toHaveCount(0)
		await page.locator('[data-account-field="baseUrl"]').fill(`${totpStack.mock.origin}/api/v1`)
		await page.locator('[data-account-field="username"]').fill('smoke-user')
		await page.locator('[data-account-field="password"]').fill('smoke-password')
		await page.getByRole('button', {name: 'Connect'}).click()

		await expect(page.getByText('This app is an independent client and is not affiliated with the official Vikunja project.')).toHaveCount(0)
		await expect(page.locator('[data-form="account-login-totp"]')).toBeVisible()
		await expect(page.getByText('Enter the code from your authenticator app for')).toHaveCount(0)
		await page.locator('[data-account-field="totpPasscode"]').fill('000000')
		await page.getByRole('button', {name: 'Verify and Sign In'}).click()
		await expect(page.getByText('Invalid totp passcode.')).toBeVisible()
		await page.locator('[data-account-field="totpPasscode"]').fill('123456')
		await page.getByRole('button', {name: 'Verify and Sign In'}).click()
		await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
	} finally {
		await page.close()
		await totpStack.stop()
	}
})

test('registration link stays hidden when the server disables self-registration', async ({browser}) => {
	const lockedStack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {
			registrationEnabled: false,
		},
	})

	const page = await browser.newPage()

	try {
		await page.setViewportSize({width: 900, height: 900})
		await page.goto(lockedStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await page.locator('[data-account-field="baseUrl"]').fill(`${lockedStack.mock.origin}/api/v1`)
		await expect(page.getByText('This Vikunja server does not allow password account creation from this screen.')).toBeVisible()
		await expect(page.getByRole('button', {name: 'Create account'})).toHaveCount(0)
		await expect(page.getByRole('button', {name: 'Forgot password?'})).toBeVisible()
	} finally {
		await page.close()
		await lockedStack.stop()
	}
})

test('instance info disables local password actions and completes an OIDC sign-in callback', async ({browser}) => {
	const oidcStack = await startTestStack({
		legacyConfigured: false,
		mockVikunjaOptions: {
			localAuthEnabled: false,
			registrationEnabled: false,
			oidcProviders: [
				{
					name: 'Acme SSO',
					key: 'acme',
					auth_url: '/mock-oidc/acme/authorize',
				},
			],
		},
	})

	const page = await browser.newPage()

	try {
		await page.setViewportSize({width: 900, height: 900})
		await page.goto(oidcStack.appUrl)
		await expect(page.getByRole('heading', {name: 'Connect to your Vikunja server'})).toBeVisible()
		await page.locator('[data-account-field="baseUrl"]').fill(`${oidcStack.mock.origin}/api/v1`)
		await page.locator('[data-account-field="username"]').fill('smoke-user')
		await page.locator('[data-account-field="password"]').fill('smoke-password')
		await expect(page.getByText('Local username/password sign-in is disabled on this Vikunja instance.')).toBeVisible()
		await expect(page.getByRole('button', {name: 'Sign in with Acme SSO'})).toBeVisible()
		await expect(page.getByRole('button', {name: 'Create account'})).toHaveCount(0)
		await expect(page.getByRole('button', {name: 'Forgot password?'})).toHaveCount(0)
		await expect(page.getByRole('button', {name: 'Connect'})).toBeDisabled()
		await page.getByRole('button', {name: 'Sign in with Acme SSO'}).click()
		await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
	} finally {
		await page.close()
		await oidcStack.stop()
	}
})

test('reset-password screen shows an invalid-link warning without params', async ({page}) => {
	await page.goto(`${stack.appUrl}/auth/reset-password`)
	await expect(page.getByText('Invalid or expired reset link. Request a new one.')).toBeVisible()
})

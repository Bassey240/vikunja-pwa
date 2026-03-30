import {expect, test} from '@playwright/test'
import {startTestStack} from '../helpers/app-under-test.mjs'

let stack

test.describe.configure({mode: 'serial'})

test.beforeAll(async () => {
	stack = await startTestStack({legacyConfigured: false})
})

test.afterAll(async () => {
	await stack.stop()
})

test.beforeEach(async ({page}) => {
	stack.reset()
	await page.setViewportSize({width: 900, height: 900})
	await page.goto(stack.appUrl)
	await page.locator('[data-action="set-account-auth-mode"][data-auth-mode="apiToken"]').click()
	await page.locator('[data-account-field="baseUrl"]').fill(`${stack.mock.origin}/api/v1`)
	await page.locator('[data-account-field="apiToken"]').fill('smoke-token')
	await page.getByRole('button', {name: 'Connect'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
})

async function expandSettingsSection(page, sectionId) {
	const section = page.locator(`.settings-section[data-settings-section="${sectionId}"]`)
	await section.locator(`[data-settings-section-toggle="${sectionId}"]`).first().click()
	return section
}

test('task detail edits title, priority, favorite state, and labels', async ({page}) => {
	await page.locator('.task-row').filter({hasText: 'Prepare daily summary'}).locator('[data-action="open-task-focus"]').click()
	await page.locator('[data-action="open-focused-task-detail"]').click()
	await expect(page.locator('[data-detail-title]')).toBeVisible()
	await expect(page.locator('[data-detail-section-toggle="related"]')).toHaveAttribute('aria-expanded', 'false')
	await expect(page.locator('[data-detail-section-toggle="planning"]')).toHaveAttribute('aria-expanded', 'false')
	await expect(page.locator('[data-detail-section-toggle="recurring"]')).toHaveAttribute('aria-expanded', 'false')
	await expect(page.locator('[data-detail-section-toggle="reminders"]')).toHaveAttribute('aria-expanded', 'false')
	await expect(page.locator('[data-detail-section-toggle="assignees"]')).toHaveAttribute('aria-expanded', 'false')
	await expect(page.locator('[data-detail-section-toggle="comments"]')).toHaveAttribute('aria-expanded', 'false')
	await expect(page.locator('[data-detail-section-toggle="attachments"]')).toHaveAttribute('aria-expanded', 'false')
	await expect(page.locator('[data-detail-section-toggle="info"]')).toHaveAttribute('aria-expanded', 'false')
	await page.locator('[data-detail-section-toggle="planning"]').click()
	await expect(page.locator('[data-detail-section-toggle="planning"]')).toHaveAttribute('aria-expanded', 'true')
	await page.locator('[data-detail-section-toggle="recurring"]').click()
	await expect(page.locator('[data-detail-section-toggle="recurring"]')).toHaveAttribute('aria-expanded', 'true')
	await page.locator('[data-detail-section-toggle="reminders"]').click()
	await expect(page.locator('[data-detail-section-toggle="reminders"]')).toHaveAttribute('aria-expanded', 'true')
	await page.locator('[data-detail-section-toggle="assignees"]').click()
	await expect(page.locator('[data-detail-section-toggle="assignees"]')).toHaveAttribute('aria-expanded', 'true')
	await page.locator('[data-detail-section-toggle="comments"]').click()
	await expect(page.locator('[data-detail-section-toggle="comments"]')).toHaveAttribute('aria-expanded', 'true')
	await page.locator('[data-detail-section-toggle="attachments"]').click()
	await expect(page.locator('[data-detail-section-toggle="attachments"]')).toHaveAttribute('aria-expanded', 'true')
	await page.locator('[data-detail-section-toggle="info"]').click()
	await expect(page.locator('[data-detail-section-toggle="info"]')).toHaveAttribute('aria-expanded', 'true')
	await expect(page.locator('[data-detail-percent-done-value]')).toHaveText('35%')
	await expect(page.locator('[data-task-metadata="done_at"]')).toHaveText('Not completed yet')
	await expect(page.locator('[data-task-metadata="created"]')).not.toHaveText('Not available')
	await expect(page.locator('[data-task-metadata="updated"]')).not.toHaveText('Not available')
	await expect(page.locator('[data-task-repeat-summary]')).toHaveText('Does not repeat')
	await expect(page.locator('[data-task-assignee]')).toHaveCount(0)
	await expect(page.locator('[data-task-reminder]')).toHaveCount(0)
	await expect(page.locator('[data-task-attachment]')).toHaveCount(0)
	await expect(page.locator('[data-action="add-quick-reminder"][data-reminder-option="tomorrow"]')).toHaveCount(1)

	const titleInput = page.locator('[data-detail-title]')
	await titleInput.fill('Prepare daily summary updated')
	await titleInput.blur()
	await expect(page.locator('.panel-title').filter({hasText: 'Prepare daily summary updated'})).toBeVisible()

	await page.locator('[data-detail-priority]').selectOption('4')
	await expect(page.locator('[data-detail-priority]')).toHaveValue('4')

	await page.locator('[data-detail-percent-done]').focus()
	await page.locator('[data-detail-percent-done]').press('End')
	await page.locator('[data-detail-percent-done]').blur()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.percent_done
	}).toBe(100)
	await expect(page.locator('[data-detail-percent-done-value]')).toHaveText('100%')

	await page.locator('[data-detail-assignee-search]').fill('smoke')
	await expect(page.locator('[data-action="add-task-assignee"][data-task-assignee-option="1"]')).toHaveCount(1)
	await page.locator('[data-action="add-task-assignee"][data-task-assignee-option="1"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.assignees?.length || 0
	}).toBe(1)
	await expect(page.locator('[data-task-assignee="1"]')).toHaveCount(1)

	await page.locator('[data-action="remove-task-assignee"][data-task-assignee-id="1"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.assignees?.length || 0
	}).toBe(0)
	await expect(page.locator('[data-task-assignee="1"]')).toHaveCount(0)

	await page.locator('[data-detail-comment-input]').fill('Follow-up note for the summary.')
	await page.locator('[data-form="add-comment"]').getByRole('button', {name: 'Add comment'}).click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.comments?.length || 0
	}).toBe(1)
	await expect(page.locator('[data-task-comment]')).toHaveCount(1)

	await page.locator('[data-action="edit-task-comment"][data-task-comment-id="2"]').click()
	await page.locator('[data-detail-edit-comment="2"]').fill('Updated follow-up note for the summary.')
	await page.locator('[data-action="save-task-comment"][data-task-comment-id="2"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.comments?.[0]?.comment || ''
	}).toBe('Updated follow-up note for the summary.')
	await expect(page.locator('[data-task-comment="2"]')).toContainText('Updated follow-up note for the summary.')

	await page.locator('[data-action="delete-task-comment"][data-task-comment-id="2"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.comments?.length || 0
	}).toBe(0)
	await expect(page.locator('[data-task-comment]')).toHaveCount(0)

	await page.locator('[data-detail-attachment-input]').setInputFiles({
		name: 'receipt.png',
		mimeType: 'image/png',
		buffer: Buffer.from('mock-png-content'),
	})
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.attachments?.length || 0
	}).toBe(1)
	await expect(page.locator('[data-task-attachment]')).toHaveCount(1)
	await expect(page.locator('[data-task-attachment] img')).toHaveCount(1)

	await page.locator('[data-action="delete-task-attachment"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.attachments?.length || 0
	}).toBe(0)
	await expect(page.locator('[data-task-attachment]')).toHaveCount(0)

	await page.locator('[data-action="set-repeat-preset"][data-repeat-preset="weeks"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.repeat_after || 0
	}).toBe(604800)
	await expect(page.locator('[data-task-repeat-summary]')).toContainText('Repeats every 1 week')

	await page.locator('[data-action="toggle-repeat-origin"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return Boolean(task.repeat_from_current_date)
	}).toBe(true)
	await expect(page.locator('[data-task-repeat-summary]')).toContainText('from completion')

	await page.locator('[data-detail-repeat-value]').fill('2')
	await page.locator('[data-detail-repeat-unit]').selectOption('days')
	await page.locator('[data-form="save-repeat"]').getByRole('button', {name: 'Save'}).click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.repeat_after || 0
	}).toBe(172800)
	await expect(page.locator('[data-task-repeat-summary]')).toContainText('Repeats every 2 days')

	await page.locator('[data-action="clear-repeat"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.repeat_after || 0
	}).toBe(0)
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return Boolean(task.repeat_from_current_date)
	}).toBe(false)
	await expect(page.locator('[data-task-repeat-summary]')).toHaveText('Does not repeat')

	await page.locator('[data-action="add-quick-reminder"][data-reminder-option="tomorrow"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.reminders?.length || 0
	}).toBe(1)

	await page.locator('[data-detail-relative-reminder-select]').selectOption('-3600')
	await page.locator('[data-form="add-relative-reminder"]').getByRole('button', {name: 'Add'}).click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.reminders?.length || 0
	}).toBe(2)
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.reminders?.some(reminder => reminder.relative_period === -3600) || false
	}).toBe(true)
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.reminders?.some(reminder => reminder.relative_to === 'due_date') || false
	}).toBe(true)

	if ((await page.locator('[data-detail-section-toggle="reminders"]').getAttribute('aria-expanded')) !== 'true') {
		await page.locator('[data-detail-section-toggle="reminders"]').click()
	}

	await expect(page.locator('[data-form="add-reminder"] .compact-date-picker-input')).toBeVisible()

	await page.locator('[data-action="remove-task-reminder"][data-task-reminder-index="0"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.reminders?.length || 0
	}).toBe(1)
	await expect(page.locator('[data-task-reminder]')).toHaveCount(1)

	await page.locator('[data-action="toggle-task-favorite"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return task.is_favorite
	}).toBe(true)

	await page.locator('[data-action="toggle-detail-done"]').click()
	await expect.poll(async () => {
		const task = await stack.mockApi('tasks/102')
		return Boolean(task.done_at)
	}).toBe(true)
	await expect(page.locator('[data-task-metadata="done_at"]')).not.toHaveText('Not completed yet')

	await page.locator('[data-detail-section-toggle="organization"]').click()
	await expect(page.locator('[data-detail-section-toggle="organization"]')).toHaveAttribute('aria-expanded', 'true')
	await page.locator('[data-detail-label-select]').selectOption('2')
	await page.locator('[data-form="add-label"]').getByRole('button', {name: 'Add'}).click()
	await expect(page.locator('.label-chip').filter({hasText: 'Personal'})).toHaveCount(1)

	await page.locator('.label-chip').filter({hasText: 'Personal'}).locator('[data-action="remove-label"]').click()
	await expect(page.locator('.label-chip').filter({hasText: 'Personal'})).toHaveCount(0)
	await page.locator('.workspace-screen.is-active .topbar [data-action="close-detail-overlay"]').click()
	await expect(page.locator('[data-detail-title]')).toHaveCount(0)
})

test('root composer creates tasks and inline subtask composer creates subtasks', async ({page}) => {
	await page.getByRole('button', {name: 'Inbox'}).click()
	await expect(page.getByRole('heading', {name: 'Inbox'})).toBeVisible()

	await page.locator('[data-action="open-root-composer"][aria-label="Add"]').click()
	await expect(page.locator('[data-composer-project]')).toBeVisible()
	await page.locator('[data-root-input]').fill('Composer created task')
	await page.locator('[data-form="root-task"]').getByRole('button', {name: 'Add'}).click()
	await expect(page.locator('[data-root-input]')).toHaveValue('')
	await page.locator('[data-action="close-root-composer"]').click({position: {x: 10, y: 10}})
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Composer created task'})).toHaveCount(1)

	const summaryBranch = page.locator('.workspace-screen.is-active .task-branch').filter({hasText: 'Prepare daily summary'})
	await summaryBranch.locator('[data-action="toggle-task-menu"]').click()
	await page.locator('[data-menu-root="true"]').last().locator('[data-action="open-subtask"][data-task-id="102"]').click()
	await summaryBranch.locator('[data-subtask-input="102"]').fill('Nested follow-up')
	await summaryBranch.locator('[data-form="subtask"]').getByRole('button', {name: 'Add'}).click()
	await expect(page.locator('.workspace-screen.is-active .task-row').filter({hasText: 'Nested follow-up'})).toHaveCount(1)

	await page.locator('.workspace-screen.is-active [data-task-row-id="102"] [data-action="open-task-focus"]').click()
	await page.locator('[data-action="open-focused-task-detail"]').click()
	await page.locator('[data-detail-section-toggle="related"]').click()
	await page.locator('[data-action="open-detail-relation-composer"]').click()
	await expect(page.locator('[data-form="detail-relation"]')).toBeVisible()
	await expect(page.locator('[data-root-input]')).toHaveCount(0)
	await page.locator('[data-form="detail-relation"]').getByRole('button', {name: 'Done'}).click()
	await expect(page.locator('.detail-subtask-title').filter({hasText: 'Nested follow-up'})).toHaveCount(1)
})

test('task detail renders avatars, marks tasks read, and toggles subscriptions', async ({page}) => {
	await page.goto(`${stack.appUrl}/projects`)
	await expect(page.getByRole('heading', {name: 'Projects'})).toBeVisible()
	await page.locator('[data-project-node-id="2"] [data-action="select-project"][data-project-id="2"]').click()
	await expect(page.getByRole('heading', {name: 'Work'})).toBeVisible()

	await page.locator('.task-row').filter({hasText: 'Smoke suite rollout'}).locator('[data-action="open-task-focus"]').click()
	await page.locator('[data-action="open-focused-task-detail"]').click()
	await expect(page.locator('[data-detail-title]')).toHaveValue('Smoke suite rollout')

	await expect
		.poll(async () => {
			const task = await stack.mockApi('tasks/201')
			return task.read_at || null
		})
		.not.toBeNull()

	await page.locator('[data-detail-section-toggle="assignees"]').click()
	await page.locator('[data-detail-section-toggle="comments"]').click()
	await expect(page.locator('[data-task-assignee="2"] img.user-avatar')).toHaveCount(1)
	await expect(page.locator('[data-task-comment="1"] img.user-avatar')).toHaveCount(1)

	await expect(page.locator('[data-action="toggle-task-subscription"]')).toHaveText('Subscribed')
	await page.locator('[data-action="toggle-task-subscription"]').click()
	await expect(page.locator('[data-action="toggle-task-subscription"]')).toHaveText('Subscribe')
	await expect
		.poll(async () => {
			const task = await stack.mockApi('tasks/201')
			return task.subscription?.subscribed ?? null
		})
		.toBe(false)
})

test('switching to initials updates the current-user avatar on task surfaces', async ({page}) => {
	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Menu'}).click()
	await page.locator('[data-menu-root="true"] [data-action="go-settings"]').click()
	await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
	const accountSection = await expandSettingsSection(page, 'account')
	await accountSection.locator('[data-avatar-provider-option="initials"]').click()
	await expect(page.getByText('Avatar provider updated.')).toBeVisible()

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Today'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()

	const taskRow = page.locator('.task-row').filter({hasText: 'Prepare daily summary'})
	await taskRow.locator('[data-action="open-task-focus"]').first().click()
	await page.locator('[data-action="open-focused-task-detail"]').click()
	await page.locator('[data-detail-section-toggle="assignees"]').click()
	await page.locator('[data-detail-assignee-search]').fill('smoke')
	await page.locator('[data-action="add-task-assignee"][data-task-assignee-option="1"]').click()
	await expect(page.locator('[data-task-assignee="1"] .user-avatar-initials')).toHaveCount(1)
})

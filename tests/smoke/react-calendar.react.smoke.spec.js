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

// The calendar lives on a temporary /calendar route reachable from the wide
// sidebar; switch to a desktop width so that entry is present.
async function openCalendar(page) {
	await page.setViewportSize({width: 1280, height: 900})
	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Calendar'}).click()
	await expect(page.locator('.calendar-body')).toBeVisible()
}

// The zoom segment is always visible in the calendar header — one click.
async function selectZoom(page, zoom) {
	await page.locator(`[data-action="set-calendar-zoom"][data-calendar-zoom="${zoom}"]`).click()
}

// Mirrors the SortableJS handle drag used across the project/list DnD smokes:
// grab the handle, pause past the touch-delay, move to the target, release.
async function dragHandleToPoint(page, handleLocator, point) {
	const box = await handleLocator.boundingBox()
	const start = {x: box.x + box.width / 2, y: box.y + box.height / 2}
	await page.mouse.move(start.x, start.y)
	await page.mouse.down()
	await page.waitForTimeout(260)
	await page.mouse.move(start.x + 2, start.y + 2, {steps: 4})
	await page.mouse.move(point.x, point.y, {steps: 18})
	await page.waitForTimeout(220)
	await page.mouse.move(point.x + 1, point.y + 1, {steps: 3})
	await page.waitForTimeout(180)
	await page.mouse.up()
	await page.waitForTimeout(700)
}

test('week view renders a kanban lane per day with an hour-rail timeline and drills into day', async ({page}) => {
	await openCalendar(page)
	await selectZoom(page, 'week')

	const board = page.locator('.calendar-board[data-calendar-zoom="week"]')
	await expect(board).toBeVisible()
	await expect(board.locator('.calendar-board-lane')).toHaveCount(7)
	// Each lane carries the hour-rail timeline (24 hour labels in its gutter).
	await expect(board.locator('.calendar-board-timeline')).toHaveCount(7)
	await expect(board.locator('.calendar-board-lane').first().locator('.calendar-board-hour-label')).toHaveCount(24)

	// Tapping a week lane head drills into that day's Day view.
	await board.locator('.calendar-board-head').first().click()
	const dayBoard = page.locator('.calendar-board[data-calendar-zoom="day"]')
	await expect(dayBoard).toBeVisible()
	await expect(dayBoard.locator('.calendar-board-lane')).toHaveCount(1)
})

test('the inspector pane keeps its remembered state on the calendar', async ({page}) => {
	await openCalendar(page)
	const inspector = page.locator('.shell-inspector-region')
	await expect(inspector).not.toHaveClass(/is-collapsed/)

	await page.locator('.shell-inspector-toggle').click()
	await expect(inspector).toHaveClass(/is-collapsed/)

	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Today'}).click()
	await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible()
	await page.getByRole('navigation', {name: 'Primary'}).getByRole('button', {name: 'Calendar'}).click()
	await expect(page.locator('.calendar-body')).toBeVisible()
	await expect(inspector).toHaveClass(/is-collapsed/)
})

test('the header title opens the go-to-date overlay in every zoom', async ({page}) => {
	await openCalendar(page)

	for (const zoom of ['day', 'week', 'month']) {
		await selectZoom(page, zoom)
		await page.locator('[data-action="open-calendar-date-picker"]').click()
		const overlay = page.locator('.date-overlay-backdrop')
		await expect(overlay).toBeVisible()
		await page.locator('[data-action="close-date-overlay"]').click()
		await expect(overlay).toHaveCount(0)
	}
})

test('clicking the selected month day again drills into its day view', async ({page}) => {
	await openCalendar(page)
	await selectZoom(page, 'month')

	// First click selects; the second click on the same cell drills.
	const cell = page.locator('.calendar-day-cell:not(.is-selected):not(.is-outside-month)').first()
	await cell.click()
	await expect(page.locator('.calendar-body[data-calendar-view="month"]')).toBeVisible()
	await page.locator('.calendar-day-cell.is-selected').click()
	await expect(page.locator('.calendar-board[data-calendar-zoom="day"]')).toBeVisible()
})

test('the day-list + Add task opens the wide-shell inline composer', async ({page}) => {
	await openCalendar(page)
	await selectZoom(page, 'month')

	await page.locator('.calendar-day-cell:not(.is-selected):not(.is-outside-month)').first().click()
	await page.locator('[data-action="add-calendar-task"]').click()
	// Scoped to the day list: hidden-but-mounted screens render their own
	// (invisible) inline composer instance.
	await expect(page.locator('.calendar-day-list [data-form="root-task-inline"]')).toBeVisible()
})

test('day view auto-scrolls the timeline to the first task instead of midnight', async ({page}) => {
	await openCalendar(page)
	await selectZoom(page, 'day')

	// "Buy milk" sits at noon today, so the timeline must open scrolled down past
	// the small hours rather than at 00:00.
	const card = page.locator('.calendar-board[data-calendar-zoom="day"] .calendar-board-card').filter({hasText: 'Buy milk'})
	await expect(card).toHaveCount(1)
	await expect.poll(async () => page.locator('.calendar-board-lanes').evaluate(node => node.scrollTop)).toBeGreaterThan(50)
})

test('dragging a timed card by its handle reschedules it earlier in the day', async ({page}) => {
	await openCalendar(page)
	await selectZoom(page, 'day')

	const card = page.locator('.calendar-board[data-calendar-zoom="day"] .calendar-board-card').filter({hasText: 'Buy milk'})
	await expect(card).toHaveCount(1)
	await card.scrollIntoViewIfNeeded()
	const before = await card.boundingBox()

	const handle = card.locator('.calendar-board-grab')
	const handleBox = await handle.boundingBox()
	const x = handleBox.x + handleBox.width / 2
	const y = handleBox.y + handleBox.height / 2

	// Grab the handle and drag up ~2 hours' worth of track (staying on-screen),
	// then drop. Dragging up reschedules the card earlier in the day.
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x, y - 12, {steps: 4})
	await page.mouse.move(x, y - 96, {steps: 12})
	await page.mouse.up()

	// The reschedule lands the card higher in the lane (earlier in the day).
	const moved = page.locator('.calendar-board[data-calendar-zoom="day"] .calendar-board-card').filter({hasText: 'Buy milk'})
	await expect(moved).toHaveCount(1)
	await expect.poll(async () => {
		const box = await moved.boundingBox()
		return box ? box.y : before.y
	}).toBeLessThan(before.y - 8)

	// The synthesized post-drop click must not fall through to a time slot and
	// open the add-task composer.
	await expect(page.locator('[data-form="root-task"]')).toHaveCount(0)
})

test('dragging a selected-day task onto another month day cell reschedules it', async ({page}) => {
	await openCalendar(page)
	await selectZoom(page, 'month')

	// The selected day defaults to today, where "Buy milk" (task 101) is due.
	const row = page.locator('.calendar-day-list .task-row').filter({hasText: 'Buy milk'})
	await expect(row).toHaveCount(1)
	const handle = row.locator('.drag-handle')
	await expect(handle).toBeVisible()

	// Drop on an in-month day cell that isn't the source day.
	const target = page.locator('.calendar-day-cell:not(.is-selected):not(.is-outside-month)').first()
	const targetBox = await target.boundingBox()
	const point = {x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2}

	const movePost = page.waitForRequest(
		request => request.method() === 'POST' && /\/api\/tasks\/101$/.test(request.url()),
	)
	await dragHandleToPoint(page, handle, point)
	await movePost

	// The synthesized post-drop click must not fall through to select the day or
	// open the add-task composer.
	await expect(page.locator('[data-form="root-task"]')).toHaveCount(0)
})

test('move to date: the selected-day task menu opens the large overlay and commits via Done', async ({page}) => {
	await openCalendar(page)
	await selectZoom(page, 'month')

	// The selected day defaults to today, where "Buy milk" (task 101) is due. The
	// Move-to-date action opens the large, screen-filling date overlay (not a
	// card-anchored popover that a scroll could push off-screen).
	const row = page.locator('.calendar-day-list .task-row').filter({hasText: 'Buy milk'})
	await expect(row).toHaveCount(1)
	await row.locator('[data-action="toggle-task-menu"]').click()
	await page.locator('[data-action="move-task-to-date"]').click()

	const overlay = page.locator('.date-overlay-backdrop')
	await expect(overlay).toBeVisible()
	await expect(overlay.locator('.date-overlay-panel')).toBeVisible()

	const movePost = page.waitForRequest(
		request => request.method() === 'POST' && /\/api\/tasks\/101$/.test(request.url()),
	)
	// Pick a day that isn't already selected, then commit with Done.
	await overlay.locator('.date-overlay-day:not(.is-selected):not(.is-muted)').first().click()
	await page.locator('[data-action="commit-date-overlay"]').click()
	await movePost

	await expect(overlay).toHaveCount(0)
})

test('move to date: an outside tap does not dismiss; ✕ closes without writing', async ({page}) => {
	await openCalendar(page)
	await selectZoom(page, 'month')

	let wrote = false
	page.on('request', request => {
		if (request.method() === 'POST' && /\/api\/tasks\/101$/.test(request.url())) {
			wrote = true
		}
	})

	const row = page.locator('.calendar-day-list .task-row').filter({hasText: 'Buy milk'})
	await row.locator('[data-action="toggle-task-menu"]').click()
	await page.locator('[data-action="move-task-to-date"]').click()

	const overlay = page.locator('.date-overlay-backdrop')
	await expect(overlay).toBeVisible()

	// A tap outside the panel must NOT dismiss the overlay — it closes only via ✕/Done.
	await page.locator('.date-overlay-backdrop').click({position: {x: 4, y: 4}})
	await expect(overlay).toBeVisible()

	// ✕ closes it without committing a write.
	await page.locator('[data-action="close-date-overlay"]').click()
	await expect(overlay).toHaveCount(0)
	expect(wrote).toBe(false)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {resolveTaskViewId} from '../../src/store/view-resolution.ts'

const views = [
	{id: 1, view_kind: 'list'},
	{id: 2, view_kind: 'kanban'},
	{id: 3, view_kind: 'table'},
	{id: 4, view_kind: 'gantt'},
]

test('falls back to the per-device default when nothing else applies', () => {
	assert.equal(resolveTaskViewId(views, {wide: true, defaultKind: 'kanban'}), 2)
	assert.equal(resolveTaskViewId(views, {wide: false, defaultKind: 'kanban'}), 2)
})

test('desktop default of gantt resolves on wide, but not on mobile', () => {
	assert.equal(resolveTaskViewId(views, {wide: true, defaultKind: 'gantt'}), 4)
	// gantt is not a mobile-supported kind: mobile ignores it and lands on the list.
	assert.equal(resolveTaskViewId(views, {wide: false, defaultKind: 'gantt'}), 1)
})

test('session memory wins over the default but is still viewport-gated', () => {
	assert.equal(resolveTaskViewId(views, {wide: true, defaultKind: 'list', sessionKind: 'table'}), 3)
	// table is desktop-only: a mobile load ignores the session table and uses the default.
	assert.equal(resolveTaskViewId(views, {wide: false, defaultKind: 'kanban', sessionKind: 'table'}), 2)
})

test('current session view wins over everything when it can still render', () => {
	assert.equal(
		resolveTaskViewId(views, {wide: true, currentViewId: 3, defaultKind: 'list', sessionKind: 'kanban'}),
		3,
	)
	// current view is gantt (id 4) but viewport is mobile: gantt can't render, fall through to default.
	assert.equal(
		resolveTaskViewId(views, {wide: false, currentViewId: 4, defaultKind: 'list'}),
		1,
	)
})

test('empty view list resolves to null', () => {
	assert.equal(resolveTaskViewId([], {wide: true, defaultKind: 'list'}), null)
})

test('default kind absent from the project falls back to the list view', () => {
	const noKanban = [
		{id: 10, view_kind: 'list'},
		{id: 11, view_kind: 'gantt'},
	]
	assert.equal(resolveTaskViewId(noKanban, {wide: true, defaultKind: 'kanban'}), 10)
})

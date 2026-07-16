import assert from 'node:assert/strict'
import {test} from 'node:test'
import {isShortcutBlocked, type ShortcutKeyEvent} from '../../src/hooks/useGlobalShortcuts.ts'

function keyEvent(overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
	return {
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		isComposing: false,
		target: {closest: () => null},
		...overrides,
	}
}

test('plain key on a non-typing target is allowed', () => {
	assert.equal(isShortcutBlocked(keyEvent()), false)
})

test('modifier chords are blocked', () => {
	assert.equal(isShortcutBlocked(keyEvent({metaKey: true})), true)
	assert.equal(isShortcutBlocked(keyEvent({ctrlKey: true})), true)
	assert.equal(isShortcutBlocked(keyEvent({altKey: true})), true)
})

test('IME composition is blocked', () => {
	assert.equal(isShortcutBlocked(keyEvent({isComposing: true})), true)
})

test('typing contexts are blocked', () => {
	const inTypingContext = {closest: (selector: string) => (selector.includes('input') ? {} : null)}
	assert.equal(isShortcutBlocked(keyEvent({target: inTypingContext})), true)
})

test('a null or closest-less target is allowed', () => {
	assert.equal(isShortcutBlocked(keyEvent({target: null})), false)
	assert.equal(
		isShortcutBlocked(keyEvent({target: {} as unknown as ShortcutKeyEvent['target']})),
		false,
	)
})

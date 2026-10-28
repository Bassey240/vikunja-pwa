import assert from 'node:assert/strict'
import {test} from 'node:test'
import {BOT_USERNAME_PREFIX, isBotUser} from '../../src/utils/bot-users.ts'

/* Vikunja 2.4 adds bot users: User.bot_owner_id identifies them, the `bot-`
 * username prefix is reserved, and password login is rejected for bots. The
 * client reflects that identity — it never enforces the rules itself. */

test('a user owned by another account is a bot', () => {
	assert.equal(isBotUser({id: 9, username: 'bot-deploy', bot_owner_id: 3}), true)
})

test('a regular user is not a bot', () => {
	assert.equal(isBotUser({id: 3, username: 'sebastiaan', bot_owner_id: 0}), false)
	assert.equal(isBotUser({id: 3, username: 'sebastiaan'}), false)
	assert.equal(isBotUser(null), false)
	assert.equal(isBotUser(undefined), false)
})

test('bot identity comes from the server field, not the username', () => {
	// A human could not register this name on 2.4, but older servers may hold
	// one — ownership is the only reliable signal.
	assert.equal(isBotUser({id: 4, username: 'bot-legacy'}), false)
	assert.equal(isBotUser({id: 4, username: 'not-a-bot', bot_owner_id: 7}), true)
})

test('snake_case and camelCase payloads are both understood', () => {
	assert.equal(isBotUser({id: 5, username: 'b', botOwnerId: 2}), true)
	assert.equal(isBotUser({id: 5, username: 'b', bot_owner_id: 2}), true)
})

test('the reserved prefix is exposed for messaging, not validation', () => {
	assert.equal(BOT_USERNAME_PREFIX, 'bot-')
})

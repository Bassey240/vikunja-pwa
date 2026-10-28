/* Vikunja 2.4 introduces bot users. The server owns the rules — it reserves the
 * `bot-` username prefix at signup and rejects password login for bots — so the
 * client only reflects the identity the server reports via User.bot_owner_id.
 * Never infer bot-ness from the username: the prefix is reserved going forward,
 * but ownership is the actual signal. */

export const BOT_USERNAME_PREFIX = 'bot-'

interface BotUserLike {
	bot_owner_id?: number | null
	botOwnerId?: number | null
}

export function isBotUser(user: BotUserLike | null | undefined) {
	return Number(user?.bot_owner_id ?? user?.botOwnerId ?? 0) > 0
}

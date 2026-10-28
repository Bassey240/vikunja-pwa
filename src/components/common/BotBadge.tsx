import type {TaskAssignee} from '@/types'
import {isBotUser} from '@/utils/bot-users'

/* Marks users Vikunja 2.4 reports as bots (User.bot_owner_id), so an automated
 * author or assignee is distinguishable from a person. */
export default function BotBadge({user}: {user: TaskAssignee | null | undefined}) {
	if (!isBotUser(user)) {
		return null
	}

	return <span className="bot-badge" data-bot-badge title="Automated account">Bot</span>
}

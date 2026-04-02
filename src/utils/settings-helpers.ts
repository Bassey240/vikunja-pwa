import type {Team} from '@/types'

export type SettingsSectionId =
	| 'account'
	| 'preferences'
	| 'offline'
	| 'notifications'
	| 'security'
	| 'collaboration'
	| 'userAdministration'
	| 'teams'
	| 'appData'

export function getTeamAdminCount(team: Team) {
	return (team.members || []).filter(member => member.admin).length
}

export function isCurrentUserTeamAdmin(team: Team, currentUsername: string) {
	const username = `${currentUsername || ''}`.trim()
	if (!username) {
		return false
	}

	return (team.members || []).some(member => member.username === username && member.admin)
}

export function getBlockedTeamManagementMessage(currentUserIsTeamAdmin: boolean, teamHasNoAdmins: boolean) {
	if (currentUserIsTeamAdmin) {
		return ''
	}
	if (teamHasNoAdmins) {
		return 'This team currently has no admins. Vikunja blocks team management until an admin is restored.'
	}
	return 'Only team admins can manage this team.'
}

export function getBlockedTeamMemberMenuMessage(options: {
	isSelf: boolean
	isLastTeamAdmin: boolean
	protectsCurrentAdminAccess: boolean
	teamMembersCount: number
	currentUserIsTeamAdmin: boolean
}) {
	if (options.protectsCurrentAdminAccess) {
		return 'Your own team admin access cannot be removed from this app.'
	}
	if (options.isLastTeamAdmin) {
		return 'The last team admin cannot be removed or demoted from this app.'
	}
	if (options.teamMembersCount <= 1) {
		return 'Vikunja does not allow removing the last team member.'
	}
	if (!options.currentUserIsTeamAdmin && !options.isSelf) {
		return 'Only team admins can manage other members.'
	}
	return 'No member management actions are available for this row.'
}

export function isCurrentAdminUser(
	currentUser: {id?: number | null; username?: string | null; email?: string | null} | null | undefined,
	userId: number,
	username: string,
	email: string,
) {
	if (!currentUser) {
		return false
	}

	const normalizedUsername = `${username || ''}`.trim().toLowerCase()
	const normalizedEmail = `${email || ''}`.trim().toLowerCase()
	return (
		Number(currentUser.id || 0) === Number(userId || 0) ||
		(normalizedUsername !== '' && normalizedUsername === `${currentUser.username || ''}`.trim().toLowerCase()) ||
		(normalizedEmail !== '' && normalizedEmail === `${currentUser.email || ''}`.trim().toLowerCase())
	)
}

export function getProtectedAdminUserMessage(isCurrentUser: boolean) {
	if (isCurrentUser) {
		return 'You cannot disable or delete the account you are currently signed in with.'
	}
	return ''
}

export function isAppleMobileWeb() {
	if (typeof navigator === 'undefined') {
		return false
	}

	const platform = `${navigator.platform || ''}`.toLowerCase()
	const userAgent = `${navigator.userAgent || ''}`.toLowerCase()
	return /iphone|ipad|ipod/.test(platform) || /iphone|ipad|ipod/.test(userAgent)
}

export function getIosVersion() {
	if (typeof navigator === 'undefined') {
		return null
	}

	const match = `${navigator.userAgent || ''}`.match(/OS (\d+)[._](\d+)(?:[._](\d+))?/)
	if (!match) {
		return null
	}

	const major = match[1] || '0'
	const minor = match[2] || '0'
	const patch = match[3] || '0'
	return `${major}.${minor}.${patch}`
}

export function compareVersions(left: string, right: string) {
	const leftParts = left.split('.').map(part => Number(part || 0))
	const rightParts = right.split('.').map(part => Number(part || 0))
	const maxLength = Math.max(leftParts.length, rightParts.length)
	for (let index = 0; index < maxLength; index += 1) {
		const leftValue = leftParts[index] || 0
		const rightValue = rightParts[index] || 0
		if (leftValue !== rightValue) {
			return leftValue - rightValue
		}
	}
	return 0
}

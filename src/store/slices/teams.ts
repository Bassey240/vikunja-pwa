import {api} from '@/api'
import type {Team} from '@/types'
import {formatError} from '@/utils/formatting'
import {canManageTeam, canManageTeamMember} from '@/utils/settings-helpers'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'

interface TeamsPayload {
	teams?: Team[]
}

interface TeamPayload {
	team?: Team | null
}

function normalizeTeam(team: Team | null | undefined): Team {
	return {
		...(team || {}),
		id: Number(team?.id || 0),
		name: `${team?.name || ''}`,
		description: team?.description || '',
		members: Array.isArray(team?.members) ? team.members.map(member => ({...member})) : [],
	}
}

export interface TeamsSlice {
	teams: Team[]
	teamsLoaded: boolean
	teamsLoading: boolean
	teamSubmitting: boolean
	loadTeams: (options?: {force?: boolean}) => Promise<void>
	createTeam: (payload: {name: string; description: string; isPublic?: boolean}) => Promise<boolean>
	updateTeam: (teamId: number, payload: {name: string; description: string; isPublic?: boolean}) => Promise<boolean>
	deleteTeam: (teamId: number) => Promise<boolean>
	addTeamMember: (teamId: number, username: string) => Promise<boolean>
	removeTeamMember: (teamId: number, username: string) => Promise<boolean>
	toggleTeamMemberAdmin: (teamId: number, username: string) => Promise<boolean>
	resetTeamsState: () => void
}

export const createTeamsSlice: StateCreator<AppStore, [], [], TeamsSlice> = (set, get) => ({
	teams: [],
	teamsLoaded: false,
	teamsLoading: false,
	teamSubmitting: false,

	async loadTeams({force = false} = {}) {
		if (!get().connected) {
			set({
				teams: [],
				teamsLoaded: false,
				teamsLoading: false,
			})
			return
		}

		if (!force && (get().teamsLoading || get().teamsLoaded)) {
			return
		}

		set({teamsLoading: true, error: null})

		try {
			const payload = await api<TeamsPayload>('/api/teams')
			const teams = Array.isArray(payload.teams) ? payload.teams : []
			const hydratedTeams = await Promise.all(teams.map(async team => {
				if (!team?.id) {
					return normalizeTeam(team)
				}

				try {
					const detailPayload = await api<TeamPayload>(`/api/teams/${team.id}`)
					if (detailPayload.team) {
						return normalizeTeam({
							...team,
							...detailPayload.team,
						})
					}
				} catch {
					// Fall back to the collection payload when a detail request fails.
				}

				return normalizeTeam(team)
			}))
			set({
				teams: hydratedTeams
					.slice()
					.sort((left, right) => `${left.name || ''}`.localeCompare(`${right.name || ''}`)),
				teamsLoaded: true,
			})
		} catch (error) {
			set({error: formatError(error as Error)})
		} finally {
			set({teamsLoading: false})
		}
	},

	async createTeam(payload) {
		if (!get().connected) {
			return false
		}

		const name = `${payload.name || ''}`.trim()
		if (!name) {
			set({error: 'Team name is required.'})
			return false
		}

		set({teamSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<TeamPayload, {name: string; description: string; isPublic?: boolean}>('/api/teams', {
				method: 'POST',
				body: {
					name,
					description: `${payload.description || ''}`.trim(),
					isPublic: payload.isPublic === true,
				},
			})
			await get().loadTeams({force: true})
			set({settingsNotice: `Created team "${name}".`})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({teamSubmitting: false})
		}
	},

	async updateTeam(teamId, payload) {
		if (!get().connected || !teamId) {
			return false
		}
		if (!ensureCanManageTeam(get, set, teamId)) {
			return false
		}

		const name = `${payload.name || ''}`.trim()
		if (!name) {
			set({error: 'Team name is required.'})
			return false
		}

		set({teamSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<TeamPayload, {name: string; description: string; isPublic?: boolean}>(`/api/teams/${teamId}`, {
				method: 'POST',
				body: {
					name,
					description: `${payload.description || ''}`.trim(),
					isPublic: payload.isPublic === true,
				},
			})
			await get().loadTeams({force: true})
			set({settingsNotice: `Updated team "${name}".`})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({teamSubmitting: false})
		}
	},

	async deleteTeam(teamId) {
		if (!get().connected || !teamId) {
			return false
		}
		if (!ensureCanManageTeam(get, set, teamId)) {
			return false
		}

		if (!window.confirm('Delete this team?')) {
			return false
		}

		set({teamSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<{ok: boolean}>(`/api/teams/${teamId}`, {
				method: 'DELETE',
			})
			await get().loadTeams({force: true})
			set({settingsNotice: 'Team deleted.'})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({teamSubmitting: false})
		}
	},

	async addTeamMember(teamId, username) {
		if (!get().connected || !teamId) {
			return false
		}
		if (!ensureCanManageTeam(get, set, teamId)) {
			return false
		}

		const nextUsername = `${username || ''}`.trim()
		if (!nextUsername) {
			set({error: 'A username is required.'})
			return false
		}

		set({teamSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<{member?: unknown}, {username: string}>(`/api/teams/${teamId}/members`, {
				method: 'POST',
				body: {username: nextUsername},
			})
			await get().loadTeams({force: true})
			set({settingsNotice: `Added "${nextUsername}" to the team.`})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({teamSubmitting: false})
		}
	},

	async removeTeamMember(teamId, username) {
		if (!get().connected || !teamId) {
			return false
		}

		const nextUsername = `${username || ''}`.trim()
		if (!nextUsername) {
			return false
		}
		if (!ensureCanManageTeamMember(get, set, teamId, nextUsername)) {
			return false
		}

		if (!window.confirm(`Remove "${nextUsername}" from this team?`)) {
			return false
		}

		set({teamSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<{ok: boolean}>(`/api/teams/${teamId}/members/${encodeURIComponent(nextUsername)}`, {
				method: 'DELETE',
			})
			await get().loadTeams({force: true})
			set({settingsNotice: `Removed "${nextUsername}" from the team.`})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({teamSubmitting: false})
		}
	},

	async toggleTeamMemberAdmin(teamId, username) {
		if (!get().connected || !teamId) {
			return false
		}
		if (!ensureCanManageTeam(get, set, teamId)) {
			return false
		}

		const nextUsername = `${username || ''}`.trim()
		if (!nextUsername) {
			return false
		}

		set({teamSubmitting: true, error: null, settingsNotice: null})

		try {
			await api<{member?: unknown}>(`/api/teams/${teamId}/members/${encodeURIComponent(nextUsername)}/admin`, {
				method: 'POST',
			})
			await get().loadTeams({force: true})
			set({settingsNotice: `Updated team admin status for "${nextUsername}".`})
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({teamSubmitting: false})
		}
	},

	resetTeamsState() {
		set({
			teams: [],
			teamsLoaded: false,
			teamsLoading: false,
			teamSubmitting: false,
		})
	},
})

function ensureCanManageTeam(
	get: () => AppStore,
	set: (partial: Partial<AppStore>) => void,
	teamId: number,
) {
	const state = get()
	const team = state.teams.find(entry => entry.id === teamId) || null
	const currentUsername = `${state.account?.user?.username || ''}`.trim()
	if (team && canManageTeam(team, currentUsername)) {
		return true
	}

	set({error: 'Only team admins can manage this team.'})
	return false
}

function ensureCanManageTeamMember(
	get: () => AppStore,
	set: (partial: Partial<AppStore>) => void,
	teamId: number,
	targetUsername: string,
) {
	const state = get()
	const team = state.teams.find(entry => entry.id === teamId) || null
	const currentUsername = `${state.account?.user?.username || ''}`.trim()
	if (team && canManageTeamMember(team, currentUsername, targetUsername)) {
		return true
	}

	set({error: 'Only team admins can manage other team members.'})
	return false
}

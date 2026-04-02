import {api, type ApiError} from '@/api'
import type {ProjectLinkShare, ProjectSharedTeam, ProjectSharedUser, SharePermission, TeamUser} from '@/types'
import {formatError} from '@/utils/formatting'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {blockOfflineReadOnlyAction, isOfflineReadOnly} from '../offline-readonly'

interface ProjectSharedUsersPayload {
	users?: ProjectSharedUser[]
}

interface ProjectSharedTeamsPayload {
	teams?: ProjectSharedTeam[]
}

interface ProjectLinkSharesPayload {
	shares?: ProjectLinkShare[]
}

export interface SharingSlice {
	projectSharedUsers: ProjectSharedUser[]
	projectSharedTeams: ProjectSharedTeam[]
	projectLinkShares: ProjectLinkShare[]
	selectedShareDetail: ProjectLinkShare | null
	shareDetailLoading: boolean
	projectSharingLoading: boolean
	projectSharingSubmitting: boolean
	projectSharingProjectId: number | null
	loadProjectSharing: (projectId: number) => Promise<void>
	loadShareDetail: (projectId: number, share: ProjectLinkShare) => Promise<void>
	clearShareDetail: () => void
	addProjectUserShare: (projectId: number, username: string, permission: SharePermission) => Promise<boolean>
	updateProjectUserShare: (projectId: number, username: string, permission: SharePermission) => Promise<boolean>
	removeProjectUserShare: (projectId: number, username: string) => Promise<boolean>
	addProjectTeamShare: (projectId: number, teamId: number, permission: SharePermission) => Promise<boolean>
	updateProjectTeamShare: (projectId: number, teamId: number, permission: SharePermission) => Promise<boolean>
	removeProjectTeamShare: (projectId: number, teamId: number) => Promise<boolean>
	addProjectLinkShare: (projectId: number, payload: {name?: string; password?: string; permission: SharePermission}) => Promise<boolean>
	removeProjectLinkShare: (projectId: number, shareId: number) => Promise<boolean>
	resetProjectSharingState: () => void
}

export const createSharingSlice: StateCreator<AppStore, [], [], SharingSlice> = (set, get) => ({
	projectSharedUsers: [],
	projectSharedTeams: [],
	projectLinkShares: [],
	selectedShareDetail: null,
	shareDetailLoading: false,
	projectSharingLoading: false,
	projectSharingSubmitting: false,
	projectSharingProjectId: null,

	async loadProjectSharing(projectId) {
		const linkSharingEnabled = get().account?.instanceFeatures?.linkSharingEnabled !== false
		if (!get().connected || projectId <= 0) {
			set({
				projectSharedUsers: [],
				projectSharedTeams: [],
				projectLinkShares: [],
				projectSharingLoading: false,
				projectSharingProjectId: null,
			})
			return
		}

		if (isOfflineReadOnly(get)) {
			set({
				projectSharingLoading: false,
				projectSharingProjectId: projectId,
			})
			return
		}

		set({
			projectSharingLoading: true,
			projectSharingProjectId: projectId,
			error: null,
		})

		try {
			const [usersPayload, teamsPayload] = await Promise.all([
				api<ProjectSharedUsersPayload>(`/api/projects/${projectId}/users`),
				api<ProjectSharedTeamsPayload>(`/api/projects/${projectId}/teams`),
			])
			const sharesPayload = linkSharingEnabled
				? await loadProjectLinkShares(projectId)
				: []
			set({
				projectSharedUsers: normalizeSharedUsers(usersPayload),
				projectSharedTeams: normalizeSharedTeams(teamsPayload),
				projectLinkShares: normalizeLinkShares(sharesPayload),
			})
		} catch (error) {
			set({
				error: formatError(error as Error),
				projectSharedUsers: [],
				projectSharedTeams: [],
				projectLinkShares: [],
			})
		} finally {
			set({projectSharingLoading: false})
		}
	},

	async loadShareDetail(projectId, share) {
		const optimisticShare = normalizeLinkShare(share)
		const shareId = optimisticShare?.id || 0
		if (!get().connected || projectId <= 0 || shareId <= 0) {
			set({
				selectedShareDetail: null,
				shareDetailLoading: false,
			})
			return
		}

		set({
			shareDetailLoading: true,
			selectedShareDetail: optimisticShare,
			error: null,
		})

		try {
			const result = await api<{share: ProjectLinkShare}>(`/api/projects/${projectId}/shares/${shareId}`)
			set({
				selectedShareDetail: normalizeLinkShare(result.share) || optimisticShare,
			})
		} catch (error) {
			const apiError = error as ApiError | null | undefined
			if (apiError?.statusCode === 404 && optimisticShare?.hash) {
				try {
					await get().loadProjectSharing(projectId)
					const refreshedShare = get().projectLinkShares.find(entry => entry.hash === optimisticShare.hash)
					if (refreshedShare) {
						set({
							selectedShareDetail: refreshedShare,
							error: null,
						})
						return
					}
				} catch {
					// Fall through to the original error if the refresh attempt also fails.
				}
			}

			set({
				error: formatError(error as Error),
				selectedShareDetail: optimisticShare,
			})
		} finally {
			set({shareDetailLoading: false})
		}
	},

	clearShareDetail() {
		set({
			selectedShareDetail: null,
			shareDetailLoading: false,
		})
	},

	async addProjectUserShare(projectId, username, permission) {
		if (!get().connected || projectId <= 0) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'update project sharing')) {
			return false
		}

		const nextUsername = `${username || ''}`.trim()
		if (!nextUsername) {
			set({error: 'A username is required.'})
			return false
		}

		set({projectSharingSubmitting: true, error: null})

		try {
			await api<{user?: unknown}, {username: string; permission: SharePermission}>(`/api/projects/${projectId}/users`, {
				method: 'POST',
				body: {
					username: nextUsername,
					permission,
				},
			})
			await get().loadProjectSharing(projectId)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({projectSharingSubmitting: false})
		}
	},

	async updateProjectUserShare(projectId, username, permission) {
		if (!get().connected || projectId <= 0) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'update project sharing')) {
			return false
		}

		const nextUsername = `${username || ''}`.trim()
		if (!nextUsername) {
			return false
		}

		set({projectSharingSubmitting: true, error: null})

		try {
			await api<{user?: unknown}, {permission: SharePermission}>(`/api/projects/${projectId}/users/${encodeURIComponent(nextUsername)}`, {
				method: 'POST',
				body: {permission},
			})
			await get().loadProjectSharing(projectId)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({projectSharingSubmitting: false})
		}
	},

	async removeProjectUserShare(projectId, username) {
		if (!get().connected || projectId <= 0) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'update project sharing')) {
			return false
		}

		const nextUsername = `${username || ''}`.trim()
		if (!nextUsername) {
			return false
		}

		set({projectSharingSubmitting: true, error: null})

		try {
			await api<{ok: boolean}>(`/api/projects/${projectId}/users/${encodeURIComponent(nextUsername)}`, {
				method: 'DELETE',
			})
			await get().loadProjectSharing(projectId)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({projectSharingSubmitting: false})
		}
	},

	async addProjectTeamShare(projectId, teamId, permission) {
		if (!get().connected || projectId <= 0 || teamId <= 0) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'update project sharing')) {
			return false
		}

		set({projectSharingSubmitting: true, error: null})

		try {
			await api<{team?: unknown}, {teamId: number; permission: SharePermission}>(`/api/projects/${projectId}/teams`, {
				method: 'POST',
				body: {
					teamId,
					permission,
				},
			})
			await get().loadProjectSharing(projectId)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({projectSharingSubmitting: false})
		}
	},

	async updateProjectTeamShare(projectId, teamId, permission) {
		if (!get().connected || projectId <= 0 || teamId <= 0) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'update project sharing')) {
			return false
		}

		set({projectSharingSubmitting: true, error: null})

		try {
			await api<{team?: unknown}, {permission: SharePermission}>(`/api/projects/${projectId}/teams/${teamId}`, {
				method: 'POST',
				body: {permission},
			})
			await get().loadProjectSharing(projectId)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({projectSharingSubmitting: false})
		}
	},

	async removeProjectTeamShare(projectId, teamId) {
		if (!get().connected || projectId <= 0 || teamId <= 0) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'update project sharing')) {
			return false
		}

		set({projectSharingSubmitting: true, error: null})

		try {
			await api<{ok: boolean}>(`/api/projects/${projectId}/teams/${teamId}`, {
				method: 'DELETE',
			})
			await get().loadProjectSharing(projectId)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({projectSharingSubmitting: false})
		}
	},

	async addProjectLinkShare(projectId, payload) {
		if (!get().connected || projectId <= 0) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'create share links')) {
			return false
		}

		set({projectSharingSubmitting: true, error: null})

		try {
			await api<{share?: ProjectLinkShare}, {name?: string; password?: string; permission: SharePermission}>(
				`/api/projects/${projectId}/shares`,
				{
					method: 'POST',
					body: {
						name: `${payload.name || ''}`.trim(),
						password: `${payload.password || ''}`,
						permission: payload.permission,
					},
				},
			)
			await get().loadProjectSharing(projectId)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({projectSharingSubmitting: false})
		}
	},

	async removeProjectLinkShare(projectId, shareId) {
		if (!get().connected || projectId <= 0 || shareId <= 0) {
			return false
		}

		if (blockOfflineReadOnlyAction(get, set, 'remove share links')) {
			return false
		}

		set({projectSharingSubmitting: true, error: null})

		try {
			await api<{ok: boolean}>(`/api/projects/${projectId}/shares/${shareId}`, {
				method: 'DELETE',
			})
			await get().loadProjectSharing(projectId)
			return true
		} catch (error) {
			set({error: formatError(error as Error)})
			return false
		} finally {
			set({projectSharingSubmitting: false})
		}
	},

	resetProjectSharingState() {
		set({
			projectSharedUsers: [],
			projectSharedTeams: [],
			projectLinkShares: [],
			selectedShareDetail: null,
			shareDetailLoading: false,
			projectSharingLoading: false,
			projectSharingSubmitting: false,
			projectSharingProjectId: null,
		})
	},
})

async function loadProjectLinkShares(projectId: number) {
	try {
		return await api<ProjectLinkSharesPayload | ProjectLinkShare[]>(`/api/projects/${projectId}/shares`)
	} catch (error) {
		if (isMissingRouteError(error)) {
			return []
		}

		throw error
	}
}

function normalizeSharedUsers(payload: ProjectSharedUsersPayload | ProjectSharedUser[] | unknown) {
	return getCollection<ProjectSharedUser>(payload, 'users')
		.map(normalizeSharedUser)
		.filter((user): user is ProjectSharedUser => Boolean(user))
		.slice()
		.sort((left, right) => `${left.name || left.username || ''}`.localeCompare(`${right.name || right.username || ''}`))
}

function normalizeSharedTeams(payload: ProjectSharedTeamsPayload | ProjectSharedTeam[] | unknown) {
	return getCollection<ProjectSharedTeam>(payload, 'teams')
		.map(normalizeSharedTeam)
		.filter((team): team is ProjectSharedTeam => Boolean(team))
		.slice()
		.sort((left, right) => `${left.name || ''}`.localeCompare(`${right.name || ''}`))
}

function normalizeLinkShares(payload: ProjectLinkSharesPayload | ProjectLinkShare[] | unknown) {
	return getCollection<ProjectLinkShare>(payload, 'shares')
		.map(normalizeLinkShare)
		.filter((share): share is ProjectLinkShare => Boolean(share))
		.slice()
		.sort((left, right) => `${right.created || ''}`.localeCompare(`${left.created || ''}`) || right.id - left.id)
}

function getCollection<T>(payload: unknown, key: string) {
	if (Array.isArray(payload)) {
		return payload as T[]
	}

	if (isRecord(payload) && Array.isArray(payload[key])) {
		return payload[key] as T[]
	}

	return []
}

function normalizeSharedUser(payload: unknown): ProjectSharedUser | null {
	if (!isRecord(payload)) {
		return null
	}

	const nestedUser = isRecord(payload.user) ? payload.user : null
	const id = normalizePositiveNumber(payload.id ?? nestedUser?.id ?? payload.user_id ?? payload.userId)
	const username = normalizeText(payload.username ?? nestedUser?.username)
	if (!id || !username) {
		return null
	}

	return {
		id,
		username,
		name: normalizeText(payload.name ?? nestedUser?.name),
		email: normalizeOptionalText(payload.email ?? nestedUser?.email),
		permission: normalizePermission(payload.permission ?? payload.right),
		created: normalizeOptionalText(payload.created),
		updated: normalizeOptionalText(payload.updated),
	}
}

function normalizeSharedTeam(payload: unknown): ProjectSharedTeam | null {
	if (!isRecord(payload)) {
		return null
	}

	const nestedTeam = isRecord(payload.team) ? payload.team : null
	const id = normalizePositiveNumber(payload.id ?? nestedTeam?.id ?? payload.team_id ?? payload.teamId)
	const name = normalizeText(payload.name ?? nestedTeam?.name)
	if (!id || !name) {
		return null
	}

	return {
		id,
		name,
		description: normalizeOptionalText(payload.description ?? nestedTeam?.description) || undefined,
		is_public: normalizeOptionalBoolean(payload.is_public ?? nestedTeam?.is_public) ?? undefined,
		external_id: normalizeOptionalText(payload.external_id ?? nestedTeam?.external_id) || undefined,
		created: normalizeOptionalText(payload.created ?? nestedTeam?.created),
		updated: normalizeOptionalText(payload.updated ?? nestedTeam?.updated),
		members: normalizeTeamMembers(payload.members ?? nestedTeam?.members),
		permission: normalizePermission(payload.permission ?? payload.right),
	}
}

function normalizeLinkShare(payload: unknown): ProjectLinkShare | null {
	if (!isRecord(payload)) {
		return null
	}

	const id = normalizePositiveNumber(payload.id)
	const hash = normalizeText(payload.hash)
	if (!id || !hash) {
		return null
	}

	return {
		id,
		hash,
		name: normalizeText(payload.name),
		project_id: normalizeNullableNumber(payload.project_id ?? payload.projectId),
		permission: normalizePermission(payload.permission ?? payload.right),
		sharing_type: normalizeNullableNumber(payload.sharing_type ?? payload.sharingType),
		expires: normalizeOptionalText(payload.expires ?? payload.expires_at),
		password_protected:
			normalizeOptionalBoolean(payload.password_protected ?? payload.passwordProtected) ??
			Boolean(normalizeOptionalText(payload.password)),
		shared_by: isRecord(payload.shared_by) ? {
			id: normalizePositiveNumber(payload.shared_by.id) || 0,
			name: normalizeText(payload.shared_by.name),
			username: normalizeText(payload.shared_by.username),
			email: normalizeOptionalText(payload.shared_by.email) || '',
		} : null,
		created: normalizeOptionalText(payload.created),
		updated: normalizeOptionalText(payload.updated),
	}
}

function normalizeTeamMembers(payload: unknown): TeamUser[] | undefined {
	if (!Array.isArray(payload)) {
		return undefined
	}

	const members = payload
		.map(entry => {
			if (!isRecord(entry)) {
				return null
			}

			const id = normalizePositiveNumber(entry.id ?? entry.user_id ?? entry.userId)
			const username = normalizeText(entry.username)
			if (!id || !username) {
				return null
			}

			return {
				id,
				username,
				name: normalizeText(entry.name),
				email: normalizeOptionalText(entry.email) || undefined,
				admin: Boolean(entry.admin),
				created: normalizeOptionalText(entry.created),
				updated: normalizeOptionalText(entry.updated),
			} satisfies TeamUser
		})
		.filter((entry): entry is TeamUser => Boolean(entry))

	return members.length > 0 ? members : undefined
}

function normalizePermission(value: unknown): SharePermission {
	const permission = Number(value)
	if (permission === 0 || permission === 1 || permission === 2) {
		return permission
	}

	return 0
}

function normalizePositiveNumber(value: unknown) {
	const numeric = Number(value)
	return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function normalizeNullableNumber(value: unknown) {
	if (value == null || value === '') {
		return null
	}

	const numeric = Number(value)
	return Number.isFinite(numeric) ? numeric : null
}

function normalizeText(value: unknown) {
	return `${value || ''}`.trim()
}

function normalizeOptionalText(value: unknown) {
	const normalized = normalizeText(value)
	return normalized || null
}

function normalizeOptionalBoolean(value: unknown) {
	if (typeof value === 'boolean') {
		return value
	}

	return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isMissingRouteError(error: unknown) {
	const apiError = error as ApiError | null | undefined
	if (apiError?.statusCode === 404) {
		return true
	}

	const message = formatError(apiError).toLowerCase()
	return message.includes('route not found') || message.includes('not found')
}

import type {Project, SharePermission, UserProfile} from '../types.ts'

/* Project permission resolution, kept free of path-alias imports so node can
 * unit-test it directly (see tests/unit/project-permissions.test.ts).
 * Re-exported from selectors.ts, which remains the import site for the app. */

type PermissionProject = Pick<Project, 'maxPermission' | 'max_permission' | 'owner'>

export interface ProjectPermissionActor extends Pick<UserProfile, 'id' | 'username' | 'email'> {
	canUseAdminBridge?: boolean | null
}

interface ProjectPermissionActorSource {
	account?: {
		linkShareAuth?: boolean
		canUseAdminBridge?: boolean
		user?: Pick<UserProfile, 'id' | 'username' | 'email'> | null
	} | null
}

/* Link-share sessions have no user identity to match against project owners. */
export function getProjectPermissionActor(state: ProjectPermissionActorSource): ProjectPermissionActor | null {
	const account = state.account
	if (!account || account.linkShareAuth) {
		return null
	}

	return {
		id: Number(account.user?.id || 0),
		username: account.user?.username || '',
		email: account.user?.email || '',
		canUseAdminBridge: account.canUseAdminBridge,
	}
}

/* Deliberately ignores canUseAdminBridge: the gateway sends every project call
 * with the session's own Vikunja token (isOperatorAccount only guards
 * /api/admin/*), so the server is the authority. Claiming admin here just
 * rendered affordances the server answers with 403. Vikunja 2.4's site-admin
 * bypass is a licensed server-side feature, not something the client asserts. */
export function getProjectPermission(
	project: PermissionProject | null | undefined,
	actor: ProjectPermissionActor | null = null,
) {
	const value = Number(project?.maxPermission ?? project?.max_permission ?? 0)
	if (value === 2) {
		return 2
	}
	if (value === 1) {
		return 1
	}

	if (matchesProjectActor(project, actor)) {
		return 2
	}

	return 0
}

export function canWriteProject(
	project: PermissionProject | null | undefined,
	actor: ProjectPermissionActor | null = null,
) {
	return getProjectPermission(project, actor) >= 1
}

export function canAdminProject(
	project: PermissionProject | null | undefined,
	actor: ProjectPermissionActor | null = null,
) {
	return getProjectPermission(project, actor) >= 2
}

export function canManageProjectSharing(
	project: PermissionProject | null | undefined,
	actor: ProjectPermissionActor | null = null,
) {
	return canWriteProject(project, actor)
}

export function canManageProjectSharePermission(
	project: PermissionProject | null | undefined,
	permission: SharePermission,
	actor: ProjectPermissionActor | null = null,
) {
	return permission === 2 ? canAdminProject(project, actor) : canManageProjectSharing(project, actor)
}

export function getAssignableProjectSharePermissions(
	project: PermissionProject | null | undefined,
	currentPermission: SharePermission | null = null,
	actor: ProjectPermissionActor | null = null,
) {
	const permissions: SharePermission[] = [0, 1]
	if (canAdminProject(project, actor) || currentPermission === 2) {
		permissions.push(2)
	}
	return permissions
}

function matchesProjectActor(
	project: Pick<Project, 'owner'> | null | undefined,
	actor: ProjectPermissionActor | null,
) {
	if (!project?.owner || !actor) {
		return false
	}

	const actorId = Number(actor.id || 0)
	const ownerId = Number(project.owner.id || 0)
	if (actorId > 0 && ownerId > 0) {
		return actorId === ownerId
	}

	const actorUsername = normalizeProjectIdentity(actor.username)
	const ownerUsername = normalizeProjectIdentity(project.owner.username)
	if (actorUsername && ownerUsername && actorUsername === ownerUsername) {
		return true
	}

	const actorEmail = normalizeProjectIdentity(actor.email)
	const ownerEmail = normalizeProjectIdentity(project.owner.email)
	return Boolean(actorEmail && ownerEmail && actorEmail === ownerEmail)
}

function normalizeProjectIdentity(value: string | null | undefined) {
	return `${value || ''}`.trim().toLowerCase()
}

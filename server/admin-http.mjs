/* Admin operations use the selected API. User listing was added to v2 in
 * 2.6, so 2.4/2.5 retain that one v1 read. Password changes require v2;
 * renaming remains a CLI bridge operation. */

export const ADMIN_USER_STATUS = {
	active: 0,
	emailConfirmationRequired: 1,
	disabled: 2,
	accountLocked: 3,
}

/* Matches the vocabulary the CLI bridge already emits, so a user record reads
 * the same whichever path produced it. */
const STATUS_LABELS = new Map([
	[ADMIN_USER_STATUS.active, 'active'],
	[ADMIN_USER_STATUS.emailConfirmationRequired, 'email-confirmation-required'],
	[ADMIN_USER_STATUS.disabled, 'disabled'],
	[ADMIN_USER_STATUS.accountLocked, 'locked'],
])

export function describeAdminUserStatus(status) {
	return STATUS_LABELS.get(Number(status || 0)) || ''
}

export function normalizeAdminHttpUser(raw) {
	const id = Number(raw?.id || 0)
	const username = `${raw?.username || ''}`.trim()
	if (!id || !username) {
		return null
	}

	const status = Number(raw?.status || 0)
	return {
		id,
		username,
		email: `${raw?.email || ''}`.trim(),
		name: `${raw?.name || ''}`.trim(),
		enabled: status !== ADMIN_USER_STATUS.disabled,
		status: describeAdminUserStatus(status),
		isAdmin: raw?.is_admin === true || raw?.isAdmin === true,
		botOwnerId: Number(raw?.bot_owner_id ?? raw?.botOwnerId ?? 0) || 0,
		authProvider: `${raw?.auth_provider || raw?.authProvider || ''}`.trim(),
		issuer: `${raw?.issuer || ''}`.trim(),
		subject: `${raw?.subject || ''}`.trim(),
		created: raw?.created || null,
		updated: raw?.updated || null,
	}
}

/* The admin routes are the only signal available: /api/v1/user omits is_admin,
 * so instance-admin rights cannot be read off the session user. A transport
 * failure resolves to false, which costs an operator the HTTP path for that
 * session but never grants access the server would refuse. */
export async function probeServerAdmin(client) {
	if (!client) {
		return false
	}

	try {
		await client.request('admin/overview')
		return true
	} catch {
		return false
	}
}

function supportsV2UserListing(version) {
	const match = /^v?(\d+)\.(\d+)\./.exec(version)
	return Boolean(match && (Number(match[1]) > 2 || Number(match[1]) === 2 && Number(match[2]) >= 6))
}

export function createAdminHttpApi({client, apiV2Available = false, serverVersion = ''} = {}) {
	function requireV2(operation) {
		if (!apiV2Available) {
			const error = new Error(`${operation} requires the Vikunja v2 API, which this instance does not serve.`)
			error.statusCode = 501
			throw error
		}
	}

	return {
		/* What the HTTP admin API can do on this instance. Renaming a user has
		 * no route in either version, so it stays a CLI-bridge-only action. */
		supports(operation) {
			switch (operation) {
				case 'overview':
				case 'listUsers':
				case 'createUser':
				case 'setUserEnabled':
				case 'setUserAdmin':
				case 'deleteUser':
					return true
				case 'setUserPassword':
					return apiV2Available
				default:
					return false
			}
		},

		async getOverview() {
			return await client.request('admin/overview')
		},

		async listUsers({search = ''} = {}) {
			const params = {}
			const query = `${search || ''}`.trim()
			if (query) {
				params.s = query
			}

			const payload = await client.fetchAllPages('admin/users', params, {apiVersion: apiV2Available && supportsV2UserListing(serverVersion) ? 'v2' : 'v1'})
			return (Array.isArray(payload) ? payload : [])
				.map(entry => normalizeAdminHttpUser(entry))
				.filter(Boolean)
		},

		async createUser({username, email, password, name = '', isAdmin = false, skipEmailConfirm = true}) {
			const created = await client.request('admin/users', {
				method: 'POST',
				body: {
					username: `${username || ''}`.trim(),
					email: `${email || ''}`.trim(),
					password: `${password || ''}`,
					name: `${name || ''}`.trim(),
					is_admin: isAdmin === true,
					skip_email_confirm: skipEmailConfirm !== false,
				},
			})
			return normalizeAdminHttpUser(created)
		},

		async setUserEnabled(id, enabled) {
			const updated = await client.request(`admin/users/${encodeURIComponent(id)}/status`, {
				method: 'PATCH',
				body: {
					status: enabled ? ADMIN_USER_STATUS.active : ADMIN_USER_STATUS.disabled,
				},
			})
			return normalizeAdminHttpUser(updated)
		},

		async setUserAdmin(id, isAdmin) {
			const updated = await client.request(`admin/users/${encodeURIComponent(id)}/admin`, {
				method: 'PATCH',
				body: {is_admin: isAdmin === true},
			})
			return normalizeAdminHttpUser(updated)
		},

		async setUserPassword(id, newPassword) {
			requireV2('Setting a password over HTTP')
			await client.request(`admin/users/${encodeURIComponent(id)}/password`, {
				method: 'PATCH',
				apiVersion: 'v2',
				body: {new_password: `${newPassword || ''}`},
			})
		},

		/* mode=now matches the bridge's `user delete --now --confirm`. The
		 * upstream default (`scheduled`) would instead email the target user a
		 * confirmation, which is not what an operator pressing Delete expects. */
		async deleteUser(id) {
			await client.request(`admin/users/${encodeURIComponent(id)}`, {
				method: 'DELETE',
				params: {mode: 'now'},
			})
		},
	}
}

/* Admin routes are keyed by numeric id, but the gateway's own admin routes have
 * always accepted a username or email too (the CLI bridge resolves either). */
export async function resolveAdminUserId(api, identifier) {
	const raw = `${identifier || ''}`.trim()
	if (/^\d+$/.test(raw)) {
		return Number(raw)
	}

	if (!raw) {
		const error = new Error('A user id, username, or email is required.')
		error.statusCode = 400
		throw error
	}

	const needle = raw.toLowerCase()
	const users = await api.listUsers({search: raw})
	const match = users.find(user =>
		user.username.toLowerCase() === needle || user.email.toLowerCase() === needle,
	)

	if (!match) {
		const error = new Error(`No Vikunja user matches "${raw}".`)
		error.statusCode = 404
		throw error
	}

	return match.id
}

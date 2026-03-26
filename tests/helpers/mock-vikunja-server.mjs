import http from 'node:http'
import {createMockFixture, cloneFixture} from './mock-data.mjs'

export async function createMockVikunjaServer() {
	const initialFixture = createMockFixture()
	let state = buildMutableState(initialFixture)

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url || '/', 'http://127.0.0.1')
			if (!url.pathname.startsWith('/api/v1/')) {
				sendJson(res, 404, {error: 'Route not found.'})
				return
			}

			const route = url.pathname.replace(/^\/api\/v1\//, '')
			const isMultipart = `${req.headers['content-type'] || ''}`.toLowerCase().includes('multipart/form-data')
			const body = req.method === 'GET' || req.method === 'DELETE' || isMultipart ? null : await readJsonBody(req)

			if (route === 'info' && req.method === 'GET') {
				sendJson(res, 200, {
					version: 'test',
					frontend_url: 'http://127.0.0.1',
					link_sharing_enabled: true,
					public_teams_enabled: true,
				})
				return
			}

			if (route === 'login' && req.method === 'POST') {
				const username = `${body?.username || ''}`.trim()
				const password = `${body?.password || ''}`.trim()
				if (!username || !password) {
					sendJson(res, 400, {error: 'Username and password are required.'})
					return
				}
				if (username !== 'smoke-user' || password !== state.currentPassword) {
					sendJson(res, 401, {error: 'Wrong username or password.'})
					return
				}

				sendJson(
					res,
					200,
					{
						token: buildToken(username),
					},
					{
						'Set-Cookie': 'vikunja_refresh_token=mock-refresh-token; Path=/; HttpOnly',
					},
				)
				return
			}

			if (route === 'user/token/refresh' && req.method === 'POST') {
				sendJson(
					res,
					200,
					{
						token: buildToken('refreshed-user'),
					},
					{
						'Set-Cookie': 'vikunja_refresh_token=mock-refresh-token; Path=/; HttpOnly',
					},
				)
				return
			}

			if (route === 'user' && req.method === 'GET') {
				sendJson(res, 200, state.user)
				return
			}

			if (route === 'users' && req.method === 'GET') {
				const search = `${url.searchParams.get('s') || ''}`.trim().toLowerCase()
				const users = !search
					? state.users
					: state.users.filter(user => {
						const haystacks = [
							`${user.name || ''}`,
							`${user.username || ''}`,
							`${user.email || ''}`,
						]
						return haystacks.some(value => value.toLowerCase().includes(search))
					})
				sendJson(res, 200, paginate(users, url))
				return
			}

			if (route === 'user/sessions' && req.method === 'GET') {
				sendJson(res, 200, paginate(state.sessions, url))
				return
			}

			if (route === 'user/timezones' && req.method === 'GET') {
				sendJson(res, 200, ['Europe/Amsterdam', 'UTC', 'America/New_York'])
				return
			}

			if (route === 'user/password' && req.method === 'POST') {
				const oldPassword = `${body?.old_password || ''}`
				const newPassword = `${body?.new_password || ''}`
				if (!oldPassword) {
					sendJson(res, 400, {error: 'The old password is empty.'})
					return
				}
				if (oldPassword !== state.currentPassword) {
					sendJson(res, 401, {error: 'Wrong username or password.'})
					return
				}
				if (!newPassword) {
					sendJson(res, 400, {error: 'The new password is empty.'})
					return
				}
				if (newPassword.length < 8) {
					sendJson(res, 412, {error: 'The new password must have at least 8 characters.'})
					return
				}
				state.currentPassword = newPassword
				state.sessions = []
				sendJson(res, 200, {message: 'The password was updated successfully.'})
				return
			}

			if (route === 'user/settings/general' && req.method === 'POST') {
				state.user = {
					...state.user,
					name: typeof body?.name === 'string' ? body.name : state.user.name,
					settings: {
						...(state.user.settings || {}),
						...(body || {}),
					},
				}
				sendJson(res, 200, {message: 'The settings were updated successfully.'})
				return
			}

			if (route === 'notifications' && req.method === 'GET') {
				sendJson(res, 200, paginate(normalizeNotifications(state.notifications), url))
				return
			}

			if (route === 'notifications' && req.method === 'POST') {
				const readAt = new Date().toISOString()
				state.notifications = normalizeNotifications(
					state.notifications.map(notification => ({
						...notification,
						read: true,
						read_at: readAt,
					})),
				)
				sendJson(res, 200, {ok: true})
				return
			}

			const notificationMatch = route.match(/^notifications\/(\d+)$/)
			if (notificationMatch && req.method === 'POST') {
				const notificationId = Number(notificationMatch[1])
				const read = body?.read !== false
				const notification = getNotification(notificationId)
				Object.assign(notification, normalizeNotification({
					...notification,
					read,
					read_at: read ? new Date().toISOString() : null,
				}))
				sendJson(res, 200, notification)
				return
			}

			const sessionMatch = route.match(/^user\/sessions\/([^/]+)$/)
			if (sessionMatch && req.method === 'DELETE') {
				state.sessions = state.sessions.filter(session => session.id !== sessionMatch[1])
				sendJson(res, 200, {ok: true})
				return
			}

			if (route === 'projects' && req.method === 'GET') {
				sendJson(res, 200, paginate(state.projects, url))
				return
			}

			if (route === 'projects' && req.method === 'PUT') {
				const project = {
					id: state.nextProjectId++,
					title: `${body?.title || ''}`.trim(),
					description: `${body?.description || ''}`.trim(),
					parent_project_id: Number(body?.parent_project_id || 0),
					position: getNextProjectPosition(),
					identifier: `${body?.identifier || ''}`.trim(),
					is_favorite: Boolean(body?.is_favorite),
					is_archived: false,
				}
				state.projects.push(project)
				sendJson(res, 201, project)
				return
			}

			if (route === 'filters' && req.method === 'PUT') {
				const savedFilter = buildSavedFilter({
					id: state.nextSavedFilterId++,
					title: body?.title,
					description: body?.description,
					is_favorite: body?.is_favorite,
					filters: body?.filters,
				})
				state.savedFilters.push(savedFilter)
				upsertSavedFilterProject(savedFilter)
				sendJson(res, 201, savedFilter)
				return
			}

			if (route === 'filters' && req.method === 'GET') {
				sendJson(res, 200, paginate(state.savedFilters, url))
				return
			}

			const filterMatch = route.match(/^filters\/(\d+)$/)
			if (filterMatch && req.method === 'GET') {
				sendJson(res, 200, getSavedFilter(Number(filterMatch[1])))
				return
			}

			if (filterMatch && req.method === 'POST') {
				const savedFilter = getSavedFilter(Number(filterMatch[1]))
				const nextFilter = buildSavedFilter({
					...savedFilter,
					title: body?.title ?? savedFilter.title,
					description: body?.description ?? savedFilter.description,
					is_favorite: body?.is_favorite ?? savedFilter.is_favorite,
					filters: body?.filters ?? savedFilter.filters,
					created: savedFilter.created,
					updated: new Date().toISOString(),
				})
				Object.assign(savedFilter, nextFilter)
				upsertSavedFilterProject(savedFilter)
				sendJson(res, 200, savedFilter)
				return
			}

			if (filterMatch && req.method === 'DELETE') {
				const savedFilterId = Number(filterMatch[1])
				const savedFilter = getSavedFilter(savedFilterId)
				state.savedFilters = state.savedFilters.filter(entry => entry.id !== savedFilterId)
				state.projects = state.projects.filter(project => project.id !== savedFilter.projectId)
				delete state.viewsByProjectId[savedFilter.projectId]
				sendJson(res, 200, {ok: true})
				return
			}

			const projectViewsMatch = route.match(/^projects\/(-?\d+)\/views$/)
			if (projectViewsMatch && req.method === 'GET') {
				const projectId = Number(projectViewsMatch[1])
				sendJson(res, 200, paginate(getViewsForProject(projectId), url))
				return
			}

			const projectUsersMatch = route.match(/^projects\/(-?\d+)\/projectusers$/)
			if (projectUsersMatch && req.method === 'GET') {
				const projectId = Number(projectUsersMatch[1])
				const search = `${url.searchParams.get('s') || ''}`.trim().toLowerCase()
				const projectUsers = listProjectUsers(projectId)
				const users = !search
					? projectUsers
					: projectUsers.filter(user => {
						const haystacks = [
							`${user.name || ''}`,
							`${user.username || ''}`,
						]
						return haystacks.some(value => value.toLowerCase().includes(search))
					})
				sendJson(res, 200, paginate(users, url))
				return
			}

			if (route === 'teams' && req.method === 'GET') {
				const search = `${url.searchParams.get('s') || ''}`.trim().toLowerCase()
				const teams = !search
					? state.teams
					: state.teams.filter(team => {
						const haystacks = [
							`${team.name || ''}`,
							`${team.description || ''}`,
						]
						return haystacks.some(value => value.toLowerCase().includes(search))
					})
				sendJson(res, 200, paginate(teams.map(team => serializeTeam(team)), url))
				return
			}

			if (route === 'teams' && req.method === 'PUT') {
				const now = new Date().toISOString()
				const team = normalizeTeam({
					id: state.nextTeamId++,
					name: `${body?.name || ''}`.trim(),
					description: `${body?.description || ''}`.trim(),
					is_public: body?.is_public === true,
					created: now,
					updated: now,
					members: [
						{
							...getUser(state.user.id),
							admin: true,
							created: now,
							updated: now,
						},
					],
				})
				state.teams.push(team)
				sendJson(res, 201, serializeTeam(team))
				return
			}

			const teamMatch = route.match(/^teams\/(\d+)$/)
			if (teamMatch && req.method === 'GET') {
				sendJson(res, 200, serializeTeam(getTeam(Number(teamMatch[1]))))
				return
			}

			if (teamMatch && req.method === 'POST') {
				const team = getTeam(Number(teamMatch[1]))
				team.name = `${body?.name || team.name || ''}`.trim()
				team.description = `${body?.description ?? team.description ?? ''}`.trim()
				team.is_public = body?.is_public === true
				team.updated = new Date().toISOString()
				sendJson(res, 200, serializeTeam(team))
				return
			}

			if (teamMatch && req.method === 'DELETE') {
				const teamId = Number(teamMatch[1])
				state.teams = state.teams.filter(team => team.id !== teamId)
				state.projectTeamShares = state.projectTeamShares.filter(entry => entry.team_id !== teamId)
				sendJson(res, 200, {ok: true})
				return
			}

			const teamMembersMatch = route.match(/^teams\/(\d+)\/members$/)
			if (teamMembersMatch && req.method === 'PUT') {
				const team = getTeam(Number(teamMembersMatch[1]))
				const username = `${body?.username || ''}`.trim()
				const user = getUserByUsername(username)
				if (!team.members.some(member => member.username === username)) {
					team.members.push({
						...user,
						admin: false,
						created: new Date().toISOString(),
						updated: new Date().toISOString(),
					})
				}
				team.updated = new Date().toISOString()
				sendJson(res, 201, {
					user_id: user.id,
					username: user.username,
					admin: false,
				})
				return
			}

			const teamMemberAdminMatch = route.match(/^teams\/(\d+)\/members\/([^/]+)\/admin$/)
			if (teamMemberAdminMatch && req.method === 'POST') {
				const team = getTeam(Number(teamMemberAdminMatch[1]))
				const username = decodeURIComponent(teamMemberAdminMatch[2])
				const member = getTeamMember(team, username)
				member.admin = !member.admin
				member.updated = new Date().toISOString()
				team.updated = new Date().toISOString()
				sendJson(res, 200, {
					user_id: member.id,
					username: member.username,
					admin: member.admin,
				})
				return
			}

			const teamMemberMatch = route.match(/^teams\/(\d+)\/members\/([^/]+)$/)
			if (teamMemberMatch && req.method === 'DELETE') {
				const team = getTeam(Number(teamMemberMatch[1]))
				const username = decodeURIComponent(teamMemberMatch[2])
				team.members = team.members.filter(member => member.username !== username)
				team.updated = new Date().toISOString()
				sendJson(res, 200, {ok: true})
				return
			}

			const projectSharedUsersMatch = route.match(/^projects\/(-?\d+)\/users$/)
			if (projectSharedUsersMatch && req.method === 'GET') {
				const projectId = Number(projectSharedUsersMatch[1])
				sendJson(res, 200, paginate(listProjectUserShares(projectId), url))
				return
			}

			if (projectSharedUsersMatch && req.method === 'PUT') {
				const projectId = Number(projectSharedUsersMatch[1])
				const username = `${body?.username || ''}`.trim()
				const user = getUserByUsername(username)
				const now = new Date().toISOString()
				const existing = state.projectUserShares.find(entry => entry.project_id === projectId && entry.username === username)
				if (existing) {
					existing.permission = normalizeSharePermission(body?.permission)
					existing.updated = now
				} else {
					state.projectUserShares.push({
						project_id: projectId,
						username,
						permission: normalizeSharePermission(body?.permission),
						created: now,
						updated: now,
					})
				}
				sendJson(res, 201, serializeProjectUserShare(projectId, user))
				return
			}

			const projectSharedUserMatch = route.match(/^projects\/(-?\d+)\/users\/([^/]+)$/)
			if (projectSharedUserMatch && req.method === 'POST') {
				const projectId = Number(projectSharedUserMatch[1])
				const username = decodeURIComponent(projectSharedUserMatch[2])
				const entry = getProjectUserShare(projectId, username)
				entry.permission = normalizeSharePermission(body?.permission)
				entry.updated = new Date().toISOString()
				sendJson(res, 200, serializeProjectUserShare(projectId, getUserByUsername(username)))
				return
			}

			if (projectSharedUserMatch && req.method === 'DELETE') {
				const projectId = Number(projectSharedUserMatch[1])
				const username = decodeURIComponent(projectSharedUserMatch[2])
				state.projectUserShares = state.projectUserShares.filter(entry => !(entry.project_id === projectId && entry.username === username))
				sendJson(res, 200, {ok: true})
				return
			}

			const projectSharedTeamsMatch = route.match(/^projects\/(-?\d+)\/teams$/)
			if (projectSharedTeamsMatch && req.method === 'GET') {
				const projectId = Number(projectSharedTeamsMatch[1])
				sendJson(res, 200, paginate(listProjectTeamShares(projectId), url))
				return
			}

			if (projectSharedTeamsMatch && req.method === 'PUT') {
				const projectId = Number(projectSharedTeamsMatch[1])
				const teamId = Number(body?.team_id || body?.teamId || 0)
				const now = new Date().toISOString()
				const existing = state.projectTeamShares.find(entry => entry.project_id === projectId && entry.team_id === teamId)
				if (existing) {
					existing.permission = normalizeSharePermission(body?.permission)
					existing.updated = now
				} else {
					state.projectTeamShares.push({
						project_id: projectId,
						team_id: teamId,
						permission: normalizeSharePermission(body?.permission),
						created: now,
						updated: now,
					})
				}
				sendJson(res, 201, serializeProjectTeamShare(projectId, getTeam(teamId)))
				return
			}

			const projectSharedTeamMatch = route.match(/^projects\/(-?\d+)\/teams\/(\d+)$/)
			if (projectSharedTeamMatch && req.method === 'POST') {
				const projectId = Number(projectSharedTeamMatch[1])
				const teamId = Number(projectSharedTeamMatch[2])
				const entry = getProjectTeamShare(projectId, teamId)
				entry.permission = normalizeSharePermission(body?.permission)
				entry.updated = new Date().toISOString()
				sendJson(res, 200, serializeProjectTeamShare(projectId, getTeam(teamId)))
				return
			}

			if (projectSharedTeamMatch && req.method === 'DELETE') {
				const projectId = Number(projectSharedTeamMatch[1])
				const teamId = Number(projectSharedTeamMatch[2])
				state.projectTeamShares = state.projectTeamShares.filter(entry => !(entry.project_id === projectId && entry.team_id === teamId))
				sendJson(res, 200, {ok: true})
				return
			}

			const projectLinkSharesMatch = route.match(/^projects\/(-?\d+)\/shares$/)
			if (projectLinkSharesMatch && req.method === 'GET') {
				const projectId = Number(projectLinkSharesMatch[1])
				sendJson(res, 200, paginate(listProjectLinkShares(projectId), url))
				return
			}

			if (projectLinkSharesMatch && req.method === 'PUT') {
				const projectId = Number(projectLinkSharesMatch[1])
				const now = new Date().toISOString()
				const share = {
					id: state.nextLinkShareId++,
					hash: `share-${projectId}-${Date.now()}-${state.nextLinkShareId}`,
					project_id: projectId,
					name: `${body?.name || ''}`.trim(),
					permission: normalizeSharePermission(body?.permission),
					sharing_type: `${body?.password || ''}` ? 2 : 1,
					password: `${body?.password || ''}`,
					shared_by: getUser(state.user.id),
					created: now,
					updated: now,
				}
				state.linkShares.push(share)
				sendJson(res, 201, normalizeLinkShare(share))
				return
			}

			const projectLinkShareMatch = route.match(/^projects\/(-?\d+)\/shares\/(\d+)$/)
			if (projectLinkShareMatch && req.method === 'DELETE') {
				const projectId = Number(projectLinkShareMatch[1])
				const shareId = Number(projectLinkShareMatch[2])
				state.linkShares = state.linkShares.filter(share => !(share.project_id === projectId && share.id === shareId))
				sendJson(res, 200, {ok: true})
				return
			}

			const linkShareAuthMatch = route.match(/^shares\/([^/]+)\/auth$/)
			if (linkShareAuthMatch && req.method === 'POST') {
				const hash = decodeURIComponent(linkShareAuthMatch[1])
				const share = state.linkShares.find(entry => `${entry.hash || ''}` === hash)
				if (!share) {
					sendJson(res, 404, {error: 'The project share does not exist.', code: 13000})
					return
				}

				const requiresPassword = Number(share.sharing_type || 0) === 2
				const password = `${body?.password || ''}`
				if (requiresPassword && !password) {
					sendJson(res, 401, {error: 'A password is required for this share.', code: 13001})
					return
				}
				if (requiresPassword && password !== `${share.password || ''}`) {
					sendJson(res, 401, {error: 'The provided share password is invalid.', code: 13002})
					return
				}

				sendJson(res, 200, {
					token: buildToken(`share-${share.project_id}`),
					project_id: Number(share.project_id || 0),
				})
				return
			}

			const viewBucketsMatch = route.match(/^projects\/(-?\d+)\/views\/(\d+)\/buckets$/)
			if (viewBucketsMatch && req.method === 'GET') {
				const viewId = Number(viewBucketsMatch[2])
				sendJson(res, 200, (state.bucketsByViewId?.[viewId] || []).map(bucket => ({
					...bucket,
					tasks: [],
				})))
				return
			}

			const projectViewTasksMatch = route.match(/^projects\/(-?\d+)\/views\/(\d+)\/tasks$/)
			if (projectViewTasksMatch && req.method === 'GET') {
				const projectId = Number(projectViewTasksMatch[1])
				const viewId = Number(projectViewTasksMatch[2])
				sendJson(res, 200, paginate(listTasksForProjectView(projectId, viewId, url.searchParams), url))
				return
			}

			const projectTasksMatch = route.match(/^projects\/(-?\d+)\/tasks$/)
			if (projectTasksMatch && req.method === 'GET') {
				const projectId = Number(projectTasksMatch[1])
				sendJson(res, 200, paginate(listTasksForProject(projectId, url.searchParams), url))
				return
			}

			if (projectTasksMatch && req.method === 'PUT') {
				const projectId = Number(projectTasksMatch[1])
				const task = buildTask({
					id: state.nextTaskId++,
					project_id: projectId,
					title: `${body?.title || ''}`.trim(),
					description: `${body?.description || ''}`.trim(),
					done: false,
					is_favorite: false,
					due_date: body?.due_date || null,
					start_date: body?.start_date || null,
					end_date: body?.end_date || null,
					done_at: null,
					position: getNextTaskPosition(projectId),
					priority: Number(body?.priority || 0),
					percent_done: Number(body?.percent_done || 0),
					reminders: body?.reminders || [],
					repeat_after: normalizeRepeatAfter(body?.repeat_after),
					repeat_from_current_date: Boolean(body?.repeat_from_current_date),
					assignees: normalizeTaskAssignees(body?.assignees),
					labelIds: [],
					parentTaskId: null,
				})
				state.tasks.push(task)
				sendJson(res, 201, serializeTask(task))
				return
			}

			const projectDuplicateMatch = route.match(/^projects\/(\d+)\/duplicate$/)
			if (projectDuplicateMatch && req.method === 'PUT') {
				const sourceProject = getProject(Number(projectDuplicateMatch[1]))
				const duplicateProject = {
					...sourceProject,
					id: state.nextProjectId++,
					title: `${sourceProject.title} (Copy)`,
					parent_project_id: Number(body?.parent_project_id ?? body?.parentProjectId ?? sourceProject.parent_project_id ?? 0),
					position: getNextProjectPosition(),
				}
				state.projects.push(duplicateProject)
				sendJson(res, 200, duplicateProject)
				return
			}

			const projectMatch = route.match(/^projects\/(-?\d+)$/)
			if (projectMatch && req.method === 'GET') {
				const projectId = Number(projectMatch[1])
				const project = getProject(projectId)
				sendJson(res, 200, project)
				return
			}

			if (projectMatch && req.method === 'POST') {
				const projectId = Number(projectMatch[1])
				const project = getProject(projectId)
				Object.assign(project, {
					...project,
					...body,
					id: projectId,
					parent_project_id: Number(body?.parent_project_id ?? project.parent_project_id ?? 0),
				})
				sendJson(res, 200, project)
				return
			}

			if (projectMatch && req.method === 'DELETE') {
				const projectId = Number(projectMatch[1])
				const removedProjectIds = new Set([projectId, ...collectChildProjectIds(projectId)])
				state.projects = state.projects.filter(project => !removedProjectIds.has(project.id))
				state.tasks = state.tasks.filter(task => !removedProjectIds.has(task.project_id))
				sendJson(res, 200, {ok: true})
				return
			}

			if (route === 'tasks' && req.method === 'GET') {
				sendJson(res, 200, paginate(filterTasks(url.searchParams), url))
				return
			}

			if (route === 'tasks/bulk' && req.method === 'POST') {
				const taskIds = Array.isArray(body?.task_ids)
					? body.task_ids.map(value => Number(value || 0)).filter(Boolean)
					: []
				const fields = Array.isArray(body?.fields) ? body.fields : []
				const values = body?.values && typeof body.values === 'object' && !Array.isArray(body.values) ? body.values : null
				const now = new Date().toISOString()

				if (taskIds.length === 0 || fields.length === 0 || !values) {
					sendJson(res, 400, {error: 'task_ids, fields, and values are required.'})
					return
				}

				for (const taskId of taskIds) {
					const task = getTask(taskId)
					task.updated = now
					fields.forEach(field => {
						const value = values[field]
						switch (`${field || ''}`) {
							case 'done':
								task.done = Boolean(value)
								task.done_at = task.done ? now : null
								break
							case 'project_id':
								task.project_id = Number(value || task.project_id)
								break
							case 'priority':
								task.priority = Number(value || 0)
								break
							case 'is_favorite':
								task.is_favorite = Boolean(value)
								break
							default:
								break
						}
					})
				}

				sendJson(res, 200, {ok: true})
				return
			}

			const taskMatch = route.match(/^tasks\/(\d+)$/)
			if (taskMatch && req.method === 'GET') {
				sendJson(res, 200, serializeTask(getTask(Number(taskMatch[1])), {includeComments: true, includeAttachments: true}))
				return
			}

			if (taskMatch && req.method === 'POST') {
				const taskId = Number(taskMatch[1])
				const task = getTask(taskId)
				const now = new Date().toISOString()
				const nextDone = body?.done === undefined ? Boolean(task.done) : Boolean(body.done)
				const previousDone = Boolean(task.done)
				const projectId = body?.project_id ? Number(body.project_id) : task.project_id

				Object.assign(task, {
					...task,
					id: taskId,
					project_id: projectId,
					title: body?.title === undefined ? task.title : `${body.title || ''}`.trim(),
					description: body?.description === undefined ? task.description : `${body.description || ''}`.trim(),
					done: nextDone,
					is_favorite: body?.is_favorite === undefined ? Boolean(task.is_favorite) : Boolean(body.is_favorite),
					due_date: body?.due_date === undefined ? task.due_date : body.due_date || null,
					start_date: body?.start_date === undefined ? task.start_date : body.start_date || null,
					end_date: body?.end_date === undefined ? task.end_date : body.end_date || null,
					done_at: body?.done_at === undefined
						? (previousDone !== nextDone ? (nextDone ? now : null) : (nextDone ? task.done_at || now : null))
						: body.done_at || null,
					position: body?.position === undefined ? Number(task.position || 0) : Number(body.position || 0),
					priority: body?.priority === undefined ? Number(task.priority || 0) : Number(body.priority || 0),
					percent_done: body?.percent_done === undefined
						? normalizePercentDone(task.percent_done)
						: normalizePercentDone(body.percent_done),
					reminders: body?.reminders === undefined ? task.reminders : normalizeTaskReminders(body.reminders),
					repeat_after: body?.repeat_after === undefined
						? normalizeRepeatAfter(task.repeat_after)
						: normalizeRepeatAfter(body.repeat_after),
					repeat_from_current_date: body?.repeat_from_current_date === undefined
						? Boolean(task.repeat_from_current_date)
						: Boolean(body.repeat_from_current_date),
					assignees: body?.assignees === undefined ? normalizeTaskAssignees(task.assignees) : normalizeTaskAssignees(body.assignees),
					comments: body?.comments === undefined ? normalizeTaskComments(task.comments) : normalizeTaskComments(body.comments),
					attachments: body?.attachments === undefined ? normalizeTaskAttachments(task.attachments) : normalizeTaskAttachments(body.attachments),
					created: task.created || now,
					updated: now,
				})
				sendJson(res, 200, serializeTask(task, {includeComments: true, includeAttachments: true}))
				return
			}

			if (taskMatch && req.method === 'DELETE') {
				const taskId = Number(taskMatch[1])
				state.tasks = state.tasks.filter(task => task.id !== taskId && task.parentTaskId !== taskId)
				sendJson(res, 200, {ok: true})
				return
			}

			const taskPositionMatch = route.match(/^tasks\/(\d+)\/position$/)
			if (taskPositionMatch && req.method === 'POST') {
				const taskId = Number(taskPositionMatch[1])
				const task = getTask(taskId)
				task.position = Number(body?.position || task.position)
				sendJson(res, 200, {
					task_id: taskId,
					project_view_id: Number(body?.project_view_id || 0),
					position: task.position,
				})
				return
			}

			const taskDuplicateMatch = route.match(/^tasks\/(\d+)\/duplicate$/)
			if (taskDuplicateMatch && req.method === 'PUT') {
				const sourceTask = getTask(Number(taskDuplicateMatch[1]))
				const duplicateTask = buildTask({
					...sourceTask,
					id: state.nextTaskId++,
					title: `${sourceTask.title} (Copy)`,
					position: getNextTaskPosition(sourceTask.project_id),
					reminders: sourceTask.reminders,
					repeat_after: sourceTask.repeat_after,
					repeat_from_current_date: sourceTask.repeat_from_current_date,
					assignees: sourceTask.assignees,
					attachments: sourceTask.attachments,
					labelIds: [...sourceTask.labelIds],
				})
				state.tasks.push(duplicateTask)
				sendJson(res, 200, serializeTask(duplicateTask))
				return
			}

			const taskAssigneesMatch = route.match(/^tasks\/(\d+)\/assignees$/)
			if (taskAssigneesMatch && req.method === 'GET') {
				const task = getTask(Number(taskAssigneesMatch[1]))
				const search = `${url.searchParams.get('s') || ''}`.trim().toLowerCase()
				const assignees = normalizeTaskAssignees(task.assignees)
				const filtered = !search
					? assignees
					: assignees.filter(user => {
						const haystacks = [
							`${user.name || ''}`,
							`${user.username || ''}`,
							`${user.email || ''}`,
						]
						return haystacks.some(value => value.toLowerCase().includes(search))
					})
				sendJson(res, 200, paginate(filtered, url))
				return
			}

			if (taskAssigneesMatch && req.method === 'PUT') {
				const task = getTask(Number(taskAssigneesMatch[1]))
				const userId = Number(body?.user_id || body?.userId || 0)
				const user = getUser(userId)
				const nextAssignees = normalizeTaskAssignees([...normalizeTaskAssignees(task.assignees), user])
				task.assignees = nextAssignees
				sendJson(res, 201, {
					user_id: user.id,
					created: new Date().toISOString(),
				})
				return
			}

			const taskAssigneeMatch = route.match(/^tasks\/(\d+)\/assignees\/(\d+)$/)
			if (taskAssigneeMatch && req.method === 'DELETE') {
				const task = getTask(Number(taskAssigneeMatch[1]))
				const userId = Number(taskAssigneeMatch[2])
				task.assignees = normalizeTaskAssignees(task.assignees).filter(user => user.id !== userId)
				sendJson(res, 200, {ok: true})
				return
			}

			const taskCommentsMatch = route.match(/^tasks\/(\d+)\/comments$/)
			if (taskCommentsMatch && req.method === 'GET') {
				const task = getTask(Number(taskCommentsMatch[1]))
				sendJson(res, 200, paginate(normalizeTaskComments(task.comments), url))
				return
			}

			if (taskCommentsMatch && req.method === 'PUT') {
				const task = getTask(Number(taskCommentsMatch[1]))
				const commentText = `${body?.comment || ''}`.trim()
				if (!commentText) {
					sendJson(res, 400, {error: 'Comment is required.'})
					return
				}

				const now = new Date().toISOString()
				const comment = {
					id: state.nextCommentId++,
					comment: commentText,
					author: getUser(state.user.id),
					created: now,
					updated: now,
				}
				task.comments = normalizeTaskComments([...(task.comments || []), comment])
				task.updated = now
				sendJson(res, 201, {...comment})
				return
			}

			const taskCommentMatch = route.match(/^tasks\/(\d+)\/comments\/(\d+)$/)
			if (taskCommentMatch && req.method === 'GET') {
				const task = getTask(Number(taskCommentMatch[1]))
				const commentId = Number(taskCommentMatch[2])
				const comment = normalizeTaskComments(task.comments).find(entry => entry.id === commentId)
				if (!comment) {
					sendJson(res, 404, {error: 'Comment not found.'})
					return
				}
				sendJson(res, 200, comment)
				return
			}

			if (taskCommentMatch && req.method === 'POST') {
				const task = getTask(Number(taskCommentMatch[1]))
				const commentId = Number(taskCommentMatch[2])
				const commentText = `${body?.comment || ''}`.trim()
				const comments = normalizeTaskComments(task.comments)
				const existingComment = comments.find(entry => entry.id === commentId)
				if (!existingComment) {
					sendJson(res, 404, {error: 'Comment not found.'})
					return
				}
				if (!commentText) {
					sendJson(res, 400, {error: 'Comment is required.'})
					return
				}

				const updatedComment = {
					...existingComment,
					comment: commentText,
					updated: new Date().toISOString(),
				}
				task.comments = comments.map(entry => entry.id === commentId ? updatedComment : entry)
				task.updated = updatedComment.updated
				sendJson(res, 200, updatedComment)
				return
			}

			if (taskCommentMatch && req.method === 'DELETE') {
				const task = getTask(Number(taskCommentMatch[1]))
				const commentId = Number(taskCommentMatch[2])
				const nextComments = normalizeTaskComments(task.comments).filter(entry => entry.id !== commentId)
				if (nextComments.length === normalizeTaskComments(task.comments).length) {
					sendJson(res, 404, {error: 'Comment not found.'})
					return
				}
				task.comments = nextComments
				task.updated = new Date().toISOString()
				sendJson(res, 200, {ok: true})
				return
			}

			const taskAttachmentsMatch = route.match(/^tasks\/(\d+)\/attachments$/)
			if (taskAttachmentsMatch && req.method === 'GET') {
				const task = getTask(Number(taskAttachmentsMatch[1]))
				sendJson(res, 200, paginate(normalizeTaskAttachments(task.attachments), url))
				return
			}

			if (taskAttachmentsMatch && req.method === 'PUT') {
				const task = getTask(Number(taskAttachmentsMatch[1]))
				const uploadedFiles = parseMultipartFiles(await readRawBody(req), `${req.headers['content-type'] || ''}`)
				if (uploadedFiles.length === 0) {
					sendJson(res, 400, {error: 'At least one file is required.'})
					return
				}

				const createdAt = new Date().toISOString()
				const nextAttachments = uploadedFiles.map(file => ({
					id: state.nextAttachmentId++,
					task_id: task.id,
					created_by: getUser(state.user.id),
					file: {
						id: state.nextAttachmentFileId++,
						name: file.name,
						mime: file.mime,
						size: file.size,
					},
					created: createdAt,
				}))
				task.attachments = normalizeTaskAttachments([...(task.attachments || []), ...nextAttachments])
				task.updated = createdAt
				sendJson(res, 201, {
					success: nextAttachments.map(attachment => ({...attachment, created_by: {...attachment.created_by}, file: {...attachment.file}})),
				})
				return
			}

			const taskAttachmentMatch = route.match(/^tasks\/(\d+)\/attachments\/(\d+)$/)
			if (taskAttachmentMatch && req.method === 'GET') {
				const task = getTask(Number(taskAttachmentMatch[1]))
				const attachmentId = Number(taskAttachmentMatch[2])
				const attachment = normalizeTaskAttachments(task.attachments).find(entry => entry.id === attachmentId)
				if (!attachment) {
					sendJson(res, 404, {error: 'Attachment not found.'})
					return
				}

				const previewSize = `${url.searchParams.get('preview_size') || ''}`.trim()
				const responseBody = buildAttachmentPayload(attachment, previewSize)
				sendBuffer(res, 200, responseBody.body, responseBody.headers)
				return
			}

			if (taskAttachmentMatch && req.method === 'DELETE') {
				const task = getTask(Number(taskAttachmentMatch[1]))
				const attachmentId = Number(taskAttachmentMatch[2])
				const nextAttachments = normalizeTaskAttachments(task.attachments).filter(entry => entry.id !== attachmentId)
				if (nextAttachments.length === normalizeTaskAttachments(task.attachments).length) {
					sendJson(res, 404, {error: 'Attachment not found.'})
					return
				}
				task.attachments = nextAttachments
				task.updated = new Date().toISOString()
				sendJson(res, 200, {ok: true})
				return
			}

			const taskRelationsMatch = route.match(/^tasks\/(\d+)\/relations$/)
			if (taskRelationsMatch && req.method === 'PUT') {
				const taskId = Number(taskRelationsMatch[1])
				const relationKind = `${body?.relation_kind || ''}`
				const otherTaskId = Number(body?.other_task_id || 0)
				if (relationKind === 'subtask') {
					getTask(otherTaskId).parentTaskId = taskId
				} else if (relationKind === 'parenttask') {
					getTask(taskId).parentTaskId = otherTaskId
				}
				sendJson(res, 201, {ok: true})
				return
			}

			const taskRelationDeleteMatch = route.match(/^tasks\/(\d+)\/relations\/(\w+)\/(\d+)$/)
			if (taskRelationDeleteMatch && req.method === 'DELETE') {
				const taskId = Number(taskRelationDeleteMatch[1])
				const relationKind = taskRelationDeleteMatch[2]
				const otherTaskId = Number(taskRelationDeleteMatch[3])
				if (relationKind === 'subtask') {
					const childTask = getTask(otherTaskId)
					if (childTask.parentTaskId === taskId) {
						childTask.parentTaskId = null
					}
				} else if (relationKind === 'parenttask') {
					const task = getTask(taskId)
					if (task.parentTaskId === otherTaskId) {
						task.parentTaskId = null
					}
				}
				sendJson(res, 200, {ok: true})
				return
			}

			const taskLabelsMatch = route.match(/^tasks\/(\d+)\/labels$/)
			if (taskLabelsMatch && req.method === 'PUT') {
				const taskId = Number(taskLabelsMatch[1])
				const task = getTask(taskId)
				const labelId = Number(body?.label_id || 0)
				if (labelId && !task.labelIds.includes(labelId)) {
					task.labelIds.push(labelId)
				}
				sendJson(res, 200, {ok: true})
				return
			}

			const taskLabelMatch = route.match(/^tasks\/(\d+)\/labels\/(\d+)$/)
			if (taskLabelMatch && req.method === 'DELETE') {
				const task = getTask(Number(taskLabelMatch[1]))
				const labelId = Number(taskLabelMatch[2])
				task.labelIds = task.labelIds.filter(entry => entry !== labelId)
				sendJson(res, 200, {ok: true})
				return
			}

			if (route === 'labels' && req.method === 'GET') {
				sendJson(res, 200, paginate(state.labels, url))
				return
			}

			if (route === 'labels' && req.method === 'PUT') {
				const label = {
					id: state.nextLabelId++,
					title: `${body?.title || ''}`.trim(),
					hex_color: body?.hex_color || '#1973ff',
				}
				state.labels.push(label)
				sendJson(res, 201, label)
				return
			}

			const labelMatch = route.match(/^labels\/(\d+)$/)
			if (labelMatch && req.method === 'POST') {
				const label = getLabel(Number(labelMatch[1]))
				Object.assign(label, body || {})
				sendJson(res, 200, label)
				return
			}

			if (labelMatch && req.method === 'DELETE') {
				const labelId = Number(labelMatch[1])
				state.labels = state.labels.filter(label => label.id !== labelId)
				for (const task of state.tasks) {
					task.labelIds = task.labelIds.filter(entry => entry !== labelId)
				}
				sendJson(res, 200, {ok: true})
				return
			}

			sendJson(res, 404, {error: 'Route not found.'})
		} catch (error) {
			sendJson(res, error.statusCode || 500, {
				error: error.message || 'Mock Vikunja request failed.',
			})
		}
	})

	await listen(server)

	return {
		origin: `http://127.0.0.1:${server.address().port}`,
		reset() {
			state = buildMutableState(initialFixture)
		},
		close() {
			return new Promise((resolve, reject) => {
				server.close(error => {
					if (error) {
						reject(error)
						return
					}
					resolve()
				})
			})
		},
	}

	function listTasksForProject(projectId, searchParams = new URLSearchParams()) {
		if (projectId < 0) {
			const savedFilter = state.savedFilters.find(entry => entry.projectId === projectId)
			const filter = savedFilter?.filters?.filter || 'done = false'
			return sortTasks(
				state.tasks.filter(task => matchesSavedFilter(task, filter, state.labels)),
				searchParams,
			).map(serializeTask)
		}

		return sortTasks(
			state.tasks.filter(task => task.project_id === projectId),
			searchParams,
		).map(serializeTask)
	}

	function listTasksForProjectView(projectId, viewId, searchParams = new URLSearchParams()) {
		const tasks = listTasksForProject(projectId, searchParams)
		if (projectId === 1 && viewId === 11) {
			return tasks.filter(task => !task.done)
		}

		return tasks
	}

	function filterTasks(searchParams) {
		const search = `${searchParams.get('s') || ''}`.trim().toLowerCase()
		const filter = `${searchParams.get('filter') || ''}`.trim()
		let tasks = state.tasks.slice()

		if (search) {
			tasks = tasks.filter(task =>
				`${task.title} ${task.description}`.toLowerCase().includes(search),
			)
		}

		if (filter) {
			if (filter.includes('done = false')) {
				tasks = tasks.filter(task => !task.done)
			}

			if (filter.includes('now+1d/d') && filter.includes('now+14d/d')) {
				const todayStart = startOfDay(new Date())
				const tomorrowStart = new Date(todayStart.getTime() + DAY_MS)
				const horizon = new Date(todayStart.getTime() + 14 * DAY_MS)
				tasks = tasks.filter(task => {
					const due = task.due_date ? new Date(task.due_date) : null
					return due && due >= tomorrowStart && due < horizon
				})
			}

			const boundaryMatch = filter.match(/due_date >= "([^"]+)" && due_date < "([^"]+)"/)
			if (boundaryMatch) {
				const start = new Date(boundaryMatch[1])
				const end = new Date(boundaryMatch[2])
				tasks = tasks.filter(task => {
					const due = task.due_date ? new Date(task.due_date) : null
					return due && due >= start && due < end
				})
			}
		}

		return sortTasks(tasks, searchParams).map(serializeTask)
	}

	function serializeTask(task, options = {}) {
		const includeComments = Boolean(options.includeComments)
		const includeAttachments = Boolean(options.includeAttachments)
		const labels = task.labelIds
			.map(labelId => state.labels.find(label => label.id === labelId))
			.filter(Boolean)
		const comments = normalizeTaskComments(task.comments)
		const attachments = normalizeTaskAttachments(task.attachments)

		return {
			id: task.id,
			project_id: task.project_id,
			title: task.title,
			description: task.description,
			done: task.done,
			is_favorite: Boolean(task.is_favorite),
			due_date: task.due_date,
			start_date: task.start_date || null,
			end_date: task.end_date || null,
			done_at: task.done_at || null,
			created: task.created || null,
			updated: task.updated || null,
			position: task.position,
			priority: task.priority,
			percent_done: normalizePercentDone(task.percent_done),
			reminders: task.reminders?.length ? task.reminders.map(reminder => ({...reminder})) : null,
			repeat_after: normalizeRepeatAfter(task.repeat_after),
			repeat_from_current_date: Boolean(task.repeat_from_current_date),
			assignees: task.assignees?.length ? task.assignees.map(assignee => ({...assignee})) : null,
			comments: includeComments ? comments.map(comment => ({...comment, author: {...comment.author}})) : null,
			comment_count: comments.length,
			attachments: includeAttachments ? attachments.map(attachment => ({...attachment, created_by: {...attachment.created_by}, file: {...attachment.file}})) : null,
			labels,
			related_tasks: {
				parenttask: task.parentTaskId ? [makeTaskRef(getTask(task.parentTaskId))] : [],
				subtask: state.tasks
					.filter(entry => entry.parentTaskId === task.id)
					.sort(compareByPositionThenId)
					.map(makeTaskRef),
			},
		}
	}

	function getTask(taskId) {
		const task = state.tasks.find(entry => entry.id === taskId)
		if (!task) {
			const error = new Error(`Task ${taskId} not found.`)
			error.statusCode = 404
			throw error
		}
		return task
	}

	function getProject(projectId) {
		const project = state.projects.find(entry => entry.id === projectId)
		if (!project) {
			const error = new Error(`Project ${projectId} not found.`)
			error.statusCode = 404
			throw error
		}
		return project
	}

	function getSavedFilter(savedFilterId) {
		const savedFilter = state.savedFilters.find(entry => entry.id === savedFilterId)
		if (!savedFilter) {
			const error = new Error(`Saved filter ${savedFilterId} not found.`)
			error.statusCode = 404
			throw error
		}
		return savedFilter
	}

	function getNotification(notificationId) {
		const notification = state.notifications.find(entry => entry.id === notificationId)
		if (!notification) {
			const error = new Error(`Notification ${notificationId} not found.`)
			error.statusCode = 404
			throw error
		}
		return notification
	}

	function getLabel(labelId) {
		const label = state.labels.find(entry => entry.id === labelId)
		if (!label) {
			const error = new Error(`Label ${labelId} not found.`)
			error.statusCode = 404
			throw error
		}
		return label
	}

	function getUser(userId) {
		const user = state.users.find(entry => entry.id === userId)
		if (!user) {
			const error = new Error(`User ${userId} not found.`)
			error.statusCode = 404
			throw error
		}

		return {
			id: Number(user.id),
			name: `${user.name || ''}`.trim(),
			username: `${user.username || ''}`.trim(),
			email: `${user.email || ''}`.trim(),
		}
	}

	function getUserByUsername(username) {
		const normalizedUsername = `${username || ''}`.trim()
		const user = state.users.find(entry => entry.username === normalizedUsername)
		if (!user) {
			const error = new Error(`User ${normalizedUsername} not found.`)
			error.statusCode = 404
			throw error
		}
		return getUser(user.id)
	}

	function getTeam(teamId) {
		const team = state.teams.find(entry => Number(entry.id) === Number(teamId))
		if (!team) {
			const error = new Error(`Team ${teamId} not found.`)
			error.statusCode = 404
			throw error
		}
		return team
	}

	function getTeamMember(team, username) {
		const normalizedUsername = `${username || ''}`.trim()
		const member = Array.isArray(team.members)
			? team.members.find(entry => `${entry?.username || ''}`.trim() === normalizedUsername)
			: null
		if (!member) {
			const error = new Error(`Team member ${normalizedUsername} not found.`)
			error.statusCode = 404
			throw error
		}
		return member
	}

	function listProjectUsers(projectId) {
		const accessibleUserIds = new Set()
		for (const user of state.users) {
			if (user.id === state.user.id) {
				accessibleUserIds.add(Number(user.id))
			}
		}

		for (const task of state.tasks) {
			if (task.project_id !== projectId) {
				continue
			}

			for (const assignee of normalizeTaskAssignees(task.assignees)) {
				accessibleUserIds.add(Number(assignee.id))
			}
		}

		for (const share of state.projectUserShares) {
			if (Number(share.project_id) !== projectId) {
				continue
			}
			const user = state.users.find(entry => entry.username === share.username)
			if (user?.id) {
				accessibleUserIds.add(Number(user.id))
			}
		}

		for (const teamShare of state.projectTeamShares) {
			if (Number(teamShare.project_id) !== projectId) {
				continue
			}
			const team = state.teams.find(entry => entry.id === teamShare.team_id)
			for (const member of normalizeTeamMembers(team?.members)) {
				accessibleUserIds.add(Number(member.id))
			}
		}

		return state.users
			.filter(user => accessibleUserIds.has(Number(user.id)))
			.map(user => ({
				id: Number(user.id),
				name: `${user.name || ''}`.trim(),
				username: `${user.username || ''}`.trim(),
				email: `${user.email || ''}`.trim(),
			}))
			.sort((left, right) => left.id - right.id)
	}

	function getNextTaskPosition(projectId) {
		const tasks = state.tasks.filter(task => task.project_id === projectId)
		const maxPosition = tasks.reduce((max, task) => Math.max(max, Number(task.position || 0)), 0)
		return maxPosition + 100
	}

	function getNextProjectPosition() {
		const maxPosition = state.projects.reduce((max, project) => Math.max(max, Number(project.position || 0)), 0)
		return maxPosition + 100
	}

	function getProjectUserShare(projectId, username) {
		const entry = state.projectUserShares.find(share => share.project_id === projectId && share.username === username)
		if (!entry) {
			const error = new Error(`Project user share ${projectId}/${username} not found.`)
			error.statusCode = 404
			throw error
		}
		return entry
	}

	function getProjectTeamShare(projectId, teamId) {
		const entry = state.projectTeamShares.find(share => share.project_id === projectId && share.team_id === teamId)
		if (!entry) {
			const error = new Error(`Project team share ${projectId}/${teamId} not found.`)
			error.statusCode = 404
			throw error
		}
		return entry
	}

	function listProjectUserShares(projectId) {
		return state.projectUserShares
			.filter(entry => Number(entry.project_id) === projectId)
			.map(entry => serializeProjectUserShare(projectId, getUserByUsername(entry.username)))
			.sort((left, right) => left.id - right.id)
	}

	function listProjectTeamShares(projectId) {
		return state.projectTeamShares
			.filter(entry => Number(entry.project_id) === projectId)
			.map(entry => serializeProjectTeamShare(projectId, getTeam(entry.team_id)))
			.sort((left, right) => left.id - right.id)
	}

	function listProjectLinkShares(projectId) {
		return state.linkShares
			.filter(entry => Number(entry.project_id) === projectId)
			.map(entry => normalizeLinkShare(entry))
			.sort((left, right) => Number(right.id || 0) - Number(left.id || 0))
	}

	function serializeProjectUserShare(projectId, user) {
		const entry = getProjectUserShare(projectId, user.username)
		return {
			...user,
			permission: normalizeSharePermission(entry.permission),
			created: entry.created || null,
			updated: entry.updated || null,
		}
	}

	function serializeProjectTeamShare(projectId, team) {
		const entry = getProjectTeamShare(projectId, team.id)
		return {
			...serializeTeam(team),
			permission: normalizeSharePermission(entry.permission),
			created: entry.created || null,
			updated: entry.updated || null,
		}
	}

	function serializeTeam(team) {
		return {
			...team,
			id: Number(team.id),
			name: `${team.name || ''}`.trim(),
			description: `${team.description || ''}`.trim(),
			is_public: team.is_public === true,
			members: normalizeTeamMembers(team.members),
			created: team.created || null,
			updated: team.updated || null,
		}
	}

	function getViewsForProject(projectId) {
		if (state.viewsByProjectId[projectId]?.length) {
			return state.viewsByProjectId[projectId]
		}

		if (projectId < 0) {
			return [{id: 1000 + Math.abs(projectId), project_id: projectId, title: 'List', view_kind: 'list'}]
		}

		return []
	}

	function upsertSavedFilterProject(savedFilter) {
		const existingProject = state.projects.find(project => project.id === savedFilter.projectId)
		const baseProject = {
			id: savedFilter.projectId,
			title: savedFilter.title,
			description: savedFilter.description,
			parent_project_id: 0,
			position: existingProject?.position || getNextProjectPosition(),
			identifier: 'FILTER',
			is_favorite: Boolean(savedFilter.is_favorite),
			is_archived: false,
			created: savedFilter.created,
			updated: savedFilter.updated,
		}

		if (existingProject) {
			Object.assign(existingProject, baseProject)
		} else {
			state.projects.push(baseProject)
		}

		state.viewsByProjectId[savedFilter.projectId] = getViewsForProject(savedFilter.projectId)
	}

	function collectChildProjectIds(parentProjectId) {
		const childProjectIds = []
		const stack = [parentProjectId]

		while (stack.length > 0) {
			const currentId = stack.pop()
			for (const project of state.projects) {
				if (Number(project.parent_project_id || 0) !== currentId || childProjectIds.includes(project.id)) {
					continue
				}

				childProjectIds.push(project.id)
				stack.push(project.id)
			}
		}

		return childProjectIds
	}
}

function buildMutableState(fixture) {
	const state = cloneFixture(fixture)
	state.currentPassword = 'smoke-password'
	state.nextProjectId = Math.max(...state.projects.filter(project => project.id > 0).map(project => project.id), 0) + 1
	state.nextTeamId = Math.max(0, ...(state.teams || []).map(team => Number(team.id || 0))) + 1
	state.nextLinkShareId = Math.max(0, ...(state.linkShares || []).map(share => Number(share.id || 0))) + 1
	state.nextTaskId = Math.max(...state.tasks.map(task => task.id), 0) + 1
	state.nextCommentId = Math.max(
		0,
		...state.tasks.flatMap(task => Array.isArray(task.comments) ? task.comments.map(comment => Number(comment.id || 0)) : []),
	) + 1
	state.nextAttachmentId = Math.max(
		0,
		...state.tasks.flatMap(task => Array.isArray(task.attachments) ? task.attachments.map(attachment => Number(attachment.id || 0)) : []),
	) + 1
	state.nextAttachmentFileId = Math.max(
		0,
		...state.tasks.flatMap(task => Array.isArray(task.attachments) ? task.attachments.map(attachment => Number(attachment?.file?.id || 0)) : []),
	) + 1
	state.nextLabelId = Math.max(...state.labels.map(label => label.id), 0) + 1
	state.nextSavedFilterId = Math.max(...(state.savedFilters || []).map(savedFilter => savedFilter.id), -1) + 1
	return state
}

function normalizeSharePermission(value) {
	const permission = Number(value)
	if (permission === 2) {
		return 2
	}
	if (permission === 1) {
		return 1
	}
	return 0
}

function normalizeTeam(team) {
	return {
		...team,
		id: Number(team?.id || 0),
		name: `${team?.name || ''}`.trim(),
		description: `${team?.description || ''}`.trim(),
		is_public: team?.is_public === true,
		members: normalizeTeamMembers(team?.members),
		created: normalizeDateString(team?.created || null),
		updated: normalizeDateString(team?.updated || null),
	}
}

function normalizeTeamMembers(members) {
	if (!Array.isArray(members)) {
		return []
	}

	const byUsername = new Map()
	for (const member of members) {
		const username = `${member?.username || ''}`.trim()
		if (!username || byUsername.has(username)) {
			continue
		}

		byUsername.set(username, {
			id: Number(member?.id || 0),
			name: `${member?.name || ''}`.trim(),
			username,
			email: `${member?.email || ''}`.trim(),
			admin: member?.admin === true,
			created: normalizeDateString(member?.created || null),
			updated: normalizeDateString(member?.updated || null),
		})
	}

	return [...byUsername.values()].sort((left, right) => left.username.localeCompare(right.username))
}

function normalizeLinkShare(share) {
	return {
		id: Number(share?.id || 0),
		hash: `${share?.hash || ''}`.trim(),
		name: `${share?.name || ''}`.trim(),
		project_id: Number(share?.project_id || 0),
		permission: normalizeSharePermission(share?.permission),
		sharing_type: Number(share?.sharing_type || 0),
		shared_by: normalizeTaskAssignee(share?.shared_by),
		created: normalizeDateString(share?.created || null),
		updated: normalizeDateString(share?.updated || null),
	}
}

function normalizeNotifications(notifications) {
	if (!Array.isArray(notifications)) {
		return []
	}

	return notifications
		.map(notification => normalizeNotification(notification))
		.filter(notification => notification.id > 0)
		.sort((left, right) => right.id - left.id)
}

function normalizeNotification(notification) {
	return {
		id: Number(notification?.id || 0),
		name: `${notification?.name || ''}`.trim(),
		read: Boolean(notification?.read) || Boolean(normalizeDateString(notification?.read_at || null)),
		read_at: normalizeDateString(notification?.read_at || null) || null,
		created: normalizeDateString(notification?.created || null) || new Date().toISOString(),
		notification: normalizeNotificationPayload(notification?.notification),
	}
}

function normalizeNotificationPayload(payload) {
	if (!payload || typeof payload !== 'object') {
		return null
	}

	return {
		doer: normalizeTaskAssignee(payload.doer),
		task: payload.task?.id
			? {
					id: Number(payload.task.id),
					title: `${payload.task.title || ''}`.trim(),
					project_id: payload.task.project_id ? Number(payload.task.project_id) : null,
				}
			: null,
		project: payload.project?.id
			? {
					id: Number(payload.project.id),
					title: `${payload.project.title || ''}`.trim(),
				}
			: null,
		comment: payload.comment?.id
			? {
					id: Number(payload.comment.id),
					comment: `${payload.comment.comment || ''}`.trim(),
				}
			: null,
		assignee: normalizeTaskAssignee(payload.assignee),
		member: normalizeTaskAssignee(payload.member),
		team: payload.team?.id
			? {
					id: Number(payload.team.id),
					name: `${payload.team.name || ''}`.trim(),
				}
			: null,
	}
}

function normalizeTaskAssignee(assignee) {
	if (!assignee?.id) {
		return null
	}

	return {
		id: Number(assignee.id),
		name: `${assignee.name || ''}`.trim(),
		username: `${assignee.username || ''}`.trim(),
		email: `${assignee.email || ''}`.trim(),
	}
}

function buildTask(task) {
	const now = new Date().toISOString()
	const done = Boolean(task.done)
	return {
		id: Number(task.id),
		project_id: Number(task.project_id),
		title: `${task.title || ''}`.trim(),
		description: `${task.description || ''}`.trim(),
		done,
		is_favorite: Boolean(task.is_favorite),
		due_date: task.due_date || null,
		start_date: task.start_date || null,
		end_date: task.end_date || null,
		done_at: done ? task.done_at || now : task.done_at || null,
		created: task.created || now,
		updated: task.updated || task.created || now,
		position: Number(task.position || 0),
		priority: Number(task.priority || 0),
		percent_done: normalizePercentDone(task.percent_done),
		reminders: normalizeTaskReminders(task.reminders),
		repeat_after: normalizeRepeatAfter(task.repeat_after),
		repeat_from_current_date: Boolean(task.repeat_from_current_date),
		assignees: normalizeTaskAssignees(task.assignees),
		comments: normalizeTaskComments(task.comments),
		attachments: normalizeTaskAttachments(task.attachments),
		labelIds: Array.isArray(task.labelIds) ? task.labelIds.map(Number) : [],
		parentTaskId: task.parentTaskId ? Number(task.parentTaskId) : null,
	}
}

function normalizeTaskAssignees(assignees) {
	if (!Array.isArray(assignees)) {
		return []
	}

	const byId = new Map()
	for (const assignee of assignees) {
		const id = Number(assignee?.id || 0)
		if (!id || byId.has(id)) {
			continue
		}

		byId.set(id, {
			id,
			name: `${assignee?.name || ''}`.trim(),
			username: `${assignee?.username || ''}`.trim(),
			email: `${assignee?.email || ''}`.trim(),
		})
	}

	return [...byId.values()].sort((left, right) => left.id - right.id)
}

function normalizeTaskComments(comments) {
	if (!Array.isArray(comments)) {
		return []
	}

	const byId = new Map()
	for (const comment of comments) {
		const id = Number(comment?.id || 0)
		if (!id || byId.has(id)) {
			continue
		}

		byId.set(id, {
			id,
			comment: `${comment?.comment || ''}`.trim(),
			author: {
				id: Number(comment?.author?.id || 0),
				name: `${comment?.author?.name || ''}`.trim(),
				username: `${comment?.author?.username || ''}`.trim(),
				email: `${comment?.author?.email || ''}`.trim(),
			},
			created: normalizeDateString(comment?.created || null) || new Date().toISOString(),
			updated: normalizeDateString(comment?.updated || comment?.created || null) || new Date().toISOString(),
		})
	}

	return [...byId.values()].sort((left, right) => new Date(left.created).getTime() - new Date(right.created).getTime() || left.id - right.id)
}

function normalizeTaskAttachments(attachments) {
	if (!Array.isArray(attachments)) {
		return []
	}

	const byId = new Map()
	for (const attachment of attachments) {
		const id = Number(attachment?.id || 0)
		if (!id || byId.has(id)) {
			continue
		}

		byId.set(id, {
			id,
			task_id: Number(attachment?.task_id || 0),
			created_by: {
				id: Number(attachment?.created_by?.id || 0),
				name: `${attachment?.created_by?.name || ''}`.trim(),
				username: `${attachment?.created_by?.username || ''}`.trim(),
				email: `${attachment?.created_by?.email || ''}`.trim(),
			},
			file: {
				id: Number(attachment?.file?.id || 0),
				name: `${attachment?.file?.name || ''}`.trim(),
				mime: `${attachment?.file?.mime || ''}`.trim(),
				size: Number(attachment?.file?.size || 0),
			},
			created: normalizeDateString(attachment?.created || null) || new Date().toISOString(),
		})
	}

	return [...byId.values()].sort((left, right) => new Date(left.created).getTime() - new Date(right.created).getTime() || left.id - right.id)
}

function normalizeRepeatAfter(value) {
	const numeric = Number(value)
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return 0
	}

	return Math.max(0, Math.round(numeric))
}

function normalizeTaskReminders(reminders) {
	if (!Array.isArray(reminders)) {
		return []
	}

	return reminders
		.map(reminder => ({
			reminder: normalizeDateString(reminder?.reminder || null),
			relative_period: Number.isFinite(Number(reminder?.relative_period))
				? Number(reminder.relative_period)
				: 0,
			relative_to: normalizeRelativeTo(reminder?.relative_to),
		}))
		.filter(reminder => Boolean(reminder.reminder))
		.sort((left, right) => new Date(left.reminder).getTime() - new Date(right.reminder).getTime())
}

function normalizeDateString(value) {
	if (!value) {
		return ''
	}

	const raw = `${value}`.trim()
	if (!raw) {
		return ''
	}

	const date = new Date(raw)
	if (Number.isNaN(date.getTime())) {
		return ''
	}

	return date.toISOString()
}

function normalizeRelativeTo(value) {
	switch (`${value || ''}`) {
		case 'due_date':
		case 'start_date':
		case 'end_date':
			return `${value}`
		default:
			return ''
	}
}

function normalizePercentDone(value) {
	const numeric = Number(value)
	if (!Number.isFinite(numeric)) {
		return 0
	}

	return Math.min(100, Math.max(0, Math.round(numeric)))
}

function buildSavedFilter(savedFilter) {
	const id = Number(savedFilter.id || 0)
	const now = new Date().toISOString()

	return {
		id,
		projectId: Number.isInteger(Number(savedFilter.projectId))
			? Number(savedFilter.projectId)
			: (id + 1) * -1,
		title: `${savedFilter.title || ''}`.trim(),
		description: `${savedFilter.description || ''}`.trim(),
		is_favorite: Boolean(savedFilter.is_favorite),
		created: savedFilter.created || now,
		updated: savedFilter.updated || now,
		filters: {
			filter: `${savedFilter.filters?.filter || 'done = false'}`.trim(),
			filter_include_nulls: Boolean(savedFilter.filters?.filter_include_nulls),
			sort_by: Array.isArray(savedFilter.filters?.sort_by) ? savedFilter.filters.sort_by.map(entry => `${entry}`) : [],
			order_by: Array.isArray(savedFilter.filters?.order_by) ? savedFilter.filters.order_by.map(entry => `${entry}`) : [],
		},
	}
}

function matchesSavedFilter(task, filter, labels) {
	const normalizedFilter = `${filter || ''}`.trim()
	if (!normalizedFilter) {
		return true
	}

	if (normalizedFilter.includes('done = false') && task.done) {
		return false
	}

	const labelMatches = [...normalizedFilter.matchAll(/label\s*=\s*"([^"]+)"/g)]
	if (labelMatches.length > 0) {
		const taskLabelTitles = task.labelIds
			.map(labelId => labels.find(label => label.id === labelId)?.title || '')
			.filter(Boolean)
		const requiredLabels = labelMatches.map(match => match[1].trim().toLowerCase())
		if (!requiredLabels.every(labelTitle => taskLabelTitles.some(taskLabel => taskLabel.toLowerCase() === labelTitle))) {
			return false
		}
	}

	const priorityMatch = normalizedFilter.match(/priority\s*>=\s*(\d+)/)
	if (priorityMatch && Number(task.priority || 0) < Number(priorityMatch[1])) {
		return false
	}

	return true
}

function makeTaskRef(task) {
	return {
		id: task.id,
		title: task.title,
		project_id: task.project_id,
		done: task.done,
		position: task.position,
	}
}

function compareByPositionThenId(a, b) {
	return Number(a.position || 0) - Number(b.position || 0) || Number(a.id || 0) - Number(b.id || 0)
}

function sortTasks(tasks, searchParams = new URLSearchParams()) {
	const sortBy = readMultiValueQueryParam(searchParams, 'sort_by')
	const orderBy = readMultiValueQueryParam(searchParams, 'order_by')
	if (sortBy.length === 0) {
		return tasks.slice().sort(compareByPositionThenId)
	}

	return tasks.slice().sort((a, b) => {
		for (let index = 0; index < sortBy.length; index += 1) {
			const field = sortBy[index]
			const direction = `${orderBy[index] || orderBy[orderBy.length - 1] || 'asc'}`.toLowerCase() === 'desc' ? -1 : 1
			const comparison = compareTaskField(a, b, field)
			if (comparison !== 0) {
				return comparison * direction
			}
		}

		return compareByPositionThenId(a, b)
	})
}

function compareTaskField(a, b, field) {
	switch (`${field || ''}`) {
		case 'title':
			return `${a.title || ''}`.localeCompare(`${b.title || ''}`)
		case 'priority':
		case 'percent_done':
		case 'position':
		case 'id':
			return Number(a[field] || 0) - Number(b[field] || 0)
		case 'due_date':
		case 'created':
		case 'updated':
		case 'done_at':
			return compareNullableDates(a[field], b[field])
		default:
			return 0
	}
}

function compareNullableDates(a, b) {
	if (!a && !b) {
		return 0
	}
	if (!a) {
		return 1
	}
	if (!b) {
		return -1
	}
	return new Date(a).getTime() - new Date(b).getTime()
}

function readMultiValueQueryParam(searchParams, key) {
	return searchParams.getAll(key).map(value => `${value || ''}`.trim()).filter(Boolean)
}

function paginate(items, url) {
	const page = Number(url.searchParams.get('page') || 1)
	const perPage = Number(url.searchParams.get('per_page') || 100)
	const start = Math.max(0, (page - 1) * perPage)
	return items.slice(start, start + perPage)
}

function startOfDay(value) {
	const date = new Date(value)
	date.setHours(0, 0, 0, 0)
	return date
}

async function readJsonBody(req) {
	const buffer = await readRawBody(req)
	if (buffer.byteLength === 0) {
		return {}
	}
	const raw = buffer.toString('utf8').trim()
	return raw ? JSON.parse(raw) : {}
}

async function readRawBody(req) {
	const chunks = []
	for await (const chunk of req) {
		chunks.push(chunk)
	}
	if (chunks.length === 0) {
		return Buffer.alloc(0)
	}
	return Buffer.concat(chunks)
}

function sendJson(res, statusCode, payload, headers = {}) {
	res.writeHead(statusCode, {
		'Content-Type': 'application/json',
		...headers,
	})
	res.end(JSON.stringify(payload))
}

function sendBuffer(res, statusCode, payload, headers = {}) {
	res.writeHead(statusCode, headers)
	res.end(payload)
}

function parseMultipartFiles(buffer, contentType) {
	const boundaryMatch = `${contentType || ''}`.match(/boundary=([^;]+)/i)
	if (!boundaryMatch) {
		return []
	}

	const boundary = `--${boundaryMatch[1]}`
	const raw = buffer.toString('latin1')
	const parts = raw.split(boundary)
	const files = []
	for (const part of parts) {
		if (!part.includes('Content-Disposition')) {
			continue
		}

		const [rawHeaders, rawValue] = part.split('\r\n\r\n')
		if (!rawHeaders || rawValue === undefined) {
			continue
		}

		const fileNameMatch = rawHeaders.match(/filename="([^"]+)"/i)
		if (!fileNameMatch) {
			continue
		}
		const mimeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)
		const bodyValue = rawValue.replace(/\r\n--$/, '').replace(/\r\n$/, '')
		files.push({
			name: fileNameMatch[1],
			mime: `${mimeMatch?.[1] || 'application/octet-stream'}`.trim(),
			size: Buffer.byteLength(bodyValue, 'latin1'),
		})
	}

	return files
}

function buildAttachmentPayload(attachment, previewSize) {
	const mime = `${attachment?.file?.mime || ''}`.trim() || 'application/octet-stream'
	const name = `${attachment?.file?.name || 'attachment.bin'}`.trim() || 'attachment.bin'
	if (previewSize && mime.startsWith('image/')) {
		return {
			body: Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9K8BP9QAAAABJRU5ErkJggg==',
				'base64',
			),
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'no-store',
			},
		}
	}

	return {
		body: Buffer.from(`Mock attachment: ${name}\n`),
		headers: {
			'Content-Type': mime,
			'Content-Disposition': `inline; filename="${name.replace(/"/g, '')}"`,
			'Cache-Control': 'no-store',
		},
	}
}

function buildToken(subject) {
	const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
	return `${encode({alg: 'none', typ: 'JWT'})}.${encode({sub: subject, exp: Math.floor(Date.now() / 1000) + 3600})}.signature`
}

function listen(server) {
	return new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject)
			resolve()
		})
	})
}

const DAY_MS = 24 * 60 * 60 * 1000

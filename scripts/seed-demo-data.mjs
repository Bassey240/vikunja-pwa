import {readFileSync} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const args = new Set(process.argv.slice(2))
const shouldWipe = args.has('--wipe')
const seedCalendarRunwayOnly = args.has('--calendar-runway')
const dryRun = args.has('--dry-run')
const env = {
	...loadDotEnv(path.join(rootDir, '.env')),
	...process.env,
}

const baseUrl = normalizeBaseUrl(env.VIKUNJA_DEFAULT_BASE_URL || env.VIKUNJA_BASE_URL || '')
const apiToken = `${env.VIKUNJA_API_TOKEN || ''}`.trim()

if (!baseUrl) {
	throw new Error('Missing VIKUNJA_DEFAULT_BASE_URL or VIKUNJA_BASE_URL.')
}

if (!apiToken) {
	throw new Error('Missing VIKUNJA_API_TOKEN.')
}

const today = atLocalHour(9)
const day = 24 * 60 * 60 * 1000
const calendarRunwayStart = new Date('2026-03-25T09:00:00+01:00')

const demoProjects = [
	{
		title: 'Product Launch 2026',
		description: 'Public-facing launch work for the mobile-first Vikunja PWA demo.',
		children: [
			{
				title: 'PWA Polish',
				description: 'Final UX cleanup before demo capture and walkthrough recording.',
				tasks: [
					{
						title: 'Fix onboarding edge cases',
						description: 'Tighten empty states, login validation, and first-run messaging.',
						due_date: isoOffset(today, -1, 11),
						priority: 5,
						labels: ['Urgent', 'Mobile'],
					},
					{
						title: 'Review install flow on iPhone',
						description: 'Validate Home Screen install, offline shell, and notification prompts.',
						due_date: isoOffset(today, 1, 14),
						priority: 4,
						labels: ['Mobile', 'Deep Work'],
						subtasks: [
							{title: 'Capture install steps in Safari'},
							{title: 'Verify icon and splash screen assets'},
							{title: 'Confirm offline shell reopens last session'},
						],
					},
					{
						title: 'Re-check desktop keyboard focus states',
						description: 'Quick pass on settings, task detail, and project navigation.',
						due_date: isoOffset(today, 4, 16),
						priority: 2,
						labels: ['Deep Work'],
					},
				],
			},
			{
				title: 'Demo Assets',
				description: 'All visual material needed for screenshots and the walkthrough video.',
				tasks: [
					{
						title: 'Record guided demo video',
						description: 'Capture a steady walkthrough of Today, Projects, task detail, and Settings.',
						due_date: isoOffset(today, 1, 10),
						priority: 5,
						labels: ['Urgent', 'Design'],
						subtasks: [
							{title: 'Draft talking points'},
							{title: 'Reset sample account and data'},
							{title: 'Capture Today / Projects / Task detail screens'},
						],
					},
					{
						title: 'Create neutral light-theme screenshots',
						description: 'Use realistic but generic project names, mixed due dates, and a clean workspace.',
						due_date: isoOffset(today, 2, 13),
						priority: 4,
						labels: ['Design'],
					},
					{
						title: 'Export app icon variations',
						description: 'Prepare 1024, 512, 192, and social-preview outputs.',
						due_date: isoOffset(today, 5, 15),
						priority: 2,
						labels: ['Design'],
						done: true,
					},
				],
			},
			{
				title: 'Launch Ops',
				description: 'Release-adjacent operational work for the demo build.',
				tasks: [
					{
						title: 'Finalize release story for landing page',
						description: 'Explain the product focus: faster task capture, nested projects, and detail-heavy flows.',
						due_date: isoOffset(today, 0, 12),
						priority: 5,
						percent_done: 70,
						labels: ['Urgent', 'Deep Work'],
						subtasks: [
							{title: 'Tighten headline options'},
							{title: 'Pick one hero screenshot'},
							{title: 'Write one-line value proposition'},
						],
					},
					{
						title: 'Publish changelog draft',
						description: 'Document server URL flexibility, Docker setup, and demo-data seeding.',
						due_date: isoOffset(today, 3, 11),
						priority: 3,
						labels: ['Deep Work'],
					},
					{
						title: 'Weekly cleanup pass',
						description: 'Routine release-prep sweep for stale notes, screenshots, and temp files.',
						due_date: isoOffset(today, 7, 9),
						priority: 1,
						repeat_after: 604800,
						labels: ['Admin'],
					},
				],
			},
		],
	},
	{
		title: 'Client Work',
		description: 'Representative client-facing work with a small nested project structure.',
		children: [
			{
				title: 'Studio Site Refresh',
				description: 'Ongoing website improvements for the studio showcase.',
				tasks: [
					{
						title: 'Collect final logo files',
						description: 'Request monochrome, SVG, and favicon-ready exports from design.',
						due_date: isoOffset(today, 2, 10),
						priority: 3,
						labels: ['Waiting'],
					},
					{
						title: 'Build services page structure',
						description: 'Outline sections, supporting proof points, and a mobile-first layout.',
						due_date: isoOffset(today, 6, 14),
						priority: 3,
						labels: ['Deep Work'],
					},
					{
						title: 'Send review link to client',
						description: 'Package a short update with a clear ask for feedback.',
						due_date: isoOffset(today, -2, 17),
						priority: 4,
						labels: ['Urgent', 'Waiting'],
						done: true,
					},
				],
			},
			{
				title: 'Client Alpha Portal',
				description: 'Internal workstream for a client portal refresh.',
				tasks: [
					{
						title: 'Review access-control notes',
						description: 'Check edge cases around invite flows, disabled users, and session expiry.',
						due_date: isoOffset(today, 1, 9),
						priority: 4,
						labels: ['Deep Work'],
					},
					{
						title: 'Polish mobile sign-in flow',
						description: 'Reduce friction in the account connect screens on narrow widths.',
						due_date: isoOffset(today, 4, 12),
						priority: 4,
						percent_done: 40,
						labels: ['Mobile', 'Design'],
					},
					{
						title: 'Triage QA round 2 findings',
						description: 'Group regressions into launch blockers, defer candidates, and polish.',
						due_date: isoOffset(today, 0, 16),
						priority: 5,
						labels: ['Urgent', 'Admin'],
						subtasks: [
							{title: 'Reproduce drag-and-drop issue on iPad'},
							{title: 'Confirm fix for stale task detail panel'},
						],
					},
				],
			},
		],
	},
	{
		title: 'Home & Admin',
		description: 'A personal/admin category so the demo data feels less one-dimensional.',
		children: [
			{
				title: 'Household',
				description: 'Small personal project set for everyday tasks.',
				tasks: [
					{
						title: 'Book plumber visit',
						description: 'Call before Friday and confirm the morning slot.',
						due_date: isoOffset(today, 3, 9),
						priority: 2,
						labels: ['Personal'],
					},
					{
						title: 'Refill pantry basics',
						description: 'Tea, oats, olive oil, and dishwasher tablets.',
						due_date: isoOffset(today, 1, 18),
						priority: 1,
						labels: ['Personal'],
					},
				],
			},
			{
				title: 'Paperwork',
				description: 'Low-drama admin work to round out the sample dataset.',
				tasks: [
					{
						title: 'Renew insurance documents',
						description: 'Check policy dates and upload the signed PDF.',
						due_date: isoOffset(today, 8, 10),
						priority: 2,
						labels: ['Admin'],
					},
					{
						title: 'Archive Q1 receipts',
						description: 'Move scans into yearly folders and verify naming consistency.',
						due_date: isoOffset(today, 5, 15),
						priority: 1,
						labels: ['Admin'],
						done: true,
					},
				],
			},
		],
	},
]

const inboxTasks = [
	{
		title: 'Capture feedback from March demo',
		description: 'Turn all loose feedback into actionable follow-up tasks.',
		due_date: isoOffset(today, 0, 11),
		priority: 4,
		labels: ['Waiting'],
	},
	{
		title: 'Buy props for screenshot desk setup',
		description: 'Notebook, pencil, coffee mug, and a clean charging cable.',
		due_date: isoOffset(today, 1, 17),
		priority: 1,
		labels: ['Personal'],
	},
	{
		title: 'Follow up on self-hosted push notifications',
		description: 'Confirm certificate, origin, and install context assumptions.',
		priority: 3,
		labels: ['Mobile', 'Admin'],
	},
]

const labelPalette = [
	{title: 'Urgent', hex_color: '#d94841'},
	{title: 'Waiting', hex_color: '#d4a017'},
	{title: 'Deep Work', hex_color: '#2f6fed'},
	{title: 'Design', hex_color: '#c45fa0'},
	{title: 'Mobile', hex_color: '#0f9d8a'},
	{title: 'Admin', hex_color: '#6b7280'},
	{title: 'Personal', hex_color: '#4ba54f'},
]

const calendarRunwayProject = {
	title: 'Today & Next 7 Days',
	description: 'Fixed demo runway for Wednesday March 25, 2026 through Wednesday April 1, 2026.',
	tasks: [
		{
			title: 'Wed Mar 25: Review today agenda',
			description: 'Quick morning pass over Today, Inbox, and the launch-critical tasks.',
			due_date: isoOffset(calendarRunwayStart, 0, 9),
			priority: 4,
			labels: ['Urgent', 'Admin'],
		},
		{
			title: 'Wed Mar 25: Capture updated hero screenshot',
			description: 'Take a clean screenshot with the refreshed demo data visible in the Today screen.',
			due_date: isoOffset(calendarRunwayStart, 0, 14),
			priority: 5,
			labels: ['Urgent', 'Design'],
		},
		{
			title: 'Thu Mar 26: Refine install instructions',
			description: 'Make the iPhone install guidance shorter and more visual.',
			due_date: isoOffset(calendarRunwayStart, 1, 10),
			priority: 3,
			labels: ['Mobile', 'Deep Work'],
		},
		{
			title: 'Fri Mar 27: Prepare walkthrough outline',
			description: 'Sequence the demo around Today, Projects, task detail, and Settings.',
			due_date: isoOffset(calendarRunwayStart, 2, 11),
			priority: 4,
			labels: ['Deep Work'],
		},
		{
			title: 'Sat Mar 28: Polish project tree copy',
			description: 'Adjust project names and descriptions so screenshots feel realistic but generic.',
			due_date: isoOffset(calendarRunwayStart, 3, 12),
			priority: 2,
			labels: ['Design'],
		},
		{
			title: 'Sun Mar 29: Tidy screenshot staging area',
			description: 'Remove low-signal tasks from visible views and keep the dashboard balanced.',
			due_date: isoOffset(calendarRunwayStart, 4, 13),
			priority: 2,
			labels: ['Admin'],
		},
		{
			title: 'Mon Mar 30: Record second demo take',
			description: 'Capture a smoother run with transitions between Today and project detail.',
			due_date: isoOffset(calendarRunwayStart, 5, 10),
			priority: 5,
			labels: ['Urgent', 'Design'],
		},
		{
			title: 'Tue Mar 31: Finalize release notes summary',
			description: 'Summarize the custom PWA changes and setup improvements in one concise note.',
			due_date: isoOffset(calendarRunwayStart, 6, 15),
			priority: 3,
			labels: ['Deep Work', 'Admin'],
		},
		{
			title: 'Wed Apr 1: Publish refreshed demo build',
			description: 'Push the updated demo environment and verify the new screenshots match the live state.',
			due_date: isoOffset(calendarRunwayStart, 7, 9),
			priority: 4,
			labels: ['Urgent', 'Mobile'],
		},
	],
}

async function main() {
	console.log(`Target Vikunja API: ${baseUrl}`)
	console.log(`Mode: ${dryRun ? 'dry-run' : shouldWipe ? 'wipe-and-seed' : seedCalendarRunwayOnly ? 'calendar-runway' : 'seed-only'}`)

	const info = await api('info')
	console.log(`Connected to Vikunja instance: ${info?.title || info?.frontend_url || 'ok'}`)

	const user = await api('user')
	const existingProjects = await listAll('projects')
	const inboxProject =
		existingProjects.find(project => Boolean(project.is_inbox_project)) ||
		existingProjects.find(project => Number(project.id) === Number(user?.settings?.default_project_id || 0)) ||
		null

	if (dryRun) {
		console.log(`Existing projects: ${existingProjects.length}`)
		console.log(`Inbox/default project: ${inboxProject?.title || 'not found'}`)
		console.log(`Labels to ensure: ${labelPalette.length}`)
		console.log(`Top-level demo projects to create: ${demoProjects.length}`)
		if (seedCalendarRunwayOnly) {
			console.log(`Calendar runway start: ${calendarRunwayStart.toISOString()}`)
		}
		console.log('Dry run complete. No data was written.')
		return
	}

	if (shouldWipe) {
		if (inboxProject && Number(user?.settings?.default_project_id || 0) !== Number(inboxProject.id)) {
			await moveDefaultProjectTo(inboxProject.id, user)
		}
		await wipeExistingData(existingProjects, inboxProject, user)
	}

	const labelIdsByTitle = await ensureLabels()
	if (seedCalendarRunwayOnly) {
		await seedCalendarRunway(labelIdsByTitle)
		const finalProjects = await listAll('projects')
		console.log(`Calendar runway seed complete: ${finalProjects.length} projects now present.`)
		return
	}
	await seedInboxTasks(inboxProject, labelIdsByTitle)
	await seedProjectTree(labelIdsByTitle)

	const finalProjects = await listAll('projects')
	const finalLabels = await listAll('labels')
	console.log(`Demo seed complete: ${finalProjects.length} projects, ${finalLabels.length} labels.`)
}

async function wipeExistingData(existingProjects, inboxProject, user) {
	console.log('Wiping existing demo/account data...')

	for (const project of sortProjectsByDepth(existingProjects)) {
		if (project.id <= 0 || project.is_inbox_project) {
			continue
		}

		try {
			await api(`projects/${project.id}`, {method: 'DELETE'})
			console.log(`Deleted project: ${project.title}`)
		} catch (error) {
			if (String(error.message || '').includes('default project of a user')) {
				console.log(`Skipped project: ${project.title} (${error.message})`)
				continue
			}

			throw error
		}
	}

	if (inboxProject) {
		const inboxTasks = await listAll(`projects/${inboxProject.id}/tasks`)
		for (const task of inboxTasks) {
			try {
				await api(`tasks/${task.id}`, {method: 'DELETE'})
				console.log(`Deleted inbox task: ${task.title}`)
			} catch (error) {
				if (error.statusCode !== 404) {
					throw error
				}
			}
		}
	}

	const labels = await listAll('labels')
	for (const label of labels) {
		await bestEffortDelete(`labels/${label.id}`, `label: ${label.title}`)
	}
}

async function bestEffortDelete(route, label) {
	try {
		await api(route, {method: 'DELETE'})
		console.log(`Deleted ${label}`)
	} catch (error) {
		if (error.statusCode === 404 || error.statusCode === 405) {
			console.log(`Skipped ${label} (${error.message})`)
			return
		}

		throw error
	}
}

async function moveDefaultProjectTo(projectId, user) {
	const settings = user?.settings && typeof user.settings === 'object' ? {...user.settings} : {}
	settings.default_project_id = projectId
	await api('user/settings/general', {
		method: 'POST',
		body: settings,
	})
	if (user?.settings) {
		user.settings.default_project_id = projectId
	}
	console.log(`Moved default project to ${projectId} so protected projects can be removed.`)
}

function sortProjectsByDepth(projects) {
	const byId = new Map(projects.map(project => [Number(project.id), project]))

	function getDepth(project) {
		let depth = 0
		let current = project
		const seen = new Set()

		while (current && Number(current.parent_project_id || 0) > 0 && !seen.has(current.id)) {
			seen.add(current.id)
			current = byId.get(Number(current.parent_project_id || 0)) || null
			depth += 1
		}

		return depth
	}

	return [...projects].sort((left, right) => getDepth(right) - getDepth(left))
}

async function ensureLabels() {
	const existingLabels = await listAll('labels')
	const labelIdsByTitle = new Map(existingLabels.map(label => [label.title, label.id]))

	for (const label of labelPalette) {
		if (labelIdsByTitle.has(label.title)) {
			continue
		}

		const created = await api('labels', {
			method: 'PUT',
			body: label,
		})
		labelIdsByTitle.set(created.title, created.id)
		console.log(`Created label: ${created.title}`)
	}

	return labelIdsByTitle
}

async function seedInboxTasks(inboxProject, labelIdsByTitle) {
	if (!inboxProject) {
		console.log('No inbox/default project found; skipping inbox task seed.')
		return
	}

	for (const task of inboxTasks) {
		await createTaskGraph(inboxProject.id, task, labelIdsByTitle)
	}
}

async function seedProjectTree(labelIdsByTitle) {
	for (const project of demoProjects) {
		const createdProject = await createProject(project)
		for (const childProject of project.children || []) {
			const createdChild = await createProject(childProject, createdProject.id)
			for (const task of childProject.tasks || []) {
				await createTaskGraph(createdChild.id, task, labelIdsByTitle)
			}
		}
	}
}

async function seedCalendarRunway(labelIdsByTitle) {
	const existingProjects = await listAll('projects')
	const existing = existingProjects.find(project => project.title === calendarRunwayProject.title)
	if (existing) {
		await bestEffortDelete(`projects/${existing.id}`, `project: ${existing.title}`)
	}

	const createdProject = await createProject(calendarRunwayProject)
	for (const task of calendarRunwayProject.tasks) {
		await createTaskGraph(createdProject.id, task, labelIdsByTitle)
	}
}

async function createProject(project, parentProjectId = 0) {
	const created = await api('projects', {
		method: 'PUT',
		body: {
			title: project.title,
			description: project.description || '',
			parent_project_id: parentProjectId,
		},
	})
	console.log(`Created project: ${project.title}`)
	return created
}

async function createTaskGraph(projectId, task, labelIdsByTitle) {
	const createdTask = await api(`projects/${projectId}/tasks`, {
		method: 'PUT',
		body: {
			title: task.title,
			description: task.description || '',
			due_date: task.due_date || null,
			start_date: task.start_date || null,
			end_date: task.end_date || null,
			priority: task.priority || 0,
			percent_done: task.percent_done || 0,
			repeat_after: task.repeat_after || 0,
		},
	})

	if (Array.isArray(task.labels) && task.labels.length > 0) {
		for (const title of task.labels) {
			const labelId = labelIdsByTitle.get(title)
			if (!labelId) {
				continue
			}

			await api(`tasks/${createdTask.id}/labels`, {
				method: 'PUT',
				body: {
					label_id: labelId,
				},
			})
		}
	}

	if (task.done) {
		await api(`tasks/${createdTask.id}`, {
			method: 'POST',
			body: {
				done: true,
			},
		})
	}

	console.log(`Created task: ${task.title}`)

	for (const subtask of task.subtasks || []) {
		const createdSubtask = await createTaskGraph(projectId, subtask, labelIdsByTitle)
		await api(`tasks/${createdTask.id}/relations`, {
			method: 'PUT',
			body: {
				other_task_id: createdSubtask.id,
				relation_kind: 'subtask',
			},
		})
		console.log(`Linked subtask: ${createdTask.title} -> ${createdSubtask.title}`)
	}

	return createdTask
}

async function listAll(route) {
	const items = []
	let page = 1
	let totalPages = 1

	do {
		const {payload, headers} = await api(route, {
			query: {
				page,
				per_page: 100,
			},
			returnHeaders: true,
		})

		if (!Array.isArray(payload)) {
			throw new Error(`Expected array response from ${route}.`)
		}

		items.push(...payload)
		totalPages = Number(headers.get('x-pagination-total-pages') || 1)
		if (payload.length === 0) {
			break
		}
		page += 1
	} while (page <= totalPages)

	return items
}

async function api(route, options = {}) {
	const url = new URL(route.replace(/^\/+/, ''), `${baseUrl}/`)
	if (options.query) {
		for (const [key, value] of Object.entries(options.query)) {
			if (value === null || value === undefined || value === '') {
				continue
			}
			url.searchParams.set(key, String(value))
		}
	}

	const response = await fetch(url, {
		method: options.method || 'GET',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${apiToken}`,
			...(options.body ? {'Content-Type': 'application/json'} : {}),
		},
		body: options.body ? JSON.stringify(options.body) : undefined,
	})

	const text = await response.text()
	const payload = text ? JSON.parse(text) : null

	if (!response.ok) {
		const error = new Error(
			payload?.message ||
			payload?.error ||
			`${options.method || 'GET'} ${url.pathname} failed with ${response.status}`,
		)
		error.statusCode = response.status
		error.payload = payload
		throw error
	}

	if (options.returnHeaders) {
		return {payload, headers: response.headers}
	}

	return payload
}

function loadDotEnv(filePath) {
	try {
		const content = readFileSync(filePath, 'utf8')
		return content
			.split(/\r?\n/)
			.map(line => line.trim())
			.filter(line => line && !line.startsWith('#'))
			.reduce((result, line) => {
				const index = line.indexOf('=')
				if (index === -1) {
					return result
				}

				const key = line.slice(0, index).trim()
				let value = line.slice(index + 1).trim()
				if (
					(value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))
				) {
					value = value.slice(1, -1)
				}

				result[key] = value
				return result
			}, {})
	} catch {
		return {}
	}
}

function normalizeBaseUrl(value) {
	if (!value) {
		return ''
	}

	let normalized = value.trim().replace(/\/+$/, '')
	if (!/^https?:\/\//.test(normalized)) {
		normalized = `http://${normalized}`
	}
	if (!normalized.endsWith('/api/v1')) {
		normalized = `${normalized}/api/v1`
	}
	return normalized
}

function atLocalHour(referenceDate, hour = 9) {
	const date = new Date(referenceDate)
	date.setHours(hour, 0, 0, 0)
	return date
}

function isoOffset(referenceDate, daysFromNow, hour = 9) {
	const date = new Date(referenceDate.getTime() + daysFromNow * day)
	date.setHours(hour, 0, 0, 0)
	return date.toISOString()
}

main().catch(error => {
	console.error(error.message || error)
	process.exitCode = 1
})

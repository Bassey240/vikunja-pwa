import {readFileSync} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const args = new Set(process.argv.slice(2))
const shouldWipe = args.has('--wipe')
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

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
const today = (() => {
	const d = new Date()
	d.setHours(9, 0, 0, 0)
	return d
})()
const day = 24 * 60 * 60 * 1000

function isoOffset(daysFromToday, hour = 9) {
	const date = new Date(today.getTime() + daysFromToday * day)
	date.setHours(hour, 0, 0, 0)
	return date.toISOString()
}

function range(startDay, endDay) {
	return {start_date: isoOffset(startDay), end_date: isoOffset(endDay, 18)}
}

// ---------------------------------------------------------------------------
// Label palette (reuses the same names as the main demo script)
// ---------------------------------------------------------------------------
const labelPalette = [
	{title: 'Urgent', hex_color: '#d94841'},
	{title: 'Waiting', hex_color: '#d4a017'},
	{title: 'Deep Work', hex_color: '#2f6fed'},
	{title: 'Design', hex_color: '#c45fa0'},
	{title: 'Mobile', hex_color: '#0f9d8a'},
	{title: 'Admin', hex_color: '#6b7280'},
	{title: 'Personal', hex_color: '#4ba54f'},
	{title: 'Backend', hex_color: '#8b5cf6'},
	{title: 'Frontend', hex_color: '#06b6d4'},
	{title: 'QA', hex_color: '#f97316'},
	{title: 'DevOps', hex_color: '#84cc16'},
	{title: 'Blocked', hex_color: '#ef4444'},
]

// ---------------------------------------------------------------------------
// Gantt demo data
//
// Every task has start_date + end_date so it shows as a bar.
// Tasks use varied priorities, percent_done, labels, done states.
// Relations (blocking, precedes) are defined separately after creation.
// ---------------------------------------------------------------------------

const ganttProjects = [
	{
		title: 'Website Redesign Q2',
		description: 'Full website overhaul — design through deployment. Demonstrates a realistic multi-week project with dependencies.',
		children: [
			{
				title: 'Design Phase',
				description: 'Visual design and prototyping sprint.',
				tasks: [
					{
						key: 'design-research',
						title: 'User research & competitor audit',
						description: 'Interview 5 stakeholders, audit 8 competitor sites, compile findings doc.',
						...range(-5, 2),
						priority: 4,
						percent_done: 85,
						labels: ['Deep Work', 'Design'],
					},
					{
						key: 'design-wireframes',
						title: 'Wireframes — all key pages',
						description: 'Lo-fi wireframes for Home, About, Services, Contact, Blog.',
						...range(1, 8),
						priority: 5,
						percent_done: 45,
						labels: ['Design', 'Urgent'],
					},
					{
						key: 'design-system',
						title: 'Design system & component library',
						description: 'Colors, typography, spacing scale, button variants, form elements.',
						...range(5, 14),
						priority: 4,
						percent_done: 20,
						labels: ['Design', 'Frontend'],
					},
					{
						key: 'design-review',
						title: 'Stakeholder design review',
						description: 'Present wireframes and design system to stakeholders for sign-off.',
						...range(13, 15),
						priority: 5,
						percent_done: 0,
						labels: ['Design', 'Waiting'],
					},
					{
						key: 'design-hifi',
						title: 'High-fidelity mockups',
						description: 'Full-color desktop and mobile mockups for all 5 pages.',
						...range(15, 24),
						priority: 3,
						percent_done: 0,
						labels: ['Design'],
					},
				],
			},
			{
				title: 'Development Phase',
				description: 'Frontend and backend implementation.',
				tasks: [
					{
						key: 'dev-setup',
						title: 'Dev environment & CI/CD pipeline',
						description: 'Set up repo, linting, build pipeline, staging deploy.',
						...range(-3, 1),
						priority: 4,
						percent_done: 100,
						labels: ['DevOps', 'Backend'],
						done: true,
					},
					{
						key: 'dev-cms',
						title: 'CMS integration & content model',
						description: 'Set up headless CMS, define content types, connect API.',
						...range(3, 12),
						priority: 3,
						percent_done: 60,
						labels: ['Backend'],
					},
					{
						key: 'dev-homepage',
						title: 'Build homepage',
						description: 'Implement hero, features section, testimonials, and CTA.',
						...range(10, 18),
						priority: 4,
						percent_done: 30,
						labels: ['Frontend'],
					},
					{
						key: 'dev-services',
						title: 'Build services page',
						description: 'Dynamic service cards, filtering, detail modals.',
						...range(14, 22),
						priority: 3,
						percent_done: 0,
						labels: ['Frontend'],
					},
					{
						key: 'dev-blog',
						title: 'Build blog with pagination',
						description: 'Blog index, single post, categories, search.',
						...range(18, 28),
						priority: 2,
						percent_done: 0,
						labels: ['Frontend', 'Backend'],
					},
					{
						key: 'dev-contact',
						title: 'Contact form & validation',
						description: 'Form with reCAPTCHA, email delivery, success/error states.',
						...range(20, 25),
						priority: 3,
						percent_done: 0,
						labels: ['Frontend', 'Backend'],
					},
					{
						key: 'dev-responsive',
						title: 'Responsive QA pass',
						description: 'Test all pages on mobile, tablet, and desktop breakpoints.',
						...range(26, 32),
						priority: 5,
						percent_done: 0,
						labels: ['QA', 'Mobile', 'Urgent'],
					},
					{
						key: 'dev-a11y',
						title: 'Accessibility audit & fixes',
						description: 'WCAG 2.1 AA compliance, screen reader testing, keyboard nav.',
						...range(30, 35),
						priority: 4,
						percent_done: 0,
						labels: ['QA', 'Frontend'],
					},
				],
			},
			{
				title: 'Launch Phase',
				description: 'Final testing and go-live.',
				tasks: [
					{
						key: 'launch-perf',
						title: 'Performance optimization',
						description: 'Lighthouse audit, image optimization, lazy loading, code splitting.',
						...range(33, 38),
						priority: 4,
						percent_done: 0,
						labels: ['DevOps', 'Frontend'],
					},
					{
						key: 'launch-staging',
						title: 'Staging review & UAT',
						description: 'Full walk-through on staging with stakeholders.',
						...range(36, 39),
						priority: 5,
						percent_done: 0,
						labels: ['QA', 'Waiting'],
					},
					{
						key: 'launch-dns',
						title: 'DNS cutover & go-live',
						description: 'Switch DNS, verify SSL, monitor error rates for 24h.',
						...range(40, 42),
						priority: 6,
						percent_done: 0,
						labels: ['DevOps', 'Urgent'],
					},
					{
						key: 'launch-monitoring',
						title: 'Post-launch monitoring',
						description: 'Monitor uptime, error logs, and performance for 1 week.',
						...range(42, 49),
						priority: 3,
						percent_done: 0,
						labels: ['DevOps', 'Admin'],
					},
				],
			},
		],
	},
	{
		title: 'Mobile App Sprint',
		description: 'Two-week sprint for the mobile companion app. Good for testing shorter, denser Gantt bars.',
		tasks: [
			{
				key: 'app-auth',
				title: 'Authentication flow',
				description: 'Login, register, password reset, biometric unlock.',
				...range(-2, 3),
				priority: 5,
				percent_done: 90,
				labels: ['Mobile', 'Backend'],
			},
			{
				key: 'app-dashboard',
				title: 'Dashboard & today view',
				description: 'Task summary, upcoming items, quick actions.',
				...range(1, 6),
				priority: 4,
				percent_done: 65,
				labels: ['Mobile', 'Frontend'],
			},
			{
				key: 'app-taskdetail',
				title: 'Task detail & editing',
				description: 'Full task view with all fields, comments, attachments.',
				...range(4, 10),
				priority: 4,
				percent_done: 40,
				labels: ['Mobile', 'Frontend'],
			},
			{
				key: 'app-offline',
				title: 'Offline mode & sync',
				description: 'Queue mutations, replay on reconnect, conflict resolution.',
				...range(7, 14),
				priority: 5,
				percent_done: 10,
				labels: ['Mobile', 'Deep Work', 'Urgent'],
			},
			{
				key: 'app-notifications',
				title: 'Push notifications',
				description: 'FCM/APNs integration, notification preferences, badge counts.',
				...range(10, 15),
				priority: 3,
				percent_done: 0,
				labels: ['Mobile', 'Backend'],
			},
			{
				key: 'app-testing',
				title: 'Integration testing',
				description: 'Automated test suite for critical flows.',
				...range(12, 16),
				priority: 4,
				percent_done: 0,
				labels: ['QA', 'Mobile'],
			},
			{
				key: 'app-release',
				title: 'Beta release prep',
				description: 'TestFlight/Play Store internal track, release notes.',
				...range(15, 17),
				priority: 5,
				percent_done: 0,
				labels: ['DevOps', 'Urgent'],
			},
		],
	},
	{
		title: 'Infrastructure Upgrade',
		description: 'Long-running infra project spanning several weeks. Tests wider Gantt zoom levels.',
		tasks: [
			{
				key: 'infra-audit',
				title: 'Current infrastructure audit',
				description: 'Document all services, dependencies, costs, and pain points.',
				...range(-7, -2),
				priority: 3,
				percent_done: 100,
				labels: ['DevOps', 'Admin'],
				done: true,
			},
			{
				key: 'infra-plan',
				title: 'Migration plan & timeline',
				description: 'Write migration runbook, identify risks, get stakeholder sign-off.',
				...range(-3, 2),
				priority: 4,
				percent_done: 100,
				labels: ['DevOps', 'Deep Work'],
				done: true,
			},
			{
				key: 'infra-k8s',
				title: 'Kubernetes cluster setup',
				description: 'Provision cluster, configure networking, set up monitoring.',
				...range(0, 10),
				priority: 5,
				percent_done: 55,
				labels: ['DevOps', 'Backend'],
			},
			{
				key: 'infra-db',
				title: 'Database migration',
				description: 'Migrate PostgreSQL to managed service, verify data integrity.',
				...range(8, 16),
				priority: 6,
				percent_done: 0,
				labels: ['Backend', 'Urgent'],
			},
			{
				key: 'infra-cache',
				title: 'Redis cluster deployment',
				description: 'Set up Redis Sentinel, configure connection pooling.',
				...range(6, 11),
				priority: 3,
				percent_done: 25,
				labels: ['DevOps', 'Backend'],
			},
			{
				key: 'infra-ci',
				title: 'CI/CD pipeline migration',
				description: 'Move from Jenkins to GitHub Actions, migrate all jobs.',
				...range(12, 20),
				priority: 3,
				percent_done: 0,
				labels: ['DevOps'],
			},
			{
				key: 'infra-monitoring',
				title: 'Monitoring & alerting setup',
				description: 'Grafana dashboards, Prometheus metrics, PagerDuty integration.',
				...range(14, 22),
				priority: 4,
				percent_done: 0,
				labels: ['DevOps', 'Admin'],
			},
			{
				key: 'infra-security',
				title: 'Security hardening',
				description: 'Network policies, secrets management, vulnerability scanning.',
				...range(18, 28),
				priority: 5,
				percent_done: 0,
				labels: ['DevOps', 'Urgent'],
			},
			{
				key: 'infra-loadtest',
				title: 'Load testing & capacity planning',
				description: 'Simulate production load, identify bottlenecks, set scaling policies.',
				...range(24, 30),
				priority: 3,
				percent_done: 0,
				labels: ['QA', 'DevOps'],
			},
			{
				key: 'infra-cutover',
				title: 'Production cutover',
				description: 'Execute migration runbook, verify all services, monitor for 48h.',
				...range(30, 33),
				priority: 6,
				percent_done: 0,
				labels: ['DevOps', 'Urgent'],
			},
		],
	},
	{
		title: 'Personal Side Project',
		description: 'Lighter project to show personal/hobby tasks with relaxed priorities and varied progress.',
		tasks: [
			{
				key: 'side-idea',
				title: 'Brainstorm feature ideas',
				description: 'Mind-map session, write down 20 ideas, pick top 5.',
				...range(-10, -6),
				priority: 1,
				percent_done: 100,
				labels: ['Personal', 'Deep Work'],
				done: true,
			},
			{
				key: 'side-prototype',
				title: 'Build rough prototype',
				description: 'Get the core flow working end-to-end, no polish.',
				...range(-4, 5),
				priority: 2,
				percent_done: 70,
				labels: ['Personal', 'Frontend'],
			},
			{
				key: 'side-feedback',
				title: 'Get feedback from 3 friends',
				description: 'Share prototype link, collect unstructured feedback.',
				...range(4, 8),
				priority: 2,
				percent_done: 0,
				labels: ['Personal', 'Waiting'],
			},
			{
				key: 'side-iterate',
				title: 'Iterate on feedback',
				description: 'Address top 3 issues from feedback round.',
				...range(8, 16),
				priority: 2,
				percent_done: 0,
				labels: ['Personal', 'Frontend'],
			},
			{
				key: 'side-launch',
				title: 'Soft launch on social',
				description: 'Write announcement post, share on Twitter and Mastodon.',
				...range(16, 18),
				priority: 1,
				percent_done: 0,
				labels: ['Personal'],
			},
			{
				key: 'side-docs',
				title: 'Write README and setup guide',
				description: 'Installation instructions, screenshots, license.',
				...range(12, 17),
				priority: 1,
				percent_done: 0,
				labels: ['Personal', 'Admin'],
			},
		],
	},
]

// ---------------------------------------------------------------------------
// Task relations — defined by key references, resolved after all tasks exist.
//
// Vikunja relation kinds:
//   subtask, parenttask, related, duplicates, blocking, blocked,
//   precedes, follows, copiedfrom, copiedto
//
// For Gantt dependency arrows, the plan uses: blocking and precedes.
// We define them as: [sourceKey, relationKind, targetKey]
// ---------------------------------------------------------------------------

const taskRelations = [
	// Website Redesign — Design flows into Dev
	['design-research', 'precedes', 'design-wireframes'],
	['design-wireframes', 'precedes', 'design-system'],
	['design-wireframes', 'precedes', 'design-review'],
	['design-review', 'blocking', 'design-hifi'],
	['design-hifi', 'precedes', 'dev-homepage'],
	['design-system', 'precedes', 'dev-homepage'],

	// Website Redesign — Dev dependencies
	['dev-setup', 'precedes', 'dev-cms'],
	['dev-cms', 'precedes', 'dev-homepage'],
	['dev-homepage', 'precedes', 'dev-services'],
	['dev-homepage', 'precedes', 'dev-blog'],
	['dev-services', 'precedes', 'dev-responsive'],
	['dev-blog', 'precedes', 'dev-responsive'],
	['dev-contact', 'precedes', 'dev-responsive'],
	['dev-responsive', 'precedes', 'dev-a11y'],

	// Website Redesign — Launch dependencies
	['dev-a11y', 'precedes', 'launch-perf'],
	['launch-perf', 'precedes', 'launch-staging'],
	['launch-staging', 'blocking', 'launch-dns'],
	['launch-dns', 'precedes', 'launch-monitoring'],

	// Mobile App — sequential flow
	['app-auth', 'precedes', 'app-dashboard'],
	['app-dashboard', 'precedes', 'app-taskdetail'],
	['app-taskdetail', 'precedes', 'app-offline'],
	['app-taskdetail', 'precedes', 'app-notifications'],
	['app-offline', 'precedes', 'app-testing'],
	['app-notifications', 'precedes', 'app-testing'],
	['app-testing', 'blocking', 'app-release'],

	// Infrastructure — critical path
	['infra-audit', 'precedes', 'infra-plan'],
	['infra-plan', 'precedes', 'infra-k8s'],
	['infra-k8s', 'precedes', 'infra-db'],
	['infra-k8s', 'precedes', 'infra-cache'],
	['infra-db', 'precedes', 'infra-ci'],
	['infra-ci', 'precedes', 'infra-monitoring'],
	['infra-monitoring', 'precedes', 'infra-security'],
	['infra-security', 'precedes', 'infra-loadtest'],
	['infra-loadtest', 'blocking', 'infra-cutover'],

	// Side project — loose chain
	['side-idea', 'precedes', 'side-prototype'],
	['side-prototype', 'precedes', 'side-feedback'],
	['side-feedback', 'precedes', 'side-iterate'],
	['side-iterate', 'precedes', 'side-launch'],
]

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

async function main() {
	console.log(`Target Vikunja API: ${baseUrl}`)
	console.log(`Mode: ${dryRun ? 'dry-run' : shouldWipe ? 'wipe-and-seed' : 'seed-only'}`)

	const info = await api('info')
	console.log(`Connected to Vikunja instance: ${info?.title || info?.frontend_url || 'ok'}`)

	const user = await api('user')

	if (dryRun) {
		const existingProjects = await listAll('projects')
		console.log(`Existing projects: ${existingProjects.length}`)
		console.log(`Labels to ensure: ${labelPalette.length}`)
		console.log(`Gantt demo projects: ${ganttProjects.length}`)
		const taskCount = ganttProjects.reduce((sum, p) => {
			const childTasks = (p.children || []).reduce((s, c) => s + (c.tasks || []).length, 0)
			return sum + (p.tasks || []).length + childTasks
		}, 0)
		console.log(`Total tasks to create: ${taskCount}`)
		console.log(`Task relations to create: ${taskRelations.length}`)
		console.log('Dry run complete. No data was written.')
		return
	}

	if (shouldWipe) {
		await wipeGanttProjects()
	}

	const labelIdsByTitle = await ensureLabels()
	const taskIdsByKey = await seedGanttProjects(labelIdsByTitle)
	await seedRelations(taskIdsByKey)

	// Try to assign the current user to some tasks for avatar demo
	if (user?.id) {
		await assignUserToTasks(user, taskIdsByKey)
	}

	const finalProjects = await listAll('projects')
	console.log(`\nGantt demo seed complete: ${finalProjects.length} total projects, ${taskIdsByKey.size} Gantt tasks, ${taskRelations.length} relations.`)
}

// ---------------------------------------------------------------------------
// Wipe — only remove Gantt demo projects (by title match)
// ---------------------------------------------------------------------------

const ganttProjectTitles = new Set(ganttProjects.map(p => p.title))

async function wipeGanttProjects() {
	console.log('Wiping existing Gantt demo projects...')
	const existingProjects = await listAll('projects')

	// Sort deepest first to delete children before parents
	const byId = new Map(existingProjects.map(p => [Number(p.id), p]))
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

	const sorted = [...existingProjects].sort((a, b) => getDepth(b) - getDepth(a))

	for (const project of sorted) {
		// Match top-level Gantt projects or their children
		const isGanttProject = ganttProjectTitles.has(project.title)
		const parent = byId.get(Number(project.parent_project_id || 0))
		const isGanttChild = parent && ganttProjectTitles.has(parent.title)

		if (!isGanttProject && !isGanttChild) continue
		if (project.is_inbox_project) continue

		try {
			await api(`projects/${project.id}`, {method: 'DELETE'})
			console.log(`  Deleted project: ${project.title}`)
		} catch (error) {
			console.log(`  Skipped project: ${project.title} (${error.message})`)
		}
	}
}

// ---------------------------------------------------------------------------
// Label management
// ---------------------------------------------------------------------------

async function ensureLabels() {
	const existingLabels = await listAll('labels')
	const labelIdsByTitle = new Map(existingLabels.map(label => [label.title, label.id]))

	for (const label of labelPalette) {
		if (labelIdsByTitle.has(label.title)) continue
		const created = await api('labels', {method: 'PUT', body: label})
		labelIdsByTitle.set(created.title, created.id)
		console.log(`Created label: ${created.title}`)
	}

	return labelIdsByTitle
}

// ---------------------------------------------------------------------------
// Project & task creation
// ---------------------------------------------------------------------------

async function seedGanttProjects(labelIdsByTitle) {
	const taskIdsByKey = new Map()

	for (const project of ganttProjects) {
		const createdProject = await createProject(project)

		// Top-level project with direct tasks (Mobile App, Infrastructure, Side Project)
		if (Array.isArray(project.tasks)) {
			for (const task of project.tasks) {
				const createdTask = await createGanttTask(createdProject.id, task, labelIdsByTitle)
				if (task.key) taskIdsByKey.set(task.key, createdTask.id)
			}
		}

		// Projects with children (Website Redesign)
		for (const childProject of project.children || []) {
			const createdChild = await createProject(childProject, createdProject.id)
			for (const task of childProject.tasks || []) {
				const createdTask = await createGanttTask(createdChild.id, task, labelIdsByTitle)
				if (task.key) taskIdsByKey.set(task.key, createdTask.id)
			}
		}
	}

	return taskIdsByKey
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

async function createGanttTask(projectId, task, labelIdsByTitle) {
	const body = {
		title: task.title,
		description: task.description || '',
		start_date: task.start_date || null,
		end_date: task.end_date || null,
		due_date: task.due_date || null,
		priority: task.priority || 0,
		percent_done: task.percent_done || 0,
	}

	const createdTask = await api(`projects/${projectId}/tasks`, {method: 'PUT', body})

	// Attach labels
	if (Array.isArray(task.labels) && task.labels.length > 0) {
		for (const title of task.labels) {
			const labelId = labelIdsByTitle.get(title)
			if (!labelId) continue
			await api(`tasks/${createdTask.id}/labels`, {method: 'PUT', body: {label_id: labelId}})
		}
	}

	// Mark done
	if (task.done) {
		await api(`tasks/${createdTask.id}`, {method: 'POST', body: {done: true}})
	}

	console.log(`  Created task: ${task.title} [${task.key || 'no-key'}]`)
	return createdTask
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

async function seedRelations(taskIdsByKey) {
	console.log(`\nCreating ${taskRelations.length} task relations...`)
	let created = 0
	let skipped = 0

	for (const [sourceKey, relationKind, targetKey] of taskRelations) {
		const sourceId = taskIdsByKey.get(sourceKey)
		const targetId = taskIdsByKey.get(targetKey)

		if (!sourceId || !targetId) {
			console.log(`  Skipped relation: ${sourceKey} -> ${targetKey} (missing task)`)
			skipped++
			continue
		}

		try {
			await api(`tasks/${sourceId}/relations`, {
				method: 'PUT',
				body: {
					other_task_id: targetId,
					relation_kind: relationKind,
				},
			})
			console.log(`  ${sourceKey} --[${relationKind}]--> ${targetKey}`)
			created++
		} catch (error) {
			console.log(`  Failed relation: ${sourceKey} -> ${targetKey} (${error.message})`)
			skipped++
		}
	}

	console.log(`Relations: ${created} created, ${skipped} skipped.`)
}

// ---------------------------------------------------------------------------
// Assignee demo — assign the current user to a selection of tasks
// to test assignee avatars on Gantt bars
// ---------------------------------------------------------------------------

const tasksToAssignCurrentUser = [
	'design-wireframes', 'design-system', 'design-hifi',
	'dev-homepage', 'dev-services', 'dev-responsive',
	'app-auth', 'app-dashboard', 'app-taskdetail', 'app-offline',
	'infra-k8s', 'infra-db', 'infra-security',
	'side-prototype', 'side-iterate',
]

async function assignUserToTasks(user, taskIdsByKey) {
	console.log(`\nAssigning user "${user.username || user.email}" to ${tasksToAssignCurrentUser.length} tasks...`)
	let assigned = 0

	for (const key of tasksToAssignCurrentUser) {
		const taskId = taskIdsByKey.get(key)
		if (!taskId) continue

		try {
			await api(`tasks/${taskId}/assignees`, {
				method: 'PUT',
				body: {user_id: user.id},
			})
			assigned++
		} catch (error) {
			// Might fail if already assigned or user lacks permission
			console.log(`  Skipped assignee for ${key}: ${error.message}`)
		}
	}

	console.log(`  Assigned to ${assigned} tasks.`)
}

// ---------------------------------------------------------------------------
// API helpers (same pattern as seed-demo-data.mjs)
// ---------------------------------------------------------------------------

async function listAll(route) {
	const items = []
	let page = 1
	let totalPages = 1

	do {
		const {payload, headers} = await api(route, {
			query: {page, per_page: 100},
			returnHeaders: true,
		})

		if (!Array.isArray(payload)) {
			throw new Error(`Expected array response from ${route}.`)
		}

		items.push(...payload)
		totalPages = Number(headers.get('x-pagination-total-pages') || 1)
		if (payload.length === 0) break
		page += 1
	} while (page <= totalPages)

	return items
}

async function api(route, options = {}) {
	const url = new URL(route.replace(/^\/+/, ''), `${baseUrl}/`)
	if (options.query) {
		for (const [key, value] of Object.entries(options.query)) {
			if (value === null || value === undefined || value === '') continue
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
			payload?.message || payload?.error ||
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
				if (index === -1) return result
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
	if (!value) return ''
	let normalized = value.trim().replace(/\/+$/, '')
	if (!/^https?:\/\//.test(normalized)) {
		normalized = `http://${normalized}`
	}
	if (!normalized.endsWith('/api/v1')) {
		normalized = `${normalized}/api/v1`
	}
	return normalized
}

main().catch(error => {
	console.error(error.message || error)
	process.exitCode = 1
})

import {readFileSync, writeFileSync} from 'node:fs'
import {chmod, mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'

export async function createMockAdminBridge(rootDir, {
	containerName = 'vikunja',
	cliPath = '/app/vikunja/vikunja',
	configPath = '/etc/vikunja/config.yml',
	composePath = '/srv/vikunja/docker-compose.yml',
	initialConfigYaml = '',
	initialComposeYaml = '',
	envVars = {},
	hostConfigPathEnabled = false,
	composePathEnabled = false,
	hostConfigPathMode = 'file',
	configReadError = null,
	configWriteError = null,
	adminUsers = [],
	testmail = {},
	doctor = {},
	migrations = [],
	dump = {},
	restore = {},
	repairs = {},
} = {}) {
	const binDir = path.join(rootDir, 'mock-admin-bridge-bin')
	const statePath = path.join(rootDir, 'mock-admin-bridge-state.json')
	const hostConfigPath = path.join(rootDir, 'mock-admin-config', 'vikunja-config.yml')
	const hostComposePath = path.join(rootDir, 'mock-admin-config', 'docker-compose.yml')
	const initialState = buildInitialState({
		containerName,
		cliPath,
		configPath,
		composePath,
		initialConfigYaml,
		initialComposeYaml,
		envVars,
		configReadError,
		configWriteError,
		adminUsers,
		testmail,
		doctor,
		migrations,
		dump,
		restore,
		repairs,
	})

	await mkdir(binDir, {recursive: true})
	if (hostConfigPathEnabled) {
		const hostConfigParent = path.dirname(hostConfigPath)
		await mkdir(hostConfigParent, {recursive: true})
		if (hostConfigPathMode === 'directory') {
			await mkdir(hostConfigPath, {recursive: true})
		} else {
			await writeFile(hostConfigPath, `${initialConfigYaml || ''}`, 'utf8')
		}
	}
	if (composePathEnabled) {
		const hostComposeParent = path.dirname(hostComposePath)
		await mkdir(hostComposeParent, {recursive: true})
		await writeFile(hostComposePath, `${initialComposeYaml || ''}`, 'utf8')
	}
	writeState(statePath, initialState)

	const dockerPath = path.join(binDir, 'docker')
	await writeFile(dockerPath, buildDockerScript(), 'utf8')
	await chmod(dockerPath, 0o755)

	return {
		binDir,
		env: {
			MOCK_ADMIN_BRIDGE_STATE_PATH: statePath,
			VIKUNJA_BRIDGE_MODE: 'docker-exec',
			VIKUNJA_CONTAINER_NAME: containerName,
			VIKUNJA_CLI_PATH: cliPath,
			VIKUNJA_HOST_CONFIG_PATH: hostConfigPathEnabled ? hostConfigPath : '',
			VIKUNJA_COMPOSE_PATH: composePathEnabled ? hostComposePath : '',
		},
		hostConfigPath,
		hostComposePath,
		readHostConfig() {
			return readFileSync(hostConfigPath, 'utf8')
		},
		readComposeConfig() {
			return readFileSync(hostComposePath, 'utf8')
		},
		getState() {
			return readState(statePath)
		},
		setState(patch) {
			writeState(statePath, mergeState(readState(statePath), patch))
		},
		reset() {
			writeState(statePath, cloneValue(initialState))
			if (hostConfigPathEnabled && hostConfigPathMode !== 'directory') {
				writeFileSync(hostConfigPath, `${initialConfigYaml || ''}`)
			}
			if (composePathEnabled) {
				writeFileSync(hostComposePath, `${initialComposeYaml || ''}`)
			}
		},
	}
}

function buildInitialState({
	containerName,
	cliPath,
	configPath,
	composePath,
	initialConfigYaml,
	initialComposeYaml,
	envVars,
	configReadError,
	configWriteError,
	adminUsers,
	testmail,
	doctor,
	migrations,
	dump,
	restore,
	repairs,
}) {
	const users = Array.isArray(adminUsers) && adminUsers.length > 0
		? adminUsers.map(user => ({
			id: Number(user.id || 0),
			username: `${user.username || ''}`.trim(),
			email: `${user.email || ''}`.trim(),
			enabled: user.enabled !== false,
			status: user.enabled === false ? 'disabled' : `${user.status || 'active'}`.trim() || 'active',
			issuer: `${user.issuer || ''}`.trim(),
			subject: `${user.subject || ''}`.trim(),
			created: `${user.created || '2026-01-01T00:00:00Z'}`.trim(),
			updated: `${user.updated || '2026-01-01T00:00:00Z'}`.trim(),
		}))
		: [
			{
				id: 1,
				username: 'smoke-user',
				email: 'smoke@example.test',
				enabled: true,
				status: 'active',
				issuer: '',
				subject: '',
				created: '2026-01-01T00:00:00Z',
				updated: '2026-01-01T00:00:00Z',
			},
		]

	return {
		containerName,
		cliPath,
		configPath,
		composePath,
		containerRunning: true,
		nextAdminUserId: Math.max(2, ...users.map(user => Number(user.id || 0) + 1)),
		adminUsers: users,
		files: initialConfigYaml
			? {
				[configPath]: initialConfigYaml,
				...(initialComposeYaml ? {[composePath]: initialComposeYaml} : {}),
			}
			: initialComposeYaml
				? {
					[composePath]: initialComposeYaml,
				}
				: {},
		binaryFiles: {},
		envVars: {...envVars},
		configReadError: normalizeCommandError(configReadError),
		configWriteError: normalizeCommandError(configWriteError),
		metrics: {
			configReadCount: 0,
			configWriteCount: 0,
			composeApplyCount: 0,
		},
		versionStdout: 'vikunja version smoke-test\n',
		testmail: {
			exitCode: Number(testmail.exitCode || 0),
			stdout: `${testmail.stdout || 'Test mail queued for {{email}}.\n'}`,
			stderr: `${testmail.stderr || ''}`,
		},
		doctor: {
			exitCode: Number(doctor.exitCode || 0),
			stdout: `${doctor.stdout || 'doctor ok\n'}`,
			stderr: `${doctor.stderr || ''}`,
		},
		migrations: Array.isArray(migrations) && migrations.length > 0
			? migrations.map(migration => ({
				id: `${migration.id || migration.name || ''}`.trim(),
				name: `${migration.name || migration.id || ''}`.trim(),
				applied: migration.applied !== false,
			}))
			: [
				{id: '001', name: '001_initial', applied: true},
				{id: '002', name: '002_add_tokens', applied: false},
			],
		dump: {
			filename: `${dump.filename || 'vikunja-dump-smoke.zip'}`,
			contentBase64: `${dump.contentBase64 || Buffer.from('mock-admin-dump-zip', 'utf8').toString('base64')}`,
		},
		restore: {
			exitCode: Number(restore.exitCode || 0),
			stdout: `${restore.stdout || 'restore ok\n'}`,
			stderr: `${restore.stderr || ''}`,
			lastUploadedBase64: null,
		},
		repairs: {
			'file-mime-types': normalizeCommandResult(repairs['file-mime-types'], 'file mime types ok\n'),
			'orphan-positions': normalizeCommandResult(repairs['orphan-positions'], 'orphan positions ok\n'),
			projects: normalizeCommandResult(repairs.projects, 'projects ok\n'),
			'task-positions': normalizeCommandResult(repairs['task-positions'], 'task positions ok\n'),
		},
	}
}

function normalizeCommandError(value) {
	if (!value) {
		return null
	}

	if (typeof value === 'string') {
		return {
			exitCode: 1,
			stderr: value,
		}
	}

	return {
		exitCode: Number(value.exitCode || 1),
		stderr: `${value.stderr || value.message || 'Command failed.'}`,
	}
}

function normalizeCommandResult(value, defaultStdout) {
	if (!value) {
		return {
			exitCode: 0,
			stdout: defaultStdout,
			stderr: '',
		}
	}

	return {
		exitCode: Number(value.exitCode || 0),
		stdout: `${value.stdout || defaultStdout || ''}`,
		stderr: `${value.stderr || ''}`,
	}
}

function cloneValue(value) {
	return JSON.parse(JSON.stringify(value))
}

function readState(statePath) {
	return JSON.parse(readFileSync(statePath, 'utf8'))
}

function writeState(statePath, state) {
	writeFileSync(statePath, JSON.stringify(state, null, 2))
}

function mergeState(current, patch) {
	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
		return current
	}

	const next = Array.isArray(current) ? [...current] : {...current}
	for (const [key, value] of Object.entries(patch)) {
		if (
			value &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			current &&
			typeof current[key] === 'object' &&
			current[key] !== null &&
			!Array.isArray(current[key])
		) {
			next[key] = mergeState(current[key], value)
			continue
		}

		next[key] = cloneValue(value)
	}
	return next
}

function buildDockerScript() {
	return `#!/usr/bin/env node
const {readFileSync, writeFileSync} = require('node:fs')

const statePath = process.env.MOCK_ADMIN_BRIDGE_STATE_PATH
if (!statePath) {
\tprocess.stderr.write('Missing MOCK_ADMIN_BRIDGE_STATE_PATH\\n')
\tprocess.exit(1)
}

function readState() {
\treturn JSON.parse(readFileSync(statePath, 'utf8'))
}

function writeState(state) {
\twriteFileSync(statePath, JSON.stringify(state, null, 2))
}

function fail(message, exitCode = 1) {
\tif (message) {
\t\tprocess.stderr.write(String(message).endsWith('\\n') ? String(message) : \`\${message}\\n\`)
\t}
\tprocess.exit(exitCode)
}

function renderTemplate(value, variables) {
\treturn String(value || '').replaceAll('{{email}}', String(variables.email || ''))
}

function findFlagValue(args, flag) {
\tconst index = args.indexOf(flag)
\treturn index >= 0 ? String(args[index + 1] || '') : ''
}

function findUser(state, identifier) {
\tconst needle = String(identifier || '').trim().toLowerCase()
\treturn (state.adminUsers || []).find(user =>
\t\tString(user.id || '').trim().toLowerCase() === needle ||
\t\tString(user.username || '').trim().toLowerCase() === needle ||
\t\tString(user.email || '').trim().toLowerCase() === needle,
\t) || null
}

function serializeUsers(users) {
\tconst header = '| ID | Username | Email | Status | Issuer | Subject | Created | Updated |'
\tconst rows = users.map(user => \`| \${user.id} | \${user.username} | \${user.email || ''} | \${user.status || (user.enabled === false ? 'disabled' : 'active')} | \${user.issuer || ''} | \${user.subject || ''} | \${user.created || ''} | \${user.updated || ''} |\`)
\treturn [header, ...rows].join('\\n')
}

function serializeMigrations(migrations) {
\tconst header = '| ID | Name | Applied |'
\tconst rows = (migrations || []).map(migration => \`| \${migration.id} | \${migration.name} | \${migration.applied === true ? 'true' : 'false'} |\`)
\treturn [header, ...rows].join('\\n')
}

function handleUserCli(state, args) {
\tconst command = String(args[0] || '')
\tif (command === 'list') {
\t\tconst email = findFlagValue(args, '--email').toLowerCase()
\t\tconst users = !email
\t\t\t? [...(state.adminUsers || [])]
\t\t\t: (state.adminUsers || []).filter(user => String(user.email || '').toLowerCase() === email)
\t\tprocess.stdout.write(serializeUsers(users))
\t\treturn
\t}

\tif (command === 'create') {
\t\tconst username = findFlagValue(args, '--username')
\t\tconst email = findFlagValue(args, '--email')
\t\tif (!username || !email) {
\t\t\tfail('Username and email are required.')
\t\t}
\t\tconst now = new Date().toISOString()
\t\tstate.adminUsers.push({
\t\t\tid: Number(state.nextAdminUserId || 2),
\t\t\tusername,
\t\t\temail,
\t\t\tenabled: true,
\t\t\tstatus: 'active',
\t\t\tissuer: '',
\t\t\tsubject: '',
\t\t\tcreated: now,
\t\t\tupdated: now,
\t\t})
\t\tstate.nextAdminUserId = Number(state.nextAdminUserId || 2) + 1
\t\twriteState(state)
\t\treturn
\t}

\tif (command === 'update') {
\t\tconst identifier = args[1]
\t\tconst user = findUser(state, identifier)
\t\tif (!user) {
\t\t\tfail('User not found.')
\t\t}
\t\tconst username = findFlagValue(args, '--username')
\t\tconst email = findFlagValue(args, '--email')
\t\tif (username) {
\t\t\tuser.username = username
\t\t}
\t\tif (email) {
\t\t\tuser.email = email
\t\t}
\t\tuser.updated = new Date().toISOString()
\t\twriteState(state)
\t\treturn
\t}

\tif (command === 'change-status') {
\t\tconst identifier = args[1]
\t\tconst user = findUser(state, identifier)
\t\tif (!user) {
\t\t\tfail('User not found.')
\t\t}
\t\tconst enabled = args.includes('--enable')
\t\tuser.enabled = enabled
\t\tuser.status = enabled ? 'active' : 'disabled'
\t\tuser.updated = new Date().toISOString()
\t\twriteState(state)
\t\treturn
\t}

\tif (command === 'reset-password') {
\t\treturn
\t}

\tif (command === 'delete') {
\t\tconst identifier = args[1]
\t\tstate.adminUsers = (state.adminUsers || []).filter(user => !findUser({adminUsers: [user]}, identifier))
\t\twriteState(state)
\t\treturn
\t}

\tfail(\`Unsupported Vikunja user command: \${command}\`)
}

function handleCli(state, args) {
\tconst command = String(args[0] || '')
\tif (command === 'version') {
\t\tprocess.stdout.write(String(state.versionStdout || 'vikunja version smoke-test\\n'))
\t\treturn
\t}

\tif (command === 'testmail') {
\t\tconst email = String(args[1] || '').trim()
\t\tconst testmail = state.testmail || {}
\t\tconst exitCode = Number(testmail.exitCode || 0)
\t\tconst stdout = renderTemplate(testmail.stdout || 'Test mail queued for {{email}}.\\n', {email})
\t\tconst stderr = renderTemplate(testmail.stderr || '', {email})
\t\tif (stdout) {
\t\t\tprocess.stdout.write(stdout)
\t\t}
\t\tif (stderr) {
\t\t\tprocess.stderr.write(stderr)
\t\t}
\t\tprocess.exit(exitCode)
\t}

\tif (command === 'doctor') {
\t\tconst doctor = state.doctor || {}
\t\tif (doctor.stdout) {
\t\t\tprocess.stdout.write(String(doctor.stdout))
\t\t}
\t\tif (doctor.stderr) {
\t\t\tprocess.stderr.write(String(doctor.stderr))
\t\t}
\t\tprocess.exit(Number(doctor.exitCode || 0))
\t}

\tif (command === 'dump') {
\t\tconst filename = String(state.dump?.filename || 'vikunja-dump-smoke.zip')
\t\tconst dumpPath = \`/tmp/\${filename}\`
\t\tstate.binaryFiles = state.binaryFiles || {}
\t\tstate.binaryFiles[dumpPath] = String(state.dump?.contentBase64 || '')
\t\twriteState(state)
\t\tprocess.stdout.write(\`Dump file saved at \${dumpPath}\\n\`)
\t\treturn
\t}

\tif (command === 'restore') {
\t\tconst targetPath = String(args[1] || '')
\t\tstate.restore = state.restore || {}
\t\tstate.restore.lastUploadedBase64 = String((state.binaryFiles || {})[targetPath] || '')
\t\twriteState(state)
\t\tif (state.restore.stdout) {
\t\t\tprocess.stdout.write(String(state.restore.stdout))
\t\t}
\t\tif (state.restore.stderr) {
\t\t\tprocess.stderr.write(String(state.restore.stderr))
\t\t}
\t\tprocess.exit(Number(state.restore.exitCode || 0))
\t}

\tif (command === 'migrate') {
\t\tconst subcommand = String(args[1] || '')
\t\tstate.migrations = state.migrations || []
\t\tif (subcommand === 'list') {
\t\t\tprocess.stdout.write(serializeMigrations(state.migrations))
\t\t\treturn
\t\t}
\t\tif (subcommand === 'rollback') {
\t\t\tconst name = findFlagValue(args, '--name')
\t\t\tconst migration = (state.migrations || []).find(entry => String(entry.name) === name)
\t\t\tif (!migration) {
\t\t\t\tfail('Migration not found.')
\t\t\t}
\t\t\tmigration.applied = false
\t\t\twriteState(state)
\t\t\tprocess.stdout.write(\`Rolled back \${name}\\n\`)
\t\t\treturn
\t\t}
\t\tfor (const migration of state.migrations) {
\t\t\tif (migration.applied !== true) {
\t\t\t\tmigration.applied = true
\t\t\t}
\t\t}
\t\twriteState(state)
\t\tprocess.stdout.write('Applied pending migrations\\n')
\t\treturn
\t}

\tif (command === 'repair') {
\t\tconst repairName = String(args[1] || '')
\t\tconst repair = (state.repairs || {})[repairName]
\t\tif (!repair) {
\t\t\tfail(\`Unknown repair command: \${repairName}\`)
\t\t}
\t\tif (repair.stdout) {
\t\t\tprocess.stdout.write(String(repair.stdout))
\t\t}
\t\tif (repair.stderr) {
\t\t\tprocess.stderr.write(String(repair.stderr))
\t\t}
\t\tprocess.exit(Number(repair.exitCode || 0))
\t}

\tif (command === 'user') {
\t\thandleUserCli(state, args.slice(1))
\t\treturn
\t}

\tfail(\`Unsupported Vikunja CLI command: \${command}\`)
}

const args = process.argv.slice(2)
const state = readState()

if (args[0] === 'ps' && args[1] === '--format') {
\tif (state.containerRunning !== false) {
\t\tprocess.stdout.write(\`\${state.containerName}\\n\`)
\t}
\tprocess.exit(0)
}

if (args[0] === 'restart') {
\tif (String(args[1] || '') !== String(state.containerName || '')) {
\t\tfail('Container not found.')
\t}
\tstate.containerRunning = true
\twriteState(state)
\tprocess.stdout.write(\`\${state.containerName}\\n\`)
\tprocess.exit(0)
}

if (args[0] === 'inspect' && args[1] === '--format') {
\tconst format = String(args[2] || '')
\tconst containerName = String(args[3] || '')
\tif (containerName !== String(state.containerName || '')) {
\t\tfail('Container not found.')
\t}
\tif (format === '{{json .Config.Env}}') {
\t\tconst envList = Object.entries(state.envVars || {}).map(([key, value]) => \`\${key}=\${value}\`)
\t\tprocess.stdout.write(\`\${JSON.stringify(envList)}\\n\`)
\t\tprocess.exit(0)
\t}
\tif (format === '{{.State.Running}}') {
\t\tprocess.stdout.write(state.containerRunning === false ? 'false\\n' : 'true\\n')
\t\tprocess.exit(0)
\t}
\tfail(\`Unsupported docker inspect format: \${format}\`)
}

if (args[0] === 'compose') {
\tif (!args.includes('up')) {
\t\tfail(\`Unsupported docker compose command: \${args.join(' ')}\`)
\t}
\tstate.metrics = state.metrics || {}
\tstate.metrics.composeApplyCount = Number(state.metrics.composeApplyCount || 0) + 1
\tstate.containerRunning = true
\twriteState(state)
\tprocess.exit(0)
}

if (args[0] === 'cp') {
\tconst source = String(args[1] || '')
\tconst destination = String(args[2] || '')
\tconst containerPrefix = \`\${state.containerName}:\`
\tconst readsFromContainer = source.startsWith(containerPrefix)
\tconst writesToContainer = destination.startsWith(containerPrefix)

\tif (readsFromContainer === writesToContainer) {
\t\tfail('Mock docker cp only supports host<->container copies.')
\t}

\tif (readsFromContainer) {
\t\tconst sourcePath = source.slice(containerPrefix.length)
\t\tif (sourcePath === String(state.configPath || '')) {
\t\t\tstate.metrics = state.metrics || {}
\t\t\tstate.metrics.configReadCount = Number(state.metrics.configReadCount || 0) + 1
\t\t\twriteState(state)
\t\t\tif (state.configReadError) {
\t\t\t\tfail(state.configReadError.stderr, Number(state.configReadError.exitCode || 1))
\t\t\t}
\t\t}
\t\tif (!(sourcePath in (state.files || {}))) {
\t\t\tfail(\`Could not find the file \${sourcePath} in container \${state.containerName}\`)
\t\t}
\t\twriteFileSync(destination, String(state.files[sourcePath] || ''))
\t\tprocess.exit(0)
\t}

\tconst destinationPath = destination.slice(containerPrefix.length)
\tif (destinationPath === String(state.configPath || '')) {
\t\tstate.metrics = state.metrics || {}
\t\tstate.metrics.configWriteCount = Number(state.metrics.configWriteCount || 0) + 1
\t\twriteState(state)
\t\tif (state.configWriteError) {
\t\t\tfail(state.configWriteError.stderr, Number(state.configWriteError.exitCode || 1))
\t\t}
\t}
\tstate.files = state.files || {}
\tstate.files[destinationPath] = readFileSync(source, 'utf8')
\twriteState(state)
\tprocess.exit(0)
}

if (args[0] !== 'exec') {
\tfail(\`Unsupported docker command: \${args.join(' ')}\`)
}

let index = 1
let interactive = false
while (args[index] === '-i' || args[index] === '-e') {
\tif (args[index] === '-i') {
\t\tinteractive = true
\t\tindex += 1
\t\tcontinue
\t}
\tif (args[index] === '-e') {
\t\tindex += 2
\t\tcontinue
\t}
}

const containerName = String(args[index] || '')
if (containerName !== String(state.containerName || '')) {
\tfail('Container not found.')
}
index += 1

const command = String(args[index] || '')
if (command === 'true') {
\tprocess.exit(0)
}

if (command === 'cat') {
\tconst targetPath = String(args[index + 1] || '')
\tif (targetPath in (state.binaryFiles || {})) {
\t\tprocess.stdout.write(Buffer.from(String(state.binaryFiles[targetPath] || ''), 'base64'))
\t\tprocess.exit(0)
\t}
\tif (!(targetPath in (state.files || {}))) {
\t\tprocess.stderr.write(\`cat: \${targetPath}: No such file or directory\\n\`)
\t\tprocess.exit(1)
\t}
\tprocess.stdout.write(String(state.files[targetPath] || ''))
\tprocess.exit(0)
}

if (command === 'rm' && String(args[index + 1] || '') === '-f') {
\tconst targetPath = String(args[index + 2] || '')
\tif (state.files && targetPath in state.files) {
\t\tdelete state.files[targetPath]
\t}
\tif (state.binaryFiles && targetPath in state.binaryFiles) {
\t\tdelete state.binaryFiles[targetPath]
\t}
\twriteState(state)
\tprocess.exit(0)
}

if (command === 'env') {
\tfor (const [key, value] of Object.entries(state.envVars || {})) {
\t\tprocess.stdout.write(\`\${key}=\${value}\\n\`)
\t}
\tprocess.exit(0)
}

if (command === 'sh' && String(args[index + 1] || '') === '-c') {
\tif (!interactive) {
\t\tfail('Interactive stdin is required for config writes.')
\t}
\tconst script = String(args[index + 2] || '')
\tconst stdinBuffer = readFileSync(0)
\tconst uploadMatch = script.match(/^cat > (.+)$/)
\tif (uploadMatch) {
\t\tconst targetPath = String(uploadMatch[1] || '').trim()
\t\tstate.binaryFiles = state.binaryFiles || {}
\t\tstate.binaryFiles[targetPath] = Buffer.from(stdinBuffer).toString('base64')
\t\twriteState(state)
\t\tprocess.exit(0)
\t}
\tstate.files = state.files || {}
\tstate.files[state.configPath] = stdinBuffer.toString('utf8')
\twriteState(state)
\tprocess.exit(0)
}

if (command === String(state.cliPath || '/app/vikunja/vikunja')) {
\thandleCli(state, args.slice(index + 1))
\tprocess.exit(0)
}

fail(\`Unsupported docker exec command: \${args.slice(index).join(' ')}\`)
`
}

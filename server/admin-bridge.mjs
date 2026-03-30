import {spawn} from 'node:child_process'

export function createAdminBridge({
	bridgeMode = '',
	vikunjaContainerName,
	vikunjaCliPath,
	vikunjaSshDestination,
	vikunjaSshPort,
	vikunjaSshKeyPath,
	adminBridgeAllowedEmails = [],
	bridgeTimeoutMs,
}) {
	const mode = normalizeBridgeMode(bridgeMode)
	const allowedEmails = new Set(
		Array.isArray(adminBridgeAllowedEmails)
			? adminBridgeAllowedEmails
				.map(value => `${value || ''}`.trim().toLowerCase())
				.filter(Boolean)
			: [],
	)
	const enabled = Boolean(
		mode &&
		`${vikunjaContainerName || ''}`.trim() &&
		`${vikunjaCliPath || ''}`.trim() &&
		(mode !== 'ssh-docker-exec' || `${vikunjaSshDestination || ''}`.trim()),
	)

	return {
		enabled,

		getPublicConfig() {
			return {
				enabled,
				mode: enabled ? mode : null,
			}
		},

		isOperatorAccount(account) {
			const email = `${account?.user?.email || ''}`.trim().toLowerCase()
			if (!email || allowedEmails.size === 0) {
				return false
			}

			return allowedEmails.has(email)
		},

		async getRuntimeHealth() {
			if (!enabled) {
				return {
					enabled: false,
					mode: null,
					dockerReachable: false,
					vikunjaContainerFound: false,
					vikunjaCliReachable: false,
					containerName: `${vikunjaContainerName || ''}`.trim() || null,
					cliPath: `${vikunjaCliPath || ''}`.trim() || null,
					errors: ['The Vikunja admin bridge is not fully configured.'],
				}
			}

			const health = {
				enabled: true,
				mode,
				dockerReachable: false,
				vikunjaContainerFound: false,
				vikunjaCliReachable: false,
				containerName: vikunjaContainerName,
				cliPath: vikunjaCliPath,
				errors: [],
			}

			try {
				const psResult = mode === 'ssh-docker-exec'
					? await runSshCommand(['docker', 'ps', '--format', '{{.Names}}'], {
						timeoutMs: bridgeTimeoutMs,
					})
					: await runCommand('docker', ['ps', '--format', '{{.Names}}'], {
						timeoutMs: bridgeTimeoutMs,
					})
				health.dockerReachable = true
				const names = psResult.stdout
					.split(/\r?\n/)
					.map(value => value.trim())
					.filter(Boolean)
				health.vikunjaContainerFound = names.includes(vikunjaContainerName)
				if (!health.vikunjaContainerFound) {
					health.errors.push(`Container "${vikunjaContainerName}" is not running.`)
					return health
				}
			} catch (error) {
				health.errors.push(error.message || 'Docker is not reachable.')
				return health
			}

			try {
				await runVikunjaCli(['version'], bridgeTimeoutMs, {allowFailure: false})
				health.vikunjaCliReachable = true
			} catch (error) {
				health.errors.push(error.message || 'Vikunja CLI is not reachable.')
			}

			return health
		},

		async runTestmail(email) {
			const nextEmail = `${email || ''}`.trim()
			assertRequired(nextEmail, 'Email address is required.')

			const result = await runVikunjaCli(['testmail', nextEmail], bridgeTimeoutMs, {
				allowFailure: true,
			})
			const stdout = `${result.stdout || ''}`.trim() || null
			const stderr = `${result.stderr || ''}`.trim() || null
			return {
				success: didTestmailSucceed(result.exitCode, stdout, stderr),
				stdout,
				stderr,
			}
		},

		async runDoctor() {
			const result = await runVikunjaCli(['doctor'], bridgeTimeoutMs, {
				allowFailure: true,
			})
			return {
				exitCode: result.exitCode,
				stdout: `${result.stdout || ''}`.trim() || null,
				stderr: `${result.stderr || ''}`.trim() || null,
			}
		},

		async listUsers({email = ''} = {}) {
			const args = ['user', 'list']
			if (`${email || ''}`.trim()) {
				args.push('--email', `${email}`.trim())
			}

			const result = await runVikunjaCli(args, bridgeTimeoutMs)
			return parseUserListOutput(result.stdout)
		},

		async createUser({username, email, password}) {
			const nextUsername = `${username || ''}`.trim()
			const nextEmail = `${email || ''}`.trim()
			const nextPassword = `${password || ''}`
			assertRequired(nextUsername, 'Username is required.')
			assertRequired(nextEmail, 'Email is required.')
			assertRequired(nextPassword, 'Password is required.')

			await runVikunjaCli([
				'user',
				'create',
				'--username',
				nextUsername,
				'--email',
				nextEmail,
				'--password',
				nextPassword,
			], bridgeTimeoutMs)

			const users = await this.listUsers({email: nextEmail})
			return users.find(user => user.email.toLowerCase() === nextEmail.toLowerCase()) || {
				id: 0,
				username: nextUsername,
				email: nextEmail,
				enabled: true,
				status: 'active',
				issuer: '',
				subject: '',
				created: null,
				updated: null,
			}
		},

		async updateUser(identifier, {username, email, avatarProvider} = {}) {
			const args = ['user', 'update', String(identifier)]
			const nextUsername = `${username || ''}`.trim()
			const nextEmail = `${email || ''}`.trim()
			const nextAvatarProvider = `${avatarProvider || ''}`.trim()

			if (nextUsername) {
				args.push('--username', nextUsername)
			}
			if (nextEmail) {
				args.push('--email', nextEmail)
			}
			if (nextAvatarProvider) {
				args.push('--avatar-provider', nextAvatarProvider)
			}
			if (args.length === 3) {
				const error = new Error('No user fields were provided to update.')
				error.statusCode = 400
				throw error
			}

			await runVikunjaCli(args, bridgeTimeoutMs)
			return await resolveUserAfterMutation(this, identifier, {
				username: nextUsername,
				email: nextEmail,
			})
		},

		async setUserEnabled(identifier, enabledValue) {
			await runVikunjaCli([
				'user',
				'change-status',
				String(identifier),
				enabledValue ? '--enable' : '--disable',
			], bridgeTimeoutMs)
			return await resolveUserAfterMutation(this, identifier)
		},

		async resetUserPassword(identifier, password) {
			const nextPassword = `${password || ''}`
			assertRequired(nextPassword, 'Password is required.')

			await runVikunjaCli([
				'user',
				'reset-password',
				String(identifier),
				'--direct',
				'--password',
				nextPassword,
			], bridgeTimeoutMs)
		},

		async deleteUser(identifier) {
			await runVikunjaCli([
				'user',
				'delete',
				String(identifier),
				'--now',
				'--confirm',
			], bridgeTimeoutMs)
		},
	}

	async function runVikunjaCli(args, timeoutMs, {allowFailure = false} = {}) {
		const dockerExecArgs = [
			'exec',
			'-e',
			'HOME=/tmp',
			'-e',
			'XDG_CACHE_HOME=/tmp/.cache',
			vikunjaContainerName,
			vikunjaCliPath,
			...args,
		]
		const result = mode === 'ssh-docker-exec'
			? await runSshCommand(
				['docker', ...dockerExecArgs],
				{timeoutMs},
			)
			: await runCommand(
				'docker',
				dockerExecArgs,
				{timeoutMs},
			)

		if (!allowFailure && result.exitCode !== 0) {
			const error = createBridgeError(
				`Vikunja CLI command failed for "${args.join(' ')}".`,
				result,
			)
			throw error
		}

		return result
	}

	function runSshCommand(remoteArgs, {timeoutMs = 10000} = {}) {
		const sshArgs = []
		if (Number.isFinite(Number(vikunjaSshPort)) && Number(vikunjaSshPort) > 0) {
			sshArgs.push('-p', String(Number(vikunjaSshPort)))
		}
		if (`${vikunjaSshKeyPath || ''}`.trim()) {
			sshArgs.push('-i', `${vikunjaSshKeyPath}`.trim())
		}
		sshArgs.push(`${vikunjaSshDestination}`.trim())
		sshArgs.push(buildShellCommand(remoteArgs))
		return runCommand('ssh', sshArgs, {timeoutMs})
	}
}

function didTestmailSucceed(exitCode, stdout, stderr) {
	if (Number(exitCode || 0) !== 0) {
		return false
	}

	const combinedOutput = `${stdout || ''}\n${stderr || ''}`.toLowerCase()
	if (!combinedOutput.trim()) {
		return true
	}

	if (combinedOutput.includes('error sending test mail')) {
		return false
	}

	if (combinedOutput.includes('level=error') && combinedOutput.includes('test mail')) {
		return false
	}

	return true
}

function normalizeBridgeMode(value) {
	const normalized = `${value || ''}`.trim()
	if (normalized === 'ssh-docker-exec') {
		return 'ssh-docker-exec'
	}
	if (normalized === 'docker-exec') {
		return 'docker-exec'
	}
	return ''
}

async function resolveUserAfterMutation(bridge, identifier, {username = '', email = ''} = {}) {
	if (`${email || ''}`.trim()) {
		const emailMatches = await bridge.listUsers({email})
		const exactEmailMatch = emailMatches.find(user => user.email.toLowerCase() === email.toLowerCase())
		if (exactEmailMatch) {
			return exactEmailMatch
		}
	}

	const allUsers = await bridge.listUsers()
	const identifierText = `${identifier || ''}`.trim()
	const identifierNumber = Number(identifierText)
	return (
		allUsers.find(user =>
			(identifierText && user.username === identifierText) ||
			(Number.isFinite(identifierNumber) && user.id === identifierNumber) ||
			(username && user.username === username),
		) || null
	)
}

function parseUserListOutput(stdout) {
	const tableRows = `${stdout || ''}`
		.split(/\r?\n/)
		.map(line => parseTableRow(line))
		.filter(Boolean)

	if (tableRows.length === 0) {
		return []
	}

	const [header, ...rows] = tableRows
	const normalizedHeader = header.map(value => value.toLowerCase())
	if (!normalizedHeader.includes('id') || !normalizedHeader.includes('username')) {
		return []
	}

	return rows
		.map(row => buildUserFromTableRow(normalizedHeader, row))
		.filter(Boolean)
}

function parseTableRow(line) {
	const normalized = `${line || ''}`.trimEnd()
	if (!normalized || !/[│|]/.test(normalized)) {
		return null
	}

	const ascii = normalized.replaceAll('│', '|')
	const values = ascii
		.split('|')
		.map(value => value.trim())
		.filter((value, index, all) => {
			if (!value && (index === 0 || index === all.length - 1)) {
				return false
			}
			return true
		})

	return values.length > 0 ? values : null
}

function buildUserFromTableRow(header, row) {
	const record = Object.fromEntries(
		header.map((key, index) => [key, `${row[index] || ''}`.trim()]),
	)

	const id = Number(record.id || 0)
	const username = record.username || ''
	if (!id || !username) {
		return null
	}

	const status = `${record.status || ''}`.trim().toLowerCase()
	return {
		id,
		username,
		email: record.email || '',
		enabled: status !== 'disabled',
		status,
		issuer: record.issuer || '',
		subject: record.subject || '',
		created: record.created || null,
		updated: record.updated || null,
	}
}

function runCommand(command, args, {timeoutMs = 10000} = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		let stdout = ''
		let stderr = ''
		let finished = false
		const timer = setTimeout(() => {
			if (finished) {
				return
			}

			finished = true
			child.kill('SIGKILL')
			const error = new Error(`Command timed out after ${timeoutMs}ms.`)
			error.statusCode = 504
			reject(error)
		}, timeoutMs)

		child.stdout.on('data', chunk => {
			stdout += chunk.toString('utf8')
		})
		child.stderr.on('data', chunk => {
			stderr += chunk.toString('utf8')
		})
		child.on('error', error => {
			if (finished) {
				return
			}

			finished = true
			clearTimeout(timer)
			const nextError = new Error(error.message || 'Command execution failed.')
			nextError.statusCode = 503
			nextError.details = {
				command,
				args,
			}
			reject(nextError)
		})
		child.on('close', (exitCode, signal) => {
			if (finished) {
				return
			}

			finished = true
			clearTimeout(timer)
			resolve({
				stdout,
				stderr,
				exitCode: Number(exitCode || 0),
				signal: signal || null,
				command,
				args,
			})
		})
	})
}

function createBridgeError(message, result) {
	const error = new Error(message)
	error.statusCode = 502
	error.details = {
		exitCode: result.exitCode,
		signal: result.signal,
		stdout: `${result.stdout || ''}`.trim() || null,
		stderr: `${result.stderr || ''}`.trim() || null,
	}
	return error
}

function assertRequired(value, message) {
	if (`${value || ''}`.trim()) {
		return
	}

	const error = new Error(message)
	error.statusCode = 400
	throw error
}

function buildShellCommand(args) {
	return args.map(quoteShellArg).join(' ')
}

function quoteShellArg(value) {
	const text = `${value ?? ''}`
	if (!text) {
		return "''"
	}

	return `'${text.replaceAll("'", "'\\''")}'`
}

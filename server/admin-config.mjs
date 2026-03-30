import {spawn} from 'node:child_process'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {parse, stringify} from 'yaml'

const MAILER_ENV_FIELD_MAP = {
	VIKUNJA_MAILER_ENABLED: 'enabled',
	VIKUNJA_MAILER_HOST: 'host',
	VIKUNJA_MAILER_PORT: 'port',
	VIKUNJA_MAILER_AUTHTYPE: 'authType',
	VIKUNJA_MAILER_USERNAME: 'username',
	VIKUNJA_MAILER_PASSWORD: 'password',
	VIKUNJA_MAILER_SKIPTLSVERIFY: 'skipTlsVerify',
	VIKUNJA_MAILER_FROMEMAIL: 'fromEmail',
	VIKUNJA_MAILER_FORCESSL: 'forceSsl',
}

export function createAdminConfig({
	bridgeMode = '',
	vikunjaContainerName,
	vikunjaSshDestination,
	vikunjaSshPort,
	vikunjaSshKeyPath,
	bridgeTimeoutMs,
	hostConfigPath = '',
	composePath = '',
}) {
	const mode = normalizeBridgeMode(bridgeMode)
	const sourceMode = `${hostConfigPath || ''}`.trim()
		? 'file-backed'
		: `${composePath || ''}`.trim()
			? 'compose-env'
			: 'read-only'
	const transport = mode === 'ssh-docker-exec' ? 'ssh' : 'local'
	const dockerAccessConfigured = Boolean(
		mode &&
		`${vikunjaContainerName || ''}`.trim() &&
		(mode !== 'ssh-docker-exec' || `${vikunjaSshDestination || ''}`.trim()),
	)
	const transportConfigured = Boolean(transport !== 'ssh' || `${vikunjaSshDestination || ''}`.trim())

	return {
		sourceMode,

		getMailerCapabilities() {
			if (sourceMode === 'file-backed' || sourceMode === 'compose-env') {
				if (!transportConfigured) {
					return {
						canInspect: false,
						canWrite: false,
						canApply: false,
						reasonCode: 'unsupported_source_mode',
					}
				}

				return {
					canInspect: true,
					canWrite: true,
					canApply: dockerAccessConfigured,
					reasonCode: dockerAccessConfigured ? null : 'no_bridge',
				}
			}

			return {
				canInspect: dockerAccessConfigured,
				canWrite: false,
				canApply: false,
				reasonCode: dockerAccessConfigured ? 'no_config_path' : 'no_bridge',
			}
		},

		async readMailerConfig() {
			const capabilities = this.getMailerCapabilities()

			if (!capabilities.canInspect) {
				return buildMailerConfig({}, {}, capabilities)
			}

			if (sourceMode === 'file-backed') {
				const envVars = dockerAccessConfigured ? await readContainerEnvVars() : {}
				const mailer = await readMailerDocument(hostConfigPath)
				return buildMailerConfig(mailer, envVars, capabilities)
			}

			if (sourceMode === 'compose-env') {
				const composeEnvVars = await readComposeMailerEnv(composePath)
				return buildMailerConfig({}, composeEnvVars, capabilities, {
					markEnvOverrides: false,
				})
			}

			const envVars = dockerAccessConfigured ? await readContainerEnvVars() : {}
			return buildMailerConfig({}, envVars, capabilities)
		},

		async writeMailerConfig(settings) {
			const capabilities = this.getMailerCapabilities()
			assertMailerCapability(capabilities, 'canWrite')

			if (sourceMode === 'compose-env') {
				const currentDocument = await readComposeDocument(composePath)
				const {serviceName, serviceConfig} = resolveComposeService(currentDocument, vikunjaContainerName)
				const environment = normalizeComposeEnvironment(serviceConfig.environment)
				const nextEnvironment = {
					...environment,
					VIKUNJA_MAILER_ENABLED: Boolean(settings.enabled) ? 'true' : 'false',
					VIKUNJA_MAILER_HOST: `${settings.host || ''}`.trim(),
					VIKUNJA_MAILER_PORT: String(normalizePort(settings.port)),
					VIKUNJA_MAILER_AUTHTYPE: `${settings.authType || 'plain'}`.trim() || 'plain',
					VIKUNJA_MAILER_USERNAME: `${settings.username || ''}`.trim(),
					VIKUNJA_MAILER_SKIPTLSVERIFY: Boolean(settings.skipTlsVerify) ? 'true' : 'false',
					VIKUNJA_MAILER_FROMEMAIL: `${settings.fromEmail || ''}`.trim(),
					VIKUNJA_MAILER_FORCESSL: Boolean(settings.forceSsl) ? 'true' : 'false',
				}

				if (settings.password != null && `${settings.password}`.length > 0) {
					nextEnvironment.VIKUNJA_MAILER_PASSWORD = `${settings.password}`
				}

				currentDocument.services = {
					...normalizeServicesDocument(currentDocument.services),
					[serviceName]: {
						...serviceConfig,
						environment: nextEnvironment,
					},
				}
				await writeComposeDocument(composePath, currentDocument)
				return await this.readMailerConfig()
			}

			const currentMailer = await readMailerDocument(hostConfigPath)
			const nextMailer = {
				...currentMailer,
				enabled: Boolean(settings.enabled),
				host: `${settings.host || ''}`.trim(),
				port: normalizePort(settings.port),
				authtype: `${settings.authType || 'plain'}`.trim() || 'plain',
				username: `${settings.username || ''}`.trim(),
				skiptlsverify: Boolean(settings.skipTlsVerify),
				fromemail: `${settings.fromEmail || ''}`.trim(),
				forcessl: Boolean(settings.forceSsl),
			}

			if (settings.password != null && `${settings.password}`.length > 0) {
				nextMailer.password = `${settings.password}`
			}

			const currentDocument = await readConfigDocument(hostConfigPath)
			currentDocument.mailer = nextMailer
			await writeConfigDocument(hostConfigPath, currentDocument)
			return await this.readMailerConfig()
		},

		async restartVikunja() {
			const capabilities = this.getMailerCapabilities()
			assertMailerCapability(capabilities, 'canApply')

			if (sourceMode === 'compose-env') {
				const currentDocument = await readComposeDocument(composePath)
				const {serviceName} = resolveComposeService(currentDocument, vikunjaContainerName)
				const result = await runComposeCommand(composePath, ['up', '-d', serviceName], {
					timeoutMs: 30000,
				})
				if (result.exitCode !== 0) {
					throw createBridgeError(
						`Failed to apply compose-based Vikunja config from "${composePath}".`,
						result,
					)
				}

				await waitForContainerReady(vikunjaContainerName, {
					timeoutMs: 20000,
					pollIntervalMs: 1000,
				})

				return {restarted: true}
			}

			const result = await runDockerCommand(['restart', vikunjaContainerName], {
				timeoutMs: 30000,
			})
			if (result.exitCode !== 0) {
				throw createBridgeError(
					`Failed to restart Vikunja container "${vikunjaContainerName}".`,
					result,
				)
			}

			await waitForContainerReady(vikunjaContainerName, {
				timeoutMs: 20000,
				pollIntervalMs: 1000,
			})

			return {restarted: true}
		},
	}

	async function readConfigDocument(filePath) {
		if (sourceMode !== 'file-backed') {
			return {}
		}

		const configYaml = await readSourceFile(filePath)
		return normalizeConfigDocument(parse(configYaml || ''))
	}

	async function readMailerDocument(filePath) {
		const document = await readConfigDocument(filePath)
		return isRecord(document.mailer) ? document.mailer : {}
	}

	async function readComposeDocument(filePath) {
		const composeYaml = await readSourceFile(filePath, {
			allowMissing: false,
			missingMessage: `Configured Docker Compose file "${filePath}" is not readable from the app process.`,
		})
		return normalizeConfigDocument(parse(composeYaml || ''))
	}

	async function writeConfigDocument(filePath, document) {
		await writeSourceFile(filePath, stringify(document))
	}

	async function writeComposeDocument(filePath, document) {
		await writeSourceFile(filePath, stringify(document))
	}

	async function readComposeMailerEnv(filePath) {
		const document = await readComposeDocument(filePath)
		const {serviceConfig} = resolveComposeService(document, vikunjaContainerName)
		return extractMailerEnvVars(normalizeComposeEnvironment(serviceConfig.environment))
	}

	async function readSourceFile(filePath, {allowMissing = true, missingMessage = ''} = {}) {
		if (transport === 'ssh') {
			return await readRemoteFile(filePath, {allowMissing, missingMessage})
		}

		try {
			return await readFile(filePath, 'utf8')
		} catch (error) {
			if (error && typeof error === 'object' && error.code === 'ENOENT') {
				if (!allowMissing) {
					throw createFileError(
						missingMessage || `Failed to read "${filePath}".`,
						error,
					)
				}
				return ''
			}
			throw createFileError(`Failed to read "${filePath}".`, error)
		}
	}

	async function writeSourceFile(filePath, content) {
		if (transport === 'ssh') {
			await writeRemoteFile(filePath, content)
			return
		}

		try {
			await mkdir(path.dirname(filePath), {recursive: true})
			await writeFile(filePath, `${content ?? ''}`, 'utf8')
		} catch (error) {
			throw createFileError(`Failed to write "${filePath}".`, error)
		}
	}

	async function readRemoteFile(filePath, {allowMissing = true, missingMessage = ''} = {}) {
		const result = await runSshShellCommand(
			[
				`if [ -f ${quoteShellArg(filePath)} ]; then`,
				`  cat ${quoteShellArg(filePath)}`,
				`elif [ ! -e ${quoteShellArg(filePath)} ]; then`,
				'  exit 44',
				'else',
				`  cat ${quoteShellArg(filePath)}`,
				'fi',
			].join('\n'),
			{timeoutMs: bridgeTimeoutMs},
		)
		if (result.exitCode === 44) {
			if (!allowMissing) {
				throw createBridgeError(
					missingMessage || `Failed to read "${filePath}".`,
					result,
				)
			}
			return ''
		}
		if (result.exitCode !== 0) {
			throw createBridgeError(`Failed to read "${filePath}".`, result)
		}

		return result.stdout
	}

	async function writeRemoteFile(filePath, content) {
		const result = await runSshShellCommandWithStdin(
			[
				`mkdir -p ${quoteShellArg(path.posix.dirname(filePath))}`,
				`cat > ${quoteShellArg(filePath)}`,
			].join('\n'),
			content,
			{timeoutMs: bridgeTimeoutMs},
		)
		if (result.exitCode !== 0) {
			throw createBridgeError(`Failed to write "${filePath}".`, result)
		}
	}

	async function readContainerEnvVars() {
		if (!dockerAccessConfigured) {
			return {}
		}

		const result = await runDockerCommand(
			['inspect', '--format', '{{json .Config.Env}}', vikunjaContainerName],
			{timeoutMs: bridgeTimeoutMs},
		)
		if (result.exitCode !== 0) {
			return {}
		}

		const envList = parseJsonArray(`${result.stdout || ''}`.trim())
		if (!envList) {
			return {}
		}

		return envList.reduce((collected, line) => {
			const match = `${line || ''}`.match(/^(VIKUNJA_MAILER_[A-Z0-9_]+)=(.*)$/)
			if (!match) {
				return collected
			}

			collected[match[1]] = match[2]
			return collected
		}, {})
	}

	async function waitForContainerReady(containerName, {timeoutMs = 20000, pollIntervalMs = 1000} = {}) {
		const deadline = Date.now() + timeoutMs
		while (Date.now() < deadline) {
			try {
				const result = await runDockerCommand(['inspect', '--format', '{{.State.Running}}', containerName], {
					timeoutMs: 3000,
				})
				if (result.exitCode === 0 && `${result.stdout || ''}`.trim() === 'true') {
					return
				}
			} catch {
				// Keep polling until the container is reachable again.
			}

			await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
		}

		const error = new Error(`Container "${containerName}" did not become ready within ${timeoutMs}ms.`)
		error.statusCode = 504
		throw error
	}

	function runDockerCommand(args, {timeoutMs = 10000} = {}) {
		return transport === 'ssh'
			? runSshDockerCommand(args, {timeoutMs})
			: runCommand('docker', args, {timeoutMs})
	}

	function runComposeCommand(filePath, composeArgs, {timeoutMs = 10000} = {}) {
		const projectDirectory = transport === 'ssh'
			? path.posix.dirname(filePath)
			: path.dirname(filePath)
		const composeFileName = transport === 'ssh'
			? path.posix.basename(filePath)
			: path.basename(filePath)
		const command = [
			`cd ${quoteShellArg(projectDirectory)}`,
			`docker compose -f ${quoteShellArg(composeFileName)} ${composeArgs.map(quoteShellArg).join(' ')}`,
		].join(' && ')
		return transport === 'ssh'
			? runSshShellCommand(command, {timeoutMs})
			: runLocalShellCommand(command, {timeoutMs})
	}

	function runLocalShellCommand(command, {timeoutMs = 10000} = {}) {
		return runCommand('sh', ['-c', command], {timeoutMs})
	}

	function runSshDockerCommand(dockerArgs, {timeoutMs = 10000} = {}) {
		return runCommand('ssh', buildSshCommandArgs(buildShellCommand(['docker', ...dockerArgs])), {timeoutMs})
	}

	function runSshShellCommand(command, {timeoutMs = 10000} = {}) {
		return runCommand('ssh', buildSshCommandArgs(command), {timeoutMs})
	}

	function runSshShellCommandWithStdin(command, stdin, {timeoutMs = 10000} = {}) {
		return runCommandWithStdin('ssh', buildSshCommandArgs(command), stdin, {timeoutMs})
	}

	function buildSshCommandArgs(command) {
		const sshArgs = []
		if (Number.isFinite(Number(vikunjaSshPort)) && Number(vikunjaSshPort) > 0) {
			sshArgs.push('-p', String(Number(vikunjaSshPort)))
		}
		if (`${vikunjaSshKeyPath || ''}`.trim()) {
			sshArgs.push('-i', `${vikunjaSshKeyPath}`.trim())
		}
		sshArgs.push(`${vikunjaSshDestination}`.trim())
		sshArgs.push(command)
		return sshArgs
	}
}

function buildMailerConfig(mailer, envVars, capabilities, {markEnvOverrides = true} = {}) {
	return {
		enabled: resolveConfigValue(mailer.enabled, envVars, 'VIKUNJA_MAILER_ENABLED', false),
		host: resolveConfigValue(mailer.host, envVars, 'VIKUNJA_MAILER_HOST', ''),
		port: resolveConfigValue(mailer.port, envVars, 'VIKUNJA_MAILER_PORT', 587),
		authType: resolveConfigValue(mailer.authtype, envVars, 'VIKUNJA_MAILER_AUTHTYPE', 'plain'),
		username: resolveConfigValue(mailer.username, envVars, 'VIKUNJA_MAILER_USERNAME', ''),
		passwordConfigured: Boolean(
			`${mailer.password || ''}`.trim() ||
			`${envVars.VIKUNJA_MAILER_PASSWORD || ''}`.trim(),
		),
		skipTlsVerify: resolveConfigValue(mailer.skiptlsverify, envVars, 'VIKUNJA_MAILER_SKIPTLSVERIFY', false),
		fromEmail: resolveConfigValue(mailer.fromemail, envVars, 'VIKUNJA_MAILER_FROMEMAIL', ''),
		forceSsl: resolveConfigValue(mailer.forcessl, envVars, 'VIKUNJA_MAILER_FORCESSL', false),
		envOverrides: markEnvOverrides
			? Object.entries(MAILER_ENV_FIELD_MAP)
				.filter(([envKey]) => Object.prototype.hasOwnProperty.call(envVars, envKey))
				.map(([, field]) => field)
			: [],
		capabilities,
	}
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

function normalizeConfigDocument(value) {
	return isRecord(value) ? {...value} : {}
}

function normalizeServicesDocument(value) {
	return isRecord(value) ? {...value} : {}
}

function normalizeComposeEnvironment(value) {
	if (Array.isArray(value)) {
		return value.reduce((collected, entry) => {
			const line = `${entry || ''}`
			const index = line.indexOf('=')
			if (index === -1) {
				return collected
			}
			collected[line.slice(0, index)] = line.slice(index + 1)
			return collected
		}, {})
	}

	if (isRecord(value)) {
		return {...value}
	}

	return {}
}

function extractMailerEnvVars(environment) {
	return Object.keys(MAILER_ENV_FIELD_MAP).reduce((collected, envKey) => {
		if (Object.prototype.hasOwnProperty.call(environment, envKey)) {
			collected[envKey] = `${environment[envKey] ?? ''}`
		}
		return collected
	}, {})
}

function resolveComposeService(document, targetContainerNameInput = '') {
	const services = normalizeServicesDocument(document.services)
	const entries = Object.entries(services).filter(([, value]) => isRecord(value))
	if (entries.length === 0) {
		throw createComposeConfigError('No services were found in the configured Docker Compose file.')
	}

	const targetContainerName = `${targetContainerNameInput || ''}`.trim()
	const byContainerName = entries.find(([, value]) => {
		const configuredName = `${value.container_name || value.containerName || ''}`.trim()
		return configuredName && configuredName === targetContainerName
	})
	if (byContainerName) {
		return {
			serviceName: byContainerName[0],
			serviceConfig: {...byContainerName[1]},
		}
	}

	if (entries.length === 1) {
		return {
			serviceName: entries[0][0],
			serviceConfig: {...entries[0][1]},
		}
	}

	const byImage = entries.find(([, value]) => `${value.image || ''}`.toLowerCase().includes('vikunja'))
	if (byImage) {
		return {
			serviceName: byImage[0],
			serviceConfig: {...byImage[1]},
		}
	}

	return {
		serviceName: entries[0][0],
		serviceConfig: {...entries[0][1]},
	}
}

function isRecord(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePort(value) {
	const nextPort = Number(value)
	return Number.isFinite(nextPort) && nextPort > 0 ? Math.trunc(nextPort) : 587
}

function resolveConfigValue(yamlValue, envVars, envKey, defaultValue) {
	if (Object.prototype.hasOwnProperty.call(envVars, envKey)) {
		const envValue = envVars[envKey]
		if (typeof defaultValue === 'boolean') {
			return ['1', 'true', 'yes', 'on'].includes(`${envValue}`.trim().toLowerCase())
		}
		if (typeof defaultValue === 'number') {
			const parsed = Number(envValue)
			return Number.isFinite(parsed) ? parsed : defaultValue
		}
		return `${envValue || ''}`
	}

	if (yamlValue !== undefined && yamlValue !== null) {
		return yamlValue
	}

	return defaultValue
}

function assertMailerCapability(capabilities, key) {
	if (capabilities?.[key]) {
		return
	}

	const reasonCode = `${capabilities?.reasonCode || ''}`.trim()
	const error = new Error(resolveMailerCapabilityMessage(key, reasonCode))
	error.statusCode = reasonCode === 'no_bridge' ? 503 : 409
	error.details = {
		reasonCode: reasonCode || null,
	}
	throw error
}

function resolveMailerCapabilityMessage(key, reasonCode) {
	if (reasonCode === 'no_bridge') {
		return key === 'canApply'
			? 'SMTP changes cannot be applied until the Vikunja admin bridge is configured correctly.'
			: 'SMTP configuration is unavailable until the Vikunja admin bridge is configured correctly.'
	}
	if (reasonCode === 'no_config_path') {
		return 'SMTP settings are read-only because no writable deployment config source is configured.'
	}
	if (reasonCode === 'unsupported_source_mode') {
		return 'SMTP settings are unavailable because the configured admin-config source is incomplete.'
	}
	return 'SMTP configuration is not available for this deployment.'
}

function parseJsonArray(value) {
	if (!value) {
		return null
	}

	try {
		const parsed = JSON.parse(value)
		return Array.isArray(parsed) ? parsed : null
	} catch {
		return null
	}
}

function createFileError(message, cause) {
	const error = new Error(message)
	error.statusCode = 500
	error.details = {
		cause: cause?.message || null,
		code: cause?.code || null,
	}
	return error
}

function createComposeConfigError(message) {
	const error = new Error(message)
	error.statusCode = 500
	return error
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

function runCommandWithStdin(command, args, stdin, {timeoutMs = 10000} = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
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
		child.stdin.on('error', error => {
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
		child.on('spawn', () => {
			child.stdin.end(`${stdin ?? ''}`, 'utf8')
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

import {spawn} from 'node:child_process'
import {mkdtemp, rm} from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {setTimeout as delay} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'
import {createMockAdminBridge} from './mock-admin-bridge.mjs'
import {createMockVikunjaServer} from './mock-vikunja-server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
let buildPromise = null

export async function startTestStack({
	legacyConfigured = true,
	mockVikunjaOptions = {},
	mockAdminBridge = false,
	envOverrides = {},
} = {}) {
	const mock = await createMockVikunjaServer(mockVikunjaOptions)
	const appPort = await getFreePort()
	const tempDir = await mkdtemp(path.join(os.tmpdir(), 'vikunja-pwa-tests-'))
	const appUrl = `http://127.0.0.1:${appPort}`
	let logs = ''
	const adminBridge = mockAdminBridge
		? await createMockAdminBridge(
			tempDir,
			typeof mockAdminBridge === 'object' ? mockAdminBridge : {},
		)
		: null

	await runBuildOnce(log => {
		logs += log
	})

	const appProcess = spawn(process.execPath, ['server.mjs'], {
		cwd: repoRoot,
		env: {
			...process.env,
			HOST: '127.0.0.1',
			PORT: String(appPort),
			APP_PUBLIC_ORIGIN: appUrl,
			APP_HTTPS_KEY_PATH: '',
			APP_HTTPS_CERT_PATH: '',
			COOKIE_SECURE: 'false',
			PUBLIC_DIR: path.join(repoRoot, 'dist'),
			VIKUNJA_BASE_URL: legacyConfigured ? mock.origin : '',
			VIKUNJA_DEFAULT_BASE_URL: mock.origin,
			VIKUNJA_API_TOKEN: legacyConfigured ? 'smoke-token' : '',
			VIKUNJA_BRIDGE_MODE: '',
			VIKUNJA_CONTAINER_NAME: '',
			VIKUNJA_CLI_PATH: '',
			VIKUNJA_SSH_DESTINATION: '',
			VIKUNJA_SSH_PORT: '',
			VIKUNJA_SSH_KEY_PATH: '',
			VIKUNJA_HOST_CONFIG_PATH: '',
			VIKUNJA_COMPOSE_PATH: '',
			ADMIN_BRIDGE_ALLOWED_EMAILS: 'smoke@example.test',
			APP_SESSION_STORE_PATH: path.join(tempDir, 'sessions.enc'),
			APP_SESSION_KEY_PATH: path.join(tempDir, 'sessions.key'),
			LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
			LOGIN_RATE_LIMIT_MAX: legacyConfigured ? '2' : '100',
			SESSION_MUTATION_RATE_LIMIT_WINDOW_SECONDS: '60',
			SESSION_MUTATION_RATE_LIMIT_MAX: '5',
			PATH: adminBridge
				? `${adminBridge.binDir}${path.delimiter}${process.env.PATH || ''}`
				: process.env.PATH,
			...(adminBridge?.env || {}),
			...envOverrides,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	})

	appProcess.stdout.on('data', chunk => {
		logs += chunk.toString()
	})
	appProcess.stderr.on('data', chunk => {
		logs += chunk.toString()
	})

	await waitForHealthy(`${appUrl}/api/config`, appProcess, () => logs)

	return {
		appUrl,
		mock,
		async api(pathname, options = {}) {
			const response = await fetch(new URL(pathname, appUrl), options)
			const text = await response.text()
			const payload = text ? JSON.parse(text) : null
			if (!response.ok) {
				const error = new Error(`App request failed with ${response.status}`)
				error.statusCode = response.status
				error.payload = payload
				throw error
			}
			return payload
		},
		async mockApi(pathname, options = {}) {
			const response = await fetch(new URL(pathname, `${mock.origin}/api/v1/`), options)
			const text = await response.text()
			const payload = text ? JSON.parse(text) : null
			if (!response.ok) {
				const error = new Error(`Mock request failed with ${response.status}`)
				error.statusCode = response.status
				error.payload = payload
				throw error
			}
			return payload
		},
		async stop() {
			mock.reset()
			adminBridge?.reset()
			await stopProcess(appProcess)
			await mock.close()
			await rm(tempDir, {recursive: true, force: true})
		},
		reset() {
			mock.reset()
			adminBridge?.reset()
		},
		getLogs() {
			return logs
		},
		adminBridge,
	}
}

async function runBuildOnce(onOutput) {
	if (!buildPromise) {
		buildPromise = runBuild(onOutput).catch(error => {
			buildPromise = null
			throw error
		})
	} else {
		buildPromise = buildPromise.then(() => undefined)
	}

	await buildPromise
}

async function runBuild(onOutput) {
	const buildProcess = spawn('npm', ['run', 'build'], {
		cwd: repoRoot,
		stdio: ['ignore', 'pipe', 'pipe'],
	})

	buildProcess.stdout.on('data', chunk => {
		onOutput(chunk.toString())
	})
	buildProcess.stderr.on('data', chunk => {
		onOutput(chunk.toString())
	})

	const exitCode = await new Promise((resolve, reject) => {
		buildProcess.on('error', reject)
		buildProcess.on('close', resolve)
	})

	if (exitCode !== 0) {
		throw new Error('Build failed before starting tests.')
	}
}

async function waitForHealthy(url, childProcess, getLogs) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (childProcess.exitCode !== null) {
			throw new Error(`App server exited early.\n${getLogs()}`)
		}

		try {
			const response = await fetch(url)
			if (response.ok) {
				return
			}
		} catch {
			// Keep polling until the server is ready.
		}

		await delay(100)
	}

	throw new Error(`Timed out waiting for app server.\n${getLogs()}`)
}

function getFreePort() {
	return new Promise((resolve, reject) => {
		const server = http.createServer()
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const {port} = server.address()
			server.close(error => {
				if (error) {
					reject(error)
					return
				}
				resolve(port)
			})
		})
	})
}

async function stopProcess(childProcess) {
	if (childProcess.exitCode !== null) {
		return
	}

	childProcess.kill('SIGTERM')
	for (let attempt = 0; attempt < 30; attempt += 1) {
		if (childProcess.exitCode !== null) {
			return
		}
		await delay(100)
	}

	childProcess.kill('SIGKILL')
}

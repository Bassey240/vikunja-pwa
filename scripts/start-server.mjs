import net from 'node:net'

const PORT = Number(process.env.PORT || 4300)
const HOST = process.env.HOST || '0.0.0.0'

const portAvailable = await ensurePortAvailable(PORT, HOST)
if (portAvailable) {
	await import('../server.mjs')
}

function ensurePortAvailable(port, host) {
	return new Promise((resolve, reject) => {
		const socket = new net.Socket()
		let settled = false

		socket.once('connect', () => {
			settled = true
			socket.destroy()
			console.error(
				[
					`Port ${port} is already in use.`,
					'The app is likely already running in another terminal.',
					`Open http://127.0.0.1:${port} or stop the existing process first.`,
					`Inspect: lsof -nP -iTCP:${port} -sTCP:LISTEN`,
				].join('\n'),
			)
			process.exitCode = 0
			resolve(false)
		})

		socket.once('error', error => {
			if (settled) {
				return
			}
			if (error && typeof error === 'object' && 'code' in error && error.code === 'ECONNREFUSED') {
				settled = true
				resolve(true)
				return
			}
			if (error && typeof error === 'object' && 'code' in error && error.code === 'EHOSTUNREACH') {
				settled = true
				resolve(true)
				return
			}
			if (error && typeof error === 'object' && 'code' in error && error.code === 'ETIMEDOUT') {
				settled = true
				resolve(true)
				return
			}
			if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
				console.error(
					[
						`Port ${port} is already in use.`,
						'The app is likely already running in another terminal.',
						`Open http://127.0.0.1:${port} or stop the existing process first.`,
						`Inspect: lsof -nP -iTCP:${port} -sTCP:LISTEN`,
					].join('\n'),
				)
				process.exitCode = 0
				resolve(false)
				return
			}

			reject(error)
		})

		socket.connect({port, host: '127.0.0.1'})
	})
}

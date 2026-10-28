// Only forward invalidations; credentials and upstream payloads stay in the gateway.
export async function streamVikunjaEvents({res, url, getAccessToken, timersEnabled, isSessionValid, onAuthFailure}) {
	const events = ['notification.created']
	if (timersEnabled) events.push('timer.created', 'timer.updated', 'timer.deleted')
	let socket
	let stopped = false
	let authenticated = false
	let heartbeat
	let authTimeout

	const stop = () => {
		if (stopped) return
		stopped = true
		clearTimeout(authTimeout)
		clearInterval(heartbeat)
		socket?.close()
		if (!res.destroyed && !res.writableEnded) res.end()
	}
	const rejectAuth = () => {
		if (stopped) return
		onAuthFailure()
		res.write('event: auth-error\ndata: {}\n\n')
		stop()
	}
	const sendEvent = name => {
		if (stopped) return
		if (!isSessionValid()) return rejectAuth()
		res.write(`event: ${name}\ndata: {}\n\n`)
	}

	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache, no-transform',
		'X-Accel-Buffering': 'no',
	})
	res.flushHeaders()
	res.on('close', stop)
	authTimeout = setTimeout(stop, 10_000)
	heartbeat = setInterval(() => {
		if (!isSessionValid()) return rejectAuth()
		res.write(': keepalive\n\n')
	}, 30_000)

	try {
		const token = await getAccessToken()
		if (stopped) return
		if (!isSessionValid()) return rejectAuth()
		socket = new WebSocket(url)
		socket.addEventListener('open', () => {
			if (!stopped) socket.send(JSON.stringify({action: 'auth', token}))
		})
		socket.addEventListener('message', message => {
			if (stopped) return
			let payload
			try {
				payload = JSON.parse(message.data)
			} catch {
				return stop()
			}
			if (payload.error === 'invalid_token') return rejectAuth()
			if (!authenticated && payload.action === 'auth.success' && payload.success === true) {
				authenticated = true
				clearTimeout(authTimeout)
				for (const event of events) socket.send(JSON.stringify({action: 'subscribe', event}))
				sendEvent('ready')
			} else if (authenticated && events.includes(payload.event)) {
				sendEvent(payload.event)
			}
		})
		socket.addEventListener('error', stop)
		socket.addEventListener('close', stop)
	} catch (error) {
		if (error.statusCode === 401) rejectAuth()
		else stop()
	}
}

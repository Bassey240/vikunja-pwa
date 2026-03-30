import {createReadStream} from 'node:fs'
import {stat} from 'node:fs/promises'
import path from 'node:path'

export async function serveStatic(publicDir, res, url, sendJson) {
	const relativePath = url.pathname === '/' ? '/index.html' : url.pathname
	let filePath = path.normalize(path.join(publicDir, relativePath))

	if (!filePath.startsWith(publicDir)) {
		sendJson(res, 403, {error: 'Forbidden'})
		return
	}

	try {
		const fileStat = await stat(filePath)
		if (fileStat.isDirectory()) {
			filePath = path.join(publicDir, 'index.html')
		}
	} catch {
		if (serveMissingAssetRecovery(res, url.pathname)) {
			return
		}

		if (!shouldServeAppShell(url.pathname, res)) {
			sendJson(res, 404, {error: 'Not found'})
			return
		}

		filePath = path.join(publicDir, 'index.html')
	}

	try {
		const fallbackStat = await stat(filePath)
		if (fallbackStat.isDirectory()) {
			sendJson(res, 404, {error: 'Not found'})
			return
		}
	} catch {
		sendJson(res, 404, {error: 'Not found'})
		return
	}

	const headers = {
		'Content-Type': getContentType(filePath),
		'Cache-Control': getCacheControl(filePath),
	}
	if (isAppShellFile(filePath)) {
		headers.Pragma = 'no-cache'
		headers.Expires = '0'
	}

	res.writeHead(200, headers)
	createReadStream(filePath).pipe(res)
}

function serveMissingAssetRecovery(res, pathname) {
	if (!pathname.startsWith('/assets/')) {
		return false
	}

	if (pathname.endsWith('.js')) {
		res.writeHead(200, {
			'Content-Type': 'application/javascript; charset=utf-8',
			'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
			Pragma: 'no-cache',
			Expires: '0',
		})
		res.end(buildAssetRecoveryScript())
		return true
	}

	if (pathname.endsWith('.css')) {
		res.writeHead(200, {
			'Content-Type': 'text/css; charset=utf-8',
			'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
			Pragma: 'no-cache',
			Expires: '0',
		})
		res.end('/* stale asset recovery placeholder */')
		return true
	}

	return false
}

function buildAssetRecoveryScript() {
	return `;(async () => {
  const key = 'vikunja-pwa-stale-asset-recovery-at'
  const now = Date.now()
  try {
    const previous = Number(window.sessionStorage?.getItem(key) || '0')
    window.sessionStorage?.setItem(key, String(now))
    if (previous && now - previous < 10000) {
      window.location.replace('/')
      return
    }
  } catch {}

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister()))
    }
  } catch {}

  try {
    if ('caches' in window) {
      const cacheKeys = await caches.keys()
      await Promise.all(cacheKeys.map(cacheKey => caches.delete(cacheKey)))
    }
  } catch {}

  window.location.replace('/')
})()`
}

function getContentType(filePath) {
	if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
	if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
	if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8'
	if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
	if (filePath.endsWith('.webmanifest')) return 'application/manifest+json; charset=utf-8'
	if (filePath.endsWith('.svg')) return 'image/svg+xml'
	if (filePath.endsWith('.png')) return 'image/png'
	if (filePath.endsWith('.ico')) return 'image/x-icon'
	return 'application/octet-stream'
}

function getCacheControl(filePath) {
	if (isAppShellFile(filePath)) {
		return 'no-store, no-cache, must-revalidate, max-age=0'
	}

	return 'public, max-age=86400'
}

function isAppShellFile(filePath) {
	return (
		filePath.endsWith('.html') ||
		filePath.endsWith('.css') ||
		filePath.endsWith('.js') ||
		filePath.endsWith('.json') ||
		filePath.endsWith('.webmanifest')
	)
}

function shouldServeAppShell(pathname, res) {
	if (pathname === '/') {
		return true
	}

	if (path.extname(pathname)) {
		return false
	}

	const method = `${res.req?.method || 'GET'}`.toUpperCase()
	return method === 'GET' || method === 'HEAD'
}

const SHELL_CACHE = 'vikunja-pwa-shell-v3'
const STATIC_CACHE = 'vikunja-pwa-static-v3'
const APP_SHELL_URLS = [
	'/',
	'/index.html',
	'/manifest.webmanifest',
	'/apple-touch-icon.png?v=20260320-3',
	'/apple-touch-icon-precomposed.png?v=20260320-3',
	'/icons/icon-192.png?v=20260320-3',
	'/icons/icon-512.png?v=20260320-3',
	'/icons/icon-1024.png?v=20260320-3',
]

self.addEventListener('install', event => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(SHELL_CACHE)
			await Promise.all(
				APP_SHELL_URLS.map(async url => {
					try {
						await cache.add(url)
					} catch {
						// Ignore individual precache failures so install can still complete.
					}
				}),
			)
			await self.skipWaiting()
		})(),
	)
})

self.addEventListener('activate', event => {
	event.waitUntil(
		(async () => {
			const cacheKeys = await caches.keys()
			await Promise.all(
				cacheKeys
					.filter(cacheKey => cacheKey !== SHELL_CACHE && cacheKey !== STATIC_CACHE)
					.map(cacheKey => caches.delete(cacheKey)),
			)
			await self.clients.claim()
		})(),
	)
})

self.addEventListener('message', event => {
	if (event.data?.type === 'SKIP_WAITING') {
		void self.skipWaiting()
		return
	}

	if (event.data?.type === 'PRECACHE_URLS' && Array.isArray(event.data.urls)) {
		event.waitUntil(precacheUrls(event.data.urls))
	}
})

self.addEventListener('fetch', event => {
	const {request} = event
	if (request.method !== 'GET') {
		return
	}

	const url = new URL(request.url)
	if (url.origin !== self.location.origin) {
		return
	}

	if (url.pathname.startsWith('/api/')) {
		return
	}

	if (request.mode === 'navigate') {
		event.respondWith(handleNavigationRequest(request))
		return
	}

	if (
		request.destination === 'script' ||
		request.destination === 'style' ||
		request.destination === 'font' ||
		request.destination === 'image' ||
		request.destination === 'worker' ||
		url.pathname.startsWith('/assets/') ||
		url.pathname.startsWith('/icons/')
	) {
		event.respondWith(handleStaticAssetRequest(request))
	}
})

async function handleNavigationRequest(request) {
	try {
		const networkResponse = await fetch(request)
		const cache = await caches.open(SHELL_CACHE)
		cache.put('/index.html', networkResponse.clone()).catch(() => {})
		return networkResponse
	} catch {
		return (await caches.match(request)) || (await caches.match('/index.html')) || (await caches.match('/'))
	}
}

async function handleStaticAssetRequest(request) {
	const cache = await caches.open(STATIC_CACHE)
	const cachedResponse = await cache.match(request)

	const networkFetch = fetch(request)
		.then(response => {
			if (response.ok) {
				cache.put(request, response.clone()).catch(() => {})
			}
			return response
		})
		.catch(() => null)

	if (cachedResponse) {
		void networkFetch
		return cachedResponse
	}

	const networkResponse = await networkFetch
	if (networkResponse) {
		return networkResponse
	}

	return Response.error()
}

async function precacheUrls(urls) {
	const shellCache = await caches.open(SHELL_CACHE)
	const staticCache = await caches.open(STATIC_CACHE)
	const uniqueUrls = [...new Set(urls.filter(url => typeof url === 'string' && url.trim().length > 0))]

	await Promise.all(
		uniqueUrls.map(async url => {
			try {
				const response = await fetch(url, {cache: 'no-store'})
				if (!response.ok) {
					return
				}

				if (url === '/' || url.endsWith('/index.html') || !/\.[a-z0-9]+$/i.test(new URL(url, self.location.origin).pathname)) {
					await shellCache.put(url, response.clone())
					if (url !== '/index.html') {
						await shellCache.put('/index.html', response.clone())
					}
					return
				}

				await staticCache.put(url, response.clone())
			} catch {
				// Ignore individual runtime precache failures.
			}
		}),
	)
}

export type RouteCategory = 'proxy' | 'gateway-only' | 'session-auth' | 'health'

const GATEWAY_ONLY_PREFIXES = [
	'/api/admin/',
	'/api/session/webhooks',
	'/api/session/totp/',
	'/api/session/caldav-tokens',
	'/api/session/settings/email',
]

const SESSION_AUTH_PREFIXES = [
	'/api/session/login',
	'/api/session/register',
	'/api/session/logout',
	'/api/session/auth-info',
	'/api/session/openid/',
	'/api/session/forgot-password',
	'/api/session/reset-password',
]

const GATEWAY_HEALTH_PATHS = new Set(['/health', '/api/session'])

export function classifyRoute(path: string): RouteCategory {
	if (GATEWAY_HEALTH_PATHS.has(path)) {
		return 'health'
	}
	if (GATEWAY_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
		return 'gateway-only'
	}
	if (SESSION_AUTH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
		return 'session-auth'
	}
	return 'proxy'
}

export function mapToVikunjaPath(path: string): string {
	if (!path.startsWith('/api/')) {
		return path
	}
	return `/api/v1/${path.slice('/api/'.length)}`
}

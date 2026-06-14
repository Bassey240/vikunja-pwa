import assert from 'node:assert/strict'
import test from 'node:test'
import {
	classifyRoute,
	mapToVikunjaPath,
} from '../../src/api/routeClassification.ts'

test('classifyRoute: admin routes are gateway-only', () => {
	assert.equal(classifyRoute('/api/admin/migrate'), 'gateway-only')
	assert.equal(classifyRoute('/api/admin/migrate/rollback'), 'gateway-only')
	assert.equal(classifyRoute('/api/admin/dump'), 'gateway-only')
	assert.equal(classifyRoute('/api/admin/restore'), 'gateway-only')
})

test('classifyRoute: gateway-only session features are gateway-only', () => {
	assert.equal(classifyRoute('/api/session/webhooks'), 'gateway-only')
	assert.equal(classifyRoute('/api/session/webhooks/42'), 'gateway-only')
	assert.equal(classifyRoute('/api/session/totp/enable'), 'gateway-only')
	assert.equal(classifyRoute('/api/session/totp/disable'), 'gateway-only')
	assert.equal(classifyRoute('/api/session/caldav-tokens/9'), 'gateway-only')
	assert.equal(
		classifyRoute('/api/session/settings/email'),
		'gateway-only',
	)
})

test('classifyRoute: session-mediated auth is session-auth', () => {
	assert.equal(classifyRoute('/api/session/login'), 'session-auth')
	assert.equal(classifyRoute('/api/session/register'), 'session-auth')
	assert.equal(classifyRoute('/api/session/logout'), 'session-auth')
	assert.equal(classifyRoute('/api/session/auth-info'), 'session-auth')
	assert.equal(classifyRoute('/api/session/openid/callback'), 'session-auth')
	assert.equal(classifyRoute('/api/session/forgot-password'), 'session-auth')
	assert.equal(classifyRoute('/api/session/reset-password'), 'session-auth')
})

test('classifyRoute: gateway health/probe paths are health', () => {
	assert.equal(classifyRoute('/health'), 'health')
	assert.equal(classifyRoute('/api/session'), 'health')
})

test('classifyRoute: standard Vikunja resources are proxy', () => {
	assert.equal(classifyRoute('/api/projects/12'), 'proxy')
	assert.equal(classifyRoute('/api/projects/12/tasks'), 'proxy')
	assert.equal(classifyRoute('/api/tasks/99'), 'proxy')
	assert.equal(classifyRoute('/api/tasks/bulk'), 'proxy')
	assert.equal(classifyRoute('/api/filters/3'), 'proxy')
	assert.equal(classifyRoute('/api/notifications'), 'proxy')
	assert.equal(classifyRoute('/api/tokens/7'), 'proxy')
	assert.equal(classifyRoute('/api/user/export/request'), 'proxy')
	assert.equal(classifyRoute('/api/user/deletion/cancel'), 'proxy')
})

test('classifyRoute: project webhooks are proxy (Vikunja-native, not gateway)', () => {
	// Important: project-level webhooks live on Vikunja itself; only
	// user/server-level session/webhooks is gateway-only.
	assert.equal(
		classifyRoute('/api/projects/12/webhooks'),
		'proxy',
	)
	assert.equal(
		classifyRoute('/api/projects/12/webhooks/4'),
		'proxy',
	)
})

test('mapToVikunjaPath: prepends /api/v1/ to /api/ paths', () => {
	assert.equal(mapToVikunjaPath('/api/tasks/1'), '/api/v1/tasks/1')
	assert.equal(
		mapToVikunjaPath('/api/projects/12/views/3/buckets/4/tasks'),
		'/api/v1/projects/12/views/3/buckets/4/tasks',
	)
	assert.equal(mapToVikunjaPath('/api/notifications'), '/api/v1/notifications')
})

test('mapToVikunjaPath: leaves non-/api/ paths untouched', () => {
	assert.equal(mapToVikunjaPath('/health'), '/health')
	assert.equal(mapToVikunjaPath('/static/foo.png'), '/static/foo.png')
})

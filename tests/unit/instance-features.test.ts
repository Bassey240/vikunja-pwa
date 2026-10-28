import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
	PRO_FEATURE_SITE_ADMIN_BYPASS,
	PRO_FEATURE_TIME_TRACKING,
	getEnabledProFeatures,
	hasEnabledProFeature,
	hasProFeature,
} from '../../src/utils/instance-features.ts'

test('a server with no licensed features reports none', () => {
	// This is what a free-tier 2.4 instance returns.
	assert.deepEqual(getEnabledProFeatures({enabled_pro_features: []}), [])
	assert.equal(hasProFeature({enabled_pro_features: []}, PRO_FEATURE_SITE_ADMIN_BYPASS), false)
})

test('pre-2.4 servers that omit the field report none rather than throwing', () => {
	assert.deepEqual(getEnabledProFeatures({}), [])
	assert.deepEqual(getEnabledProFeatures(null), [])
	assert.equal(hasProFeature(null, PRO_FEATURE_SITE_ADMIN_BYPASS), false)
})

test('licensed features are reported and matched case-insensitively', () => {
	const info = {enabled_pro_features: ['SiteAdminBypass', 'something_else']}
	assert.deepEqual(getEnabledProFeatures(info), ['siteadminbypass', 'something_else'])
	assert.equal(hasProFeature(info, 'siteadminbypass'), true)
	assert.equal(hasProFeature(info, 'SITEADMINBYPASS'), true)
	assert.equal(hasProFeature(info, 'time_tracking'), false)
})

test('malformed payloads are ignored instead of crashing feature gates', () => {
	assert.deepEqual(getEnabledProFeatures({enabled_pro_features: 'nope' as unknown as string[]}), [])
	assert.deepEqual(getEnabledProFeatures({enabled_pro_features: [null, 42, ' padded '] as unknown as string[]}), ['padded'])
})

test('the store-shaped gate reads an already-normalized feature list', () => {
	// Account.instanceFeatures.enabledProFeatures, not a raw /info payload.
	assert.equal(hasEnabledProFeature(['time_tracking'], PRO_FEATURE_TIME_TRACKING), true)
	assert.equal(hasEnabledProFeature(['Time_Tracking'], PRO_FEATURE_TIME_TRACKING), true)
	assert.equal(hasEnabledProFeature([], PRO_FEATURE_TIME_TRACKING), false)
	assert.equal(hasEnabledProFeature(null, PRO_FEATURE_TIME_TRACKING), false)
	assert.equal(hasEnabledProFeature(undefined, PRO_FEATURE_TIME_TRACKING), false)
})

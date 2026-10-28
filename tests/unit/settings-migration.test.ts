import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {test} from 'node:test'
import {build} from 'esbuild'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

// Compile the actual shared component for rendering with Node's test runner.
const require = createRequire(import.meta.url)
const result = await build({
	entryPoints: [fileURLToPath(new URL('../../src/components/screens/settings/SettingsMigrationSection.tsx', import.meta.url))],
	bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
	alias: {'@': fileURLToPath(new URL('../../src', import.meta.url))},
	plugins: [{name: 'shared-react', setup(builder) {
		builder.onResolve({filter: /^react(?:\/.*)?$/}, args => ({path: pathToFileURL(require.resolve(args.path)).href, external: true}))
	}}],
})
const {default: MigrationSection} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

function render(nativeOnly: boolean, available: string[]) {
	return renderToStaticMarkup(createElement(MigrationSection, {
		open: true, nativeOnly, onToggle() {},
		availableMigrationServices: new Set(available), migrationAvailabilityResolved: true,
		vikunjaInfoLoading: false, publicAppOrigin: 'https://pwa.test', canManageUsers: true,
		migrationStatus: {planka: 'running'}, migrationMessages: {planka: 'Import running'},
		migrationDetails: {planka: {started_at: '2026-10-08T08:00:00Z'}},
		migrationLoadingServices: new Set(), migrationSubmittingServices: new Set(),
	}))
}

test('native migration offers advertised credential, file and CSV imports without browser callbacks', () => {
	const html = render(true, ['planka', 'todoist', 'trello', 'microsoft-todo', 'csv', 'ticktick', 'wekan', 'vikunja-file'])
	assert.deepEqual([...html.matchAll(/data-migration-service="([^"]+)"/g)].map(match => match[1]), ['planka', 'ticktick', 'wekan', 'csv', 'vikunja-file'])
	assert.match(html, /Planka API key/)
	assert.match(html, /Import from Planka/)
	assert.match(html, /Import running/)
	assert.match(html, /Updates automatically/)
	assert.match(html, /Guided CSV import/)
	assert.doesNotMatch(html, /PWA callback|Administration|OAuth|Enable provider/)
})

test('native migration retains advertised legacy file import without showing unavailable providers', () => {
	const html = render(true, ['todoist', 'ticktick'])
	assert.deepEqual([...html.matchAll(/data-migration-service="([^"]+)"/g)].map(match => match[1]), ['ticktick'])
	assert.doesNotMatch(html, /Import from Planka|Enable provider|OAuth/)
})

test('native migration has no actions when only browser importers are advertised', () => {
	const html = render(true, ['todoist'])
	assert.doesNotMatch(html, /data-migration-service=|Refresh status|Enable provider/)
	assert.match(html, /No importers are enabled/)
})

test('PWA migration retains its advertised importers and provider guidance', () => {
	const html = render(false, ['planka', 'todoist', 'csv', 'ticktick'])
	for (const service of ['planka', 'todoist', 'csv', 'ticktick']) assert.match(html, new RegExp(`data-migration-service="${service}"`))
	assert.match(html, /Recommended PWA callback/)
	assert.match(html, /Enable provider/)
})

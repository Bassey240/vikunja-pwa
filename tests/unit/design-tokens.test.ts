import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

// Guards the design-token invariants from the single-card-token + dark-hairline
// study (docs/flat-design-language.md, internal/docs/ui-contrast-guidelines.md):
// every card shares one fill token, --bg-soft is never a bare card fill, the
// calendar planes use the page background, and the dark hairline ramp is never
// dimmer than the light one. These are visual rules a build can't catch.

const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/styles.css')
// Strip block comments so token names in explanatory comments don't count as usages.
const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// Declaration bodies for every occurrence of an exact selector. A selector can
// repeat (a base rule plus state/media overrides); each block is captured by
// brace-counting from its own opening brace.
function ruleBodies(selector: string): string[] {
	const bodies: string[] = []
	const needle = `${selector} {`
	for (let idx = css.indexOf(needle); idx !== -1; idx = css.indexOf(needle, idx + needle.length)) {
		const before = css[idx - 1]
		// Reject partial matches (".foo" inside ".bar-foo"); allow block boundaries.
		if (before !== undefined && !/[\s{};,]/.test(before)) {
			continue
		}
		const open = css.indexOf('{', idx)
		let depth = 1
		let i = open + 1
		for (; i < css.length && depth > 0; i++) {
			if (css[i] === '{') depth++
			else if (css[i] === '}') depth--
		}
		bodies.push(css.slice(open + 1, i - 1))
	}
	return bodies
}

// Every background value declared on any rule whose selector ends in `selector`
// (base plus state/media variants).
function fills(selector: string): string[] {
	const values: string[] = []
	for (const body of ruleBodies(selector)) {
		for (const match of body.matchAll(/background:\s*([^;]+);/g)) {
			values.push(match[1].trim())
		}
	}
	assert.ok(values.length > 0, `expected at least one background for ${selector}`)
	return values
}

test('--bg-soft is never a bare card fill (single card token; tint-only)', () => {
	const bare = css.match(/background:\s*var\(--bg-soft\)\s*;/g) || []
	assert.equal(bare.length, 0, `--bg-soft must only appear inside color-mix tints, found ${bare.length} bare fills`)
})

test('kanban cards + column heads have a --surface-card base and never --bg-soft', () => {
	// Accent state variants (drop-target, completing) are allowed; the regression
	// guarded against is the old brighter kanban grey (--bg-soft).
	for (const selector of ['.kanban-task-frame', '.kanban-lane-head']) {
		const values = fills(selector)
		assert.ok(values.includes('var(--surface-card)'), `${selector} needs a --surface-card base fill`)
		assert.ok(!values.some(value => value.includes('var(--bg-soft)')), `${selector} must not fill with --bg-soft`)
	}
})

test('calendar content cards use --surface-card', () => {
	for (const value of fills('.calendar-board-chip')) {
		assert.equal(value, 'var(--surface-card)')
	}
})

test('calendar structural planes use the page background --bg', () => {
	for (const selector of ['.calendar-board-timeline', '.calendar-day-cell', '.calendar-weeknum']) {
		for (const value of fills(selector)) {
			assert.equal(value, 'var(--bg)', `${selector} plane must use --bg`)
		}
	}
})

test('dark hairlines are lifted at or above the light ramp', () => {
	const [lightRoot] = ruleBodies(':root[data-theme="light"]')
	assert.ok(lightRoot, 'expected a :root[data-theme="light"] block')
	for (const token of ['--hairline', '--hairline-2', '--stroke']) {
		// Dark tokens live in the default :root block as white rgba; light uses black rgba.
		const dark = Number(css.match(new RegExp(`${token}:\\s*rgba\\(255,\\s*255,\\s*255,\\s*([\\d.]+)\\)`))?.[1])
		const light = Number(lightRoot.match(new RegExp(`${token}:\\s*rgba\\(0,\\s*0,\\s*0,\\s*([\\d.]+)\\)`))?.[1])
		assert.ok(Number.isFinite(dark), `dark ${token} alpha not found`)
		assert.ok(Number.isFinite(light), `light ${token} alpha not found`)
		assert.ok(dark >= light, `dark ${token} (${dark}) must be >= light (${light})`)
	}
})

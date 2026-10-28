import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
	getRichTextChecklistState,
	getRichTextTaskId,
	isDroppedRichTextSubtree,
	looksLikeRichTextHtml,
	resolveRichTextTag,
	sanitizeRichTextHref,
} from '../../src/utils/rich-text.ts'

test('the editor tags Vikunja emits are rendered, normalised where they alias', () => {
	assert.equal(resolveRichTextTag('p'), 'p')
	assert.equal(resolveRichTextTag('B'), 'strong')
	assert.equal(resolveRichTextTag('i'), 'em')
	assert.equal(resolveRichTextTag('del'), 's')
	assert.equal(resolveRichTextTag('ul'), 'ul')
	assert.equal(resolveRichTextTag('blockquote'), 'blockquote')
})

test('unknown tags are not rendered as elements', () => {
	for (const tag of ['script', 'iframe', 'form', 'input', 'marquee', '']) {
		assert.equal(resolveRichTextTag(tag), null, tag)
	}
})

test('executable containers are dropped with their contents', () => {
	assert.equal(isDroppedRichTextSubtree('script'), true)
	assert.equal(isDroppedRichTextSubtree('STYLE'), true)
	assert.equal(isDroppedRichTextSubtree('iframe'), true)
	assert.equal(isDroppedRichTextSubtree('p'), false)
})

test('only safe link schemes survive', () => {
	assert.equal(sanitizeRichTextHref('https://example.test/x'), 'https://example.test/x')
	assert.equal(sanitizeRichTextHref('http://example.test'), 'http://example.test')
	assert.equal(sanitizeRichTextHref('mailto:a@b.test'), 'mailto:a@b.test')
})

test('script-bearing and opaque schemes are refused', () => {
	assert.equal(sanitizeRichTextHref('javascript:alert(1)'), null)
	assert.equal(sanitizeRichTextHref('JavaScript:alert(1)'), null)
	assert.equal(sanitizeRichTextHref('data:text/html;base64,PHNjcmlwdD4='), null)
	assert.equal(sanitizeRichTextHref('vbscript:msgbox'), null)
	assert.equal(sanitizeRichTextHref(''), null)
	assert.equal(sanitizeRichTextHref(null), null)
})

test('in-app and protocol-relative links are preserved sensibly', () => {
	assert.equal(sanitizeRichTextHref('/projects/2'), '/projects/2')
	assert.equal(sanitizeRichTextHref('#section'), '#section')
	assert.equal(sanitizeRichTextHref('//cdn.example.test/a.png'), 'https://cdn.example.test/a.png')
})

test('checklist state is read from the stored attribute', () => {
	assert.equal(getRichTextChecklistState(() => 'true'), true)
	assert.equal(getRichTextChecklistState(() => 'false'), false)
	assert.equal(getRichTextChecklistState(() => null), null)
})

test('plain text is not mistaken for markup', () => {
	assert.equal(looksLikeRichTextHtml('<p>Pick up groceries</p>'), true)
	assert.equal(looksLikeRichTextHtml('Pick up groceries'), false)
	assert.equal(looksLikeRichTextHtml('2 < 3 and 5 > 4'), false)
	assert.equal(looksLikeRichTextHtml(''), false)
})

test('task permalinks match the current app and configured frontend base path', () => {
	const bases = ['https://pwa.test', 'https://vikunja.test/team/']
	for (const href of ['/tasks/42', 'https://pwa.test/tasks/42?comment=3#details', 'https://vikunja.test/team/tasks/42']) {
		assert.equal(getRichTextTaskId(href, bases), 42, href)
	}
	assert.equal(getRichTextTaskId('tasks/7', ['https://vikunja.test/team']), 7)
})

test('other origins, paths and invalid task ids remain ordinary links', () => {
	const bases = ['https://vikunja.test/team/']
	for (const href of [
		'https://other.test/team/tasks/42', 'http://vikunja.test/team/tasks/42',
		'https://vikunja.test/tasks/42', 'https://vikunja.test/teamwork/tasks/42',
		'/team/tasks/0', '/team/tasks/-1', '/team/tasks/42/edit', '/team/tasks/42/',
		'/team/tasks/abc', '/team/projects/42', 'javascript:alert(1)', 'http://[',
	]) assert.equal(getRichTextTaskId(href, bases), null, href)
	assert.equal(getRichTextTaskId('/tasks/42', ['invalid', 'custom://localhost']), null)
})

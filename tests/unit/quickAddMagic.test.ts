import assert from 'node:assert/strict'
import test from 'node:test'
import {parseQuickAddMagic, tokenizeQuickAddMagic, type QuickAddToken} from '../../src/utils/quickAddMagic.ts'

function sliceTokens(text: string): Array<{type: QuickAddToken['type']; text: string}> {
	return tokenizeQuickAddMagic(text).map(token => ({
		type: token.type,
		text: text.slice(token.start, token.end),
	}))
}

test('tokenize: single date keyword', () => {
	assert.deepEqual(sliceTokens('Buy milk today'), [{type: 'date', text: 'today'}])
})

test('tokenize: prefixed label, project, assignee, priority', () => {
	assert.deepEqual(sliceTokens('Plan trip +Travel *urgent @bob !2'), [
		{type: 'project', text: '+Travel'},
		{type: 'label', text: '*urgent'},
		{type: 'assignee', text: '@bob'},
		{type: 'priority', text: '!2'},
	])
})

test('tokenize: repeat phrase', () => {
	assert.deepEqual(sliceTokens('Water plants every week'), [{type: 'repeat', text: 'every week'}])
})

test('tokenize: multiple labels and assignees', () => {
	assert.deepEqual(sliceTokens('Ship *a *b @x @y'), [
		{type: 'label', text: '*a'},
		{type: 'label', text: '*b'},
		{type: 'assignee', text: '@x'},
		{type: 'assignee', text: '@y'},
	])
})

test('tokenize: quoted label value is kept whole', () => {
	assert.deepEqual(sliceTokens('Note *"high priority"'), [{type: 'label', text: '*"high priority"'}])
})

test('tokenize: only the first project is highlighted (parser keeps the rest as title)', () => {
	const tokens = sliceTokens('Move +one +two')
	assert.deepEqual(tokens, [{type: 'project', text: '+one'}])
})

test('tokenize: a keyword inside a label value is not double-highlighted', () => {
	// "today" lives inside the *today label, so it must not also produce a date token.
	assert.deepEqual(sliceTokens('Recap *today'), [{type: 'label', text: '*today'}])
})

test('tokenize: plain title yields no tokens', () => {
	assert.deepEqual(tokenizeQuickAddMagic('Just a normal task title'), [])
})

test('tokenize: tokens are sorted by position', () => {
	const tokens = tokenizeQuickAddMagic('Plan trip +Travel *urgent @bob !2 every monday')
	const starts = tokens.map(token => token.start)
	assert.deepEqual(starts, [...starts].sort((a, b) => a - b))
})

test('tokenize stays aligned with parse: highlighted spans are exactly what parse removes', () => {
	const text = 'Buy milk today +Groceries *urgent @bob !2'
	const parsed = parseQuickAddMagic(text)
	const tokens = sliceTokens(text)

	assert.equal(parsed.title, 'Buy milk')
	assert.ok(tokens.some(token => token.type === 'date' && token.text === 'today'))
	assert.ok(tokens.some(token => token.type === 'project' && token.text === '+Groceries'))
	assert.ok(tokens.some(token => token.type === 'label' && token.text === '*urgent'))
	assert.ok(tokens.some(token => token.type === 'assignee' && token.text === '@bob'))
	assert.ok(tokens.some(token => token.type === 'priority' && token.text === '!2'))

	// Nothing the parser kept in the title should be highlighted.
	for (const token of tokens) {
		assert.ok(!parsed.title.includes(token.text), `title unexpectedly contains ${token.text}`)
	}
})

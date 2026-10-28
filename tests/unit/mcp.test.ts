import assert from 'node:assert/strict'
import test from 'node:test'
import {mcpConnectionCommand, mcpPermissions} from '../../src/utils/mcp.ts'
import type {McpConnectionInfo} from '../../src/types.ts'

const info: McpConnectionInfo = {
	endpoint: 'https://vikunja.example/api/v2/mcp',
	routes: {
		mcp: {access: {path: '/api/v2/mcp', method: 'ANY'}},
		tasks: {
			read_one: {path: '/api/v2/tasks/{task}', method: 'GET'},
			read_all: {path: '/api/v2/tasks', method: 'GET'},
			update: {path: '/api/v2/tasks/{task}', method: 'PUT'},
		},
	},
	presets: {
		read_only: {'*': ['read_one', 'read_all']},
		typed: {tasks: ['read_one', 'update'], tokens: ['create']},
		full: {'*': '*'},
	},
}

test('MCP read-only preset expands only advertised reads and includes access', () => {
	assert.deepEqual(mcpPermissions(info, 'read_only'), {tasks: ['read_one', 'read_all'], mcp: ['access']})
})

test('MCP write preset excludes permissions outside the MCP route map', () => {
	assert.deepEqual(mcpPermissions(info, 'typed'), {tasks: ['read_one', 'update'], mcp: ['access']})
})

test('MCP client instructions quote shell values and use bearer-token authentication', () => {
	assert.equal(mcpConnectionCommand('other', info.endpoint, 'test-token'), 'Authorization: Bearer test-token')
	assert.equal(mcpConnectionCommand('claudeCode', info.endpoint, "test'token"),
		"claude mcp add --transport http --header 'Authorization: Bearer test'\\''token' vikunja 'https://vikunja.example/api/v2/mcp'")
	assert.equal(mcpConnectionCommand('codex', info.endpoint, 'test-token'),
		"export VIKUNJA_MCP_TOKEN='test-token'\ncodex mcp add vikunja --url 'https://vikunja.example/api/v2/mcp' --bearer-token-env-var VIKUNJA_MCP_TOKEN")
})

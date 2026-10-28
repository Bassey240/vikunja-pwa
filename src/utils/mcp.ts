import type {McpConnectionInfo} from '../types.ts'

export type McpPreset = 'read_only' | 'typed'
export type McpClient = 'other' | 'claudeCode' | 'codex'

export function mcpPermissions(info: McpConnectionInfo, preset: McpPreset): Record<string, string[]> {
	const selected = info.presets[preset]
	const permissions = Object.fromEntries(
		Object.entries(info.routes)
			.map(([resource, routes]) => [resource, Object.keys(routes).filter(permission =>
				(selected[resource] ?? selected['*'] ?? []).includes(permission),
			)])
			.filter(([, values]) => values.length > 0),
	)
	return {...permissions, mcp: ['access']}
}

export function mcpConnectionCommand(client: McpClient, endpoint: string, token: string): string {
	const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
	if (client === 'claudeCode') {
		return `claude mcp add --transport http --header ${quote(`Authorization: Bearer ${token}`)} vikunja ${quote(endpoint)}`
	}
	if (client === 'codex') {
		return `export VIKUNJA_MCP_TOKEN=${quote(token)}\ncodex mcp add vikunja --url ${quote(endpoint)} --bearer-token-env-var VIKUNJA_MCP_TOKEN`
	}
	return `Authorization: Bearer ${token}`
}

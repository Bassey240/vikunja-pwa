import Ajv from 'ajv'
import {readFileSync} from 'node:fs'

// Request schemas from the released 2.7 OpenAPI. This is test-only and uses
// the validator already installed by ESLint; production has no validator.
const fixture = JSON.parse(readFileSync(new URL('./vikunja-v2-write-schemas.json', import.meta.url)))
const ajv = new Ajv({allErrors: true, unknownFormats: 'ignore', logger: false})
const contracts = Object.entries(fixture.routes).map(([key, schema]) => {
	const [method, path] = key.split(' ')
	return {method, path: new RegExp('^' + path.replace(/\{[^}]+\}/g, '[^/]+') + '$'), validate: ajv.compile({...schema, components: fixture.components})}
})

export function v2BodyErrors(method, path, body) {
	const contract = contracts.find(entry => entry.method === method && entry.path.test(path))
	if (!contract) return null // Configured-off routes have separate source contracts.
	// JSON merge-patch null deletes a property rather than supplying a null
	// value to the final resource's schema.
	const input = method === 'PATCH' ? JSON.parse(JSON.stringify(body, (_key, value) => value === null ? undefined : value)) : body
	return contract.validate(input) ? null : contract.validate.errors
}

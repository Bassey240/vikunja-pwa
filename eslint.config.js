import globals from 'globals'

export default [
	{
		ignores: [
			'.data/**',
			'dist/**',
			'node_modules/**',
			'playwright-report/**',
			'public/vendor/**',
			'test-results/**',
		],
	},
	{
		files: ['**/*.js', '**/*.mjs'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node,
				...globals.serviceworker,
			},
		},
		rules: {
			'no-async-promise-executor': 'error',
			'no-case-declarations': 'error',
			'no-constant-binary-expression': 'error',
			'no-dupe-keys': 'error',
			'no-undef': 'error',
			'no-unreachable': 'error',
			'valid-typeof': 'error',
		},
	},
]

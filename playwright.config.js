import {defineConfig} from '@playwright/test'

export default defineConfig({
	testDir: './tests/smoke',
	testMatch: '*.spec.js',
	fullyParallel: false,
	workers: 1,
	// Pointer-simulated drag/drop smoke flows flake intermittently on timing; one retry
	// absorbs that without masking real regressions (a true break still fails twice).
	retries: 1,
	timeout: 30_000,
	reporter: [
		['list'],
		['html', {outputFolder: 'test-results/playwright-report', open: 'never'}],
	],
	outputDir: 'test-results/playwright-artifacts',
	use: {
		headless: true,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},
})

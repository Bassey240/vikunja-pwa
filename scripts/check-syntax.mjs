import {readdir} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const ignoredDirectories = new Set([
	'.data',
	'.git',
	'dist',
	'node_modules',
	'playwright-report',
	'test-results',
])
const ignoredFilePaths = new Set([
	path.join('public', 'vendor', 'Sortable.min.js'),
])

const files = []
await collectJavaScriptFiles(repoRoot, files)

for (const filePath of files) {
	const result = spawnSync(process.execPath, ['--check', filePath], {
		cwd: repoRoot,
		encoding: 'utf8',
	})
	if (result.status !== 0) {
		process.stdout.write(result.stdout || '')
		process.stderr.write(result.stderr || '')
		process.exit(result.status || 1)
	}
}

async function collectJavaScriptFiles(currentDir, target) {
	const entries = await readdir(currentDir, {withFileTypes: true})
	for (const entry of entries) {
		const fullPath = path.join(currentDir, entry.name)
		const relativePath = path.relative(repoRoot, fullPath)

		if (entry.isDirectory()) {
			if (ignoredDirectories.has(entry.name)) {
				continue
			}
			await collectJavaScriptFiles(fullPath, target)
			continue
		}

		if (!/\.(?:js|mjs)$/.test(entry.name)) {
			continue
		}

		if (ignoredFilePaths.has(relativePath)) {
			continue
		}

		target.push(fullPath)
	}
}

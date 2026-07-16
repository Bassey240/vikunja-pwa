import {writeFileSync} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {buildIdFromGit, readBuildIdFile} from '../server/build-info.mjs'

// Stamps build-info.json at the repo root so environments without git
// (the docker build on the deploy VM) still report the deployed commit.
// Without git an existing stamp is kept (it IS the deploy stamp there);
// --require-git fails instead so a missing stamp can't reach production.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireGit = process.argv.includes('--require-git')
const outputPath = path.join(repoRoot, 'build-info.json')

const fromGit = buildIdFromGit(repoRoot)
if (!fromGit) {
	if (requireGit) {
		console.error('generate-build-info: git metadata unavailable; refusing to stamp.')
		process.exit(1)
	}
	const existing = readBuildIdFile(outputPath)
	if (existing) {
		console.log(`generate-build-info: no git; keeping existing stamp ${existing}`)
		process.exit(0)
	}
	console.warn('generate-build-info: no git and no existing stamp; stamping "unknown".')
}

const buildId = fromGit || 'unknown'
writeFileSync(outputPath, `${JSON.stringify({buildId, generatedAt: new Date().toISOString()}, null, '\t')}\n`)
console.log(`generate-build-info: ${buildId} -> ${outputPath}`)

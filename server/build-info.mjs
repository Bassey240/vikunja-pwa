import {execSync} from 'node:child_process'
import {readFileSync} from 'node:fs'

// Shared by server.mjs, vite.config.ts, and scripts/generate-build-info.mjs.
// Lives in server/ because that is the only helper dir copied into the
// production docker image.

export function readBuildIdFile(filePath) {
	try {
		const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
		const buildId = `${parsed?.buildId || ''}`.trim()
		return buildId || null
	} catch {
		return null
	}
}

export function buildIdFromGit(cwd) {
	try {
		const run = command => execSync(command, {cwd, stdio: ['ignore', 'pipe', 'ignore']}).toString().trim()
		const commitDate = run('git show -s --format=%cs HEAD')
		const shortSha = run('git rev-parse --short HEAD')
		if (!commitDate || !shortSha) {
			return null
		}
		const dirty = run('git status --porcelain') ? '-dirty' : ''
		return `${commitDate}-${shortSha}${dirty}`
	} catch {
		return null
	}
}

export function resolveBuildId({fileCandidates = [], gitCwd = process.cwd()} = {}) {
	for (const candidate of fileCandidates) {
		const fromFile = readBuildIdFile(candidate)
		if (fromFile) {
			return fromFile
		}
	}
	return buildIdFromGit(gitCwd) || 'unknown'
}

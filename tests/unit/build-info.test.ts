import assert from 'node:assert/strict'
import {execSync} from 'node:child_process'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {buildIdFromGit, readBuildIdFile, resolveBuildId} from '../../server/build-info.mjs'

function makeTempDir() {
	return mkdtempSync(path.join(os.tmpdir(), 'build-info-test-'))
}

function makeGitRepo() {
	const dir = makeTempDir()
	const run = (command: string) => execSync(command, {cwd: dir, stdio: ['ignore', 'pipe', 'ignore']})
	run('git init -q')
	run('git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init')
	return dir
}

test('buildIdFromGit formats as <commit-date>-<short-sha> and flags dirty trees', t => {
	const repo = makeGitRepo()
	t.after(() => rmSync(repo, {recursive: true, force: true}))

	const clean = buildIdFromGit(repo)
	assert.match(clean as string, /^\d{4}-\d{2}-\d{2}-[0-9a-f]{4,}$/)

	writeFileSync(path.join(repo, 'scratch.txt'), 'x')
	assert.match(buildIdFromGit(repo) as string, /^\d{4}-\d{2}-\d{2}-[0-9a-f]{4,}-dirty$/)
})

test('buildIdFromGit returns null outside a git repo', t => {
	const dir = makeTempDir()
	t.after(() => rmSync(dir, {recursive: true, force: true}))
	assert.equal(buildIdFromGit(dir), null)
})

test('readBuildIdFile reads the stamp and tolerates missing or broken files', t => {
	const dir = makeTempDir()
	t.after(() => rmSync(dir, {recursive: true, force: true}))

	const stampPath = path.join(dir, 'build-info.json')
	assert.equal(readBuildIdFile(stampPath), null)

	writeFileSync(stampPath, 'not-json')
	assert.equal(readBuildIdFile(stampPath), null)

	writeFileSync(stampPath, JSON.stringify({buildId: '2026-07-14-abc1234'}))
	assert.equal(readBuildIdFile(stampPath), '2026-07-14-abc1234')
})

test('resolveBuildId prefers the stamp file, then git, then unknown', t => {
	const repo = makeGitRepo()
	const empty = makeTempDir()
	t.after(() => {
		rmSync(repo, {recursive: true, force: true})
		rmSync(empty, {recursive: true, force: true})
	})

	const stampPath = path.join(repo, 'build-info.json')
	writeFileSync(stampPath, JSON.stringify({buildId: 'stamped-id'}))
	assert.equal(resolveBuildId({fileCandidates: [stampPath], gitCwd: repo}), 'stamped-id')

	assert.match(
		resolveBuildId({fileCandidates: [path.join(empty, 'missing.json')], gitCwd: repo}),
		/^\d{4}-\d{2}-\d{2}-/,
	)

	assert.equal(resolveBuildId({fileCandidates: [], gitCwd: empty}), 'unknown')
})

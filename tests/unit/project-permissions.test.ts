import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
	canAdminProject,
	canWriteProject,
	getProjectPermission,
	type ProjectPermissionActor,
} from '../../src/store/project-permissions.ts'

const operator: ProjectPermissionActor = {
	id: 7,
	username: 'operator',
	email: 'operator@example.test',
	canUseAdminBridge: true,
}

const member: ProjectPermissionActor = {
	id: 7,
	username: 'operator',
	email: 'operator@example.test',
	canUseAdminBridge: false,
}

test('the admin-bridge flag does not grant project permission it does not have', () => {
	// The gateway sends admin-bridge requests through the session's own Vikunja
	// token, so the server decides — claiming 2 here only produced affordances
	// the server rejects.
	const foreignProject = {maxPermission: 0, max_permission: 0, owner: {id: 99, username: 'someone'}}
	assert.equal(getProjectPermission(foreignProject, operator), 0)
	assert.equal(canWriteProject(foreignProject, operator), false)
	assert.equal(canAdminProject(foreignProject, operator), false)
})

test('shared permissions are still honored for an operator account', () => {
	const shared = {maxPermission: 1, max_permission: 1, owner: {id: 99, username: 'someone'}}
	assert.equal(getProjectPermission(shared, operator), 1)
	assert.equal(canWriteProject(shared, operator), true)
	assert.equal(canAdminProject(shared, operator), false)
})

test('ownership still grants admin regardless of the bridge flag', () => {
	const owned = {maxPermission: 0, max_permission: 0, owner: {id: 7, username: 'operator'}}
	assert.equal(getProjectPermission(owned, operator), 2)
	assert.equal(getProjectPermission(owned, member), 2)
	assert.equal(canAdminProject(owned, member), true)
})

test('explicit admin permission maps to 2', () => {
	const adminShared = {maxPermission: 2, max_permission: 2, owner: {id: 99, username: 'someone'}}
	assert.equal(getProjectPermission(adminShared, member), 2)
	assert.equal(canAdminProject(adminShared, member), true)
})

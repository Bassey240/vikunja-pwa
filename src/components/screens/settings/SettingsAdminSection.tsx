import DetailSheet from '@/components/common/DetailSheet'
import type {AdminRuntimeHealth, AdminUser} from '@/types'
import {
	getProtectedAdminUserMessage,
	isCurrentAdminUser,
	isPrimaryAdminUser,
	type SettingsSectionId,
} from '@/utils/settings-helpers'
import {type FormEvent, useState} from 'react'
import SettingsSection from './SettingsSection'

export default function SettingsAdminSection({
	open,
	onToggle,
	accountUser,
	accountIsAdmin,
	canManageUsers,
	adminUsers,
	adminUsersLoading,
	adminUsersLoaded,
	adminUserSubmitting,
	adminRuntimeHealth,
	adminBridgeFailedChecks,
	adminRuntimeHealthLoading,
	onReloadRuntimeHealth,
	onReloadUsers,
	onCreateAdminUser,
	onUpdateAdminUser,
	onSetAdminUserEnabled,
	onResetAdminUserPassword,
	onDeleteAdminUser,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	accountUser: {
		id?: number | null
		username?: string | null
		email?: string | null
	} | null | undefined
	accountIsAdmin: boolean
	canManageUsers: boolean
	adminUsers: AdminUser[]
	adminUsersLoading: boolean
	adminUsersLoaded: boolean
	adminUserSubmitting: boolean
	adminRuntimeHealth: AdminRuntimeHealth | null
	adminBridgeFailedChecks: string[]
	adminRuntimeHealthLoading: boolean
	onReloadRuntimeHealth: () => void
	onReloadUsers: () => void
	onCreateAdminUser: (payload: {username: string; email: string; password: string}) => Promise<boolean>
	onUpdateAdminUser: (identifier: number | string, payload: {username: string; email: string}) => Promise<boolean>
	onSetAdminUserEnabled: (identifier: number | string, enabled: boolean) => Promise<boolean>
	onResetAdminUserPassword: (identifier: number | string, password: string) => Promise<boolean>
	onDeleteAdminUser: (identifier: number | string) => Promise<boolean>
}) {
	const [userDialogMode, setUserDialogMode] = useState<'create' | 'edit' | null>(null)
	const [userDialogForm, setUserDialogForm] = useState({
		id: 0,
		username: '',
		email: '',
		password: '',
	})
	const [selectedAdminUserId, setSelectedAdminUserId] = useState<number | null>(null)

	const adminBridgeReady = Boolean(
		adminRuntimeHealth?.dockerReachable &&
		adminRuntimeHealth?.vikunjaContainerFound &&
		adminRuntimeHealth?.vikunjaCliReachable,
	)
	const showAdminUserFallback = canManageUsers && !adminBridgeReady && Boolean(accountUser)
	const userDialogOpen = userDialogMode !== null
	const selectedAdminUser = selectedAdminUserId
		? adminUsers.find(user => user.id === selectedAdminUserId) || null
		: null
	const selectedAdminUserIsCurrent = selectedAdminUser
		? isCurrentAdminUser(accountUser, selectedAdminUser.id, selectedAdminUser.username, selectedAdminUser.email)
		: false
	const selectedAdminUserIsPrimary = selectedAdminUser ? isPrimaryAdminUser(selectedAdminUser.id) : false
	const selectedAdminUserProtectedMessage = selectedAdminUser
		? getProtectedAdminUserMessage(selectedAdminUserIsCurrent, selectedAdminUserIsPrimary)
		: ''

	function openCreateUserDialog() {
		setSelectedAdminUserId(null)
		setUserDialogForm({
			id: 0,
			username: '',
			email: '',
			password: '',
		})
		setUserDialogMode('create')
	}

	function openEditAdminUserDialog(userId: number, currentUsername: string, currentEmail: string) {
		setSelectedAdminUserId(null)
		setUserDialogForm({
			id: userId,
			username: currentUsername,
			email: currentEmail,
			password: '',
		})
		setUserDialogMode('edit')
	}

	function closeUserDialog() {
		if (adminUserSubmitting) {
			return
		}

		setUserDialogMode(null)
	}

	function closeAdminUserDetail() {
		if (adminUserSubmitting) {
			return
		}

		setSelectedAdminUserId(null)
	}

	async function handleSubmitUserDialog(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (userDialogMode === 'create') {
			const success = await onCreateAdminUser({
				username: userDialogForm.username,
				email: userDialogForm.email,
				password: userDialogForm.password,
			})
			if (success) {
				closeUserDialog()
			}
			return
		}

		if (userDialogMode === 'edit') {
			const success = await onUpdateAdminUser(userDialogForm.id, {
				username: userDialogForm.username,
				email: userDialogForm.email,
			})
			if (success) {
				closeUserDialog()
			}
		}
	}

	async function handleResetAdminUserPassword(userId: number, username: string) {
		const password = window.prompt(`Set a new password for ${username}`)
		if (password === null) {
			return
		}

		await onResetAdminUserPassword(userId, password)
	}

	return (
		<>
			<SettingsSection
				title="User Administration"
				section="userAdministration"
				open={open}
				onToggle={onToggle}
				actions={
					<>
						<button
							className="pill-button subtle"
							data-action="reload-admin-users"
							type="button"
							disabled={!canManageUsers}
							onClick={() => {
								onReloadRuntimeHealth()
								if (adminBridgeReady) {
									onReloadUsers()
								}
							}}
						>
							Reload
						</button>
						<button
							className="pill-button"
							data-action="open-create-user"
							type="button"
							disabled={!canManageUsers || !adminBridgeReady}
							title={!adminBridgeReady ? 'Unavailable until this backend can reach the configured Vikunja container and CLI.' : undefined}
							onClick={openCreateUserDialog}
						>
							Create user
						</button>
					</>
				}
			>
				{!accountIsAdmin ? (
					<div className="empty-state compact">
						Only the primary Vikunja admin account can manage instance users from the PWA app.
					</div>
				) : null}
				{canManageUsers ? (
					<>
						{adminRuntimeHealthLoading ? <div className="empty-state compact">Checking bridge health…</div> : null}
						{adminRuntimeHealth ? (
							<div className="detail-grid detail-grid-tight">
								<div className="detail-item detail-field">
									<div className="detail-label">Docker</div>
									<div className="detail-value">{adminRuntimeHealth.dockerReachable ? 'Reachable' : 'Unavailable'}</div>
								</div>
								<div className="detail-item detail-field">
									<div className="detail-label">Vikunja container</div>
									<div className="detail-value">{adminRuntimeHealth.vikunjaContainerFound ? 'Found' : 'Missing'}</div>
								</div>
								<div className="detail-item detail-field">
									<div className="detail-label">Vikunja CLI</div>
									<div className="detail-value">{adminRuntimeHealth.vikunjaCliReachable ? 'Reachable' : 'Unavailable'}</div>
								</div>
							</div>
						) : null}
						{adminRuntimeHealth?.errors?.length ? (
							<div className="empty-state compact">{adminRuntimeHealth.errors.join(' ')}</div>
						) : null}
						<div className="empty-state compact">
							The instance user list appears here when the admin bridge is available.
						</div>
						{!adminBridgeReady ? (
							<div className="empty-state compact">
								Admin user management requires the Vikunja CLI bridge. Configure it via environment
								variables on the server.
								{adminBridgeFailedChecks.length ? ` Checks failed: ${adminBridgeFailedChecks.join(', ')}.` : ''}
							</div>
						) : null}
						{showAdminUserFallback ? (
							<div className="settings-session-list">
								<div className="settings-admin-user-row">
									<div className="settings-admin-user-copy">
										<div className="detail-value">{accountUser?.username || 'Unknown user'}</div>
										<div className="detail-meta">
											{accountUser?.email || 'No email'} · Connected primary Vikunja admin
										</div>
									</div>
									<div className="settings-admin-user-actions">
										<div className="settings-status-chip is-active">Connected</div>
									</div>
								</div>
							</div>
						) : null}
						{adminBridgeReady && adminUsersLoading ? <div className="empty-state compact">Loading users…</div> : null}
						{adminBridgeReady && !adminUsersLoading && adminUsers.length === 0 && adminUsersLoaded ? (
							<div className="empty-state compact">No users were returned by the admin bridge.</div>
						) : null}
						{adminBridgeReady && adminUsers.length > 0 ? (
							<div className="settings-session-list">
								{adminUsers.map(user => {
									const isCurrentUser = isCurrentAdminUser(accountUser, user.id, user.username, user.email)
									const isPrimaryAdmin = isPrimaryAdminUser(user.id)
									const protectedMessage = getProtectedAdminUserMessage(isCurrentUser, isPrimaryAdmin)

									return (
										<div key={user.id} className="settings-admin-user-row">
											<div className="settings-admin-user-copy">
												<div className="detail-value">{user.username}</div>
												<div className="detail-meta">
													{user.email || 'No email'}
													{isCurrentUser ? ' · Current account' : ''}
													{isPrimaryAdmin ? ' · Primary admin' : ''}
													{protectedMessage ? ' · Protected' : ''}
												</div>
											</div>
											<div className="settings-admin-user-actions">
												<div className={`settings-status-chip ${user.enabled ? 'is-active' : 'is-disabled'}`.trim()}>
													{user.enabled ? 'Active' : 'Disabled'}
												</div>
												<button
													className="menu-button settings-admin-user-overflow"
													type="button"
													aria-label={`Manage ${user.username}`}
													onClick={() => setSelectedAdminUserId(user.id)}
												>
													⋯
												</button>
											</div>
										</div>
									)
								})}
							</div>
						) : null}
					</>
				) : null}
			</SettingsSection>
			<DetailSheet
				open={userDialogOpen}
				closeAction="close-user-dialog"
				onClose={closeUserDialog}
			>
				<div className="sheet-head">
					<div>
						<div className="panel-label">User Administration</div>
						<div className="panel-title">{userDialogMode === 'create' ? 'Create User' : 'Edit User'}</div>
					</div>
				</div>
				<form className="detail-core-card settings-user-dialog" data-form="admin-user-dialog" onSubmit={handleSubmitUserDialog}>
					<div className="detail-grid detail-grid-tight">
						<label className="detail-item detail-field">
							<div className="detail-label">Username</div>
							<input
								className="detail-input"
								data-admin-user-field="username"
								type="text"
								value={userDialogForm.username}
								disabled={adminUserSubmitting}
								onChange={event => {
									const value = event.currentTarget.value
									setUserDialogForm(state => ({
										...state,
										username: value,
									}))
								}}
							/>
						</label>
						<label className="detail-item detail-field">
							<div className="detail-label">Email</div>
							<input
								className="detail-input"
								data-admin-user-field="email"
								type="email"
								value={userDialogForm.email}
								disabled={adminUserSubmitting}
								onChange={event => {
									const value = event.currentTarget.value
									setUserDialogForm(state => ({
										...state,
										email: value,
									}))
								}}
							/>
						</label>
						{userDialogMode === 'create' ? (
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">Password</div>
								<input
									className="detail-input"
									data-admin-user-field="password"
									type="password"
									value={userDialogForm.password}
									disabled={adminUserSubmitting}
									onChange={event => {
										const value = event.currentTarget.value
										setUserDialogForm(state => ({
											...state,
											password: value,
										}))
									}}
								/>
							</label>
						) : null}
					</div>
					<div className="settings-dialog-actions">
						<button className="ghost-button" type="button" disabled={adminUserSubmitting} onClick={closeUserDialog}>
							Cancel
						</button>
						<button className="composer-submit" type="submit" disabled={adminUserSubmitting}>
							{adminUserSubmitting
								? 'Working…'
								: userDialogMode === 'create'
									? 'Create user'
									: 'Save user'}
						</button>
					</div>
				</form>
			</DetailSheet>
			<DetailSheet
				open={Boolean(selectedAdminUser)}
				closeAction="close-admin-user-detail"
				onClose={closeAdminUserDetail}
			>
				{selectedAdminUser ? (
					<>
						<div className="sheet-head">
							<div>
								<div className="panel-label">User Administration</div>
								<div className="panel-title">{selectedAdminUser.username}</div>
							</div>
						</div>
						<div className="detail-core-card settings-admin-user-sheet">
							<div className="settings-admin-user-summary">
								<div className="settings-admin-user-sheet-copy">
									<div className="detail-label">Email</div>
									<div className="detail-value">{selectedAdminUser.email || 'No email'}</div>
									{selectedAdminUserProtectedMessage ? (
										<div className="detail-meta">
											Protected account
											{selectedAdminUserIsCurrent ? ' · Current signed-in account' : ''}
											{selectedAdminUserIsPrimary ? ' · Primary admin' : ''}
										</div>
									) : null}
								</div>
								<div className={`settings-status-chip ${selectedAdminUser.enabled ? 'is-active' : 'is-disabled'}`.trim()}>
									{selectedAdminUser.enabled ? 'Active' : 'Disabled'}
								</div>
							</div>
							{selectedAdminUserProtectedMessage ? (
								<div className="detail-helper-text settings-admin-user-protection-note">{selectedAdminUserProtectedMessage}</div>
							) : null}
							<div className="settings-action-row settings-admin-user-sheet-actions">
								<button
									className="pill-button subtle"
									type="button"
									onClick={() =>
										openEditAdminUserDialog(
											selectedAdminUser.id,
											selectedAdminUser.username,
											selectedAdminUser.email,
										)
									}
								>
									Edit
								</button>
								<button
									className="pill-button subtle"
									type="button"
									onClick={() => void handleResetAdminUserPassword(selectedAdminUser.id, selectedAdminUser.username)}
								>
									Reset password
								</button>
								{selectedAdminUserProtectedMessage ? null : (
									<>
										<button
											className="pill-button subtle"
											type="button"
											onClick={() => void onSetAdminUserEnabled(selectedAdminUser.id, !selectedAdminUser.enabled)}
										>
											{selectedAdminUser.enabled ? 'Disable' : 'Enable'}
										</button>
										<button
											className="pill-button subtle"
											type="button"
											onClick={async () => {
												const success = await onDeleteAdminUser(selectedAdminUser.id)
												if (success) {
													closeAdminUserDetail()
												}
											}}
										>
											Delete
										</button>
									</>
								)}
							</div>
						</div>
					</>
				) : null}
			</DetailSheet>
		</>
	)
}

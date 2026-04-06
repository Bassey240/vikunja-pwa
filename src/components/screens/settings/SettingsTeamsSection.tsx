import DetailSheet from '@/components/common/DetailSheet'
import ContextMenu from '@/components/common/ContextMenu'
import type {Team} from '@/types'
import {
	getBlockedTeamManagementMessage,
	getBlockedTeamMemberMenuMessage,
	getTeamAdminCount,
	isCurrentUserTeamAdmin,
	type SettingsSectionId,
} from '@/utils/settings-helpers'
import {type FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useState} from 'react'
import SettingsSection from './SettingsSection'

type LocalMenuAnchor = {
	top: number
	right: number
	bottom: number
	left: number
}

export default function SettingsTeamsSection({
	open,
	onToggle,
	teams,
	teamsLoaded,
	teamsLoading,
	teamSubmitting,
	currentUsername,
	onReload,
	onEditTeam,
	onAddTeamMember,
	onCreateTeam,
	onDeleteTeam,
	onToggleTeamMemberAdmin,
	onRemoveTeamMember,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	teams: Team[]
	teamsLoaded: boolean
	teamsLoading: boolean
	teamSubmitting: boolean
	currentUsername: string
	onReload: () => void
	onEditTeam: (teamId: number, payload: {name: string; description: string}) => Promise<boolean>
	onAddTeamMember: (teamId: number, username: string) => Promise<boolean>
	onCreateTeam: (payload: {name: string; description: string}) => Promise<boolean>
	onDeleteTeam: (teamId: number) => Promise<boolean>
	onToggleTeamMemberAdmin: (teamId: number, username: string) => Promise<boolean>
	onRemoveTeamMember: (teamId: number, username: string) => Promise<boolean>
}) {
	const [createTeamForm, setCreateTeamForm] = useState({
		name: '',
		description: '',
	})
	const [teamMenuAnchor, setTeamMenuAnchor] = useState<{teamId: number; anchor: LocalMenuAnchor} | null>(null)
	const [teamMemberMenuAnchor, setTeamMemberMenuAnchor] = useState<{
		teamId: number
		username: string
		anchor: LocalMenuAnchor
	} | null>(null)
	const [teamDialogMode, setTeamDialogMode] = useState<'edit' | 'addMember' | null>(null)
	const [teamDialogForm, setTeamDialogForm] = useState({
		teamId: 0,
		teamName: '',
		name: '',
		description: '',
		username: '',
	})

	useEffect(() => {
		if (!teamMenuAnchor && !teamMemberMenuAnchor) {
			return
		}

		function handlePointerDown(event: PointerEvent) {
			const target = event.target instanceof HTMLElement ? event.target : null
			if (!target) {
				return
			}

			if (target.closest('[data-menu-root]') || target.closest('[data-menu-toggle="true"]')) {
				return
			}

			setTeamMenuAnchor(null)
			setTeamMemberMenuAnchor(null)
		}

		document.addEventListener('pointerdown', handlePointerDown, true)
		return () => document.removeEventListener('pointerdown', handlePointerDown, true)
	}, [teamMenuAnchor, teamMemberMenuAnchor])

	async function handleCreateTeam(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await onCreateTeam(createTeamForm)
		if (success) {
			setCreateTeamForm({
				name: '',
				description: '',
			})
		}
	}

	function openTeamMenu(event: ReactMouseEvent<HTMLButtonElement>, teamId: number) {
		const rect = event.currentTarget.getBoundingClientRect()
		setTeamMemberMenuAnchor(null)
		setTeamMenuAnchor(current =>
			current?.teamId === teamId
				? null
				: {
					teamId,
					anchor: {
						top: rect.top,
						right: rect.right,
						bottom: rect.bottom,
						left: rect.left,
					},
				},
		)
	}

	function openTeamMemberMenu(event: ReactMouseEvent<HTMLButtonElement>, teamId: number, username: string) {
		const rect = event.currentTarget.getBoundingClientRect()
		setTeamMenuAnchor(null)
		setTeamMemberMenuAnchor(current =>
			current?.teamId === teamId && current?.username === username
				? null
				: {
					teamId,
					username,
					anchor: {
						top: rect.top,
						right: rect.right,
						bottom: rect.bottom,
						left: rect.left,
					},
				},
		)
	}

	function openEditTeamDialog(team: Team) {
		setTeamDialogForm({
			teamId: team.id,
			teamName: team.name || '',
			name: team.name || '',
			description: team.description || '',
			username: '',
		})
		setTeamDialogMode('edit')
	}

	function openAddTeamMemberDialog(team: Team) {
		setTeamDialogForm({
			teamId: team.id,
			teamName: team.name || '',
			name: team.name || '',
			description: team.description || '',
			username: '',
		})
		setTeamDialogMode('addMember')
	}

	function closeTeamDialog() {
		if (teamSubmitting) {
			return
		}

		setTeamDialogMode(null)
	}

	async function handleSubmitTeamDialog(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()

		if (teamDialogMode === 'edit') {
			const success = await onEditTeam(teamDialogForm.teamId, {
				name: teamDialogForm.name,
				description: teamDialogForm.description,
			})
			if (success) {
				closeTeamDialog()
			}
			return
		}

		if (teamDialogMode === 'addMember') {
			const success = await onAddTeamMember(teamDialogForm.teamId, teamDialogForm.username)
			if (success) {
				closeTeamDialog()
			}
		}
	}

	return (
		<>
			<SettingsSection
				title="Teams"
				section="teams"
				open={open}
				onToggle={onToggle}
				actions={
					<button className="pill-button subtle" type="button" onClick={onReload}>
						Reload
					</button>
				}
			>
			<div className="empty-state compact">
				Create teams here, manage their members, and then share projects with those teams from project detail.
				New teams automatically include the creator as the first team admin.
			</div>
			<form className="detail-grid settings-form" data-form="create-team" onSubmit={handleCreateTeam}>
				<label className="detail-item detail-field">
					<div className="detail-label">Team name</div>
					<input
						className="detail-input"
						type="text"
						value={createTeamForm.name}
						disabled={teamSubmitting}
						onChange={event => {
							const value = event.currentTarget.value
							setCreateTeamForm(state => ({
								...state,
								name: value,
							}))
						}}
					/>
				</label>
				<label className="detail-item detail-item-full detail-field">
					<div className="detail-label">Description</div>
					<input
						className="detail-input"
						type="text"
						value={createTeamForm.description}
						disabled={teamSubmitting}
						onChange={event => {
							const value = event.currentTarget.value
							setCreateTeamForm(state => ({
								...state,
								description: value,
							}))
						}}
					/>
				</label>
				<div className="detail-item detail-item-full detail-field">
					<button className="composer-submit" type="submit" disabled={teamSubmitting}>
						{teamSubmitting ? 'Working…' : 'Create team'}
					</button>
				</div>
			</form>
			{teamsLoading ? <div className="empty-state compact">Loading teams…</div> : null}
			{!teamsLoading && teamsLoaded && teams.length === 0 ? (
				<div className="empty-state compact">No teams found for this account.</div>
			) : null}
			{teams.length > 0 ? (
				<div className="settings-team-list">
						{teams.map(team => {
							const teamMembers = team.members || []
							const currentUserIsTeamAdmin = isCurrentUserTeamAdmin(team, currentUsername)
							const teamAdminCount = getTeamAdminCount(team)
							const teamHasNoAdmins = teamAdminCount === 0
							const teamAccessLabel = teamHasNoAdmins
								? 'No admins'
								: currentUserIsTeamAdmin
									? 'Your access: Admin'
									: 'Your access: Member'
							const blockedTeamManagementMessage = getBlockedTeamManagementMessage(
								currentUserIsTeamAdmin,
								teamHasNoAdmins,
						)

						return (
							<div key={team.id} className="settings-team-card">
								<div className="settings-team-head">
									<div className="settings-team-copy">
										<div className="detail-value">{team.name}</div>
										<div className="detail-meta">
											{team.description || 'No description'} · {teamMembers.length} member(s)
										</div>
									</div>
									<div className="settings-team-actions">
										<div className={`settings-status-chip ${currentUserIsTeamAdmin ? 'is-active' : teamHasNoAdmins ? 'is-disabled' : ''}`.trim()}>
											{teamAccessLabel}
										</div>
										<button
											className="menu-button settings-team-overflow"
											type="button"
											data-menu-toggle="true"
											aria-label={`Manage ${team.name}`}
											aria-expanded={teamMenuAnchor?.teamId === team.id ? 'true' : 'false'}
											title={blockedTeamManagementMessage || undefined}
											onClick={event => openTeamMenu(event, team.id)}
										>
											⋯
										</button>
									</div>
								</div>
								{teamMenuAnchor?.teamId === team.id ? (
									<ContextMenu anchor={teamMenuAnchor.anchor} positionMode="anchor-end">
										{currentUserIsTeamAdmin ? (
												<>
													<button
														className="menu-item"
														data-action="open-edit-team-dialog"
														type="button"
														onClick={() => {
															setTeamMenuAnchor(null)
															openEditTeamDialog(team)
														}}
													>
														Edit team
													</button>
													<button
														className="menu-item"
														data-action="open-add-team-member-dialog"
														type="button"
														onClick={() => {
															setTeamMenuAnchor(null)
															openAddTeamMemberDialog(team)
														}}
													>
														Add member
												</button>
												<button
													className="menu-item danger"
													type="button"
													onClick={() => {
														setTeamMenuAnchor(null)
														void onDeleteTeam(team.id)
													}}
												>
													Delete team
												</button>
											</>
										) : (
											<div className="menu-note">{blockedTeamManagementMessage}</div>
										)}
									</ContextMenu>
								) : null}
								{teamHasNoAdmins ? (
									<div className="empty-state compact">
										This team currently has no admins. Vikunja blocks team management until an admin is restored.
									</div>
								) : null}
								{teamMembers.length ? (
									<div className="settings-team-members">
										{teamMembers.map(member => {
											const isSelf = member.username === currentUsername
											const isLastTeamAdmin = Boolean(member.admin && teamAdminCount <= 1)
											const protectsCurrentAdminAccess = Boolean(isSelf && member.admin)
											const canRemoveMember = currentUserIsTeamAdmin || isSelf
											const removeDisabled =
												teamMembers.length <= 1 ||
												!canRemoveMember ||
												isLastTeamAdmin ||
												protectsCurrentAdminAccess
											const removeTitle = teamMembers.length <= 1
												? 'Vikunja does not allow removing the last team member.'
												: protectsCurrentAdminAccess
													? 'The current team admin cannot remove their own access from this app.'
													: isLastTeamAdmin
														? 'The last team admin cannot be removed from this app.'
														: !canRemoveMember
															? 'Only team admins can remove other members.'
															: undefined
											const toggleDisabled =
												!currentUserIsTeamAdmin || isLastTeamAdmin || protectsCurrentAdminAccess
											const toggleTitle = protectsCurrentAdminAccess
												? 'Your own team admin access cannot be removed from this app.'
												: isLastTeamAdmin
													? 'The last team admin cannot be demoted from this app.'
													: !currentUserIsTeamAdmin
														? 'Only team admins can change admin status.'
														: undefined
											const memberMenuDisabled = removeDisabled && toggleDisabled
											const blockedMemberMenuMessage = memberMenuDisabled
												? getBlockedTeamMemberMenuMessage({
													isSelf,
													isLastTeamAdmin,
													protectsCurrentAdminAccess,
													teamMembersCount: teamMembers.length,
													currentUserIsTeamAdmin,
												})
												: ''

											return (
												<div key={`${team.id}-${member.id}`} className="settings-team-member-row">
													<div className="settings-team-member-copy">
														<div className="detail-value">{member.name || member.username}</div>
														<div className="detail-meta">
															{member.username}{member.email ? ` · ${member.email}` : ''}
														</div>
													</div>
													<div className="settings-team-member-actions">
														<div className={`settings-status-chip ${member.admin ? 'is-active' : ''}`.trim()}>
															{member.admin ? 'Admin' : 'Member'}
														</div>
														<button
															className="menu-button settings-team-overflow"
															type="button"
															data-menu-toggle="true"
															aria-label={`Manage ${member.username}`}
															aria-expanded={
																teamMemberMenuAnchor?.teamId === team.id &&
																teamMemberMenuAnchor?.username === member.username
																	? 'true'
																	: 'false'
															}
															title={memberMenuDisabled ? blockedMemberMenuMessage : undefined}
															onClick={event => openTeamMemberMenu(event, team.id, member.username)}
														>
															⋯
														</button>
													</div>
													{teamMemberMenuAnchor?.teamId === team.id && teamMemberMenuAnchor?.username === member.username ? (
														<ContextMenu anchor={teamMemberMenuAnchor.anchor} positionMode="anchor-end">
															{memberMenuDisabled ? (
																<div className="menu-note">{blockedMemberMenuMessage}</div>
															) : (
																<>
																	<button
																		className="menu-item"
																		type="button"
																		disabled={toggleDisabled}
																		title={toggleTitle}
																		onClick={() => {
																			if (toggleDisabled) {
																				return
																			}
																			setTeamMemberMenuAnchor(null)
																			void onToggleTeamMemberAdmin(team.id, member.username)
																		}}
																	>
																		{member.admin ? 'Remove admin role' : 'Make admin'}
																	</button>
																	<button
																		className="menu-item danger"
																		type="button"
																		disabled={removeDisabled}
																		title={removeTitle}
																		onClick={() => {
																			if (removeDisabled) {
																				return
																			}
																			setTeamMemberMenuAnchor(null)
																			void onRemoveTeamMember(team.id, member.username)
																		}}
																	>
																		Remove from team
																	</button>
																</>
															)}
														</ContextMenu>
													) : null}
												</div>
											)
										})}
									</div>
								) : (
									<div className="empty-state compact">No members yet.</div>
								)}
							</div>
						)
					})}
				</div>
			) : null}
			</SettingsSection>
			<DetailSheet
				open={teamDialogMode !== null}
				closeAction="close-team-dialog"
				onClose={closeTeamDialog}
			>
			<div className="sheet-head">
				<div>
					<div className="panel-label">Teams</div>
					<div className="panel-title">{teamDialogMode === 'edit' ? 'Edit Team' : 'Add Team Member'}</div>
				</div>
			</div>
			<form className="detail-core-card settings-user-dialog" data-form="team-dialog" onSubmit={handleSubmitTeamDialog}>
				<div className="detail-helper-text">
					{teamDialogMode === 'edit'
						? `Update the details for ${teamDialogForm.teamName || 'this team'}.`
						: `Add a Vikunja user to ${teamDialogForm.teamName || 'this team'} by username.`}
				</div>
				<div className="detail-grid detail-grid-tight">
					{teamDialogMode === 'edit' ? (
						<>
							<label className="detail-item detail-field">
								<div className="detail-label">Team name</div>
								<input
									className="detail-input"
									data-team-field="name"
									type="text"
									value={teamDialogForm.name}
									disabled={teamSubmitting}
									onChange={event => {
										const value = event.currentTarget.value
										setTeamDialogForm(state => ({
											...state,
											name: value,
										}))
									}}
								/>
							</label>
							<label className="detail-item detail-field">
								<div className="detail-label">Description</div>
								<input
									className="detail-input"
									data-team-field="description"
									type="text"
									value={teamDialogForm.description}
									disabled={teamSubmitting}
									onChange={event => {
										const value = event.currentTarget.value
										setTeamDialogForm(state => ({
											...state,
											description: value,
										}))
									}}
								/>
							</label>
						</>
					) : (
						<label className="detail-item detail-item-full detail-field">
							<div className="detail-label">Username</div>
							<input
								className="detail-input"
								data-team-field="username"
								type="text"
								value={teamDialogForm.username}
								disabled={teamSubmitting}
								onChange={event => {
									const value = event.currentTarget.value
									setTeamDialogForm(state => ({
										...state,
										username: value,
									}))
								}}
							/>
						</label>
					)}
				</div>
				<div className="settings-dialog-actions">
					<button className="ghost-button" data-action="close-team-dialog" type="button" disabled={teamSubmitting} onClick={closeTeamDialog}>
						Cancel
					</button>
					<button className="composer-submit" data-action="submit-team-dialog" type="submit" disabled={teamSubmitting}>
						{teamSubmitting
							? 'Working…'
							: teamDialogMode === 'edit'
								? 'Save team'
								: 'Add member'}
					</button>
				</div>
			</form>
			</DetailSheet>
		</>
	)
}

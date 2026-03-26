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

	async function handleEditTeam(teamId: number, currentName: string, currentDescription: string) {
		const name = window.prompt('Team name', currentName)
		if (name === null) {
			return
		}

		const description = window.prompt('Team description', currentDescription)
		if (description === null) {
			return
		}

		await onEditTeam(teamId, {
			name,
			description,
		})
	}

	async function handleAddTeamMember(teamId: number) {
		const username = window.prompt('Username to add to this team')
		if (username === null) {
			return
		}

		await onAddTeamMember(teamId, username)
	}

	return (
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
													type="button"
													onClick={() => {
														setTeamMenuAnchor(null)
														void handleEditTeam(team.id, team.name, team.description || '')
													}}
												>
													Edit team
												</button>
												<button
													className="menu-item"
													type="button"
													onClick={() => {
														setTeamMenuAnchor(null)
														void handleAddTeamMember(team.id)
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
	)
}

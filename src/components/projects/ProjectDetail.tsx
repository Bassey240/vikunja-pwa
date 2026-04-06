import {api} from '@/api'
import UserAvatar from '@/components/common/UserAvatar'
import DetailSheet from '@/components/common/DetailSheet'
import UnsplashBackgroundPicker from '@/components/projects/UnsplashBackgroundPicker'
import WebhookManager from '@/components/webhooks/WebhookManager'
import {ACCENT_BLUE} from '@/utils/color-constants'
import {useAppStore} from '@/store'
import {
	canAdminProject,
	canManageProjectSharePermission,
	canManageProjectSharing,
	canWriteProject,
	getAssignableProjectSharePermissions,
	getProjectPermission,
} from '@/store/selectors'
import type {ProjectLinkShare, SharePermission, TaskAssignee, Team} from '@/types'
import {
	formatOptionalLongDate,
	getColorInputValue,
	getUserDisplayName,
	normalizeHexColor,
} from '@/utils/formatting'
import {projectHasBackground} from '@/utils/project-background'
import {type ReactNode, useEffect, useState} from 'react'

const SHARE_PERMISSION_OPTIONS: Array<{value: SharePermission; label: string}> = [
	{value: 0, label: 'Read'},
	{value: 1, label: 'Read & Write'},
	{value: 2, label: 'Admin'},
]

function getSharePermissionLabel(permission: SharePermission) {
	return SHARE_PERMISSION_OPTIONS.find(option => option.value === permission)?.label || 'Read'
}

interface UsersPayload {
	users?: TaskAssignee[]
}

interface TeamsPayload {
	teams?: Team[]
}

type ProjectDetailSection = 'project' | 'webhooks' | 'sharedUsers' | 'sharedTeams' | 'linkShares'

const DEFAULT_PROJECT_DETAIL_SECTIONS: Record<ProjectDetailSection, boolean> = {
	project: true,
	webhooks: false,
	sharedUsers: false,
	sharedTeams: false,
	linkShares: false,
}

const CLOSED_PROJECT_DETAIL_SECTIONS: Record<ProjectDetailSection, boolean> = {
	project: false,
	webhooks: false,
	sharedUsers: false,
	sharedTeams: false,
	linkShares: false,
}

export default function ProjectDetail({mode = 'sheet'}: {mode?: 'sheet' | 'inspector'}) {
	const account = useAppStore(state => state.account)
	const serverConfig = useAppStore(state => state.serverConfig)
	const vikunjaInfo = useAppStore(state => state.vikunjaInfo)
	const projectDetailOpen = useAppStore(state => state.projectDetailOpen)
	const projectDetailLoading = useAppStore(state => state.projectDetailLoading)
	const projectDetail = useAppStore(state => state.projectDetail)
	const projectSharedUsers = useAppStore(state => state.projectSharedUsers)
	const projectSharedTeams = useAppStore(state => state.projectSharedTeams)
	const projectLinkShares = useAppStore(state => state.projectLinkShares)
	const projectBackgroundUrls = useAppStore(state => state.projectBackgroundUrls)
	const projectBackgroundPreviewUrls = useAppStore(state => state.projectBackgroundPreviewUrls)
	const uploadingProjectBackground = useAppStore(state => state.uploadingProjectBackground)
	const selectedShareDetail = useAppStore(state => state.selectedShareDetail)
	const shareDetailLoading = useAppStore(state => state.shareDetailLoading)
	const projectSharingLoading = useAppStore(state => state.projectSharingLoading)
	const projectSharingSubmitting = useAppStore(state => state.projectSharingSubmitting)
	const projectWebhooks = useAppStore(state => state.projectWebhooks)
	const projectWebhooksLoadedIds = useAppStore(state => state.projectWebhooksLoadedIds)
	const projectWebhooksLoadingIds = useAppStore(state => state.projectWebhooksLoadingIds)
	const projectWebhookEvents = useAppStore(state => state.projectWebhookEvents)
	const projectWebhookEventsLoaded = useAppStore(state => state.projectWebhookEventsLoaded)
	const webhookSubmitting = useAppStore(state => state.webhookSubmitting)
	const subscriptionsByEntity = useAppStore(state => state.subscriptionsByEntity)
	const subscriptionMutatingKeys = useAppStore(state => state.subscriptionMutatingKeys)
	const closeProjectDetail = useAppStore(state => state.closeProjectDetail)
	const getAvailableParentProjects = useAppStore(state => state.getAvailableParentProjects)
	const getProjectAncestors = useAppStore(state => state.getProjectAncestors)
	const saveProjectDetailPatch = useAppStore(state => state.saveProjectDetailPatch)
	const loadProjectBackground = useAppStore(state => state.loadProjectBackground)
	const uploadProjectBackground = useAppStore(state => state.uploadProjectBackground)
	const removeProjectBackground = useAppStore(state => state.removeProjectBackground)
	const loadProjectSharing = useAppStore(state => state.loadProjectSharing)
	const loadProjectWebhooks = useAppStore(state => state.loadProjectWebhooks)
	const loadProjectWebhookEvents = useAppStore(state => state.loadProjectWebhookEvents)
	const loadShareDetail = useAppStore(state => state.loadShareDetail)
	const clearShareDetail = useAppStore(state => state.clearShareDetail)
	const toggleSubscription = useAppStore(state => state.toggleSubscription)
	const addProjectUserShare = useAppStore(state => state.addProjectUserShare)
	const updateProjectUserShare = useAppStore(state => state.updateProjectUserShare)
	const removeProjectUserShare = useAppStore(state => state.removeProjectUserShare)
	const addProjectTeamShare = useAppStore(state => state.addProjectTeamShare)
	const updateProjectTeamShare = useAppStore(state => state.updateProjectTeamShare)
	const removeProjectTeamShare = useAppStore(state => state.removeProjectTeamShare)
	const addProjectLinkShare = useAppStore(state => state.addProjectLinkShare)
	const removeProjectLinkShare = useAppStore(state => state.removeProjectLinkShare)
	const createProjectWebhook = useAppStore(state => state.createProjectWebhook)
	const updateProjectWebhookEvents = useAppStore(state => state.updateProjectWebhookEvents)
	const deleteProjectWebhook = useAppStore(state => state.deleteProjectWebhook)
	const [title, setTitle] = useState('')
	const [identifier, setIdentifier] = useState('')
	const [description, setDescription] = useState('')
	const [color, setColor] = useState(ACCENT_BLUE)
	const [userShareQuery, setUserShareQuery] = useState('')
	const [userShareResults, setUserShareResults] = useState<TaskAssignee[]>([])
	const [userShareSearchLoading, setUserShareSearchLoading] = useState(false)
	const [nextUserPermission, setNextUserPermission] = useState<SharePermission>(1)
	const [teamShareQuery, setTeamShareQuery] = useState('')
	const [teamShareResults, setTeamShareResults] = useState<Team[]>([])
	const [teamShareSearchLoading, setTeamShareSearchLoading] = useState(false)
	const [nextTeamPermission, setNextTeamPermission] = useState<SharePermission>(1)
	const [nextLinkPermission, setNextLinkPermission] = useState<SharePermission>(1)
	const [linkShareName, setLinkShareName] = useState('')
	const [linkSharePassword, setLinkSharePassword] = useState('')
	const [copiedLinkShareId, setCopiedLinkShareId] = useState<number | null>(null)
	const [expandedLinkShareId, setExpandedLinkShareId] = useState<number | null>(null)
	const [openSections, setOpenSections] = useState<Record<ProjectDetailSection, boolean>>(DEFAULT_PROJECT_DETAIL_SECTIONS)
	const [backgroundSheetOpen, setBackgroundSheetOpen] = useState(false)
	const [backgroundTab, setBackgroundTab] = useState<'upload' | 'unsplash'>('upload')
	const projectPermissionActor = account?.linkShareAuth
		? null
		: {
			id: Number(account?.user?.id || 0),
			username: account?.user?.username || '',
			email: account?.user?.email || '',
			canUseAdminBridge: account?.canUseAdminBridge,
		}
	const canEditProject = canWriteProject(projectDetail, projectPermissionActor)
	const canManageSharing = !account?.linkShareAuth && canManageProjectSharing(projectDetail, projectPermissionActor)
	const canManageProjectWebhooks = !account?.linkShareAuth && canEditProject
	const canGrantAdminShares = canAdminProject(projectDetail, projectPermissionActor)
	const availableSharePermissions = getAssignableProjectSharePermissions(projectDetail, null, projectPermissionActor)
	const projectPermissionValue = getProjectPermission(projectDetail, projectPermissionActor) as SharePermission
	const projectPermissionLabel = account?.linkShareAuth
		? getSharePermissionLabel(projectPermissionValue)
		: account?.canUseAdminBridge
			? 'Operator admin'
			: getSharePermissionLabel(projectPermissionValue)
	const projectPermissionMessage = account?.linkShareAuth
		? 'This session is authenticated through a shared project link. Project sharing stays locked even if the link allows editing.'
		: account?.canUseAdminBridge
			? 'Operator access is active for this session, so project editing and all share levels are available from the PWA.'
			: projectPermissionValue === 2
				? 'This session can edit the project and manage all project share levels.'
				: projectPermissionValue === 1
					? 'This session can edit the project and manage non-admin project shares.'
					: 'This session can view the project, but it cannot change project settings or shares.'
	const sharingBlockedMessage = account?.linkShareAuth
		? 'Shared-link sessions cannot create or manage project shares.'
		: !canManageSharing
			? 'Sharing requires Read & Write or Admin permission on this project.'
			: ''
	const adminShareRestrictionMessage = canManageSharing && !canGrantAdminShares
		? 'Admin shares require Admin permission on this project.'
		: ''
	const projectWebhookBlockedMessage = account?.linkShareAuth
		? 'Shared-link sessions cannot create or manage project webhooks.'
		: !canManageProjectWebhooks
			? 'Project webhooks require edit access on this project.'
			: ''
	const currentProjectId = Number(projectDetail?.id || 0)
	const currentProjectHasBackground = projectHasBackground(projectDetail)
	const currentBackgroundUrl = currentProjectId > 0 ? (projectBackgroundUrls[currentProjectId] ?? null) : null
	const currentBackgroundPreviewUrl = currentProjectId > 0 ? (projectBackgroundPreviewUrls[currentProjectId] ?? null) : null
	const currentResolvedBackgroundUrl = currentBackgroundUrl || currentBackgroundPreviewUrl
	const currentBackgroundUploading = currentProjectId > 0 ? Boolean(uploadingProjectBackground[currentProjectId]) : false
	const unsplashEnabled = (vikunjaInfo?.enabled_background_providers || []).includes('unsplash')
	const currentProjectWebhooks = currentProjectId > 0 ? projectWebhooks[currentProjectId] || [] : []
	const currentProjectWebhooksLoading = currentProjectId > 0 ? projectWebhooksLoadingIds.has(currentProjectId) : false

	useEffect(() => {
		setTitle(projectDetail?.title || '')
		setIdentifier(projectDetail?.identifier || '')
		setDescription(projectDetail?.description || '')
		setColor(getColorInputValue(projectDetail?.hex_color))
	}, [projectDetail?.description, projectDetail?.hex_color, projectDetail?.id, projectDetail?.identifier, projectDetail?.title])

	useEffect(() => {
		if (!projectDetail?.id || !currentProjectHasBackground || currentBackgroundUrl) {
			return
		}

		void loadProjectBackground(projectDetail.id)
	}, [currentBackgroundUrl, currentProjectHasBackground, loadProjectBackground, projectDetail?.id])

	useEffect(() => {
		if (!projectDetailOpen) {
			setOpenSections(DEFAULT_PROJECT_DETAIL_SECTIONS)
			setExpandedLinkShareId(null)
			clearShareDetail()
		}
	}, [clearShareDetail, projectDetailOpen])

	useEffect(() => {
		setUserShareQuery('')
		setUserShareResults([])
		setUserShareSearchLoading(false)
		setTeamShareQuery('')
		setTeamShareResults([])
		setTeamShareSearchLoading(false)
		setNextLinkPermission(1)
		setLinkShareName('')
		setLinkSharePassword('')
		setCopiedLinkShareId(null)
		setExpandedLinkShareId(null)
		setOpenSections(DEFAULT_PROJECT_DETAIL_SECTIONS)
		clearShareDetail()

		if (projectDetail?.id) {
			void loadProjectSharing(projectDetail.id)
		}
	}, [clearShareDetail, loadProjectSharing, projectDetail?.id])

	useEffect(() => {
		if (canGrantAdminShares) {
			return
		}

		setNextUserPermission(permission => (permission === 2 ? 1 : permission))
		setNextTeamPermission(permission => (permission === 2 ? 1 : permission))
		setNextLinkPermission(permission => (permission === 2 ? 1 : permission))
	}, [canGrantAdminShares])

	useEffect(() => {
		if (!copiedLinkShareId) {
			return
		}

		const timeoutId = window.setTimeout(() => {
			setCopiedLinkShareId(null)
		}, 1800)

		return () => window.clearTimeout(timeoutId)
	}, [copiedLinkShareId])

	useEffect(() => {
		if (!expandedLinkShareId) {
			return
		}

		if (!projectLinkShares.some(share => share.id === expandedLinkShareId)) {
			setExpandedLinkShareId(null)
			clearShareDetail()
		}
	}, [clearShareDetail, expandedLinkShareId, projectLinkShares])

	useEffect(() => {
		if (!projectDetail?.id || !openSections.webhooks) {
			return
		}
		if (!projectWebhooksLoadedIds.has(projectDetail.id) && !projectWebhooksLoadingIds.has(projectDetail.id)) {
			void loadProjectWebhooks(projectDetail.id)
		}
		if (!projectWebhookEventsLoaded) {
			void loadProjectWebhookEvents()
		}
	}, [
		loadProjectWebhookEvents,
		loadProjectWebhooks,
		openSections.webhooks,
		projectDetail?.id,
		projectWebhookEventsLoaded,
		projectWebhooksLoadedIds,
		projectWebhooksLoadingIds,
	])

	useEffect(() => {
		const normalizedQuery = `${userShareQuery || ''}`.trim()
		if (!projectDetail?.id || !normalizedQuery || !canManageSharing) {
			setUserShareResults([])
			setUserShareSearchLoading(false)
			return
		}

		let cancelled = false
		setUserShareSearchLoading(true)

		void api<UsersPayload>(`/api/users?s=${encodeURIComponent(normalizedQuery)}`)
			.then(result => {
				if (cancelled) {
					return
				}

				const sharedUsernames = new Set(projectSharedUsers.map(user => user.username))
				const currentUserId = Number(account?.user?.id || 0)
				const users = Array.isArray(result.users) ? result.users : []
				setUserShareResults(
					users
						.filter(user => user?.id && user?.username && user.id !== currentUserId && !sharedUsernames.has(user.username))
						.sort((left, right) => getUserDisplayName(left).localeCompare(getUserDisplayName(right))),
				)
			})
			.catch(() => {
				if (!cancelled) {
					setUserShareResults([])
				}
			})
			.finally(() => {
				if (!cancelled) {
					setUserShareSearchLoading(false)
				}
			})

		return () => {
			cancelled = true
		}
	}, [account?.user?.id, canManageSharing, projectDetail?.id, projectSharedUsers, userShareQuery])

	useEffect(() => {
		const normalizedQuery = `${teamShareQuery || ''}`.trim()
		if (!projectDetail?.id || !normalizedQuery || !canManageSharing) {
			setTeamShareResults([])
			setTeamShareSearchLoading(false)
			return
		}

		let cancelled = false
		setTeamShareSearchLoading(true)

		void api<TeamsPayload>(`/api/teams?s=${encodeURIComponent(normalizedQuery)}`)
			.then(result => {
				if (cancelled) {
					return
				}

				const sharedTeamIds = new Set(projectSharedTeams.map(team => team.id))
				const teams = Array.isArray(result.teams) ? result.teams : []
				setTeamShareResults(
					teams
						.filter(team => team?.id && !sharedTeamIds.has(team.id))
						.sort((left, right) => `${left.name || ''}`.localeCompare(`${right.name || ''}`)),
				)
			})
			.catch(() => {
				if (!cancelled) {
					setTeamShareResults([])
				}
			})
			.finally(() => {
				if (!cancelled) {
					setTeamShareSearchLoading(false)
				}
			})

		return () => {
			cancelled = true
		}
	}, [canManageSharing, projectDetail?.id, projectSharedTeams, teamShareQuery])

	const parentOptions = projectDetail ? getAvailableParentProjects(projectDetail.id) : []
	const projectSubscriptionKey = projectDetail ? `project:${projectDetail.id}` : ''
	const projectSubscribed = projectSubscriptionKey ? (subscriptionsByEntity[projectSubscriptionKey] ?? null) : null
	const projectSubscriptionSubmitting = projectSubscriptionKey ? subscriptionMutatingKeys.has(projectSubscriptionKey) : false

	async function handleTitleBlur() {
		if (!projectDetail || !canEditProject) {
			return
		}

		const trimmedTitle = title.trim()
		if (!trimmedTitle || trimmedTitle === projectDetail.title) {
			setTitle(projectDetail.title)
			return
		}

		const success = await saveProjectDetailPatch({title: trimmedTitle})
		if (!success) {
			setTitle(projectDetail.title)
		}
	}

	async function handleIdentifierBlur() {
		if (!projectDetail || !canEditProject) {
			return
		}

		if (identifier === (projectDetail.identifier || '')) {
			setIdentifier(projectDetail.identifier || '')
			return
		}

		const success = await saveProjectDetailPatch({identifier})
		if (!success) {
			setIdentifier(projectDetail.identifier || '')
		}
	}

	async function handleDescriptionBlur() {
		if (!projectDetail || !canEditProject) {
			return
		}

		if (description === (projectDetail.description || '')) {
			setDescription(projectDetail.description || '')
			return
		}

		const success = await saveProjectDetailPatch({description})
		if (!success) {
			setDescription(projectDetail.description || '')
		}
	}

	async function handleParentChange(parentProjectId: number) {
		if (!projectDetail || !canEditProject) {
			return
		}

		const currentParentProjectId = Number(projectDetail.parent_project_id || 0)
		if (parentProjectId === currentParentProjectId) {
			return
		}

		await saveProjectDetailPatch({parent_project_id: parentProjectId})
	}

	async function handleColorChange(nextValue: string) {
		if (!projectDetail || !canEditProject) {
			return
		}

		const normalizedColor = normalizeHexColor(nextValue)
		setColor(getColorInputValue(normalizedColor))
		if (normalizedColor === normalizeHexColor(projectDetail.hex_color || '')) {
			return
		}

		await saveProjectDetailPatch({hex_color: normalizedColor})
	}

	async function handleAddUserShare(username: string) {
		if (!projectDetail) {
			return
		}

		const success = await addProjectUserShare(projectDetail.id, username, nextUserPermission)
		if (success) {
			setUserShareQuery('')
			setUserShareResults([])
		}
	}

	async function handleAddTeamShare(teamId: number) {
		if (!projectDetail) {
			return
		}

		const success = await addProjectTeamShare(projectDetail.id, teamId, nextTeamPermission)
		if (success) {
			setTeamShareQuery('')
			setTeamShareResults([])
		}
	}

	async function handleAddLinkShare() {
		if (!projectDetail) {
			return
		}

		const success = await addProjectLinkShare(projectDetail.id, {
			name: linkShareName,
			password: linkSharePassword,
			permission: nextLinkPermission,
		})
		if (success) {
			setLinkShareName('')
			setLinkSharePassword('')
			setNextLinkPermission(1)
		}
	}

	async function handleCopyLinkShare(share: ProjectLinkShare) {
		const shareUrl = getProjectLinkShareUrl(share.hash, serverConfig?.publicAppOrigin)
		try {
			await navigator.clipboard.writeText(shareUrl)
			setCopiedLinkShareId(share.id)
		} catch {
			window.prompt('Copy this link', shareUrl)
		}
	}

	function toggleLinkShare(share: ProjectLinkShare) {
		if (!projectDetail?.id) {
			return
		}

		if (expandedLinkShareId === share.id) {
			setExpandedLinkShareId(null)
			clearShareDetail()
			return
		}

		setExpandedLinkShareId(share.id)
		void loadShareDetail(projectDetail.id, share)
	}

	const linkSharingEnabled = account?.instanceFeatures?.linkSharingEnabled !== false

	function toggleSection(section: ProjectDetailSection) {
		const keepLinkShareExpanded = section === 'linkShares' && !openSections.linkShares
		if (!keepLinkShareExpanded) {
			setExpandedLinkShareId(null)
			clearShareDetail()
		}

		setOpenSections(state => {
			const nextOpen = !state[section]
			return nextOpen ? {...CLOSED_PROJECT_DETAIL_SECTIONS, [section]: true} : CLOSED_PROJECT_DETAIL_SECTIONS
		})
	}

	function handleCloseProjectDetail() {
		setOpenSections(DEFAULT_PROJECT_DETAIL_SECTIONS)
		setExpandedLinkShareId(null)
		setBackgroundSheetOpen(false)
		setBackgroundTab('upload')
		clearShareDetail()
		closeProjectDetail()
	}

	return (
		<>
			<DetailSheet
				open={projectDetailOpen}
				closeAction="close-project-detail"
				onClose={handleCloseProjectDetail}
				mode={mode}
			>
			<div className="sheet-head detail-sheet-head">
				<div>
					<div className="panel-label">Project Detail</div>
					<div className="panel-title">{projectDetail ? projectDetail.title : 'Loading…'}</div>
				</div>
				<div className="panel-action-row">
					{projectDetail && projectSubscribed !== null ? (
						<button
							className={`pill-button ${projectSubscribed ? 'is-active' : ''}`.trim()}
							data-action="toggle-project-subscription"
							type="button"
							disabled={projectSubscriptionSubmitting}
							onClick={() => void toggleSubscription('project', projectDetail.id)}
						>
							{projectSubscriptionSubmitting ? 'Saving…' : projectSubscribed ? 'Subscribed' : 'Subscribe'}
						</button>
					) : null}
				</div>
			</div>
			{projectDetailLoading && !projectDetail ? <div className="empty-state">Loading project details…</div> : null}
				{projectDetail ? (
				<div className="project-detail-stack detail-density-compact-surface">
					<CollapsibleProjectSection
						title="Project"
						section="project"
						open={openSections.project}
						onToggle={toggleSection}
					>
						<div
							className="project-background-banner"
							data-project-background-banner="true"
							data-has-background={currentProjectHasBackground ? 'true' : 'false'}
						>
							{currentResolvedBackgroundUrl ? (
								<img src={currentResolvedBackgroundUrl} alt="" className="project-background-image" />
							) : (
								<div className="project-background-placeholder" />
							)}
							<div className="project-background-actions">
								<button
									className="pill-button"
									data-action="open-project-background-sheet"
									type="button"
									disabled={!canEditProject}
									onClick={() => {
										setBackgroundTab('upload')
										setBackgroundSheetOpen(true)
									}}
								>
									{currentProjectHasBackground ? 'Change background' : 'Add background'}
								</button>
								{currentProjectHasBackground ? (
									<button
										className="pill-button subtle"
										data-action="remove-project-background"
										type="button"
										disabled={!canEditProject}
										onClick={() => {
											if (window.confirm('Remove project background?')) {
												void removeProjectBackground(projectDetail.id)
											}
										}}
									>
										Remove
									</button>
								) : null}
							</div>
						</div>
						<div className="detail-grid detail-grid-tight project-detail-main-grid">
							<div className="detail-item detail-item-full detail-field">
								<div className="detail-label">Your access</div>
								<div className="detail-value">{projectPermissionLabel}</div>
								<div className="detail-helper-text">{projectPermissionMessage}</div>
							</div>
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">Title</div>
								<input
									className="detail-input"
									data-project-detail-title
									type="text"
									value={title}
									disabled={!canEditProject}
									onChange={event => setTitle(event.currentTarget.value)}
									onBlur={() => void handleTitleBlur()}
									onKeyDown={event => {
										if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
											event.preventDefault()
											event.currentTarget.blur()
										}
									}}
								/>
							</label>
							<label className="detail-item detail-field">
								<div className="detail-label">Parent project</div>
								<select
									className="detail-input"
									data-project-detail-parent
									value={Number(projectDetail.parent_project_id || 0)}
									disabled={!canEditProject}
									onChange={event => void handleParentChange(Number(event.currentTarget.value))}
								>
									<option value="0">Top level</option>
									{parentOptions.map(project => (
										<option key={project.id} value={project.id}>
											{getProjectAncestors(project.id).map(entry => entry.title).join(' / ')}
										</option>
									))}
								</select>
							</label>
							<label className="detail-item detail-field">
								<div className="detail-label">Identifier</div>
								<input
									className="detail-input"
									data-project-detail-identifier
									type="text"
									value={identifier}
									disabled={!canEditProject}
									onChange={event => setIdentifier(event.currentTarget.value)}
									onBlur={() => void handleIdentifierBlur()}
								/>
							</label>
							<div className="detail-item detail-field detail-toggle-item">
								<div className="detail-label">Favorite</div>
								<button
									className="detail-done-toggle"
									data-action="toggle-project-favorite"
									type="button"
									disabled={!canEditProject}
									onClick={() => void saveProjectDetailPatch({is_favorite: !projectDetail.is_favorite})}
								>
									<span className={`checkbox-button ${projectDetail.is_favorite ? 'is-checked' : ''}`.trim()}>
										{projectDetail.is_favorite ? '✓' : ''}
									</span>
									<span>{projectDetail.is_favorite ? 'Favorite' : 'Standard'}</span>
								</button>
							</div>
							<div className="detail-item detail-field detail-toggle-item">
								<div className="detail-label">Archived</div>
								<button
									className="detail-done-toggle"
									data-action="toggle-project-archived"
									type="button"
									disabled={!canEditProject}
									onClick={() => void saveProjectDetailPatch({is_archived: !projectDetail.is_archived})}
								>
									<span className={`checkbox-button ${projectDetail.is_archived ? 'is-checked' : ''}`.trim()}>
										{projectDetail.is_archived ? '✓' : ''}
									</span>
									<span>{projectDetail.is_archived ? 'Archived' : 'Active'}</span>
								</button>
							</div>
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">Color</div>
								<input
									className="detail-input detail-color-input"
									data-project-detail-color
									type="color"
									value={color}
									disabled={!canEditProject}
									onChange={event => void handleColorChange(event.currentTarget.value)}
								/>
							</label>
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">Description</div>
								<textarea
									className="detail-textarea"
									data-project-detail-description
									placeholder="No description"
									value={description}
									disabled={!canEditProject}
									onChange={event => setDescription(event.currentTarget.value)}
									onBlur={() => void handleDescriptionBlur()}
								/>
							</label>
						</div>
					</CollapsibleProjectSection>

					<div className="detail-section-list project-detail-sharing-sections">
						<CollapsibleProjectSection
							title="Webhooks"
							section="webhooks"
							open={openSections.webhooks}
							onToggle={toggleSection}
						>
							<div className="project-share-section-content">
								<WebhookManager
									scopeLabel="project"
									hooks={currentProjectWebhooks}
									eventOptions={projectWebhookEvents}
									loading={currentProjectWebhooksLoading}
									submitting={webhookSubmitting}
									disabled={!canManageProjectWebhooks}
									blockedMessage={projectWebhookBlockedMessage}
									onCreate={payload => createProjectWebhook(projectDetail.id, payload)}
									onUpdateEvents={(hookId, events) => updateProjectWebhookEvents(projectDetail.id, hookId, events)}
									onDelete={hookId => deleteProjectWebhook(projectDetail.id, hookId)}
								/>
							</div>
						</CollapsibleProjectSection>

						<CollapsibleProjectSection
							title="Shared Users"
							section="sharedUsers"
							open={openSections.sharedUsers}
							onToggle={toggleSection}
						>
							<div className="project-share-section-content">
								<div className="detail-helper-text">
									Add existing Vikunja users directly to this project and manage their permission here.
								</div>
								{sharingBlockedMessage ? <div className="detail-helper-text">{sharingBlockedMessage}</div> : null}
								{adminShareRestrictionMessage ? <div className="detail-helper-text">{adminShareRestrictionMessage}</div> : null}
								{projectSharingLoading ? <div className="empty-state compact">Loading user shares…</div> : null}
								<div className="project-share-inline-form">
									<select
										className="detail-input project-share-permission-select"
										value={nextUserPermission}
										disabled={projectSharingSubmitting || !canManageSharing}
										onChange={event => setNextUserPermission(Number(event.currentTarget.value) as SharePermission)}
									>
										{availableSharePermissions.map(permission => (
											<option key={permission} value={permission}>
												{getSharePermissionLabel(permission)}
											</option>
										))}
									</select>
									<input
										className="detail-input"
										type="text"
										placeholder="Search users"
										value={userShareQuery}
										disabled={projectSharingSubmitting || !canManageSharing}
										onChange={event => setUserShareQuery(event.currentTarget.value)}
									/>
								</div>
								{userShareSearchLoading ? <div className="empty-state compact">Searching users…</div> : null}
								{userShareQuery.trim() && !userShareSearchLoading && userShareResults.length === 0 ? (
									<div className="empty-state compact">No matching users found.</div>
								) : null}
								{userShareResults.length > 0 ? (
									<div className="detail-assignee-search-results">
										{userShareResults.map(user => (
											<button
												key={user.id}
												className="detail-assignee-search-result"
												type="button"
												disabled={projectSharingSubmitting || !canManageSharing}
												onClick={() => void handleAddUserShare(user.username)}
											>
												<span className="detail-assignee-search-token">
													<UserAvatar user={user} size={30} />
												</span>
												<span className="detail-assignee-search-copy">
													<span className="detail-assignee-search-name">{getUserDisplayName(user)}</span>
													<span className="detail-meta">{user.username}</span>
												</span>
											</button>
										))}
									</div>
								) : null}
								{!projectSharingLoading && projectSharedUsers.length === 0 ? (
									<div className="empty-state compact">No direct user shares yet.</div>
								) : null}
								{projectSharedUsers.length > 0 ? (
									<div className="detail-assignee-list">
										{projectSharedUsers.map(user => (
											<div key={user.id} className="detail-assignee-row project-share-row">
												<div className="detail-assignee-pill">
													<span className="detail-assignee-pill-token">
														<UserAvatar user={user} size={30} />
													</span>
													<span className="detail-assignee-pill-name">
														<span className="detail-assignee-primary">{getUserDisplayName(user)}</span>
														<span className="detail-meta">{user.username}</span>
													</span>
												</div>
												<div className="project-share-actions">
													<select
														className="detail-input project-share-permission-select"
														value={user.permission}
														disabled={
															projectSharingSubmitting ||
															!canManageSharing ||
															!canManageProjectSharePermission(projectDetail, user.permission, projectPermissionActor)
														}
														onChange={event => void updateProjectUserShare(
															projectDetail.id,
															user.username,
															Number(event.currentTarget.value) as SharePermission,
														)}
													>
														{getAssignableProjectSharePermissions(projectDetail, user.permission, projectPermissionActor).map(permission => (
															<option key={permission} value={permission}>{getSharePermissionLabel(permission)}</option>
														))}
													</select>
													<button
														className="pill-button subtle"
														type="button"
														disabled={
															projectSharingSubmitting ||
															!canManageSharing ||
															!canManageProjectSharePermission(projectDetail, user.permission, projectPermissionActor)
														}
														onClick={() => void removeProjectUserShare(projectDetail.id, user.username)}
													>
														Remove
													</button>
												</div>
											</div>
										))}
									</div>
								) : null}
							</div>
						</CollapsibleProjectSection>

						<CollapsibleProjectSection
							title="Shared Teams"
							section="sharedTeams"
							open={openSections.sharedTeams}
							onToggle={toggleSection}
						>
							<div className="project-share-section-content">
								<div className="detail-helper-text">
									Share this project with a whole team and keep team-level access synchronized from Settings.
								</div>
								{sharingBlockedMessage ? <div className="detail-helper-text">{sharingBlockedMessage}</div> : null}
								{adminShareRestrictionMessage ? <div className="detail-helper-text">{adminShareRestrictionMessage}</div> : null}
								<div className="project-share-inline-form">
									<select
										className="detail-input project-share-permission-select"
										value={nextTeamPermission}
										disabled={projectSharingSubmitting || !canManageSharing}
										onChange={event => setNextTeamPermission(Number(event.currentTarget.value) as SharePermission)}
									>
										{availableSharePermissions.map(permission => (
											<option key={permission} value={permission}>{getSharePermissionLabel(permission)}</option>
										))}
									</select>
									<input
										className="detail-input"
										type="text"
										placeholder="Search teams"
										value={teamShareQuery}
										disabled={projectSharingSubmitting || !canManageSharing}
										onChange={event => setTeamShareQuery(event.currentTarget.value)}
									/>
								</div>
								{teamShareSearchLoading ? <div className="empty-state compact">Searching teams…</div> : null}
								{teamShareQuery.trim() && !teamShareSearchLoading && teamShareResults.length === 0 ? (
									<div className="empty-state compact">No matching teams found.</div>
								) : null}
								{teamShareResults.length > 0 ? (
									<div className="detail-assignee-search-results">
										{teamShareResults.map(team => (
											<button
												key={team.id}
												className="detail-assignee-search-result"
												type="button"
												disabled={projectSharingSubmitting || !canManageSharing}
												onClick={() => void handleAddTeamShare(team.id)}
											>
												<span className="detail-assignee-search-token">{`${team.name || '?'} `.trim().slice(0, 2).toUpperCase()}</span>
												<span className="detail-assignee-search-copy">
													<span className="detail-assignee-search-name">{team.name}</span>
													<span className="detail-meta">{team.description || 'No description'}</span>
												</span>
											</button>
										))}
									</div>
								) : null}
								{!projectSharingLoading && projectSharedTeams.length === 0 ? (
									<div className="empty-state compact">No team shares yet.</div>
								) : null}
								{projectSharedTeams.length > 0 ? (
									<div className="detail-assignee-list">
										{projectSharedTeams.map(team => (
											<div key={team.id} className="detail-assignee-row project-share-row">
												<div className="detail-assignee-pill">
													<span className="detail-assignee-pill-token">{`${team.name || '?'} `.trim().slice(0, 2).toUpperCase()}</span>
													<span className="detail-assignee-pill-name">
														<span className="detail-assignee-primary">{team.name}</span>
														<span className="detail-meta">{team.description || 'No description'}</span>
													</span>
												</div>
												<div className="project-share-actions">
													<select
														className="detail-input project-share-permission-select"
														value={team.permission}
														disabled={
															projectSharingSubmitting ||
															!canManageSharing ||
															!canManageProjectSharePermission(projectDetail, team.permission, projectPermissionActor)
														}
														onChange={event => void updateProjectTeamShare(
															projectDetail.id,
															team.id,
															Number(event.currentTarget.value) as SharePermission,
														)}
													>
														{getAssignableProjectSharePermissions(projectDetail, team.permission, projectPermissionActor).map(permission => (
															<option key={permission} value={permission}>{getSharePermissionLabel(permission)}</option>
														))}
													</select>
													<button
														className="pill-button subtle"
														type="button"
														disabled={
															projectSharingSubmitting ||
															!canManageSharing ||
															!canManageProjectSharePermission(projectDetail, team.permission, projectPermissionActor)
														}
														onClick={() => void removeProjectTeamShare(projectDetail.id, team.id)}
													>
														Remove
													</button>
												</div>
											</div>
										))}
									</div>
								) : null}
							</div>
						</CollapsibleProjectSection>

						<CollapsibleProjectSection
							title="Link Shares"
							section="linkShares"
							open={openSections.linkShares}
							onToggle={toggleSection}
						>
							<div className="project-share-section-content">
								<div className="detail-helper-text">
									Create share links for people who should access this project without a named Vikunja account.
								</div>
								{sharingBlockedMessage ? <div className="detail-helper-text">{sharingBlockedMessage}</div> : null}
								{adminShareRestrictionMessage ? <div className="detail-helper-text">{adminShareRestrictionMessage}</div> : null}
								{!linkSharingEnabled ? (
									<div className="empty-state compact">Link sharing is disabled on this Vikunja instance.</div>
								) : (
									<>
										<div className="project-link-share-form">
											<select
												className="detail-input project-share-permission-select"
												value={nextLinkPermission}
												disabled={projectSharingSubmitting || !canManageSharing}
												onChange={event => setNextLinkPermission(Number(event.currentTarget.value) as SharePermission)}
											>
												{availableSharePermissions.map(permission => (
													<option key={permission} value={permission}>{getSharePermissionLabel(permission)}</option>
												))}
											</select>
											<input
												className="detail-input"
												data-project-link-share-name
												type="text"
												placeholder="Link name (optional)"
												value={linkShareName}
												disabled={projectSharingSubmitting || !canManageSharing}
												onChange={event => setLinkShareName(event.currentTarget.value)}
											/>
											<input
												className="detail-input project-link-share-password"
												data-project-link-share-password
												type="password"
												placeholder="Password (optional)"
												value={linkSharePassword}
												disabled={projectSharingSubmitting || !canManageSharing}
												onChange={event => setLinkSharePassword(event.currentTarget.value)}
											/>
											<button
												className="pill-button"
												data-action="create-project-link-share"
												type="button"
												disabled={projectSharingSubmitting || !canManageSharing}
												onClick={() => void handleAddLinkShare()}
											>
												Create link
											</button>
										</div>
										{projectSharingLoading ? <div className="empty-state compact">Loading link shares…</div> : null}
										{!projectSharingLoading && projectLinkShares.length === 0 ? (
											<div className="empty-state compact">No link shares yet.</div>
										) : null}
										{projectLinkShares.length > 0 ? (
											<div className="detail-assignee-list">
												{projectLinkShares.map(share => {
													const shareUrl = getProjectLinkShareUrl(share.hash, serverConfig?.publicAppOrigin)
													const expanded = expandedLinkShareId === share.id
													const detailShare = selectedShareDetail?.id === share.id ? selectedShareDetail : share
													return (
													<div
														key={share.id}
														className={`detail-item detail-field project-link-share-card ${expanded ? 'is-expanded' : ''}`.trim()}
														data-project-link-share-row={share.id}
													>
														<div className="project-link-share-summary-row">
															<button
																className="project-link-share-summary"
																data-action="toggle-project-link-share"
																data-share-id={share.id}
																type="button"
																aria-expanded={expanded ? 'true' : 'false'}
																onClick={() => toggleLinkShare(share)}
															>
																<div className="detail-assignee-pill">
																	<span className="detail-assignee-pill-token">LK</span>
																	<span className="detail-assignee-pill-name">
																		<span className="detail-assignee-primary">{share.name || 'Unnamed link'}</span>
																		<span className="detail-meta">
																			{getSharePermissionLabel(share.permission)}
																			{share.shared_by?.name || share.shared_by?.username
																				? ` · Shared by ${getUserDisplayName(share.shared_by)}`
																				: ''}
																		</span>
																	</span>
																</div>
															</button>
															<button
																className="pill-button subtle settings-copy-field-button project-link-share-summary-copy"
																data-action="copy-project-link-share-summary"
																data-share-id={share.id}
																type="button"
																disabled={projectSharingSubmitting}
																onClick={() => void handleCopyLinkShare(share)}
															>
																{copiedLinkShareId === share.id ? 'Copied' : 'Copy'}
															</button>
														</div>
														{expanded ? (
															<div className="project-link-share-detail-grid" data-project-link-share-detail={share.id}>
																{shareDetailLoading ? <div className="detail-helper-text">Refreshing share details…</div> : null}
																<div className="detail-grid detail-grid-tight">
																	<div className="detail-item detail-field">
																		<div className="detail-label">Name</div>
																		<div className="detail-value">{detailShare.name || 'Unnamed link'}</div>
																	</div>
																	<div className="detail-item detail-field">
																		<div className="detail-label">Permission</div>
																		<div className="detail-value">{getSharePermissionLabel(detailShare.permission)}</div>
																	</div>
																	<div className="detail-item detail-field">
																		<div className="detail-label">Shared by</div>
																		<div className="detail-value">
																			{detailShare.shared_by ? getUserDisplayName(detailShare.shared_by) : 'Unknown'}
																		</div>
																	</div>
																	<div className="detail-item detail-field">
																		<div className="detail-label">Password protected</div>
																		<div className="detail-value">{detailShare.password_protected ? 'Yes' : 'No'}</div>
																	</div>
																	<div className="detail-item detail-item-full detail-field">
																		<div className="detail-label">Share link</div>
																		<div className="settings-copy-field-row">
																			<input
																				className="detail-input project-link-share-url"
																				type="text"
																				readOnly
																				value={shareUrl}
																			/>
																			<button
																				className="pill-button subtle settings-copy-field-button"
																				data-action="copy-project-link-share"
																				data-share-id={share.id}
																				type="button"
																				disabled={projectSharingSubmitting}
																				onClick={() => void handleCopyLinkShare(share)}
																			>
																				{copiedLinkShareId === share.id ? 'Copied' : 'Copy'}
																			</button>
																		</div>
																	</div>
																	<div className="detail-item detail-item-full detail-field">
																		<div className="detail-label">Hash</div>
																		<div className="detail-value">{detailShare.hash}</div>
																	</div>
																	<div className="detail-item detail-field">
																		<div className="detail-label">Created</div>
																		<div className="detail-value">{formatOptionalLongDate(detailShare.created || null) || 'Not available'}</div>
																	</div>
																	<div className="detail-item detail-field">
																		<div className="detail-label">Expiry</div>
																		<div className="detail-value">{formatOptionalLongDate(detailShare.expires || null) || 'Never'}</div>
																	</div>
																</div>
																<div className="detail-inline-actions">
																	<button
																		className="pill-button subtle"
																		data-action="remove-project-link-share"
																		data-share-id={share.id}
																		type="button"
																		disabled={
																			projectSharingSubmitting ||
																			!canManageSharing ||
																			!canManageProjectSharePermission(projectDetail, share.permission)
																		}
																		onClick={() => void removeProjectLinkShare(projectDetail.id, share.id)}
																	>
																		Remove
																	</button>
																</div>
															</div>
														) : null}
													</div>
													)
												})}
											</div>
										) : null}
									</>
								)}
							</div>
						</CollapsibleProjectSection>
					</div>
				</div>
				) : null}
				{projectDetail ? (
					<DetailSheet
						open={backgroundSheetOpen}
						closeAction="close-project-background-sheet"
						onClose={() => {
							setBackgroundSheetOpen(false)
							setBackgroundTab('upload')
						}}
						mode={mode}
					>
						<div className="sheet-head detail-sheet-head">
							<div>
								<div className="panel-label">Project Background</div>
								<div className="panel-title">{projectDetail.title}</div>
							</div>
						</div>
						<div className="detail-core-card background-sheet-card" data-form="project-background">
							<div className="background-sheet-tabs">
								<button
									className={`pill-button ${backgroundTab === 'upload' ? 'is-active' : ''}`.trim()}
									data-background-tab="upload"
									type="button"
									onClick={() => setBackgroundTab('upload')}
								>
									Upload
								</button>
								{unsplashEnabled ? (
									<button
										className={`pill-button ${backgroundTab === 'unsplash' ? 'is-active' : ''}`.trim()}
										data-background-tab="unsplash"
										type="button"
										onClick={() => setBackgroundTab('unsplash')}
									>
										Unsplash
									</button>
								) : null}
							</div>
							{backgroundTab === 'upload' ? (
								<div className="background-upload-tab">
									<label className="detail-field">
										<div className="detail-label">Upload image</div>
										<input
											className="detail-input"
											data-project-background-file="true"
											type="file"
											accept="image/*"
											disabled={!canEditProject || currentBackgroundUploading}
											onChange={event => {
												const file = event.currentTarget.files?.[0]
												if (!projectDetail?.id || !file) {
													return
												}
												void uploadProjectBackground(projectDetail.id, file)
													.then(() => {
														setBackgroundSheetOpen(false)
														setBackgroundTab('upload')
													})
													.catch(error => {
														console.error('Failed to upload project background', error)
													})
													.finally(() => {
														event.currentTarget.value = ''
													})
											}}
										/>
									</label>
									<div className="detail-helper-text">JPEG or PNG, max 15 MB.</div>
									{!canEditProject ? (
										<div className="detail-helper-text">Edit access is required to change the project background.</div>
									) : currentBackgroundUploading ? (
										<div className="detail-helper-text">Uploading background…</div>
									) : null}
								</div>
							) : (
								<UnsplashBackgroundPicker
									projectId={projectDetail.id}
									onSelected={() => {
										setBackgroundSheetOpen(false)
										setBackgroundTab('upload')
									}}
								/>
							)}
						</div>
					</DetailSheet>
				) : null}
			</DetailSheet>
		</>
	)
}

function getProjectLinkShareUrl(hash: string, publicOrigin?: string | null) {
	if (typeof window === 'undefined') {
		return `/share/${hash}/auth`
	}

	return new URL(`/share/${hash}/auth`, `${publicOrigin || ''}`.trim() || window.location.origin).toString()
}

function CollapsibleProjectSection({
	title,
	section,
	open,
	onToggle,
	children,
}: {
	title: string
	section: ProjectDetailSection
	open: boolean
	onToggle: (section: ProjectDetailSection) => void
	children: ReactNode
}) {
	return (
		<section className={`detail-section ${open ? 'is-open' : ''}`.trim()} data-detail-section={section}>
			<button
				className="detail-section-toggle"
				type="button"
				data-action="toggle-detail-section"
				data-detail-section-toggle={section}
				aria-expanded={open ? 'true' : 'false'}
				onClick={() => onToggle(section)}
			>
				<span className="detail-section-toggle-copy">
					<span className="detail-label">{title}</span>
				</span>
				<span className="detail-section-chevron" aria-hidden="true">
					{open ? '▾' : '▸'}
				</span>
			</button>
			{open ? <div className="detail-section-content">{children}</div> : null}
		</section>
	)
}

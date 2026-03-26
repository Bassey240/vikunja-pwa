import {APP_VERSION} from '@/appVersion'
import {CLIENT_BUILD_ID} from '@/clientBuildId'
import StatusCards from '@/components/layout/StatusCards'
import Topbar from '@/components/layout/Topbar'
import SettingsAccountSection from '@/components/screens/settings/SettingsAccountSection'
import SettingsAdminSection from '@/components/screens/settings/SettingsAdminSection'
import SettingsAppDataSection from '@/components/screens/settings/SettingsAppDataSection'
import SettingsCollaborationSection from '@/components/screens/settings/SettingsCollaborationSection'
import SettingsNotificationsSection from '@/components/screens/settings/SettingsNotificationsSection'
import SettingsOfflineSection from '@/components/screens/settings/SettingsOfflineSection'
import SettingsPreferencesSection from '@/components/screens/settings/SettingsPreferencesSection'
import SettingsTeamsSection from '@/components/screens/settings/SettingsTeamsSection'
import InlineRootTaskComposer from '@/components/tasks/InlineRootTaskComposer'
import {useAppStore} from '@/store'
import {
	type SettingsSectionId,
} from '@/utils/settings-helpers'
import {type FormEvent, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'

export default function SettingsScreen() {
	const navigate = useNavigate()
	const account = useAppStore(state => state.account)
	const connected = useAppStore(state => state.connected)
	const serverConfig = useAppStore(state => state.serverConfig)
	const accountForm = useAppStore(state => state.accountForm)
	const settingsSubmitting = useAppStore(state => state.settingsSubmitting)
	const accountSessionsLoading = useAppStore(state => state.accountSessionsLoading)
	const accountSessionsLoaded = useAppStore(state => state.accountSessionsLoaded)
	const accountSessions = useAppStore(state => state.accountSessions)
	const settingsNotice = useAppStore(state => state.settingsNotice)
	const isOnline = useAppStore(state => state.isOnline)
	const isSecureContext = useAppStore(state => state.isSecureContext)
	const standaloneDisplayMode = useAppStore(state => state.standaloneDisplayMode)
	const serviceWorkerSupported = useAppStore(state => state.serviceWorkerSupported)
	const serviceWorkerRegistered = useAppStore(state => state.serviceWorkerRegistered)
	const serviceWorkerUpdateAvailable = useAppStore(state => state.serviceWorkerUpdateAvailable)
	const serviceWorkerError = useAppStore(state => state.serviceWorkerError)
	const browserNotificationsSupported = useAppStore(state => state.browserNotificationsSupported)
	const pushManagerSupported = useAppStore(state => state.pushManagerSupported)
	const browserNotificationPermission = useAppStore(state => state.browserNotificationPermission)
	const notificationPermissionRequesting = useAppStore(state => state.notificationPermissionRequesting)
	const passwordChangeSubmitting = useAppStore(state => state.passwordChangeSubmitting)
	const changePasswordForm = useAppStore(state => state.changePasswordForm)
	const timezoneOptionsLoading = useAppStore(state => state.timezoneOptionsLoading)
	const timezoneOptionsLoaded = useAppStore(state => state.timezoneOptionsLoaded)
	const timezoneOptions = useAppStore(state => state.timezoneOptions)
	const timezoneSubmitting = useAppStore(state => state.timezoneSubmitting)
	const collaborationSettingsSubmitting = useAppStore(state => state.collaborationSettingsSubmitting)
	const adminUsers = useAppStore(state => state.adminUsers)
	const adminUsersLoading = useAppStore(state => state.adminUsersLoading)
	const adminUsersLoaded = useAppStore(state => state.adminUsersLoaded)
	const adminUserSubmitting = useAppStore(state => state.adminUserSubmitting)
	const adminRuntimeHealth = useAppStore(state => state.adminRuntimeHealth)
	const adminRuntimeHealthLoading = useAppStore(state => state.adminRuntimeHealthLoading)
	const teams = useAppStore(state => state.teams)
	const teamsLoaded = useAppStore(state => state.teamsLoaded)
	const teamsLoading = useAppStore(state => state.teamsLoading)
	const teamSubmitting = useAppStore(state => state.teamSubmitting)
	const theme = useAppStore(state => state.theme)
	const setAccountField = useAppStore(state => state.setAccountField)
	const setAccountAuthMode = useAppStore(state => state.setAccountAuthMode)
	const setTheme = useAppStore(state => state.setTheme)
	const setChangePasswordField = useAppStore(state => state.setChangePasswordField)
	const login = useAppStore(state => state.login)
	const disconnectAccount = useAppStore(state => state.disconnectAccount)
	const loadAccountSessions = useAppStore(state => state.loadAccountSessions)
	const loadTimezoneOptions = useAppStore(state => state.loadTimezoneOptions)
	const updateTimezone = useAppStore(state => state.updateTimezone)
	const changePassword = useAppStore(state => state.changePassword)
	const logoutAccount = useAppStore(state => state.logoutAccount)
	const revokeAccountSession = useAppStore(state => state.revokeAccountSession)
	const refreshAppData = useAppStore(state => state.refreshAppData)
	const refreshRuntimeState = useAppStore(state => state.refreshRuntimeState)
	const requestBrowserNotificationPermission = useAppStore(state => state.requestBrowserNotificationPermission)
	const sendTestBrowserNotification = useAppStore(state => state.sendTestBrowserNotification)
	const applyServiceWorkerUpdate = useAppStore(state => state.applyServiceWorkerUpdate)
	const openRootComposer = useAppStore(state => state.openRootComposer)
	const loadAdminUsers = useAppStore(state => state.loadAdminUsers)
	const loadAdminRuntimeHealth = useAppStore(state => state.loadAdminRuntimeHealth)
	const createAdminUser = useAppStore(state => state.createAdminUser)
	const updateAdminUser = useAppStore(state => state.updateAdminUser)
	const setAdminUserEnabled = useAppStore(state => state.setAdminUserEnabled)
	const resetAdminUserPassword = useAppStore(state => state.resetAdminUserPassword)
	const deleteAdminUser = useAppStore(state => state.deleteAdminUser)
	const saveCollaborationSettings = useAppStore(state => state.saveCollaborationSettings)
	const notificationPreferencesSubmitting = useAppStore(state => state.notificationPreferencesSubmitting)
	const saveNotificationPreferences = useAppStore(state => state.saveNotificationPreferences)
	const loadTeams = useAppStore(state => state.loadTeams)
	const createTeam = useAppStore(state => state.createTeam)
	const updateTeam = useAppStore(state => state.updateTeam)
	const deleteTeam = useAppStore(state => state.deleteTeam)
	const addTeamMember = useAppStore(state => state.addTeamMember)
	const removeTeamMember = useAppStore(state => state.removeTeamMember)
	const toggleTeamMemberAdmin = useAppStore(state => state.toggleTeamMemberAdmin)
	const [openSections, setOpenSections] = useState<Record<SettingsSectionId, boolean>>({
		account: false,
		preferences: false,
		offline: false,
		notifications: false,
		collaboration: false,
		userAdministration: false,
		teams: false,
		appData: false,
	})

	const canManageUsers = Boolean(account?.authMode === 'password' && account?.isAdmin)
	const adminBridgeReady = Boolean(
		adminRuntimeHealth?.dockerReachable &&
		adminRuntimeHealth?.vikunjaContainerFound &&
		adminRuntimeHealth?.vikunjaCliReachable,
	)
	const adminBridgeFailedChecks = adminRuntimeHealth
		? [
			!adminRuntimeHealth.dockerReachable ? 'Docker' : null,
			!adminRuntimeHealth.vikunjaContainerFound ? 'container' : null,
			!adminRuntimeHealth.vikunjaCliReachable ? 'CLI' : null,
		].filter((value): value is string => Boolean(value))
		: []

	useEffect(() => {
		if (connected && account?.sessionsSupported && !accountSessionsLoaded && !accountSessionsLoading) {
			void loadAccountSessions()
		}
	}, [
		account?.sessionsSupported,
		accountSessionsLoaded,
		accountSessionsLoading,
		connected,
		loadAccountSessions,
	])

	useEffect(() => {
		if (connected && account?.authMode === 'password' && !timezoneOptionsLoaded && !timezoneOptionsLoading) {
			void loadTimezoneOptions()
		}
	}, [account?.authMode, connected, loadTimezoneOptions, timezoneOptionsLoaded, timezoneOptionsLoading])

	useEffect(() => {
		if (!canManageUsers) {
			return
		}

		if (!adminRuntimeHealth && !adminRuntimeHealthLoading) {
			void loadAdminRuntimeHealth()
		}
	}, [
		adminRuntimeHealth,
		adminRuntimeHealthLoading,
		canManageUsers,
		loadAdminRuntimeHealth,
	])

	useEffect(() => {
		if (!canManageUsers || !adminBridgeReady || adminUsersLoaded || adminUsersLoading) {
			return
		}

		void loadAdminUsers()
	}, [adminBridgeReady, adminUsersLoaded, adminUsersLoading, canManageUsers, loadAdminUsers])

	useEffect(() => {
		if (!connected || teamsLoaded || teamsLoading) {
			return
		}

		void loadTeams()
	}, [connected, loadTeams, teamsLoaded, teamsLoading])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await login()
		if (success) {
			navigate('/', {replace: true})
		}
	}

	async function handleDisconnect() {
		const success = await disconnectAccount()
		if (success) {
			navigate('/settings', {replace: true})
		}
	}

	async function handleTimezoneChange(timezone: string) {
		if (timezone && timezone !== account?.user?.settings?.timezone) {
			await updateTimezone(timezone)
		}
	}

	async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		await changePassword()
	}

	function toggleSection(section: SettingsSectionId) {
		setOpenSections(state => {
			const nextState = Object.keys(state).reduce(
				(result, key) => ({
					...result,
					[key]: false,
				}),
				{} as Record<SettingsSectionId, boolean>,
			)

			if (!state[section]) {
				nextState[section] = true
			}

			return nextState
		})
	}

	const buildId = serverConfig?.buildId || 'unknown'
	const showPasswordForm = accountForm.authMode === 'password'
	const currentTimezone = `${account?.user?.settings?.timezone || ''}`.trim()
	const canChangePassword = account?.authMode === 'password'
	const canLogout = account?.source === 'account' && account?.authMode === 'password'

	return (
		<div className="surface">
			<Topbar
				desktopHeadingTitle="Settings"
				desktopHeadingCount={account ? 'Live' : 'Idle'}
				primaryAction={{
					action: 'open-root-composer',
					label: 'Add task',
					text: '+',
					className: 'topbar-primary-add-button',
					onClick: () => openRootComposer({placement: 'center'}),
				}}
			/>
			<div className="surface-content">
				<StatusCards />
				<section className="panel screen-card settings-screen-card">
					<div className="panel-head desktop-promoted-panel-head">
						<div className="panel-heading-inline">
							<h2 className="panel-title">Settings</h2>
							<div className="count-chip">{account ? 'Live' : 'Idle'}</div>
						</div>
					</div>
					<div className="screen-body detail-density-compact-surface settings-screen-body">
						<InlineRootTaskComposer />
						{settingsNotice ? <div className="empty-state compact settings-notice">{settingsNotice}</div> : null}
						{!account ? (
							<div className="empty-state">Connect a Vikunja account to start syncing projects and tasks.</div>
						) : null}
						<SettingsAccountSection
							open={openSections.account}
							onToggle={toggleSection}
							account={account}
							accountForm={accountForm}
							settingsSubmitting={settingsSubmitting}
							accountSessionsLoading={accountSessionsLoading}
							accountSessions={accountSessions}
							changePasswordForm={changePasswordForm}
							passwordChangeSubmitting={passwordChangeSubmitting}
							currentTimezone={currentTimezone}
							showPasswordForm={showPasswordForm}
							canChangePassword={canChangePassword}
							canLogout={canLogout}
							onDisconnect={handleDisconnect}
							onLogout={() => {
								void logoutAccount()
							}}
							onSetAccountAuthMode={setAccountAuthMode}
							onSetAccountField={setAccountField}
							onSubmit={handleSubmit}
							onReloadSessions={() => {
								void loadAccountSessions()
							}}
							onRevokeAccountSession={sessionId => {
								void revokeAccountSession(sessionId)
							}}
							onSetChangePasswordField={setChangePasswordField}
							onPasswordChange={handlePasswordChange}
						/>
						{account ? (
							<SettingsPreferencesSection
								open={openSections.preferences}
								onToggle={toggleSection}
								accountAuthMode={account?.authMode}
								theme={theme}
								onSetTheme={setTheme}
								timezoneOptionsLoading={timezoneOptionsLoading}
								currentTimezone={currentTimezone}
								timezoneSubmitting={timezoneSubmitting}
								timezoneOptions={timezoneOptions}
								onTimezoneChange={timezone => {
									void handleTimezoneChange(timezone)
								}}
							/>
						) : null}
						{account ? (
							<SettingsOfflineSection
								open={openSections.offline}
								onToggle={toggleSection}
								isOnline={isOnline}
								serviceWorkerSupported={serviceWorkerSupported}
								serviceWorkerRegistered={serviceWorkerRegistered}
								serviceWorkerUpdateAvailable={serviceWorkerUpdateAvailable}
								serviceWorkerError={serviceWorkerError}
								isSecureContext={isSecureContext}
								standaloneWebApp={standaloneDisplayMode}
								onApplyServiceWorkerUpdate={() => {
									void applyServiceWorkerUpdate()
								}}
							/>
						) : null}
						{account ? (
							<SettingsNotificationsSection
								open={openSections.notifications}
								onToggle={toggleSection}
								frontendSettings={account.user?.settings?.frontend_settings}
								pushManagerSupported={pushManagerSupported}
								isSecureContext={isSecureContext}
								standaloneWebApp={standaloneDisplayMode}
								browserNotificationsSupported={browserNotificationsSupported}
								browserNotificationPermission={browserNotificationPermission}
								notificationPermissionRequesting={notificationPermissionRequesting}
								notificationPreferencesSubmitting={notificationPreferencesSubmitting}
								onRefreshRuntimeState={() => {
									void refreshRuntimeState()
								}}
								onRequestBrowserNotificationPermission={() => {
									void requestBrowserNotificationPermission()
								}}
								onSendTestBrowserNotification={() => {
									void sendTestBrowserNotification()
								}}
								onSubmit={saveNotificationPreferences}
							/>
						) : null}
						{account ? (
							<SettingsCollaborationSection
								open={openSections.collaboration}
								onToggle={toggleSection}
								name={account.user?.name || ''}
								discoverableByName={Boolean(account.user?.settings?.discoverable_by_name)}
								discoverableByEmail={Boolean(account.user?.settings?.discoverable_by_email)}
								collaborationSettingsSubmitting={collaborationSettingsSubmitting}
								onSubmit={saveCollaborationSettings}
							/>
						) : null}
						{account?.authMode === 'password' ? (
							<SettingsAdminSection
								open={openSections.userAdministration}
								onToggle={toggleSection}
								accountUser={account.user}
								accountIsAdmin={Boolean(account.isAdmin)}
								canManageUsers={canManageUsers}
								adminUsers={adminUsers}
								adminUsersLoading={adminUsersLoading}
								adminUsersLoaded={adminUsersLoaded}
								adminUserSubmitting={adminUserSubmitting}
								adminRuntimeHealth={adminRuntimeHealth}
								adminBridgeFailedChecks={adminBridgeFailedChecks}
								adminRuntimeHealthLoading={adminRuntimeHealthLoading}
								onReloadRuntimeHealth={() => {
									void loadAdminRuntimeHealth()
								}}
								onReloadUsers={() => {
									void loadAdminUsers()
								}}
								onCreateAdminUser={createAdminUser}
								onUpdateAdminUser={updateAdminUser}
								onSetAdminUserEnabled={setAdminUserEnabled}
								onResetAdminUserPassword={resetAdminUserPassword}
								onDeleteAdminUser={deleteAdminUser}
							/>
						) : null}
						{account ? (
							<SettingsTeamsSection
								open={openSections.teams}
								onToggle={toggleSection}
								teams={teams}
								teamsLoaded={teamsLoaded}
								teamsLoading={teamsLoading}
								teamSubmitting={teamSubmitting}
								currentUsername={`${account.user?.username || ''}`}
								onReload={() => {
									void loadTeams({force: true})
								}}
								onEditTeam={updateTeam}
								onAddTeamMember={addTeamMember}
								onCreateTeam={createTeam}
								onDeleteTeam={deleteTeam}
								onToggleTeamMemberAdmin={toggleTeamMemberAdmin}
								onRemoveTeamMember={removeTeamMember}
							/>
						) : null}
						<SettingsAppDataSection
							open={openSections.appData}
							onToggle={toggleSection}
							appVersion={APP_VERSION}
							buildId={buildId}
							clientBuildId={CLIENT_BUILD_ID}
							onRefreshAppData={() => {
								void refreshAppData()
							}}
						/>
					</div>
				</section>
			</div>
		</div>
	)
}

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
import SettingsSecuritySection from '@/components/screens/settings/SettingsSecuritySection'
import SettingsTeamsSection from '@/components/screens/settings/SettingsTeamsSection'
import InlineRootTaskComposer from '@/components/tasks/InlineRootTaskComposer'
import {useAppStore} from '@/store'
import {
	type SettingsSectionId,
} from '@/utils/settings-helpers'
import {type FormEvent, useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'

export default function SettingsScreen() {
	const navigate = useNavigate()
	const location = useLocation()
	const account = useAppStore(state => state.account)
	const connected = useAppStore(state => state.connected)
	const serverConfig = useAppStore(state => state.serverConfig)
	const accountForm = useAppStore(state => state.accountForm)
	const settingsSubmitting = useAppStore(state => state.settingsSubmitting)
	const accountSessionsLoading = useAppStore(state => state.accountSessionsLoading)
	const accountSessionsLoaded = useAppStore(state => state.accountSessionsLoaded)
	const accountSessions = useAppStore(state => state.accountSessions)
	const settingsNotice = useAppStore(state => state.settingsNotice)
	const timezoneNotice = useAppStore(state => state.timezoneNotice)
	const changeEmailNotice = useAppStore(state => state.changeEmailNotice)
	const dataExportNotice = useAppStore(state => state.dataExportNotice)
	const accountDeletionNotice = useAppStore(state => state.accountDeletionNotice)
	const isOnline = useAppStore(state => state.isOnline)
	const isSecureContext = useAppStore(state => state.isSecureContext)
	const standaloneDisplayMode = useAppStore(state => state.standaloneDisplayMode)
	const serviceWorkerSupported = useAppStore(state => state.serviceWorkerSupported)
	const serviceWorkerRegistered = useAppStore(state => state.serviceWorkerRegistered)
	const serviceWorkerUpdateAvailable = useAppStore(state => state.serviceWorkerUpdateAvailable)
	const serviceWorkerError = useAppStore(state => state.serviceWorkerError)
	const offlineQueueCount = useAppStore(state => state.offlineQueueCount)
	const offlineQueueFailedCount = useAppStore(state => state.offlineQueueFailedCount)
	const offlineSyncInProgress = useAppStore(state => state.offlineSyncInProgress)
	const browserNotificationsSupported = useAppStore(state => state.browserNotificationsSupported)
	const pushManagerSupported = useAppStore(state => state.pushManagerSupported)
	const browserNotificationPermission = useAppStore(state => state.browserNotificationPermission)
	const notificationPermissionRequesting = useAppStore(state => state.notificationPermissionRequesting)
	const passwordChangeSubmitting = useAppStore(state => state.passwordChangeSubmitting)
	const changePasswordForm = useAppStore(state => state.changePasswordForm)
	const changeEmailForm = useAppStore(state => state.changeEmailForm)
	const changeEmailSubmitting = useAppStore(state => state.changeEmailSubmitting)
	const dataExportStatus = useAppStore(state => state.dataExportStatus)
	const dataExportStatusLoading = useAppStore(state => state.dataExportStatusLoading)
	const dataExportRequesting = useAppStore(state => state.dataExportRequesting)
	const dataExportDownloading = useAppStore(state => state.dataExportDownloading)
	const accountDeletionForm = useAppStore(state => state.accountDeletionForm)
	const accountDeletionRequesting = useAppStore(state => state.accountDeletionRequesting)
	const accountDeletionCancelling = useAppStore(state => state.accountDeletionCancelling)
	const timezoneOptionsLoading = useAppStore(state => state.timezoneOptionsLoading)
	const timezoneOptionsLoaded = useAppStore(state => state.timezoneOptionsLoaded)
	const timezoneOptions = useAppStore(state => state.timezoneOptions)
	const timezoneSubmitting = useAppStore(state => state.timezoneSubmitting)
	const vikunjaInfo = useAppStore(state => state.vikunjaInfo)
	const vikunjaInfoLoading = useAppStore(state => state.vikunjaInfoLoading)
	const totpSettings = useAppStore(state => state.totpSettings)
	const totpSettingsLoading = useAppStore(state => state.totpSettingsLoading)
	const totpSettingsSubmitting = useAppStore(state => state.totpSettingsSubmitting)
	const totpQrCodeUrl = useAppStore(state => state.totpQrCodeUrl)
	const totpEnrolling = useAppStore(state => state.totpEnrolling)
	const caldavTokens = useAppStore(state => state.caldavTokens)
	const caldavTokensLoading = useAppStore(state => state.caldavTokensLoading)
	const caldavTokenSubmitting = useAppStore(state => state.caldavTokenSubmitting)
	const newCaldavToken = useAppStore(state => state.newCaldavToken)
	const apiTokens = useAppStore(state => state.apiTokens)
	const apiTokensLoading = useAppStore(state => state.apiTokensLoading)
	const apiTokenSubmitting = useAppStore(state => state.apiTokenSubmitting)
	const newApiToken = useAppStore(state => state.newApiToken)
	const availableRoutes = useAppStore(state => state.availableRoutes)
	const availableRoutesLoaded = useAppStore(state => state.availableRoutesLoaded)
	const collaborationSettingsSubmitting = useAppStore(state => state.collaborationSettingsSubmitting)
	const adminUsers = useAppStore(state => state.adminUsers)
	const adminUsersLoading = useAppStore(state => state.adminUsersLoading)
	const adminUsersLoaded = useAppStore(state => state.adminUsersLoaded)
	const adminUserSubmitting = useAppStore(state => state.adminUserSubmitting)
	const adminRuntimeHealth = useAppStore(state => state.adminRuntimeHealth)
	const adminRuntimeHealthLoading = useAppStore(state => state.adminRuntimeHealthLoading)
	const adminMigrations = useAppStore(state => state.adminMigrations)
	const adminMigrationsLoading = useAppStore(state => state.adminMigrationsLoading)
	const adminMigrationsLoaded = useAppStore(state => state.adminMigrationsLoaded)
	const adminMigrateSubmitting = useAppStore(state => state.adminMigrateSubmitting)
	const adminDumpSubmitting = useAppStore(state => state.adminDumpSubmitting)
	const adminRestoreSubmitting = useAppStore(state => state.adminRestoreSubmitting)
	const adminRepairSubmitting = useAppStore(state => state.adminRepairSubmitting)
	const adminRepairResults = useAppStore(state => state.adminRepairResults)
	const mailDiagnosticsSubmitting = useAppStore(state => state.mailDiagnosticsSubmitting)
	const mailDiagnosticsResult = useAppStore(state => state.mailDiagnosticsResult)
	const mailerConfig = useAppStore(state => state.mailerConfig)
	const mailerConfigLoadAttempted = useAppStore(state => state.mailerConfigLoadAttempted)
	const mailerConfigLoading = useAppStore(state => state.mailerConfigLoading)
	const mailerConfigSubmitting = useAppStore(state => state.mailerConfigSubmitting)
	const mailerConfigRestarting = useAppStore(state => state.mailerConfigRestarting)
	const teams = useAppStore(state => state.teams)
	const teamsLoaded = useAppStore(state => state.teamsLoaded)
	const teamsLoading = useAppStore(state => state.teamsLoading)
	const teamSubmitting = useAppStore(state => state.teamSubmitting)
	const theme = useAppStore(state => state.theme)
	const setAccountField = useAppStore(state => state.setAccountField)
	const setAccountAuthMode = useAppStore(state => state.setAccountAuthMode)
	const setTheme = useAppStore(state => state.setTheme)
	const setChangePasswordField = useAppStore(state => state.setChangePasswordField)
	const setChangeEmailField = useAppStore(state => state.setChangeEmailField)
	const setAccountDeletionField = useAppStore(state => state.setAccountDeletionField)
	const login = useAppStore(state => state.login)
	const disconnectAccount = useAppStore(state => state.disconnectAccount)
	const loadAccountSessions = useAppStore(state => state.loadAccountSessions)
	const loadTimezoneOptions = useAppStore(state => state.loadTimezoneOptions)
	const updateTimezone = useAppStore(state => state.updateTimezone)
	const changePassword = useAppStore(state => state.changePassword)
	const changeEmail = useAppStore(state => state.changeEmail)
	const checkDataExportStatus = useAppStore(state => state.checkDataExportStatus)
	const requestDataExport = useAppStore(state => state.requestDataExport)
	const downloadDataExport = useAppStore(state => state.downloadDataExport)
	const requestAccountDeletion = useAppStore(state => state.requestAccountDeletion)
	const cancelAccountDeletion = useAppStore(state => state.cancelAccountDeletion)
	const logoutAccount = useAppStore(state => state.logoutAccount)
	const revokeAccountSession = useAppStore(state => state.revokeAccountSession)
	const refreshAppData = useAppStore(state => state.refreshAppData)
	const loadVikunjaInfo = useAppStore(state => state.loadVikunjaInfo)
	const refreshRuntimeState = useAppStore(state => state.refreshRuntimeState)
	const requestBrowserNotificationPermission = useAppStore(state => state.requestBrowserNotificationPermission)
	const sendTestBrowserNotification = useAppStore(state => state.sendTestBrowserNotification)
	const applyServiceWorkerUpdate = useAppStore(state => state.applyServiceWorkerUpdate)
	const refreshOfflineQueueCounts = useAppStore(state => state.refreshOfflineQueueCounts)
	const openRootComposer = useAppStore(state => state.openRootComposer)
	const loadAdminUsers = useAppStore(state => state.loadAdminUsers)
	const loadAdminRuntimeHealth = useAppStore(state => state.loadAdminRuntimeHealth)
	const loadMigrations = useAppStore(state => state.loadMigrations)
	const runMigrate = useAppStore(state => state.runMigrate)
	const rollbackMigration = useAppStore(state => state.rollbackMigration)
	const createDump = useAppStore(state => state.createDump)
	const runRestore = useAppStore(state => state.runRestore)
	const runRepair = useAppStore(state => state.runRepair)
	const sendTestmail = useAppStore(state => state.sendTestmail)
	const loadMailerConfig = useAppStore(state => state.loadMailerConfig)
	const saveMailerConfig = useAppStore(state => state.saveMailerConfig)
	const applyMailerConfig = useAppStore(state => state.applyMailerConfig)
	const createAdminUser = useAppStore(state => state.createAdminUser)
	const updateAdminUser = useAppStore(state => state.updateAdminUser)
	const setAdminUserEnabled = useAppStore(state => state.setAdminUserEnabled)
	const resetAdminUserPassword = useAppStore(state => state.resetAdminUserPassword)
	const deleteAdminUser = useAppStore(state => state.deleteAdminUser)
	const saveCollaborationSettings = useAppStore(state => state.saveCollaborationSettings)
	const notificationPreferencesSubmitting = useAppStore(state => state.notificationPreferencesSubmitting)
	const avatarProvider = useAppStore(state => state.avatarProvider)
	const avatarProviderLoaded = useAppStore(state => state.avatarProviderLoaded)
	const avatarProviderLoading = useAppStore(state => state.avatarProviderLoading)
	const avatarProviderSubmitting = useAppStore(state => state.avatarProviderSubmitting)
	const avatarUploadSubmitting = useAppStore(state => state.avatarUploadSubmitting)
	const saveNotificationPreferences = useAppStore(state => state.saveNotificationPreferences)
	const loadAvatarProvider = useAppStore(state => state.loadAvatarProvider)
	const updateAvatarProvider = useAppStore(state => state.updateAvatarProvider)
	const uploadAvatar = useAppStore(state => state.uploadAvatar)
	const loadTotpStatus = useAppStore(state => state.loadTotpStatus)
	const enrollTotp = useAppStore(state => state.enrollTotp)
	const enableTotp = useAppStore(state => state.enableTotp)
	const disableTotp = useAppStore(state => state.disableTotp)
	const loadCaldavTokens = useAppStore(state => state.loadCaldavTokens)
	const createCaldavToken = useAppStore(state => state.createCaldavToken)
	const clearNewCaldavToken = useAppStore(state => state.clearNewCaldavToken)
	const deleteCaldavToken = useAppStore(state => state.deleteCaldavToken)
	const loadApiTokens = useAppStore(state => state.loadApiTokens)
	const loadAvailableRoutes = useAppStore(state => state.loadAvailableRoutes)
	const createApiToken = useAppStore(state => state.createApiToken)
	const clearNewApiToken = useAppStore(state => state.clearNewApiToken)
	const deleteApiToken = useAppStore(state => state.deleteApiToken)
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
		security: false,
		collaboration: false,
		userAdministration: false,
		teams: false,
		appData: false,
	})

	const canManageUsers = Boolean(account?.authMode === 'password' && account?.isAdmin)
	const adminBridgeConfigured = Boolean(serverConfig?.features?.adminBridgeMode)
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
		if (!connected || !account?.user || avatarProviderLoaded || avatarProviderLoading) {
			return
		}

		void loadAvatarProvider()
	}, [account?.user, avatarProviderLoaded, avatarProviderLoading, connected, loadAvatarProvider])

	useEffect(() => {
		if (!openSections.userAdministration || account?.authMode !== 'password') {
			return
		}

		if (!adminRuntimeHealth && !adminRuntimeHealthLoading) {
			void loadAdminRuntimeHealth()
		}
	}, [
		adminRuntimeHealth,
		adminRuntimeHealthLoading,
		account?.authMode,
		loadAdminRuntimeHealth,
		openSections.userAdministration,
	])

	useEffect(() => {
		if (!canManageUsers || !adminBridgeReady || adminUsersLoaded || adminUsersLoading) {
			return
		}

		void loadAdminUsers()
	}, [adminBridgeReady, adminUsersLoaded, adminUsersLoading, canManageUsers, loadAdminUsers])

	useEffect(() => {
		const params = new URLSearchParams(location.search)
		if (params.get('section') !== 'offline') {
			return
		}

		setOpenSections(current => ({
			...current,
			offline: true,
		}))
	}, [location.search])

	useEffect(() => {
		if (!connected || teamsLoaded || teamsLoading) {
			return
		}

		void loadTeams()
	}, [connected, loadTeams, teamsLoaded, teamsLoading])

	useEffect(() => {
		if (!openSections.account || account?.authMode !== 'password') {
			return
		}

		void checkDataExportStatus()
	}, [account?.authMode, checkDataExportStatus, openSections.account])

	useEffect(() => {
		if (!openSections.appData || !connected || vikunjaInfo || vikunjaInfoLoading) {
			return
		}

		void loadVikunjaInfo()
	}, [connected, loadVikunjaInfo, openSections.appData, vikunjaInfo, vikunjaInfoLoading])

	useEffect(() => {
		if (!accountDeletionNotice || openSections.account) {
			return
		}

		setOpenSections({
			account: true,
			preferences: false,
			offline: false,
			notifications: false,
			security: false,
			collaboration: false,
			userAdministration: false,
			teams: false,
			appData: false,
		})
	}, [accountDeletionNotice, openSections.account])

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
							changeEmailForm={changeEmailForm}
							changeEmailSubmitting={changeEmailSubmitting}
							changeEmailNotice={changeEmailNotice}
							dataExportStatus={dataExportStatus}
							dataExportStatusLoading={dataExportStatusLoading}
							dataExportRequesting={dataExportRequesting}
							dataExportDownloading={dataExportDownloading}
							dataExportNotice={dataExportNotice}
							accountDeletionForm={accountDeletionForm}
							accountDeletionNotice={accountDeletionNotice}
							accountDeletionRequesting={accountDeletionRequesting}
							accountDeletionCancelling={accountDeletionCancelling}
							currentTimezone={currentTimezone}
							showPasswordForm={showPasswordForm}
							canChangePassword={canChangePassword}
							canLogout={canLogout}
							avatarProvider={avatarProvider}
							avatarProviderLoaded={avatarProviderLoaded}
							avatarProviderLoading={avatarProviderLoading}
							avatarProviderSubmitting={avatarProviderSubmitting}
							avatarUploadSubmitting={avatarUploadSubmitting}
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
							onSetChangeEmailField={setChangeEmailField}
							onChangeEmail={() => {
								void changeEmail()
							}}
							onRequestExport={password => {
								void requestDataExport(password)
							}}
							onDownloadExport={password => {
								void downloadDataExport(password)
							}}
							onSetAccountDeletionField={setAccountDeletionField}
							onRequestDeletion={() => {
								void requestAccountDeletion()
							}}
							onCancelDeletion={() => {
								void cancelAccountDeletion()
							}}
							onReloadAvatarProvider={() => {
								void loadAvatarProvider()
							}}
							onUpdateAvatarProvider={provider => {
								void updateAvatarProvider(provider)
							}}
							onUploadAvatar={file => {
								void uploadAvatar(file)
							}}
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
								timezoneNotice={timezoneNotice}
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
								offlineQueueCount={offlineQueueCount}
								offlineQueueFailedCount={offlineQueueFailedCount}
								offlineSyncInProgress={offlineSyncInProgress}
								onRefreshOfflineQueueCounts={refreshOfflineQueueCounts}
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
								emailDeliveryAvailable={account.instanceFeatures?.emailRemindersEnabled === true}
								emailRemindersEnabled={Boolean(account.user?.settings?.email_reminders_enabled)}
								overdueTasksRemindersEnabled={Boolean(account.user?.settings?.overdue_tasks_reminders_enabled)}
								accountIsAdmin={Boolean(account.isAdmin)}
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
							<SettingsSecuritySection
								open={openSections.security}
								onToggle={toggleSection}
								currentBaseUrl={account.baseUrl || ''}
								currentUsername={`${account.user?.username || ''}`}
								vikunjaInfo={vikunjaInfo}
								vikunjaInfoLoading={vikunjaInfoLoading}
								totpSettings={totpSettings}
								totpSettingsLoading={totpSettingsLoading}
								totpSettingsSubmitting={totpSettingsSubmitting}
								totpQrCodeUrl={totpQrCodeUrl}
								totpEnrolling={totpEnrolling}
								onLoadTotpStatus={loadTotpStatus}
								onEnrollTotp={enrollTotp}
								onEnableTotp={enableTotp}
								onDisableTotp={disableTotp}
								caldavTokens={caldavTokens}
								caldavTokensLoading={caldavTokensLoading}
								caldavTokenSubmitting={caldavTokenSubmitting}
								newCaldavToken={newCaldavToken}
								onLoadCaldavTokens={loadCaldavTokens}
								onCreateCaldavToken={createCaldavToken}
								onClearNewCaldavToken={clearNewCaldavToken}
								onDeleteCaldavToken={deleteCaldavToken}
								apiTokens={apiTokens}
								apiTokensLoading={apiTokensLoading}
								apiTokenSubmitting={apiTokenSubmitting}
								newApiToken={newApiToken}
								availableRoutes={availableRoutes}
								availableRoutesLoaded={availableRoutesLoaded}
								onLoadApiTokens={loadApiTokens}
								onLoadAvailableRoutes={loadAvailableRoutes}
								onCreateApiToken={createApiToken}
								onClearNewApiToken={clearNewApiToken}
								onDeleteApiToken={deleteApiToken}
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
								adminBridgeConfigured={adminBridgeConfigured}
								canManageUsers={canManageUsers}
								adminUsers={adminUsers}
								adminUsersLoading={adminUsersLoading}
								adminUsersLoaded={adminUsersLoaded}
								adminUserSubmitting={adminUserSubmitting}
								adminRuntimeHealth={adminRuntimeHealth}
								adminBridgeFailedChecks={adminBridgeFailedChecks}
								adminRuntimeHealthLoading={adminRuntimeHealthLoading}
								adminMigrations={adminMigrations}
								adminMigrationsLoading={adminMigrationsLoading}
								adminMigrationsLoaded={adminMigrationsLoaded}
								adminMigrateSubmitting={adminMigrateSubmitting}
								adminDumpSubmitting={adminDumpSubmitting}
								adminRestoreSubmitting={adminRestoreSubmitting}
								adminRepairSubmitting={adminRepairSubmitting}
								adminRepairResults={adminRepairResults}
								mailDiagnosticsSubmitting={mailDiagnosticsSubmitting}
								mailDiagnosticsResult={mailDiagnosticsResult}
								mailerConfig={mailerConfig}
								mailerConfigLoadAttempted={mailerConfigLoadAttempted}
								mailerConfigLoading={mailerConfigLoading}
								mailerConfigSubmitting={mailerConfigSubmitting}
								mailerConfigRestarting={mailerConfigRestarting}
								onReloadRuntimeHealth={() => {
									void loadAdminRuntimeHealth()
								}}
								onReloadUsers={() => {
									void loadAdminUsers()
								}}
								onLoadMigrations={loadMigrations}
								onRunMigrate={runMigrate}
								onRollbackMigration={rollbackMigration}
								onCreateDump={createDump}
								onRunRestore={runRestore}
								onRunRepair={runRepair}
								onCreateAdminUser={createAdminUser}
								onUpdateAdminUser={updateAdminUser}
								onSetAdminUserEnabled={setAdminUserEnabled}
								onResetAdminUserPassword={resetAdminUserPassword}
								onDeleteAdminUser={deleteAdminUser}
								onSendTestmail={sendTestmail}
								onLoadMailerConfig={loadMailerConfig}
								onSaveMailerConfig={saveMailerConfig}
								onApplyMailerConfig={applyMailerConfig}
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
							vikunjaInfo={vikunjaInfo}
							vikunjaInfoLoading={vikunjaInfoLoading}
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

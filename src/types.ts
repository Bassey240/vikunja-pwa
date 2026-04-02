export type AuthMode = 'password' | 'apiToken'
export type AppTheme = 'dark' | 'light'

export type Screen =
	| 'today'
	| 'inbox'
	| 'upcoming'
	| 'projects'
	| 'search'
	| 'filters'
	| 'tasks'
	| 'labels'
	| 'settings'

export type BulkTaskAction =
	| 'complete'
	| 'reopen'
	| 'move-project'
	| 'set-priority'
	| 'favorite'
	| 'unfavorite'
	| 'delete'

export type UndoableMutationKind =
	| 'task-complete'
	| 'task-reopen'
	| 'bulk-task-update'
	| 'task-delete'
	| 'project-delete'

export interface UndoableMutationNotice {
	id: string
	kind: UndoableMutationKind
	title: string
	body: string
	actionLabel?: string
}

export interface ServerConfig {
	configured: boolean
	baseUrl: string | null
	defaultBaseUrl: string | null
	publicAppOrigin?: string | null
	legacyConfigured: boolean
	buildId: string
	authModes: AuthMode[]
	features?: {
		adminBridgeMode?: 'docker-exec' | 'ssh-docker-exec' | null
		httpsEnabled?: boolean
	}
}

export interface AuthServerInfo {
	baseUrl: string
	localEnabled: boolean | null
	registrationEnabled: boolean | null
}

export interface VikunjaInfo {
	version: string
	frontend_url: string | null
	motd: string | null
	caldav_enabled?: boolean
	task_attachments_enabled: boolean
	enabled_background_providers: string[]
	auth: {
		local: {
			enabled: boolean
			registration_enabled?: boolean
		}
		openid?: {
			enabled: boolean
			providers: Array<{
				name: string
				key: string
				auth_url: string
			}>
		}
		openid_connect?: {
			enabled: boolean
			providers: Array<{
				name: string
				key: string
				auth_url: string
			}>
		}
	}
	registration_enabled?: boolean
}

export interface UserProfile {
	id: number
	name: string
	username: string
	email: string
	deletionScheduledAt?: string | null
	isLocalUser?: boolean | null
	authProvider?: string | null
	settings?: {
		default_project_id?: number | null
		timezone?: string | null
		discoverable_by_name?: boolean | null
		discoverable_by_email?: boolean | null
		email_reminders_enabled?: boolean | null
		overdue_tasks_reminders_enabled?: boolean | null
		overdue_tasks_reminders_time?: string | null
		frontend_settings?: UserFrontendSettings | null
		[key: string]: unknown
	}
}

export type NotificationCategory =
	| 'mentions'
	| 'comments'
	| 'assignments'
	| 'reminders'
	| 'overdue'
	| 'taskDeletions'
	| 'projectCreation'
	| 'teamMembership'
	| 'system'

export interface NotificationCategoryPreference {
	center: boolean
}

export type NotificationPreferenceMap = Record<NotificationCategory, NotificationCategoryPreference>

export interface NotificationSettingsForm {
	centerPreferences: NotificationPreferenceMap
	emailRemindersEnabled: boolean
	overdueTasksRemindersEnabled: boolean
}

export interface UserFrontendSettings {
	notification_preferences?: Partial<Record<NotificationCategory, Partial<NotificationCategoryPreference>>> | null
	[key: string]: unknown
}

export type AvatarProvider =
	| 'default'
	| 'initials'
	| 'gravatar'
	| 'marble'
	| 'upload'
	| 'ldap'
	| 'openid'

export interface InstanceFeatures {
	linkSharingEnabled: boolean | null
	publicTeamsEnabled: boolean | null
	frontendUrl: string | null
	emailRemindersEnabled: boolean | null
}

export interface Account {
	source: 'legacy' | 'account'
	authMode: AuthMode
	baseUrl: string
	linkShareAuth?: boolean
	linkShareProjectId?: number | null
	isAdmin?: boolean
	instanceFeatures?: InstanceFeatures | null
	user: UserProfile | null
	sessionsSupported: boolean
	disconnectSupported: boolean
}

export interface AdminUser {
	id: number
	username: string
	email: string
	enabled: boolean
	status?: string
	issuer?: string
	subject?: string
	created?: string | null
	updated?: string | null
}

export interface AdminRuntimeHealth {
	enabled: boolean
	mode: 'docker-exec' | 'ssh-docker-exec' | null
	dockerReachable: boolean
	vikunjaContainerFound: boolean
	vikunjaCliReachable: boolean
	containerName: string | null
	cliPath: string | null
	errors: string[]
}

export interface AdminMailDiagnosticsResult {
	success: boolean
	stdout: string | null
	stderr: string | null
}

export interface AdminMigration {
	id: string
	name: string
	applied: boolean
}

export interface AdminDumpResult {
	ok: boolean
	filename: string
}

export interface AdminRestoreResult {
	ok: boolean
	stdout: string | null
	stderr: string | null
}

export interface AdminMigrateResult {
	ok: boolean
	stdout: string | null
	stderr: string | null
}

export interface AdminRepairResult {
	success: boolean
	stdout: string | null
	stderr: string | null
}

export type MailerConfigField =
	| 'enabled'
	| 'host'
	| 'port'
	| 'authType'
	| 'username'
	| 'password'
	| 'skipTlsVerify'
	| 'fromEmail'
	| 'forceSsl'

export type MailerCapabilityReasonCode =
	| 'no_bridge'
	| 'no_config_path'
	| 'unsupported_source_mode'
	| 'not_authorized'

export interface MailerConfigCapabilities {
	canInspect: boolean
	canWrite: boolean
	canApply: boolean
	reasonCode: MailerCapabilityReasonCode | null
}

export interface MailerConfig {
	enabled: boolean
	host: string
	port: number
	authType: string
	username: string
	passwordConfigured: boolean
	skipTlsVerify: boolean
	fromEmail: string
	forceSsl: boolean
	envOverrides: MailerConfigField[]
	capabilities: MailerConfigCapabilities
}

export interface MailerConfigInput {
	enabled: boolean
	host: string
	port: number
	authType: string
	username: string
	password: string
	skipTlsVerify: boolean
	fromEmail: string
	forceSsl: boolean
}

export type SharePermission = 0 | 1 | 2

export interface TeamUser {
	id: number
	name: string
	username: string
	email?: string
	admin?: boolean
	created?: string | null
	updated?: string | null
}

export interface Team {
	id: number
	name: string
	description?: string
	is_public?: boolean
	external_id?: string
	created?: string | null
	updated?: string | null
	members?: TeamUser[]
}

export interface ProjectSharedUser {
	id: number
	name: string
	username: string
	email?: string
	permission: SharePermission
	created?: string | null
	updated?: string | null
}

export interface ProjectSharedTeam extends Team {
	permission: SharePermission
}

export interface ProjectLinkShare {
	id: number
	hash: string
	name: string
	project_id?: number | null
	permission: SharePermission
	sharing_type?: number | null
	shared_by?: TaskAssignee | null
	expires?: string | null
	password_protected?: boolean | null
	created?: string | null
	updated?: string | null
}

export interface TotpSettings {
	enabled: boolean
	secret: string | null
	totpUrl: string | null
}

export interface CalDavToken {
	id: number
	created: string
}

export interface ApiToken {
	id: number
	title: string
	permissions: Record<string, string[]>
	expires_at: string | null
	created: string
	token?: string | null
}

export interface ApiRouteDetail {
	path: string
	method: string
}

export type ApiRouteGroup = Record<string, ApiRouteDetail>
export type ApiRouteGroups = Record<string, ApiRouteGroup>

export interface AccountForm {
	authMode: AuthMode
	baseUrl: string
	username: string
	password: string
	totpPasscode: string
	apiToken: string
}

export interface Session {
	id: string
	device_info?: string
	ip_address?: string
	last_active?: string
	created?: string
}

export interface Label {
	id: number
	title: string
	hex_color?: string
	hexColor?: string
}

export interface EntitySubscription {
	subscribed: boolean
}

export interface Project {
	id: number
	title: string
	description?: string
	parent_project_id?: number
	position?: number
	identifier?: string
	hex_color?: string
	is_favorite?: boolean
	is_archived?: boolean
	is_inbox_project?: boolean
	created?: string | null
	updated?: string | null
	subscription?: EntitySubscription | null
}

export interface SavedFilter {
	id: number
	projectId: number
	title: string
	description: string
	isFavorite: boolean
	created: string | null
	updated: string | null
}

export interface ProjectView {
	id: number
	project_id: number
	title: string
	view_kind: string
	default_bucket_id?: number | null
	done_bucket_id?: number | null
	defaultBucketId?: number | null
	doneBucketId?: number | null
}

export interface Bucket {
	id: number
	project_id: number
	project_view_id: number
	title: string
	position?: number | null
	limit?: number | null
	count?: number | null
	tasks: Task[]
}

export interface TaskRelationRef {
	id: number
	title: string
	project_id: number
	done: boolean
	position?: number | null
}

export type TaskRelationKind =
	| 'subtask'
	| 'parenttask'
	| 'related'
	| 'duplicateof'
	| 'duplicates'
	| 'blocking'
	| 'blocked'
	| 'precedes'
	| 'follows'
	| 'copiedfrom'
	| 'copiedto'

export interface TaskReminder {
	reminder: string
	relative_period?: number | null
	relative_to?: 'due_date' | 'start_date' | 'end_date' | '' | null
}

export interface TaskAssignee {
	id: number
	name: string
	username: string
	email?: string
}

export interface TaskComment {
	id: number
	comment: string
	author: TaskAssignee
	created: string | null
	updated: string | null
}

export interface TaskReaction {
	value: string
	user: UserProfile
}

export type ReactionMap = Record<string, TaskReaction[]>

export interface TaskAttachmentFile {
	id: number
	name: string
	mime: string
	size: number
}

export interface TaskAttachment {
	id: number
	task_id: number
	created_by: TaskAssignee
	file: TaskAttachmentFile
	created: string | null
}

export type NotificationName =
	| 'task.comment'
	| 'task.assigned'
	| 'task.deleted'
	| 'project.created'
	| 'team.member.added'
	| 'task.reminder'
	| 'task.mentioned'
	| 'task.undone.overdue'
	| 'data.export.ready'

export interface NotificationTaskRef {
	id: number
	title: string
	project_id?: number | null
}

export interface NotificationProjectRef {
	id: number
	title: string
}

export interface NotificationTeamRef {
	id: number
	name: string
}

export interface NotificationCommentRef {
	id: number
	comment: string
}

export interface NotificationPayload {
	doer?: TaskAssignee | null
	task?: NotificationTaskRef | null
	project?: NotificationProjectRef | null
	comment?: NotificationCommentRef | null
	assignee?: TaskAssignee | null
	member?: TaskAssignee | null
	team?: NotificationTeamRef | null
}

export interface AppNotification {
	id: number
	name: NotificationName | string
	notification: NotificationPayload | null
	read?: boolean
	read_at?: string | null
	created: string | null
}

export interface Task {
	id: number
	index?: number | null
	identifier?: string | null
	project_id: number
	title: string
	description?: string
	done: boolean
	is_favorite?: boolean
	due_date?: string | null
	start_date?: string | null
	end_date?: string | null
	done_at?: string | null
	created?: string | null
	updated?: string | null
	read?: boolean
	read_at?: string | null
	position?: number | null
	priority?: number | null
	percent_done?: number | null
	reminders?: TaskReminder[] | null
	repeat_after?: number | null
	repeat_from_current_date?: boolean
	created_by?: TaskAssignee | null
	assignees?: TaskAssignee[] | null
	comments?: TaskComment[] | null
	comment_count?: number | null
	attachments?: TaskAttachment[] | null
	labels?: Label[]
	related_tasks?: Partial<Record<TaskRelationKind, TaskRelationRef[]>>
	bucket_id?: number | null
	bucketId?: number | null
	subscription?: EntitySubscription | null
}

export interface FocusTarget {
	type: string
	value?: string
	parentTaskId?: number
}

export interface MenuAnchor {
	top: number
	right: number
	bottom: number
	left: number
}

export type OpenMenu =
	| {
		kind: 'nav'
	}
	| {
		kind: 'notifications'
	}
	| {
		kind: 'sidebar-projects'
		anchor: MenuAnchor
	}
	| {
		kind: 'label'
		id: number
		anchor: MenuAnchor
	}
	| {
		kind: 'project'
		id: number
		anchor: MenuAnchor
	}
	| {
		kind: 'task'
		id: number
		anchor: MenuAnchor
	}

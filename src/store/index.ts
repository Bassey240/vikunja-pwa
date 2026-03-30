import {create} from 'zustand'
import {createAuthSlice, type AuthSlice} from './slices/auth'
import {createLabelsSlice, type LabelsSlice} from './slices/labels'
import {createMutationsSlice, type MutationsSlice} from './slices/mutations'
import {createNotificationsSlice, type NotificationsSlice} from './slices/notifications'
import {createProjectsSlice, type ProjectsSlice} from './slices/projects'
import {createRuntimeSlice, type RuntimeSlice} from './slices/runtime'
import {createSharingSlice, type SharingSlice} from './slices/sharing'
import {createSubscriptionsSlice, type SubscriptionsSlice} from './slices/subscriptions'
import {createTasksSlice, type TasksSlice} from './slices/tasks'
import {createTeamsSlice, type TeamsSlice} from './slices/teams'
import {createUiSlice, type UiSlice} from './slices/ui'
import {createUsersSlice, type UsersSlice} from './slices/users'
import {createViewsSlice, type ViewsSlice} from './slices/views'

export type AppStore =
	& AuthSlice
	& UiSlice
	& MutationsSlice
	& RuntimeSlice
	& LabelsSlice
	& NotificationsSlice
	& TeamsSlice
	& SharingSlice
	& SubscriptionsSlice
	& ProjectsSlice
	& ViewsSlice
	& TasksSlice
	& UsersSlice

export const useAppStore = create<AppStore>()((...args) => ({
	...createUiSlice(...args),
	...createMutationsSlice(...args),
	...createRuntimeSlice(...args),
	...createAuthSlice(...args),
	...createUsersSlice(...args),
	...createTeamsSlice(...args),
	...createSharingSlice(...args),
	...createLabelsSlice(...args),
	...createNotificationsSlice(...args),
	...createSubscriptionsSlice(...args),
	...createViewsSlice(...args),
	...createProjectsSlice(...args),
	...createTasksSlice(...args),
}))

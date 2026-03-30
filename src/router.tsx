import ResetPasswordScreen from '@/components/auth/ResetPasswordScreen'
import FiltersScreen from '@/components/screens/FiltersScreen'
import AppShell from '@/components/layout/AppShell'
import LinkShareAuthScreen from '@/components/sharing/LinkShareAuthScreen'
import InboxScreen from '@/components/screens/InboxScreen'
import LabelsScreen from '@/components/screens/LabelsScreen'
import ProjectTasksScreen from '@/components/screens/ProjectTasksScreen'
import ProjectsScreen from '@/components/screens/ProjectsScreen'
import SearchScreen from '@/components/screens/SearchScreen'
import SettingsScreen from '@/components/screens/SettingsScreen'
import TodayScreen from '@/components/screens/TodayScreen'
import UpcomingScreen from '@/components/screens/UpcomingScreen'
import {createBrowserRouter} from 'react-router-dom'

export const router = createBrowserRouter([
	{
		path: '/auth/reset-password',
		element: <ResetPasswordScreen />,
	},
	{
		path: '/share/:share/auth',
		element: <LinkShareAuthScreen />,
	},
	{
		path: '/',
		element: <AppShell />,
		children: [
			{
				index: true,
				element: <TodayScreen />,
			},
			{
				path: 'inbox',
				element: <InboxScreen />,
			},
			{
				path: 'upcoming',
				element: <UpcomingScreen />,
			},
			{
				path: 'projects',
				element: <ProjectsScreen />,
			},
			{
				path: 'search',
				element: <SearchScreen />,
			},
			{
				path: 'filters',
				element: <FiltersScreen />,
			},
			{
				path: 'projects/:id',
				element: <ProjectTasksScreen />,
			},
			{
				path: 'labels',
				element: <LabelsScreen />,
			},
			{
				path: 'settings',
				element: <SettingsScreen />,
			},
		],
	},
])

import {storageKeys} from '@/storageKeys'
import type {AppTheme, FocusTarget, OpenMenu, Screen} from '@/types'
import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'

export interface UiSlice {
	screen: Screen
	theme: AppTheme
	error: string | null
	offlineActionNotice: string | null
	openMenu: OpenMenu | null
	focusTarget: FocusTarget | null
	setScreen: (screen: Screen) => void
	setTheme: (theme: AppTheme) => void
	setError: (error: string | null) => void
	clearError: () => void
	setOfflineActionNotice: (notice: string | null) => void
	clearOfflineActionNotice: () => void
	setOpenMenu: (menu: OpenMenu | null) => void
	toggleNavMenu: () => void
	toggleNotificationsMenu: () => void
}

function loadStoredTheme(): AppTheme {
	if (typeof window === 'undefined') {
		return 'dark'
	}

	const stored = window.localStorage.getItem(storageKeys.theme)
	return stored === 'light' ? 'light' : 'dark'
}

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = set => ({
	screen: 'today',
	theme: loadStoredTheme(),
	error: null,
	offlineActionNotice: null,
	openMenu: null,
	focusTarget: null,
	setScreen: screen => set({screen}),
	setTheme: theme => {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(storageKeys.theme, theme)
		}

		set({theme})
	},
	setError: error => set({error}),
	clearError: () => set({error: null}),
	setOfflineActionNotice: offlineActionNotice => set({offlineActionNotice}),
	clearOfflineActionNotice: () => set({offlineActionNotice: null}),
	setOpenMenu: openMenu => set({openMenu}),
	toggleNavMenu: () =>
		set(state => ({
			openMenu: state.openMenu?.kind === 'nav' ? null : {kind: 'nav'},
		})),
	toggleNotificationsMenu: () =>
		set(state => ({
			openMenu: state.openMenu?.kind === 'notifications' ? null : {kind: 'notifications'},
		})),
})

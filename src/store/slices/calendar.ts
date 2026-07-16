import type {StateCreator} from 'zustand'
import type {AppStore} from '../index'
import {allDayDueIso, localDayKey, type CalendarZoom} from '@/utils/calendar-window'

export interface CalendarSlice {
	calendarZoom: CalendarZoom
	calendarAnchorIso: string
	calendarSelectedDayKey: string
	calendarSelectedDayMs: number
	setCalendarZoom: (zoom: CalendarZoom) => void
	setCalendarAnchorIso: (iso: string) => void
	setCalendarSelectedDay: (dayKey: string, dayMs: number) => void
	openCalendarComposer: (dayKey?: string, placement?: 'sheet' | 'center') => void
	openCalendarComposerAt: (ms: number, placement?: 'sheet' | 'center') => void
}

export const createCalendarSlice: StateCreator<AppStore, [], [], CalendarSlice> = (set, get) => ({
	calendarZoom: 'day',
	calendarAnchorIso: new Date().toISOString(),
	calendarSelectedDayKey: localDayKey(Date.now()),
	calendarSelectedDayMs: Date.now(),
	setCalendarZoom(zoom) {
		set({calendarZoom: zoom})
	},
	setCalendarAnchorIso(iso) {
		set({calendarAnchorIso: iso})
	},
	setCalendarSelectedDay(dayKey, dayMs) {
		set({calendarSelectedDayKey: dayKey, calendarSelectedDayMs: dayMs})
	},
	// Tap-to-add on the calendar: pre-target the given (or selected) day as an
	// all-day task. The page is date-centric, so the composer always carries a
	// date — never the Today screen's today/inbox defaults. Placement follows
	// the caller's layout: 'center' renders the wide shell's inline composer
	// (which CalendarScreen embeds), 'sheet' the mobile sheet.
	openCalendarComposer(dayKey, placement = 'sheet') {
		get().openRootComposer({defaultDueDate: allDayDueIso(dayKey ?? get().calendarSelectedDayKey), placement})
	},
	// Tap a time slot in the week/day grid: pre-target that exact local datetime
	// (converted to the UTC instant Vikunja stores), so the task lands timed —
	// not all-day — at the tapped hour.
	openCalendarComposerAt(ms, placement = 'sheet') {
		get().openRootComposer({defaultDueDate: new Date(ms).toISOString(), placement})
	},
})

import {createRoot} from 'react-dom/client'
import App from './App'
import {trackKeyboardInset} from './platform/safeArea'
import {useAppStore} from './store'
import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@fontsource/geist-sans/700.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import './styles.css'

// Shared boot, called by the app entry (main.tsx). Platform-specific setup
// happens at the entry, not here.
export function bootApp(): void {
	// Locked design decisions from the redesign handoff (handoff/components.md).
	// Set once at boot so first paint matches the redesign without flicker.
	{
		const root = document.documentElement
		root.dataset.density = 'regular'
		root.dataset.card = 'outlined'
		root.dataset.nest = 'rail'
		root.dataset.handles = 'always'
	}

	// Footer hide + composer keyboard-glue (cross-platform: PWA + native). The footer
	// and safe-area are plain CSS (position:fixed; bottom:0; env(safe-area-inset-bottom)).
	trackKeyboardInset()

	createRoot(document.getElementById('app')!).render(<App />)
	void useAppStore.getState().initRuntime()
}

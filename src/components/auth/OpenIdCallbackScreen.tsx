import {useAppStore} from '@/store'
import {useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'

export default function OpenIdCallbackScreen() {
	const navigate = useNavigate()
	const location = useLocation()
	const loginWithOidc = useAppStore(state => state.loginWithOidc)
	const settingsSubmitting = useAppStore(state => state.settingsSubmitting)
	const error = useAppStore(state => state.error)
	const [callbackError, setCallbackError] = useState('')

	useEffect(() => {
		const params = new URLSearchParams(location.search)
		const code = `${params.get('code') || ''}`.trim()
		const state = `${params.get('state') || ''}`.trim()
		if (!code || !state) {
			setCallbackError('This single sign-on callback is missing the required code or state.')
			return
		}

		let cancelled = false
		void loginWithOidc(code, state).then(success => {
			if (cancelled) {
				return
			}
			if (success) {
				navigate('/', {replace: true})
			}
		})

		return () => {
			cancelled = true
		}
	}, [location.search, loginWithOidc, navigate])

	return (
		<div className="surface auth-callback-surface">
			<div className="surface-content">
				<section className="panel screen-card">
					<div className="screen-body detail-density-compact-surface">
						<div className="detail-label">Single sign-on</div>
						<h2 className="panel-title">Completing sign-in</h2>
						{callbackError ? <div className="status-card danger">{callbackError}</div> : null}
						{!callbackError && error ? <div className="status-card danger">{error}</div> : null}
						{!callbackError && !error ? (
							<div className="empty-state compact">
								{settingsSubmitting ? 'Validating your Vikunja session…' : 'Finishing the login callback…'}
							</div>
						) : null}
					</div>
				</section>
			</div>
		</div>
	)
}

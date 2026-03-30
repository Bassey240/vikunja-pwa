import {useAppStore} from '@/store'
import {type FormEvent, useEffect} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'

export default function ResetPasswordScreen() {
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const populateResetPasswordFromParams = useAppStore(state => state.populateResetPasswordFromParams)
	const resetPassword = useAppStore(state => state.resetPassword)
	const resetPasswordForm = useAppStore(state => state.resetPasswordForm)
	const resetPasswordSubmitting = useAppStore(state => state.resetPasswordSubmitting)
	const resetPasswordDone = useAppStore(state => state.resetPasswordDone)
	const resetPasswordError = useAppStore(state => state.resetPasswordError)
	const setResetPasswordField = useAppStore(state => state.setResetPasswordField)

	useEffect(() => {
		populateResetPasswordFromParams({
			token: searchParams.get('token') || '',
			baseUrl: searchParams.get('baseUrl') || '',
		})
	}, [populateResetPasswordFromParams, searchParams])

	useEffect(() => {
		if (!resetPasswordDone) {
			return
		}

		const timeoutId = window.setTimeout(() => {
			navigate('/', {replace: true})
		}, 2000)
		return () => window.clearTimeout(timeoutId)
	}, [navigate, resetPasswordDone])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		await resetPassword()
	}

	const invalidLink = !resetPasswordForm.token || !resetPasswordForm.baseUrl

	return (
		<div className="auth-shell">
			<div className="auth-layout">
				<section className="auth-card">
					<div className="auth-card-head">
						<div>
							<div className="detail-label">Set New Password</div>
							<h2>Reset your password</h2>
							<p>Finish the password reset from the link sent by your Vikunja server.</p>
						</div>
					</div>

					{resetPasswordDone ? (
						<div className="status-card success">Password updated. Redirecting to sign in…</div>
					) : (
						<div className="auth-form-card">
							{resetPasswordError ? <div className="status-card danger">{resetPasswordError}</div> : null}
							{invalidLink ? (
								<div className="status-card warning">Invalid or expired reset link. Request a new one.</div>
							) : (
								<form className="detail-grid settings-form" data-form="reset-password" onSubmit={handleSubmit}>
									<label className="detail-item detail-field">
										<div className="detail-label">New Password</div>
										<input
											className="detail-input"
											data-reset-password-field="password"
											name="password"
											type="password"
											autoComplete="new-password"
											value={resetPasswordForm.password}
											disabled={resetPasswordSubmitting}
											onChange={event => setResetPasswordField('password', event.currentTarget.value)}
										/>
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Confirm Password</div>
										<input
											className="detail-input"
											data-reset-password-field="confirmPassword"
											name="confirmPassword"
											type="password"
											autoComplete="new-password"
											value={resetPasswordForm.confirmPassword}
											disabled={resetPasswordSubmitting}
											onChange={event => setResetPasswordField('confirmPassword', event.currentTarget.value)}
										/>
									</label>
									<div className="detail-item detail-item-full detail-field">
										<button className="composer-submit" type="submit" disabled={resetPasswordSubmitting}>
											{resetPasswordSubmitting ? 'Updating…' : 'Set New Password'}
										</button>
									</div>
								</form>
							)}
							<button className="auth-text-link" type="button" onClick={() => navigate('/', {replace: true})}>
								Back to sign in
							</button>
						</div>
					)}
				</section>
			</div>
		</div>
	)
}

import StatusCards from '@/components/layout/StatusCards'
import {useAppStore} from '@/store'
import {type FormEvent, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'

export default function AuthScreen() {
	const navigate = useNavigate()
	const [authSubscreen, setAuthSubscreen] = useState<'login' | 'register' | 'forgot-password'>('login')
	const serverConfig = useAppStore(state => state.serverConfig)
	const accountForm = useAppStore(state => state.accountForm)
	const registrationForm = useAppStore(state => state.registrationForm)
	const registrationSubmitting = useAppStore(state => state.registrationSubmitting)
	const registrationError = useAppStore(state => state.registrationError)
	const forgotPasswordForm = useAppStore(state => state.forgotPasswordForm)
	const forgotPasswordSubmitting = useAppStore(state => state.forgotPasswordSubmitting)
	const forgotPasswordSent = useAppStore(state => state.forgotPasswordSent)
	const settingsSubmitting = useAppStore(state => state.settingsSubmitting)
	const settingsNotice = useAppStore(state => state.settingsNotice)
	const isOnline = useAppStore(state => state.isOnline)
	const theme = useAppStore(state => state.theme)
	const setAccountField = useAppStore(state => state.setAccountField)
	const setAccountAuthMode = useAppStore(state => state.setAccountAuthMode)
	const setRegistrationField = useAppStore(state => state.setRegistrationField)
	const setForgotPasswordEmail = useAppStore(state => state.setForgotPasswordEmail)
	const setTheme = useAppStore(state => state.setTheme)
	const login = useAppStore(state => state.login)
	const register = useAppStore(state => state.register)
	const requestPasswordReset = useAppStore(state => state.requestPasswordReset)
	const restoreLegacyFallback = useAppStore(state => state.restoreLegacyFallback)
	const connected = useAppStore(state => state.connected)

	const showPasswordForm = accountForm.authMode === 'password'
	const hasServerFallback = Boolean(serverConfig?.legacyConfigured)
	const connectDisabled = settingsSubmitting || !isOnline
	const registrationDisabled = registrationSubmitting || !isOnline
	const forgotPasswordDisabled = forgotPasswordSubmitting || !isOnline

	useEffect(() => {
		if (authSubscreen !== 'register' || registrationForm.baseUrl || !accountForm.baseUrl) {
			return
		}

		setRegistrationField('baseUrl', accountForm.baseUrl)
	}, [accountForm.baseUrl, authSubscreen, registrationForm.baseUrl, setRegistrationField])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await login()
		if (success) {
			navigate('/', {replace: true})
		}
	}

	async function handleServerFallback() {
		const success = await restoreLegacyFallback()
		if (success || useAppStore.getState().connected || connected) {
			navigate('/', {replace: true})
		}
	}

	async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await register()
		if (success) {
			navigate('/', {replace: true})
		}
	}

	async function handleForgotPasswordSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		await requestPasswordReset()
	}

	return (
		<div className="auth-shell">
			<div className="auth-layout">
				<section className="auth-hero">
					<div className="auth-brand">
						<div className="auth-logo-mark" aria-hidden="true">
							<div className="auth-logo-mark-core">V</div>
						</div>
						<div className="auth-brand-copy">
							<div className="eyebrow">Unofficial Vikunja client</div>
							<h1>A focused client for your Vikunja workspace.</h1>
							<p>
								An independent PWA that connects to Vikunja servers for projects, tasks, comments,
								attachments, and detail-heavy work across phone, tablet, and desktop.
							</p>
						</div>
					</div>
					<div className="auth-identity-slot">
						<div className="detail-label">Identity-ready shell</div>
						<div className="auth-identity-card">
							<div className="auth-identity-line auth-identity-line-wide"></div>
							<div className="auth-identity-line"></div>
							<div className="auth-identity-chip-row">
								<span className="count-chip compact">Projects</span>
								<span className="count-chip compact">Tasks</span>
								<span className="count-chip compact">Details</span>
							</div>
						</div>
					</div>
				</section>

				<section className="auth-card">
					<div className="auth-card-head">
						<div>
							<div className="detail-label">Welcome</div>
							<h2>Connect to your Vikunja server</h2>
							<p>This app is an independent client and is not affiliated with the official Vikunja project.</p>
						</div>
						<div className="settings-toggle-row">
							<button
								className={`pill-button ${theme === 'dark' ? '' : 'subtle'}`.trim()}
								type="button"
								onClick={() => setTheme('dark')}
							>
								Dark
							</button>
							<button
								className={`pill-button ${theme === 'light' ? '' : 'subtle'}`.trim()}
								type="button"
								onClick={() => setTheme('light')}
							>
								Light
							</button>
						</div>
					</div>

					<StatusCards />
					{!isOnline ? (
						<div className="status-card warning">
							You&apos;re offline. Sign-in requires a live connection. If you connected before, the installed app can reopen the last known shell in read-only mode.
						</div>
					) : null}
					{settingsNotice ? <div className="empty-state compact">{settingsNotice}</div> : null}

					{hasServerFallback ? (
						<div className="auth-fallback-card">
							<div className="detail-label">Developer Fallback</div>
							<div className="auth-fallback-copy">
								Use the server-managed fallback session from the local environment instead of entering account
								credentials.
							</div>
							<button
								className="pill-button"
								data-action="use-server-fallback"
								type="button"
								disabled={settingsSubmitting}
								onClick={() => void handleServerFallback()}
							>
								Continue with server fallback
							</button>
						</div>
					) : null}

					<div className="auth-form-card">
						{authSubscreen === 'login' ? (
							<>
								<div className="detail-label">Connect Account</div>
								<div className="settings-toggle-row">
									<button
										className={`pill-button ${showPasswordForm ? '' : 'subtle'}`.trim()}
										data-action="set-account-auth-mode"
										data-auth-mode="password"
										type="button"
										onClick={() => setAccountAuthMode('password')}
									>
										Password
									</button>
									<button
										className={`pill-button ${showPasswordForm ? 'subtle' : ''}`.trim()}
										data-action="set-account-auth-mode"
										data-auth-mode="apiToken"
										type="button"
										onClick={() => setAccountAuthMode('apiToken')}
									>
										API Token
									</button>
								</div>

								<form className="detail-grid settings-form" data-form="account-login" onSubmit={handleSubmit}>
									<label className="detail-item detail-item-full detail-field">
										<div className="detail-label">Server URL</div>
										<input
											className="detail-input"
											data-account-field="baseUrl"
											name="baseUrl"
											type="url"
											inputMode="url"
											autoComplete="url"
											spellCheck={false}
											placeholder="https://vikunja.example.com"
											value={accountForm.baseUrl}
											disabled={connectDisabled}
											onChange={event => setAccountField('baseUrl', event.currentTarget.value)}
										/>
									</label>
									{showPasswordForm ? (
										<>
											<label className="detail-item detail-field">
												<div className="detail-label">Username</div>
												<input
													className="detail-input"
													data-account-field="username"
													name="username"
													type="text"
													autoComplete="username"
													autoCapitalize="none"
													spellCheck={false}
													value={accountForm.username}
													disabled={connectDisabled}
													onChange={event => setAccountField('username', event.currentTarget.value)}
												/>
											</label>
											<label className="detail-item detail-field">
												<div className="detail-label">Password</div>
												<input
													className="detail-input"
													data-account-field="password"
													name="password"
													type="password"
													autoComplete="current-password"
													value={accountForm.password}
													disabled={connectDisabled}
													onChange={event => setAccountField('password', event.currentTarget.value)}
												/>
											</label>
										</>
									) : (
										<label className="detail-item detail-item-full detail-field">
											<div className="detail-label">API Token</div>
											<input
												className="detail-input"
												data-account-field="apiToken"
												name="apiToken"
												type="password"
												autoComplete="off"
												autoCapitalize="none"
												spellCheck={false}
												value={accountForm.apiToken}
												disabled={connectDisabled}
												onChange={event => setAccountField('apiToken', event.currentTarget.value)}
											/>
										</label>
									)}
									<div className="detail-item detail-item-full detail-field">
										<button className="composer-submit" type="submit" disabled={connectDisabled}>
											{settingsSubmitting ? 'Connecting…' : !isOnline ? 'Offline' : 'Connect'}
										</button>
									</div>
								</form>
								<div className="auth-link-row">
									<button
										className="auth-text-link"
										type="button"
										onClick={() => setAuthSubscreen('register')}
									>
										Create account
									</button>
									<button
										className="auth-text-link"
										type="button"
										onClick={() => setAuthSubscreen('forgot-password')}
									>
										Forgot password?
									</button>
								</div>
								<div className="empty-state compact">
									Password login is recommended for self-hosted Vikunja. API tokens are proxied through this
									backend and are never stored in browser storage.
								</div>
							</>
						) : null}

						{authSubscreen === 'register' ? (
							<>
								<div className="detail-label">Create Account</div>
								{registrationError ? <div className="status-card danger">{registrationError}</div> : null}
								<form className="detail-grid settings-form" data-form="account-register" onSubmit={handleRegisterSubmit}>
									<label className="detail-item detail-item-full detail-field">
										<div className="detail-label">Server URL</div>
										<input
											className="detail-input"
											data-registration-field="baseUrl"
											name="baseUrl"
											type="url"
											inputMode="url"
											autoComplete="url"
											spellCheck={false}
											placeholder="https://vikunja.example.com"
											value={registrationForm.baseUrl}
											disabled={registrationDisabled}
											onChange={event => setRegistrationField('baseUrl', event.currentTarget.value)}
										/>
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Username</div>
										<input
											className="detail-input"
											data-registration-field="username"
											name="username"
											type="text"
											autoComplete="username"
											autoCapitalize="none"
											spellCheck={false}
											value={registrationForm.username}
											disabled={registrationDisabled}
											onChange={event => setRegistrationField('username', event.currentTarget.value)}
										/>
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Email</div>
										<input
											className="detail-input"
											data-registration-field="email"
											name="email"
											type="email"
											autoComplete="email"
											value={registrationForm.email}
											disabled={registrationDisabled}
											onChange={event => setRegistrationField('email', event.currentTarget.value)}
										/>
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Password</div>
										<input
											className="detail-input"
											data-registration-field="password"
											name="password"
											type="password"
											autoComplete="new-password"
											value={registrationForm.password}
											disabled={registrationDisabled}
											onChange={event => setRegistrationField('password', event.currentTarget.value)}
										/>
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Confirm Password</div>
										<input
											className="detail-input"
											data-registration-field="confirmPassword"
											name="confirmPassword"
											type="password"
											autoComplete="new-password"
											value={registrationForm.confirmPassword}
											disabled={registrationDisabled}
											onChange={event => setRegistrationField('confirmPassword', event.currentTarget.value)}
										/>
									</label>
									<div className="detail-item detail-item-full detail-field">
										<button className="composer-submit" type="submit" disabled={registrationDisabled}>
											{registrationSubmitting ? 'Creating account…' : !isOnline ? 'Offline' : 'Create Account'}
										</button>
									</div>
								</form>
								<button className="auth-text-link" type="button" onClick={() => setAuthSubscreen('login')}>
									Back to sign in
								</button>
							</>
						) : null}

						{authSubscreen === 'forgot-password' ? (
							<>
								<div className="detail-label">Reset Password</div>
								{forgotPasswordSent ? (
									<div className="status-card success">
										If an account with that email exists, a reset link has been sent.
									</div>
								) : (
									<form className="detail-grid settings-form" data-form="forgot-password" onSubmit={handleForgotPasswordSubmit}>
										<label className="detail-item detail-item-full detail-field">
											<div className="detail-label">Email</div>
											<input
												className="detail-input"
												data-forgot-password-field="email"
												name="email"
												type="email"
												autoComplete="email"
												value={forgotPasswordForm.email}
												disabled={forgotPasswordDisabled}
												onChange={event => setForgotPasswordEmail(event.currentTarget.value)}
											/>
										</label>
										<div className="detail-item detail-item-full detail-field">
											<button className="composer-submit" type="submit" disabled={forgotPasswordDisabled}>
												{forgotPasswordSubmitting ? 'Sending…' : !isOnline ? 'Offline' : 'Send Reset Link'}
											</button>
										</div>
									</form>
								)}
								<div className="empty-state compact">
									{accountForm.baseUrl
										? `Using ${accountForm.baseUrl} for the reset request.`
										: 'Enter your Vikunja server URL on the sign-in screen first.'}
								</div>
								<button className="auth-text-link" type="button" onClick={() => setAuthSubscreen('login')}>
									Back to sign in
								</button>
							</>
						) : null}
					</div>
				</section>
			</div>
		</div>
	)
}

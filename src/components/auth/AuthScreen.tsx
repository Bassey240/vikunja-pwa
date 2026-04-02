import StatusCards from '@/components/layout/StatusCards'
import {useAppStore} from '@/store'
import type {VikunjaInfo} from '@/types'
import {type FormEvent, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'

export default function AuthScreen() {
	const navigate = useNavigate()
	const [authSubscreen, setAuthSubscreen] = useState<'login' | 'register' | 'forgot-password'>('login')
	const [instanceInfo, setInstanceInfo] = useState<VikunjaInfo | null>(null)
	const [instanceInfoBaseUrl, setInstanceInfoBaseUrl] = useState('')
	const [instanceInfoLoading, setInstanceInfoLoading] = useState(false)
	const accountForm = useAppStore(state => state.accountForm)
	const registrationForm = useAppStore(state => state.registrationForm)
	const registrationSubmitting = useAppStore(state => state.registrationSubmitting)
	const registrationError = useAppStore(state => state.registrationError)
	const forgotPasswordForm = useAppStore(state => state.forgotPasswordForm)
	const forgotPasswordSubmitting = useAppStore(state => state.forgotPasswordSubmitting)
	const forgotPasswordSent = useAppStore(state => state.forgotPasswordSent)
	const settingsSubmitting = useAppStore(state => state.settingsSubmitting)
	const settingsNotice = useAppStore(state => state.settingsNotice)
	const error = useAppStore(state => state.error)
	const totpLoginRequired = useAppStore(state => state.totpLoginRequired)
	const isOnline = useAppStore(state => state.isOnline)
	const setAccountField = useAppStore(state => state.setAccountField)
	const setAccountAuthMode = useAppStore(state => state.setAccountAuthMode)
	const cancelTotpLoginChallenge = useAppStore(state => state.cancelTotpLoginChallenge)
	const probeInstanceInfo = useAppStore(state => state.probeInstanceInfo)
	const setRegistrationField = useAppStore(state => state.setRegistrationField)
	const setForgotPasswordEmail = useAppStore(state => state.setForgotPasswordEmail)
	const login = useAppStore(state => state.login)
	const register = useAppStore(state => state.register)
	const requestPasswordReset = useAppStore(state => state.requestPasswordReset)

	const showPasswordForm = accountForm.authMode === 'password'
	const authCapabilityBaseUrl = authSubscreen === 'register' ? registrationForm.baseUrl : accountForm.baseUrl
	const normalizedAuthCapabilityBaseUrl = authCapabilityBaseUrl.trim()
	const currentInstanceInfo =
		instanceInfo && instanceInfoBaseUrl === normalizedAuthCapabilityBaseUrl ? instanceInfo : null
	const registrationEnabled = getRegistrationEnabled(currentInstanceInfo)
	const localPasswordEnabled = getLocalPasswordEnabled(currentInstanceInfo)
	const oidcProviders = getOidcProviders(currentInstanceInfo)
	const connectDisabled = settingsSubmitting || !isOnline || (showPasswordForm && localPasswordEnabled === false)
	const totpFieldDisabled = settingsSubmitting || !isOnline
	const totpSubmitDisabled = totpFieldDisabled || !accountForm.totpPasscode.trim()
	const forgotPasswordDisabled = forgotPasswordSubmitting || !isOnline || localPasswordEnabled === false
	const registrationBlockedByServer = localPasswordEnabled === false || registrationEnabled === false
	const registrationDisabled = registrationSubmitting || !isOnline || instanceInfoLoading || registrationBlockedByServer
	const showTotpLoginStep = authSubscreen === 'login' && showPasswordForm && totpLoginRequired
	const showCreateAccountLink = Boolean(
		showPasswordForm &&
		normalizedAuthCapabilityBaseUrl &&
		localPasswordEnabled !== false &&
		registrationEnabled !== false,
	)
	const showForgotPasswordLink = Boolean(showPasswordForm && localPasswordEnabled !== false)

	useEffect(() => {
		if (authSubscreen !== 'register' || registrationForm.baseUrl || !accountForm.baseUrl) {
			return
		}

		setRegistrationField('baseUrl', accountForm.baseUrl)
	}, [accountForm.baseUrl, authSubscreen, registrationForm.baseUrl, setRegistrationField])

	useEffect(() => {
		if (!isOnline || !normalizedAuthCapabilityBaseUrl) {
			setInstanceInfo(null)
			setInstanceInfoBaseUrl('')
			setInstanceInfoLoading(false)
			return
		}

		let cancelled = false
		const timeoutId = window.setTimeout(() => {
			void (async () => {
				setInstanceInfoLoading(true)
				const info = await probeInstanceInfo(normalizedAuthCapabilityBaseUrl)
				if (cancelled) {
					return
				}
				setInstanceInfo(info)
				setInstanceInfoBaseUrl(normalizedAuthCapabilityBaseUrl)
				setInstanceInfoLoading(false)
			})()
		}, 600)

		return () => {
			cancelled = true
			window.clearTimeout(timeoutId)
		}
	}, [isOnline, normalizedAuthCapabilityBaseUrl, probeInstanceInfo])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await login()
		if (success) {
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
							{showTotpLoginStep ? null : <div className="detail-label">Welcome</div>}
							<h2>Connect to your Vikunja server</h2>
							{showTotpLoginStep ? null : (
								<p>This app is an independent client and is not affiliated with the official Vikunja project.</p>
							)}
						</div>
					</div>

					{showTotpLoginStep ? null : <StatusCards />}
					{!showTotpLoginStep && !isOnline ? (
						<div className="status-card warning">
							You&apos;re offline. Sign-in requires a live connection. If you connected before, the installed app can reopen the last known shell in read-only mode.
						</div>
					) : null}
					{!showTotpLoginStep && settingsNotice ? <div className="empty-state compact">{settingsNotice}</div> : null}

					<div className="auth-form-card">
						{authSubscreen === 'login' ? (
							<>
								{showTotpLoginStep ? (
									<>
										<div className="detail-label">Two-Factor Authentication</div>
										{error ? <div className="status-card danger">{error}</div> : null}
										<form className="detail-grid settings-form" data-form="account-login-totp" onSubmit={handleSubmit}>
											<label className="detail-item detail-item-full detail-field">
												<div className="detail-label">Authentication code</div>
												<input
													className="detail-input"
													data-account-field="totpPasscode"
													name="totpPasscode"
													type="text"
													inputMode="numeric"
													autoComplete="one-time-code"
													value={accountForm.totpPasscode}
													disabled={totpFieldDisabled}
													onChange={event => setAccountField('totpPasscode', event.currentTarget.value)}
												/>
											</label>
											<div className="detail-item detail-item-full detail-field">
												<button className="composer-submit" type="submit" disabled={totpSubmitDisabled}>
													{settingsSubmitting ? 'Verifying…' : !isOnline ? 'Offline' : 'Verify and Sign In'}
												</button>
											</div>
										</form>
										<button className="auth-text-link" type="button" onClick={cancelTotpLoginChallenge}>
											Back to sign in
										</button>
									</>
								) : (
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
										{showPasswordForm && oidcProviders.length > 0 ? (
											<div className="detail-core-card settings-subsection">
												<div className="detail-label">Single sign-on</div>
												<div className="detail-inline-actions">
													{oidcProviders.map(provider => (
														<button
															key={provider.key}
															className="pill-button subtle"
															type="button"
															onClick={() => {
																window.open(provider.auth_url, '_blank', 'noopener,noreferrer')
															}}
														>
															Sign in with {provider.name || provider.key}
														</button>
													))}
												</div>
												<div className="empty-state compact">
													OIDC callback handling is not wired in this build yet. These buttons preview the configured providers.
												</div>
											</div>
										) : null}
										<div className="auth-link-row">
											{showCreateAccountLink ? (
												<button
													className="auth-text-link"
													type="button"
													onClick={() => setAuthSubscreen('register')}
												>
													Create account
												</button>
											) : null}
											{showForgotPasswordLink ? (
												<button
													className="auth-text-link"
													type="button"
													onClick={() => setAuthSubscreen('forgot-password')}
												>
													Forgot password?
												</button>
											) : null}
										</div>
										{showPasswordForm && normalizedAuthCapabilityBaseUrl && instanceInfoLoading ? (
											<div className="empty-state compact">Checking sign-in options for this server…</div>
										) : null}
										{showPasswordForm && normalizedAuthCapabilityBaseUrl && registrationBlockedByServer ? (
											<div className="empty-state compact">
												This Vikunja server does not allow password account creation from this screen.
											</div>
										) : null}
										{showPasswordForm && normalizedAuthCapabilityBaseUrl && localPasswordEnabled === false ? (
											<div className="empty-state compact">
												Local username/password sign-in is disabled on this Vikunja instance.
											</div>
										) : null}
										<div className="empty-state compact">
											Password login is recommended for self-hosted Vikunja. API tokens are proxied through this
											backend and are never stored in browser storage.
										</div>
									</>
								)}
							</>
						) : null}

						{authSubscreen === 'register' ? (
							<>
								<div className="detail-label">Create Account</div>
								{registrationError ? <div className="status-card danger">{registrationError}</div> : null}
								{registrationBlockedByServer ? (
									<div className="status-card warning">
										This Vikunja server does not allow self-registration.
									</div>
								) : (
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
								)}
								<button className="auth-text-link" type="button" onClick={() => setAuthSubscreen('login')}>
									Back to sign in
								</button>
							</>
						) : null}

						{authSubscreen === 'forgot-password' ? (
							<>
								<div className="detail-label">Reset Password</div>
								{localPasswordEnabled === false ? (
									<div className="status-card warning">
										This Vikunja server does not allow password reset because local password auth is disabled.
									</div>
								) : null}
								{forgotPasswordSent ? (
									<div className="status-card success">
										If an account with that email exists, a reset link has been sent.
									</div>
								) : localPasswordEnabled === false ? null : (
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

function getRegistrationEnabled(info: VikunjaInfo | null) {
	if (!info) {
		return true
	}

	if (typeof info.registration_enabled === 'boolean') {
		return info.registration_enabled
	}

	if (typeof info.auth?.local?.registration_enabled === 'boolean') {
		return info.auth.local.registration_enabled
	}

	return true
}

function getLocalPasswordEnabled(info: VikunjaInfo | null) {
	if (!info) {
		return true
	}

	if (typeof info.auth?.local?.enabled === 'boolean') {
		return info.auth.local.enabled
	}

	return true
}

function getOidcProviders(info: VikunjaInfo | null) {
	return info?.auth?.openid?.providers || info?.auth?.openid_connect?.providers || []
}

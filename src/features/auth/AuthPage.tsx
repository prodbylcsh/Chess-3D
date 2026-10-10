import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { tk, useT, withNodes } from '../../i18n';
import { Eye, EyeOff, KeyRound, Lock, Mail, MailCheck, Sparkles, Swords, Trophy } from 'lucide-react';
import { api, ApiError } from '../../api';
import { emailProblem, passwordProblem, passwordStrength } from '../../api/validation';
import { legalUrl } from '../../app/legal';
import { useSession } from '../../app/session';
import { Wordmark } from '../../app/AppLayout';
import { PieceGlyph } from '../../ui/art/art';
import { Button, Field, Modal, Segmented, Spinner, cx, useToast } from '../../ui/kit';
import './auth.css';

type Mode = 'signin' | 'signup';

function AppleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

const STRENGTH = [tk('Too weak'), tk('Weak'), tk('Good'), tk('Strong')];

/** The decorative left half of the sign-in screens. */
function AuthHero() {
  const t = useT();
  return (
    <section className="auth-hero" aria-hidden>
      <div className="auth-hero-glow" />
      <svg className="auth-hero-art" viewBox="0 0 400 400">
        <defs>
          <linearGradient id="hero-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe6b8" />
            <stop offset="1" stopColor="#c98a3c" />
          </linearGradient>
          <linearGradient id="hero-violet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d3c6ff" />
            <stop offset="1" stopColor="#5a3fb8" />
          </linearGradient>
        </defs>
        <g transform="translate(40 70) scale(2.5)" opacity="0.95">
          <PieceGlyph piece="king" fill="url(#hero-gold)" />
        </g>
        <g transform="translate(170 120) scale(2.1)" opacity="0.9">
          <PieceGlyph piece="queen" fill="url(#hero-violet)" />
        </g>
      </svg>
      <div className="auth-hero-copy">
        <Wordmark />
        <h1 className="display">{t('Chess, with a little magic.')}</h1>
        <ul>
          <li>
            <Swords size={18} /> {t('Ranked leagues from Iron to Challenger')}
          </li>
          <li>
            <Sparkles size={18} /> {t('Cinematic 3D battles on every capture')}
          </li>
          <li>
            <Trophy size={18} /> {t('Earn coins, unlock sets, boards and effects')}
          </li>
        </ul>
      </div>
    </section>
  );
}

export function AuthPage() {
  const { signedIn } = useSession();
  const t = useT();
  const location = useLocation();
  // "/auth?signup" (e.g. from a guest's result card) opens the sign-up form
  const [mode, setMode] = useState<Mode>(new URLSearchParams(location.search).has('signup') ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<null | 'email' | 'apple' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  /** waiting for the player to click the confirmation link sent to this address */
  const [pending, setPending] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<'apple' | 'google', boolean> | null>(null);

  useEffect(() => {
    void api.auth.providers().then(setProviders);
  }, []);

  const emailError = touched ? emailProblem(email) : null;
  const passwordError = touched && mode === 'signup' ? passwordProblem(password) : touched && !password ? t('Enter your password') : null;
  const strength = passwordStrength(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    setUnconfirmed(false);
    if (emailProblem(email) || (mode === 'signup' ? passwordProblem(password) : !password)) return;
    setBusy('email');
    try {
      if (mode === 'signup') {
        const result = await api.auth.signUp(email, password);
        if ('confirmEmail' in result) {
          setPending(result.confirmEmail);
          setBusy(null);
          return;
        }
        await signedIn(result.account);
      } else {
        await signedIn(await api.auth.signIn(email, password));
      }
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t('Something went wrong. Please try again.'));
      setUnconfirmed(err instanceof ApiError && err.code === 'email_not_confirmed');
      setBusy(null);
    }
  }

  async function social(provider: 'apple' | 'google') {
    setError(null);
    setBusy(provider);
    try {
      await signedIn(await api.auth.signInWith(provider));
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t('Sign-in was not completed.'));
      setBusy(null);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setUnconfirmed(false);
    setTouched(false);
  }

  const unavailable = (provider: 'apple' | 'google') => providers !== null && !providers[provider];

  return (
    <div className="auth">
      <AuthHero />

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <Wordmark />
          </div>
          {pending ? (
            <ConfirmEmail
              email={pending}
              onBack={() => {
                setPending(null);
                switchMode('signin');
              }}
            />
          ) : (
            <>
              <h2>{mode === 'signin' ? t('Welcome back') : t('Create your account')}</h2>
              <p className="muted">{mode === 'signin' ? t('Sign in to continue your climb.') : t('It takes less than a minute.')}</p>

              <Segmented
                label={t('Sign in or sign up')}
                value={mode}
                onChange={switchMode}
                options={[
                  { value: 'signin', label: t('Sign in') },
                  { value: 'signup', label: t('Create account') },
                ]}
              />

              <div className="auth-social">
                <Button
                  className="btn-apple"
                  size="lg"
                  block
                  icon={<AppleLogo />}
                  loading={busy === 'apple'}
                  disabled={!!busy || unavailable('apple')}
                  title={unavailable('apple') ? t('Not available yet') : undefined}
                  onClick={() => void social('apple')}
                >
                  {t('Continue with Apple')}
                  {unavailable('apple') && <em className="auth-soon">{t('Soon')}</em>}
                </Button>
                <Button
                  className="btn-google"
                  size="lg"
                  block
                  icon={<GoogleLogo />}
                  loading={busy === 'google'}
                  disabled={!!busy || unavailable('google')}
                  title={unavailable('google') ? t('Not available yet') : undefined}
                  onClick={() => void social('google')}
                >
                  {t('Continue with Google')}
                  {unavailable('google') && <em className="auth-soon">{t('Soon')}</em>}
                </Button>
              </div>

              <div className="auth-divider">
                <span>{t('or with email')}</span>
              </div>

              <form className="auth-form" onSubmit={submit} noValidate>
                <Field
                  label={t('Email')}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  leading={<Mail size={18} />}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={emailError && t(emailError)}
                />
                <Field
                  label={t('Password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder={mode === 'signup' ? t('At least 8 characters') : t('Your password')}
                  leading={<Lock size={18} />}
                  trailing={
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? t('Hide password') : t('Show password')}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={passwordError && t(passwordError)}
                />
                {mode === 'signup' && password && (
                  <div className={cx('strength', `strength-${strength}`)}>
                    <span />
                    <span />
                    <span />
                    <em>{t(STRENGTH[strength])}</em>
                  </div>
                )}
                {mode === 'signin' && (
                  <button type="button" className="link-btn auth-forgot" onClick={() => setResetOpen(true)}>
                    {t('Forgot password?')}
                  </button>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                    {unconfirmed && (
                      <>
                        {' '}
                        <ResendLink email={email} />
                      </>
                    )}
                  </p>
                )}
                <Button type="submit" variant="primary" size="lg" block loading={busy === 'email'} disabled={!!busy}>
                  {mode === 'signin' ? t('Sign in') : t('Create account')}
                </Button>
              </form>

              <p className="auth-foot faint">
                {withNodes(t('By continuing you confirm you are at least 15 and agree to the {terms} and the {privacy}.'), {
                  terms: (
                    <a href={legalUrl('terms')} target="_blank" rel="noreferrer">
                      {t('Terms of Service')}
                    </a>
                  ),
                  privacy: (
                    <a href={legalUrl('privacy')} target="_blank" rel="noreferrer">
                      {t('Privacy Policy')}
                    </a>
                  ),
                })}
                {api.demo.accounts && <> {t('Demo mode: accounts are stored only in this browser.')}</>}
              </p>
            </>
          )}
        </div>
      </section>

      <ResetPassword open={resetOpen} onClose={() => setResetOpen(false)} initialEmail={email} />
    </div>
  );
}

function ResetPassword({ open, onClose, initialEmail }: { open: boolean; onClose: () => void; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = emailProblem(email);
    if (problem) return setError(t(problem));
    setBusy(true);
    try {
      await api.auth.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t('Something went wrong.'));
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    onClose();
    setTimeout(() => setSent(false), 300);
  };

  return (
    <Modal open={open} onClose={close} title={sent ? t('Check your inbox') : t('Reset your password')} subtitle={sent ? t('If an account exists for {email}, we sent a link to set a new password.', { email }) : t("Enter your email and we'll send you a reset link.")}>
      {sent ? (
        <Button variant="primary" block onClick={close}>
          {t('Back to sign in')}
        </Button>
      ) : (
        <form onSubmit={submit} className="auth-form" noValidate>
          <Field label={t('Email')} type="email" leading={<Mail size={18} />} value={email} onChange={(e) => setEmail(e.target.value)} error={error} autoFocus />
          <Button type="submit" variant="primary" block loading={busy}>
            {t('Send reset link')}
          </Button>
        </form>
      )}
    </Modal>
  );
}

/** Sent again on request; says so in a toast. */
function ResendLink({ email }: { email: string }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function resend() {
    setBusy(true);
    try {
      await api.auth.resendConfirmation(email);
      toast(t('We sent the link again.'), { tone: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Something went wrong.'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="link-btn" disabled={busy} onClick={() => void resend()}>
      {t('Send the link again')}
    </button>
  );
}

/** After signing up: the account exists once the player opens the emailed link. */
function ConfirmEmail({ email, onBack }: { email: string; onBack: () => void }) {
  const t = useT();
  return (
    <div className="auth-confirm">
      <div className="auth-confirm-icon">
        <MailCheck size={30} />
      </div>
      <h2>{t('Confirm your email')}</h2>
      <p className="muted">{t('We sent a link to {email}. Open it to finish creating your account.', { email })}</p>
      <p className="faint">{t("Can't find it? Check your spam folder, or send it again.")}</p>
      <div className="auth-confirm-actions">
        <ResendLink email={email} />
        <button type="button" className="link-btn" onClick={onBack}>
          {t('Back to sign in')}
        </button>
      </div>
    </div>
  );
}

/** Reached from a password-reset email: the link has already signed the player in. */
export function ResetPasswordPage() {
  const { status, account } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = touched ? passwordProblem(password) : null;
  const strength = passwordStrength(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (passwordProblem(password)) return;
    setBusy(true);
    try {
      await api.auth.updatePassword(password);
      toast(t('Password changed.'), { tone: 'success' });
      navigate('/play', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Something went wrong. Please try again.'));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <AuthHero />
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <Wordmark />
          </div>
          {status === 'loading' ? (
            <div className="auth-loading">
              <Spinner />
            </div>
          ) : status === 'signedOut' ? (
            <div className="auth-confirm">
              <div className="auth-confirm-icon">
                <KeyRound size={28} />
              </div>
              <h2>{t('This link is no longer valid')}</h2>
              <p className="muted">{t('Reset links work only once and expire after an hour. Ask for a new one on the sign-in page.')}</p>
              <Button variant="primary" block onClick={() => navigate('/auth', { replace: true })}>
                {t('Back to sign in')}
              </Button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submit} noValidate>
              <h2>{t('Choose a new password')}</h2>
              <p className="muted">{t('For {email}.', { email: account?.email ?? '' })}</p>
              <Field
                label={t('New password')}
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('At least 8 characters')}
                leading={<Lock size={18} />}
                trailing={
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t('Hide password') : t('Show password')}>
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={problem}
                autoFocus
              />
              {password && (
                <div className={cx('strength', `strength-${strength}`)}>
                  <span />
                  <span />
                  <span />
                  <em>{t(STRENGTH[strength])}</em>
                </div>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" block loading={busy}>
                {t('Save new password')}
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

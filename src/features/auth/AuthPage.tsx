import { useState, type FormEvent } from 'react';
import { tk, useT } from '../../i18n';
import { Eye, EyeOff, Lock, Mail, Sparkles, Swords, Trophy } from 'lucide-react';
import { api, ApiError } from '../../api';
import { emailProblem, passwordProblem, passwordStrength } from '../../api/validation';
import { useSession } from '../../app/session';
import { Wordmark } from '../../app/AppLayout';
import { PieceGlyph } from '../../ui/art/art';
import { Button, Field, Modal, Segmented, cx } from '../../ui/kit';
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

export function AuthPage() {
  const { signedIn } = useSession();
  const t = useT();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<null | 'email' | 'apple' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const emailError = touched ? emailProblem(email) : null;
  const passwordError = touched && mode === 'signup' ? passwordProblem(password) : touched && !password ? t('Enter your password') : null;
  const strength = passwordStrength(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (emailProblem(email) || (mode === 'signup' ? passwordProblem(password) : !password)) return;
    setBusy('email');
    try {
      const account = mode === 'signup' ? await api.auth.signUp(email, password) : await api.auth.signIn(email, password);
      await signedIn(account);
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t('Something went wrong. Please try again.'));
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
    setTouched(false);
  }

  return (
    <div className="auth">
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

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <Wordmark />
          </div>
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
            <Button className="btn-apple" size="lg" block icon={<AppleLogo />} loading={busy === 'apple'} disabled={!!busy} onClick={() => void social('apple')}>
              {t('Continue with Apple')}
            </Button>
            <Button className="btn-google" size="lg" block icon={<GoogleLogo />} loading={busy === 'google'} disabled={!!busy} onClick={() => void social('google')}>
              {t('Continue with Google')}
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
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" block loading={busy === 'email'} disabled={!!busy}>
              {mode === 'signin' ? t('Sign in') : t('Create account')}
            </Button>
          </form>

          <p className="auth-foot faint">
            {t('By continuing you agree to the Terms of Service and Privacy Policy.')}
            {api.mock && <> {t('Demo mode: accounts are stored only in this browser.')}</>}
          </p>
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

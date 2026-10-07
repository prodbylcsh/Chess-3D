import { t, tk } from '../../i18n';
import { shortDate } from '../../ui/format';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AtSign, Check, Globe, KeyRound, LogOut, Mail, Trash2, UserRound, Volume2, X, RefreshCw } from 'lucide-react';
import { api, ApiError, type UsernameCheck } from '../../api';
import { USERNAME_COOLDOWN_DAYS, USERNAME_MAX, emailProblem, nextUsernameChange, passwordProblem, usernameProblem } from '../../api/validation';
import { Page } from '../../app/AppLayout';
import { LANGUAGES, setPrefs, usePrefs } from '../../app/prefs';
import { useSession } from '../../app/session';
import { ProfileIcon } from '../../ui/art/art';
import { Badge, Button, Card, Field, Modal, Spinner, Switch, useToast } from '../../ui/kit';
import './settings.css';

const PROVIDER: Record<string, string> = { email: tk('Email and password'), apple: tk('Sign in with Apple'), google: tk('Sign in with Google') };

export function SettingsPage() {
  const { account, profile, signOut } = useSession();
  const prefs = usePrefs();
  const [dialog, setDialog] = useState<null | 'email' | 'password' | 'username' | 'delete'>(null);
  if (!account || !profile) return null;
  const social = account.provider !== 'email';
  const nextChange = nextUsernameChange(profile.usernameChangedAt ?? null);

  return (
    <Page title={t('Settings')} subtitle={t('Your account, profile and preferences.')}>
      <div className="settings">
        <Section title={t('Account')}>
          <Row icon={<KeyRound size={18} />} title={t('Sign-in method')} text={t(PROVIDER[account.provider])} />
          <Row
            icon={<Mail size={18} />}
            title={t('Email')}
            text={account.email}
            action={
              social ? (
                <Badge>{t('Managed by {provider}', { provider: account.provider === 'apple' ? 'Apple' : 'Google' })}</Badge>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setDialog('email')}>
                  {t('Change')}
                </Button>
              )
            }
          />
          {!social && (
            <Row
              icon={<KeyRound size={18} />}
              title={t('Password')}
              text="••••••••••"
              action={
                <Button size="sm" variant="secondary" onClick={() => setDialog('password')}>
                  {t('Change')}
                </Button>
              }
            />
          )}
        </Section>

        <Section title={t('Profile')}>
          <Row
            icon={<AtSign size={18} />}
            title={t('Username')}
            text={
              <>
                {profile.username}
                <span className="faint"> · {nextChange ? t('next change on {date}', { date: shortDate(nextChange) }) : t('can be changed once every {n} days', { n: USERNAME_COOLDOWN_DAYS })}</span>
              </>
            }
            action={
              <Button size="sm" variant="secondary" disabled={!!nextChange} onClick={() => setDialog('username')}>
                {t('Change')}
              </Button>
            }
          />
          <Row
            icon={<ProfileIcon icon={profile.iconId} size={30} />}
            title={t('Profile icon')}
            text={t('Shown in games, chats and on your profile')}
            action={
              <Link to="/profile" className="btn btn-sm btn-secondary">
                <span>{t('Edit on profile')}</span>
              </Link>
            }
          />
        </Section>

        <Section title={t('Game')}>
          <Row icon={<Volume2 size={18} />} title={t('Sound effects')} text={t('Moves, captures and spells')} action={<Switch label={t('Sound effects')} checked={prefs.sound} onChange={(sound) => setPrefs({ sound })} />} />
          <Row
            icon={<RefreshCw size={18} />}
            title={t('Turn the board for each player')}
            text={t('In same-device games, the camera turns to the side to move')}
            action={<Switch label={t('Turn the board for each player')} checked={prefs.autoRotate} onChange={(autoRotate) => setPrefs({ autoRotate })} />}
          />
        </Section>

        <Section title={t('Language')}>
          <Row
            icon={<Globe size={18} />}
            title={t('Interface language')}
            text={t('More languages are on the way.')}
            action={
              <select className="select" value={prefs.language} onChange={(e) => setPrefs({ language: e.target.value })} aria-label={t('Interface language')}>
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            }
          />
        </Section>

        <Section title={t('Session')}>
          <Row
            icon={<LogOut size={18} />}
            title={t('Sign out')}
            text={t('Sign out of Wizard Chess on this device')}
            action={
              <Button size="sm" variant="secondary" onClick={() => void signOut()}>
                {t('Sign out')}
              </Button>
            }
          />
        </Section>

        <Section title={t('Danger zone')} danger>
          <Row
            icon={<Trash2 size={18} />}
            title={t('Delete account')}
            text={t('Permanently deletes your profile, rank, coins, friends and messages')}
            action={
              <Button size="sm" variant="danger" onClick={() => setDialog('delete')}>
                {t('Delete')}
              </Button>
            }
          />
        </Section>

        {api.mock && <p className="faint settings-note">{t('Demo mode: account changes are stored only in this browser.')}</p>}
      </div>

      <ChangeEmail open={dialog === 'email'} onClose={() => setDialog(null)} />
      <ChangePassword open={dialog === 'password'} onClose={() => setDialog(null)} />
      <ChangeUsername open={dialog === 'username'} onClose={() => setDialog(null)} />
      <DeleteAccount open={dialog === 'delete'} onClose={() => setDialog(null)} />
    </Page>
  );
}

function Section({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <section className={danger ? 'settings-section is-danger' : 'settings-section'}>
      <h2>{title}</h2>
      <Card className="settings-card">{children}</Card>
    </section>
  );
}

function Row({ icon, title, text, action }: { icon: ReactNode; title: string; text: ReactNode; action?: ReactNode }) {
  return (
    <div className="settings-row">
      <span className="settings-icon">{icon}</span>
      <span className="settings-text">
        <strong>{title}</strong>
        <span className="muted">{text}</span>
      </span>
      {action && <span className="settings-action">{action}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ dialogs

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

function ChangeEmail({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signedIn } = useSession();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, setError, run } = useSubmit(() => {
    toast(t('Email updated.'), { tone: 'success' });
    onClose();
  });
  useEffect(() => {
    if (open) {
      setEmail('');
      setPassword('');
      setError(null);
    }
  }, [open, setError]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = emailProblem(email);
    if (problem) return setError(problem);
    void run(async () => signedIn(await api.account.changeEmail(email, password)));
  };
  return (
    <Modal open={open} onClose={onClose} title={t('Change email')} subtitle={t("We'll use the new address for sign-in and notifications.")} width={420}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <Field label={t('New email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t('Current password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="form-error">{error}</p>}
        <Button type="submit" variant="primary" block loading={busy}>
          {t('Save email')}
        </Button>
      </form>
    </Modal>
  );
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const { busy, error, setError, run } = useSubmit(() => {
    toast(t('Password changed.'), { tone: 'success' });
    onClose();
  });
  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setError(null);
    }
  }, [open, setError]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(next);
    if (problem) return setError(t('New password: {problem}', { problem: problem.charAt(0).toLowerCase() + problem.slice(1) }));
    void run(() => api.account.changePassword(current, next));
  };
  return (
    <Modal open={open} onClose={onClose} title={t('Change password')} width={420}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <Field label={t('Current password')} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Field label={t('New password')} type="password" autoComplete="new-password" hint={t('At least 8 characters, with a number')} value={next} onChange={(e) => setNext(e.target.value)} />
        {error && <p className="form-error">{error}</p>}
        <Button type="submit" variant="primary" block loading={busy}>
          {t('Change password')}
        </Button>
      </form>
    </Modal>
  );
}

function ChangeUsername({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, setProfile } = useSession();
  const toast = useToast();
  const [name, setName] = useState('');
  const [check, setCheck] = useState<UsernameCheck | 'checking' | null>(null);
  const { busy, error, setError, run } = useSubmit(() => {
    toast(t('Username changed.'), { tone: 'success' });
    onClose();
  });
  const problem = name ? usernameProblem(name) : null;

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open, setError]);

  useEffect(() => {
    if (!name || problem || name === profile?.username) return setCheck(null);
    setCheck('checking');
    let live = true;
    const timer = setTimeout(() => void api.profiles.checkUsername(name).then((r) => live && setCheck(r)), 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [name, problem, profile?.username]);

  const status =
    check === 'checking' ? <Spinner size={16} /> : check === 'available' ? <span className="name-ok"><Check size={15} /> {t('Available')}</span> : check === 'taken' ? <span className="name-bad"><X size={15} /> {t('Taken')}</span> : null;

  return (
    <Modal open={open} onClose={onClose} title={t('Change username')} subtitle={t('You can change it once every {n} days. Your old name becomes available to others.', { n: USERNAME_COOLDOWN_DAYS })} width={440}>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (check === 'available') void run(async () => setProfile(await api.profiles.update({ username: name })));
        }}
        noValidate
      >
        <Field label={t('New username')} placeholder={profile?.username ?? ''} leading={<UserRound size={18} />} trailing={status} maxLength={USERNAME_MAX} value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, ''))} error={problem} />
        {error && <p className="form-error">{error}</p>}
        <Button type="submit" variant="primary" block loading={busy} disabled={check !== 'available'}>
          {t('Change username')}
        </Button>
      </form>
    </Modal>
  );
}

function DeleteAccount({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, signOut } = useSession();
  const [typed, setTyped] = useState('');
  const { busy, error, setError, run } = useSubmit(() => void signOut());
  useEffect(() => {
    if (open) {
      setTyped('');
      setError(null);
    }
  }, [open, setError]);
  return (
    <Modal open={open} onClose={onClose} title={t('Delete your account?')} subtitle={t('This cannot be undone. Your rank, coins, items, friends and messages are deleted permanently.')} width={440}>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api.account.deleteAccount(typed));
        }}
      >
        <Field label={t('Type your username ({name}) to confirm', { name: profile?.username ?? '' })} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        {error && <p className="form-error">{error}</p>}
        <Button type="submit" variant="danger" block loading={busy} disabled={typed !== profile?.username}>
          {t('Delete account permanently')}
        </Button>
      </form>
    </Modal>
  );
}

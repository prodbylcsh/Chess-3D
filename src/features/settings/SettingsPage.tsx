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

const PROVIDER: Record<string, string> = { email: 'Email and password', apple: 'Sign in with Apple', google: 'Sign in with Google' };

export function SettingsPage() {
  const { account, profile, signOut } = useSession();
  const prefs = usePrefs();
  const [dialog, setDialog] = useState<null | 'email' | 'password' | 'username' | 'delete'>(null);
  if (!account || !profile) return null;
  const social = account.provider !== 'email';
  const nextChange = nextUsernameChange(profile.usernameChangedAt ?? null);

  return (
    <Page title="Settings" subtitle="Your account, profile and preferences.">
      <div className="settings">
        <Section title="Account">
          <Row icon={<KeyRound size={18} />} title="Sign-in method" text={PROVIDER[account.provider]} />
          <Row
            icon={<Mail size={18} />}
            title="Email"
            text={account.email}
            action={
              social ? (
                <Badge>Managed by {account.provider === 'apple' ? 'Apple' : 'Google'}</Badge>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setDialog('email')}>
                  Change
                </Button>
              )
            }
          />
          {!social && (
            <Row
              icon={<KeyRound size={18} />}
              title="Password"
              text="••••••••••"
              action={
                <Button size="sm" variant="secondary" onClick={() => setDialog('password')}>
                  Change
                </Button>
              }
            />
          )}
        </Section>

        <Section title="Profile">
          <Row
            icon={<AtSign size={18} />}
            title="Username"
            text={
              <>
                {profile.username}
                <span className="faint"> · {nextChange ? `next change on ${nextChange.toLocaleDateString()}` : `can be changed once every ${USERNAME_COOLDOWN_DAYS} days`}</span>
              </>
            }
            action={
              <Button size="sm" variant="secondary" disabled={!!nextChange} onClick={() => setDialog('username')}>
                Change
              </Button>
            }
          />
          <Row
            icon={<ProfileIcon icon={profile.iconId} size={30} />}
            title="Profile icon"
            text="Shown in games, chats and on your profile"
            action={
              <Link to="/profile" className="btn btn-sm btn-secondary">
                <span>Edit on profile</span>
              </Link>
            }
          />
        </Section>

        <Section title="Game">
          <Row icon={<Volume2 size={18} />} title="Sound effects" text="Moves, captures and spells" action={<Switch label="Sound effects" checked={prefs.sound} onChange={(sound) => setPrefs({ sound })} />} />
          <Row
            icon={<RefreshCw size={18} />}
            title="Turn the board for each player"
            text="In same-device games, the camera turns to the side to move"
            action={<Switch label="Turn the board for each player" checked={prefs.autoRotate} onChange={(autoRotate) => setPrefs({ autoRotate })} />}
          />
        </Section>

        <Section title="Language">
          <Row
            icon={<Globe size={18} />}
            title="Interface language"
            text="More languages are on the way."
            action={
              <select className="select" value={prefs.language} onChange={(e) => setPrefs({ language: e.target.value })} aria-label="Interface language">
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            }
          />
        </Section>

        <Section title="Session">
          <Row
            icon={<LogOut size={18} />}
            title="Sign out"
            text="Sign out of Wizard Chess on this device"
            action={
              <Button size="sm" variant="secondary" onClick={() => void signOut()}>
                Sign out
              </Button>
            }
          />
        </Section>

        <Section title="Danger zone" danger>
          <Row
            icon={<Trash2 size={18} />}
            title="Delete account"
            text="Permanently deletes your profile, rank, coins, friends and messages"
            action={
              <Button size="sm" variant="danger" onClick={() => setDialog('delete')}>
                Delete
              </Button>
            }
          />
        </Section>

        {api.mock && <p className="faint settings-note">Demo mode: account changes are stored only in this browser.</p>}
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
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
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
    toast('Email updated.', { tone: 'success' });
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
    <Modal open={open} onClose={onClose} title="Change email" subtitle="We'll use the new address for sign-in and notifications." width={420}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <Field label="New email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Current password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="form-error">{error}</p>}
        <Button type="submit" variant="primary" block loading={busy}>
          Save email
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
    toast('Password changed.', { tone: 'success' });
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
    if (problem) return setError(`New password: ${problem.toLowerCase()}`);
    void run(() => api.account.changePassword(current, next));
  };
  return (
    <Modal open={open} onClose={onClose} title="Change password" width={420}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <Field label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Field label="New password" type="password" autoComplete="new-password" hint="At least 8 characters, with a number" value={next} onChange={(e) => setNext(e.target.value)} />
        {error && <p className="form-error">{error}</p>}
        <Button type="submit" variant="primary" block loading={busy}>
          Change password
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
    toast('Username changed.', { tone: 'success' });
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
    const t = setTimeout(() => void api.profiles.checkUsername(name).then((r) => live && setCheck(r)), 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name, problem, profile?.username]);

  const status =
    check === 'checking' ? <Spinner size={16} /> : check === 'available' ? <span className="name-ok"><Check size={15} /> Available</span> : check === 'taken' ? <span className="name-bad"><X size={15} /> Taken</span> : null;

  return (
    <Modal open={open} onClose={onClose} title="Change username" subtitle={`You can change it once every ${USERNAME_COOLDOWN_DAYS} days. Your old name becomes available to others.`} width={440}>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (check === 'available') void run(async () => setProfile(await api.profiles.update({ username: name })));
        }}
        noValidate
      >
        <Field label="New username" placeholder={profile?.username ?? ''} leading={<UserRound size={18} />} trailing={status} maxLength={USERNAME_MAX} value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, ''))} error={problem} />
        {error && <p className="form-error">{error}</p>}
        <Button type="submit" variant="primary" block loading={busy} disabled={check !== 'available'}>
          Change username
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
    <Modal open={open} onClose={onClose} title="Delete your account?" subtitle="This cannot be undone. Your rank, coins, items, friends and messages are deleted permanently." width={440}>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api.account.deleteAccount(typed));
        }}
      >
        <Field label={`Type your username (${profile?.username}) to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        {error && <p className="form-error">{error}</p>}
        <Button type="submit" variant="danger" block loading={busy} disabled={typed !== profile?.username}>
          Delete account permanently
        </Button>
      </form>
    </Modal>
  );
}

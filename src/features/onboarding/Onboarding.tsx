import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, AtSign, Check, Coins as CoinsIcon, Crown, Swords, X } from 'lucide-react';
import { rankOf } from '#shared/rating.ts';
import { api, ApiError, type UsernameCheck } from '../../api';
import { USERNAME_MAX, usernameProblem } from '../../api/validation';
import { useSession } from '../../app/session';
import { Wordmark } from '../../app/AppLayout';
import { ProfileIcon, RankEmblem, STARTER_ICONS } from '../../ui/art/art';
import { Button, Coins, Field, Spinner, cx } from '../../ui/kit';
import './onboarding.css';

const STEPS = ['Welcome', 'Username', 'Profile icon', 'Ready'];

export function Onboarding() {
  const { profile, setProfile, signOut } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(() => Math.min(profile?.onboardingStep ?? 0, STEPS.length - 1));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [username, setUsername] = useState(profile?.username ?? '');
  const [iconId, setIconId] = useState(profile?.iconId ?? 'knight');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null;

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setError(null);
    setStep(next);
  };

  async function save(patch: Parameters<typeof api.profiles.update>[0], next?: number) {
    setSaving(true);
    setError(null);
    try {
      setProfile(await api.profiles.update(patch));
      if (next != null) go(next);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    if (await save({ onboarded: true, onboardingStep: STEPS.length })) navigate('/play', { replace: true });
  }

  return (
    <div className="onboarding">
      <header className="ob-top">
        <Wordmark />
        <button type="button" className="link-btn ob-signout" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      <div className="ob-card">
        <div className="ob-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          <div className="ob-progress-track">
            <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <ol>
            {STEPS.map((label, i) => (
              <li key={label} className={cx(i < step && 'is-done', i === step && 'is-current')}>
                <span className="ob-dot">{i < step ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                <span className="ob-label">{label}</span>
              </li>
            ))}
          </ol>
        </div>

        <div key={step} className={cx('ob-step', direction > 0 ? 'from-right' : 'from-left')}>
          {step === 0 && <Welcome onNext={() => void save({ onboardingStep: 1 }, 1)} saving={saving} />}
          {step === 1 && (
            <UsernameStep
              value={username}
              onChange={setUsername}
              saving={saving}
              onBack={() => go(0)}
              onNext={() => void save({ username, onboardingStep: 2 }, 2)}
            />
          )}
          {step === 2 && (
            <IconStep
              iconId={iconId}
              username={username}
              onChange={setIconId}
              saving={saving}
              onBack={() => go(1)}
              onNext={() => void save({ iconId, onboardingStep: 3 }, 3)}
            />
          )}
          {step === 3 && <Ready iconId={iconId} username={username} mmr={profile.mmr} coins={profile.coins} saving={saving} onBack={() => go(2)} onFinish={() => void finish()} />}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ steps

function StepNav({ onBack, next }: { onBack?: () => void; next: ReactNode }) {
  return (
    <div className="ob-nav">
      {onBack ? (
        <Button variant="ghost" icon={<ArrowLeft size={17} />} onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      {next}
    </div>
  );
}

function Welcome({ onNext, saving }: { onNext: () => void; saving: boolean }) {
  return (
    <>
      <div className="ob-hero">
        <div className="ob-hero-icons">
          {STARTER_ICONS.slice(0, 3).map((i, n) => (
            <ProfileIcon key={i.id} icon={i.id} size={n === 1 ? 84 : 64} />
          ))}
        </div>
        <h1>Welcome to Wizard Chess</h1>
        <p className="muted">Let's set up your profile. It only takes a moment: pick a username and an icon, and you're ready to play.</p>
      </div>
      <StepNav
        next={
          <Button variant="primary" size="lg" onClick={onNext} loading={saving}>
            Let's go
          </Button>
        }
      />
    </>
  );
}

function suggestions(base: string): string[] {
  const clean = base.replace(/[^A-Za-z0-9_]/g, '').slice(0, USERNAME_MAX - 3) || 'Player';
  const n = () => Math.floor(10 + Math.random() * 989);
  return [`${clean}${n()}`, `${clean}_${n()}`, `The${clean}`.slice(0, USERNAME_MAX)];
}

function UsernameStep({
  value,
  onChange,
  onBack,
  onNext,
  saving,
}: {
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  saving: boolean;
}) {
  const [check, setCheck] = useState<UsernameCheck | 'checking' | null>(null);
  const problem = value ? usernameProblem(value) : null;
  const ideas = useMemo(() => (check === 'taken' ? suggestions(value) : []), [check, value]);

  useEffect(() => {
    if (!value || problem) {
      setCheck(null);
      return;
    }
    setCheck('checking');
    let live = true;
    const timer = setTimeout(() => {
      void api.profiles.checkUsername(value).then((r) => live && setCheck(r));
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [value, problem]);

  const status =
    check === 'checking' ? (
      <Spinner size={16} />
    ) : check === 'available' ? (
      <span className="ob-check ok">
        <Check size={15} strokeWidth={3} /> Available
      </span>
    ) : check === 'taken' ? (
      <span className="ob-check bad">
        <X size={15} strokeWidth={3} /> Taken
      </span>
    ) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (check === 'available') onNext();
  };

  return (
    <form onSubmit={submit}>
      <div className="ob-head">
        <h1>Choose a username</h1>
        <p className="muted">This is how other players will see you. You can change it later.</p>
      </div>
      <Field
        label="Username"
        placeholder="e.g. KnightRider"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        maxLength={USERNAME_MAX}
        leading={<AtSign size={18} />}
        trailing={status}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
        error={problem}
        hint={`3–${USERNAME_MAX} characters: letters, numbers and _`}
      />
      {ideas.length > 0 && (
        <div className="ob-ideas">
          <span className="faint">Try:</span>
          {ideas.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => onChange(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <StepNav
        onBack={onBack}
        next={
          <Button type="submit" variant="primary" size="lg" disabled={check !== 'available'} loading={saving}>
            Continue
          </Button>
        }
      />
    </form>
  );
}

function IconStep({
  iconId,
  username,
  onChange,
  onBack,
  onNext,
  saving,
}: {
  iconId: string;
  username: string;
  onChange: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
  saving: boolean;
}) {
  return (
    <>
      <div className="ob-head">
        <h1>Pick your profile icon</h1>
        <p className="muted">Shown next to your name in games, chats and leaderboards. More icons are available in the Shop.</p>
      </div>
      <div className="ob-preview">
        <ProfileIcon key={iconId} icon={iconId} size={72} className="ob-preview-icon" />
        <div>
          <strong>{username}</strong>
          <span className="faint">{STARTER_ICONS.find((i) => i.id === iconId)?.name}</span>
        </div>
      </div>
      <div className="ob-icons" role="radiogroup" aria-label="Profile icon">
        {STARTER_ICONS.map((icon) => (
          <button
            key={icon.id}
            type="button"
            role="radio"
            aria-checked={icon.id === iconId}
            aria-label={icon.name}
            className={cx('ob-icon', icon.id === iconId && 'is-selected')}
            onClick={() => onChange(icon.id)}
          >
            <ProfileIcon icon={icon.id} size={76} />
            <span>{icon.name}</span>
            {icon.id === iconId && (
              <span className="ob-icon-check">
                <Check size={13} strokeWidth={3} />
              </span>
            )}
          </button>
        ))}
      </div>
      <StepNav
        onBack={onBack}
        next={
          <Button variant="primary" size="lg" onClick={onNext} loading={saving}>
            Continue
          </Button>
        }
      />
    </>
  );
}

function Ready({
  iconId,
  username,
  mmr,
  coins,
  onBack,
  onFinish,
  saving,
}: {
  iconId: string;
  username: string;
  mmr: number;
  coins: number;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
}) {
  const rank = rankOf(mmr);
  return (
    <>
      <div className="ob-ready">
        <div className="ob-ready-glow" />
        <ProfileIcon icon={iconId} size={104} ring="rgba(242,194,122,.8)" />
        <h1>You're all set, {username}!</h1>
        <p className="muted">Here's what you start with.</p>
        <div className="ob-perks">
          <div className="ob-perk">
            <RankEmblem tier={rank.tier.id} division={rank.division} size={44} />
            <div>
              <strong>{rank.label}</strong>
              <span className="faint">Starting rank</span>
            </div>
          </div>
          <div className="ob-perk">
            <span className="ob-perk-icon">
              <CoinsIcon size={22} />
            </span>
            <div>
              <Coins amount={coins} />
              <span className="faint">Welcome coins</span>
            </div>
          </div>
        </div>
        <ul className="ob-tips">
          <li>
            <Swords size={16} /> Win ranked games to climb from {rank.tier.name} towards Challenger.
          </li>
          <li>
            <Crown size={16} /> Every casual and ranked game earns coins for the Shop.
          </li>
        </ul>
      </div>
      <StepNav
        onBack={onBack}
        next={
          <Button variant="primary" size="lg" onClick={onFinish} loading={saving}>
            Start playing
          </Button>
        }
      />
    </>
  );
}

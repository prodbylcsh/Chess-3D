import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Link2, MonitorSmartphone, Send, UserPlus } from 'lucide-react';
import { api, type FriendEntry } from '../../api';
import { useProfile } from '../../app/session';
import { online } from '../../net/client';
import { ProfileIcon, RankEmblem } from '../../ui/art/art';
import { Button, EmptyState, Modal, Segmented, Spinner, cx, useToast } from '../../ui/kit';

type Step = 'menu' | 'friends' | 'link';

export function PlayFriend({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('menu');
  const close = () => {
    onClose();
    setTimeout(() => setStep('menu'), 250);
  };
  const titles: Record<Step, string> = { menu: 'Play a friend', friends: 'Invite a friend', link: 'Create an invite link' };
  return (
    <Modal open={open} onClose={close} title={titles[step]} width={480}>
      {step !== 'menu' && (
        <button type="button" className="link-btn sheet-back" onClick={() => setStep('menu')}>
          <ChevronLeft size={15} /> Back
        </button>
      )}
      {step === 'menu' && <Menu onPick={setStep} />}
      {step === 'friends' && <Friends />}
      {step === 'link' && <CreateLink />}
    </Modal>
  );
}

function Menu({ onPick }: { onPick: (s: Step) => void }) {
  const navigate = useNavigate();
  const rows = [
    { id: 'friends', icon: UserPlus, title: 'Invite a friend', text: 'Pick someone from your friends list.', run: () => onPick('friends') },
    { id: 'link', icon: Link2, title: 'Create an invite link', text: 'Anyone with the link can join, no account needed.', run: () => onPick('link'), disabled: !online },
    { id: 'local', icon: MonitorSmartphone, title: 'Play on this device', text: 'Two players, one screen. Take turns.', run: () => navigate('/game/local') },
  ];
  return (
    <div className="options">
      {rows.map((r) => (
        <button key={r.id} type="button" className="option" onClick={r.run} disabled={r.disabled}>
          <span className="option-icon">
            <r.icon size={22} />
          </span>
          <span className="option-text">
            <strong>{r.title}</strong>
            <span className="faint">{r.disabled ? 'Online play is not configured in this build.' : r.text}</span>
          </span>
          <ChevronRight size={18} className="option-arrow" />
        </button>
      ))}
    </div>
  );
}

/** Create a real online game (Supabase) and go to its waiting room. */
async function createOnlineGame(name: string, color: 'w' | 'b' | 'random'): Promise<string> {
  if (!online) throw new Error('Online play is not configured.');
  await online.signIn();
  const row = await online.create(name, color);
  return row.id;
}

function Friends() {
  const profile = useProfile();
  const navigate = useNavigate();
  const toast = useToast();
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void api.friends.list().then(setFriends);
  }, []);

  async function invite(f: FriendEntry) {
    setBusy(f.profile.id);
    try {
      const id = await createOnlineGame(profile.username ?? 'Player', 'random');
      toast(
        <>
          Invite sent to <strong>{f.profile.username}</strong>.{api.mock && ' (Demo: share the link from the next screen to play for real.)'}
        </>,
        { tone: 'success', duration: 6 },
      );
      navigate(`/game/online/${id}`);
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' });
      setBusy(null);
    }
  }

  if (!friends) {
    return (
      <div className="sheet-loading">
        <Spinner />
      </div>
    );
  }
  if (!friends.length) {
    return (
      <EmptyState icon={<UserPlus size={28} />} title="No friends yet">
        Find players in Community and send them a friend request.
      </EmptyState>
    );
  }
  const sorted = [...friends].sort((a, b) => Number(b.profile.online) - Number(a.profile.online));
  return (
    <ul className="friends">
      {sorted.map((f) => (
        <li key={f.profile.id} className={cx('friend', !f.profile.online && 'is-offline')}>
          <div className="friend-avatar">
            <ProfileIcon icon={f.profile.iconId} size={42} />
            <span className={cx('presence', f.profile.online && 'is-on')} />
          </div>
          <div className="friend-text">
            <strong>{f.profile.username}</strong>
            <span className="friend-rank">
              <RankEmblem tier={f.profile.rank.tier} division={f.profile.rank.division} size={16} />
              {f.profile.rank.label} · {f.profile.online ? 'Online' : 'Offline'}
            </span>
          </div>
          <Button size="sm" variant={f.profile.online ? 'primary' : 'secondary'} icon={<Send size={14} />} disabled={!f.profile.online || !!busy || !online} loading={busy === f.profile.id} onClick={() => void invite(f)}>
            Invite
          </Button>
        </li>
      ))}
    </ul>
  );
}

function CreateLink() {
  const profile = useProfile();
  const navigate = useNavigate();
  const toast = useToast();
  const [color, setColor] = useState<'w' | 'random' | 'b'>('random');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      navigate(`/game/online/${await createOnlineGame(profile.username ?? 'Player', color)}`);
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' });
      setBusy(false);
    }
  }

  return (
    <>
      <p className="muted sheet-intro">We'll create a game and give you a link to send. It starts as soon as your friend opens it.</p>
      <div className="sheet-row">
        <span className="sheet-label">Play as</span>
        <Segmented
          label="Your colour"
          value={color}
          onChange={setColor}
          options={[
            { value: 'w', label: 'White' },
            { value: 'random', label: 'Random' },
            { value: 'b', label: 'Black' },
          ]}
        />
      </div>
      <Button variant="primary" size="lg" block icon={<Link2 size={18} />} loading={busy} onClick={() => void create()}>
        Create game
      </Button>
    </>
  );
}

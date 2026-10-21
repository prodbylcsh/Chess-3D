// Blocking and reporting (docs/PLATFORM.md §4.4): the report dialog, the block button and
// whether a player is blocked.
import { useEffect, useState } from 'react';
import { Ban, Flag } from 'lucide-react';
import { api, ApiError, type PublicProfile, type ReportReason } from '../../api';
import { useBadges } from '../../app/notifications';
import { t, tk } from '../../i18n';
import { Button, Modal, Switch, confirmDialog, cx, toast } from '../../ui/kit';

const REASONS: { id: ReportReason; label: string; hint: string }[] = [
  { id: 'abuse', label: tk('Abusive or hateful'), hint: tk('Insults, threats, harassment') },
  { id: 'cheating', label: tk('Cheating'), hint: tk('Using an engine or help during games') },
  { id: 'username', label: tk('Offensive username'), hint: tk('A name or icon that should not be here') },
  { id: 'spam', label: tk('Spam'), hint: tk('Advertising, links, the same message again and again') },
  { id: 'other', label: tk('Something else'), hint: tk('Tell us below') },
];

/** Whether the signed-in player blocked `playerId` (null while loading). */
export function useBlocked(playerId: string): [boolean | null, (next: boolean) => void] {
  const { version } = useBadges();
  const [blocked, setBlocked] = useState<boolean | null>(null);
  useEffect(() => {
    void api.safety.isBlocked(playerId).then(setBlocked, () => setBlocked(false));
  }, [playerId, version]);
  return [blocked, setBlocked];
}

/** Block (after a confirmation) or unblock. */
export function BlockButton({ player, blocked, onChange, compact }: { player: PublicProfile; blocked: boolean; onChange: (next: boolean) => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    if (
      !blocked &&
      !(await confirmDialog({
        title: t('Block {name}?', { name: player.username }),
        text: t('You will no longer be friends, neither of you can send the other a friend request, and you will not be matched in games. {name} is not told.', { name: player.username }),
        confirmLabel: t('Block'),
        tone: 'danger',
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await (blocked ? api.safety.unblock(player.id) : api.safety.block(player.id));
      onChange(!blocked);
      toast(blocked ? t('{name} is unblocked.', { name: player.username }) : t('{name} is blocked.', { name: player.username }), { tone: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Something went wrong.'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size={compact ? 'sm' : 'md'} variant="ghost" icon={<Ban size={15} />} loading={busy} onClick={() => void run()}>
      {blocked ? t('Unblock') : t('Block')}
    </Button>
  );
}

/** Report a player, or one of their messages. */
export function ReportDialog({
  player,
  messageId,
  open,
  onClose,
  onBlocked,
}: {
  player: PublicProfile;
  messageId?: string;
  open: boolean;
  onClose: () => void;
  onBlocked?: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(messageId ? 'abuse' : null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!reason) return;
    setBusy(true);
    try {
      await api.safety.report(player.id, reason, { messageId, note: note.trim() || undefined });
      if (alsoBlock && !(await api.safety.isBlocked(player.id))) {
        await api.safety.block(player.id);
        onBlocked?.();
      }
      toast(t('Thank you. We will look into it.'), { tone: 'success' });
      onClose();
      setNote('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Something went wrong.'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={messageId ? t('Report this message') : t('Report {name}', { name: player.username })}
      subtitle={t('Reports are private: {name} does not see who sent them.', { name: player.username })}
    >
      <div className="report-form">
        <div className="report-reasons" role="radiogroup" aria-label={t('Reason')}>
          {REASONS.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} className={cx('report-reason', reason === r.id && 'is-on')} onClick={() => setReason(r.id)}>
              <strong>{t(r.label)}</strong>
              <span className="faint">{t(r.hint)}</span>
            </button>
          ))}
        </div>
        <textarea
          className="report-note"
          rows={3}
          maxLength={500}
          placeholder={t('What happened? (optional)')}
          aria-label={t('What happened? (optional)')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <label className="report-block">
          <Switch checked={alsoBlock} onChange={setAlsoBlock} label={t('Also block {name}', { name: player.username })} />
          <span>{t('Also block {name}', { name: player.username })}</span>
        </label>
        <Button variant="primary" block icon={<Flag size={16} />} loading={busy} disabled={!reason} onClick={() => void send()}>
          {t('Send report')}
        </Button>
      </div>
    </Modal>
  );
}

import { t } from '../../i18n';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, MessageCirclePlus, MessagesSquare, Search, SendHorizontal, Swords } from 'lucide-react';
import { api, type Conversation, type FriendEntry, type Message } from '../../api';
import { useBadges } from '../../app/notifications';
import { useProfile } from '../../app/session';
import { ProfileIcon } from '../../ui/art/art';
import { Badge, Button, EmptyState, Field, IconButton, Modal, Spinner, cx } from '../../ui/kit';
import { clockTime, timeAgo } from '../../ui/format';
import { ChallengeButton, PlayerLine } from '../social/social';
import './messages.css';

export function MessagesPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { version } = useBadges();
  const [list, setList] = useState<Conversation[] | null>(null);
  const [filter, setFilter] = useState('');
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    void api.messages.conversations().then(setList);
  }, [version, conversationId]);

  const current = list?.find((c) => c.id === conversationId) ?? null;
  const shown = (list ?? []).filter((c) => c.with.username.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className={cx('chat', conversationId && 'has-thread')}>
      <aside className="chat-list">
        <header className="chat-list-head">
          <h1 className="page-title">{t('Messages')}</h1>
          <IconButton label={t('New message')} onClick={() => setPicking(true)}>
            <MessageCirclePlus size={19} />
          </IconButton>
        </header>
        <div className="chat-search">
          <Field placeholder={t('Search conversations')} leading={<Search size={17} />} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('Search conversations')} />
        </div>
        {!list ? (
          <div className="chat-loading">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <p className="faint chat-none">{list.length ? t('No conversations match.') : t('No conversations yet.')}</p>
        ) : (
          <ul>
            {shown.map((c) => (
              <li key={c.id}>
                <button type="button" className={cx('chat-item', c.id === conversationId && 'is-active', c.unread > 0 && 'is-unread')} onClick={() => navigate(`/messages/${c.id}`)}>
                  <span className="chat-item-avatar">
                    <ProfileIcon icon={c.with.iconId} size={44} />
                    <span className={cx('presence-dot', c.with.online && 'is-on')} />
                  </span>
                  <span className="chat-item-text">
                    <span className="chat-item-top">
                      <strong>{c.with.username}</strong>
                      {c.last && <span className="faint">{timeAgo(c.last.at)}</span>}
                    </span>
                    <span className="chat-item-last">
                      {c.last ? (c.last.kind === 'invite' ? t('♟ Game invite') : c.last.body) : t('Say hello 👋')}
                      {c.unread > 0 && <Badge tone="gold">{c.unread}</Badge>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="chat-thread">
        {current ? (
          <Thread key={current.id} conversation={current} onBack={() => navigate('/messages')} />
        ) : conversationId && list ? (
          <EmptyState title={t('Conversation not found')} />
        ) : (
          <EmptyState icon={<MessagesSquare size={28} />} title={t('Your messages')}>
            {t('Pick a conversation, or start a new one with a friend.')}
            <div style={{ marginTop: 16 }}>
              <Button variant="primary" icon={<MessageCirclePlus size={17} />} onClick={() => setPicking(true)}>
                {t('New message')}
              </Button>
            </div>
          </EmptyState>
        )}
      </section>

      <FriendPicker open={picking} onClose={() => setPicking(false)} onPick={async (id) => {
        setPicking(false);
        navigate(`/messages/${(await api.messages.open(id)).id}`);
      }} />
    </div>
  );
}

function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const me = useProfile();
  const navigate = useNavigate();
  const { version } = useBadges();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void api.messages.messages(conversation.id).then((m) => {
      if (!live) return;
      setMessages(m);
      if (conversation.unread > 0) void api.messages.markRead(conversation.id);
    });
    return () => {
      live = false;
    };
  }, [conversation.id, conversation.unread, version]);

  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages?.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    try {
      const msg = await api.messages.send(conversation.id, body);
      setMessages((m) => [...(m ?? []), msg]);
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  // group consecutive messages from the same sender
  const rows = (messages ?? []).map((m, i, all) => ({ m, first: i === 0 || all[i - 1].from !== m.from }));

  return (
    <>
      <header className="thread-head">
        <IconButton label={t('Back to conversations')} className="thread-back" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        <PlayerLine player={conversation.with} sub={<> · {conversation.with.online ? t('Online') : t('Offline')}</>} />
        <ChallengeButton player={conversation.with} />
      </header>

      <div className="thread-body" ref={scroller}>
        {!messages ? (
          <div className="chat-loading">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <p className="thread-empty faint">{t('This is the start of your conversation with {name}.', { name: conversation.with.username })}</p>
        ) : (
          rows.map(({ m, first }) => {
            const mine = m.from === me.id;
            return (
              <div key={m.id} className={cx('bubble-row', mine && 'is-mine', first && 'is-first')}>
                {!mine && (first ? <ProfileIcon icon={conversation.with.iconId} size={30} /> : <span className="bubble-spacer" />)}
                {m.kind === 'invite' ? (
                  <div className="invite-bubble">
                    <span className="invite-bubble-icon">
                      <Swords size={18} />
                    </span>
                    <div>
                      <strong>{mine ? t('You sent a challenge') : t('{name} challenges you', { name: conversation.with.username })}</strong>
                      <span className="faint">{m.body}</span>
                    </div>
                    <Button size="sm" variant="primary" onClick={() => navigate(mine ? `/game/online/${m.gameId}` : `/join/${m.gameId}`)}>
                      {mine ? t('Open') : t('Join')}
                    </Button>
                  </div>
                ) : (
                  <div className="bubble">
                    <span>{m.body}</span>
                    <time>{clockTime(m.at)}</time>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <form className="composer" onSubmit={send}>
        <textarea rows={1} placeholder={t('Message {name}', { name: conversation.with.username })} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} maxLength={1000} aria-label={t('Message')} />
        <IconButton label={t('Send')} type="submit" className="composer-send" disabled={!draft.trim() || sending}>
          <SendHorizontal size={18} />
        </IconButton>
      </form>
    </>
  );
}

function FriendPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  useEffect(() => {
    if (open) void api.friends.list().then(setFriends);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={t('New message')} subtitle={t('Choose a friend to write to.')} width={440}>
      {!friends ? (
        <div className="chat-loading">
          <Spinner />
        </div>
      ) : friends.length === 0 ? (
        <p className="faint">{t('Add friends in Community to message them.')}</p>
      ) : (
        <ul className="picker">
          {friends.map((f) => (
            <li key={f.profile.id}>
              <button type="button" onClick={() => onPick(f.profile.id)}>
                <ProfileIcon icon={f.profile.iconId} size={38} />
                <span>{f.profile.username}</span>
                <span className={cx('presence-dot static', f.profile.online && 'is-on')} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

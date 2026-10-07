import { t, tk } from '../../i18n';
// Mock friends, messages, player lookups and account changes. Demo players react
// on their own (accept friend requests, reply to chats) so the screens can be tried.
import { rankOf } from '#shared/rating.ts';
import {
  ApiError,
  type AccountService,
  type Conversation,
  type FriendsService,
  type GameRecord,
  type Message,
  type MessagesService,
  type ProfileService,
  type PublicProfile,
  type Relation,
} from '../types';
import { emailProblem, passwordProblem } from '../validation';
import { allPlayers, db, emit, findPlayer, newId, now, publicProfile, save, seedById, session, socialOf, strip, wait, type StoredConversation } from './db';
import { SEED_PLAYERS } from './seed';

const isSeed = (id: string) => id.startsWith('seed-');

function player(id: string): PublicProfile {
  const p = findPlayer(id);
  if (!p) throw new ApiError('not_found', t('Player not found.'));
  return p;
}

/** demo players respond after a short, human-looking pause */
function later(fn: () => void, min = 1800, max = 4200): void {
  setTimeout(() => {
    if (db.sessionId) fn();
  }, min + Math.random() * (max - min));
}

// ------------------------------------------------------------------ public history of demo players

function seeded(n: number): number {
  const x = Math.sin(n * 7919 + 104729) * 233280;
  return x - Math.floor(x);
}

const REASONS = ['checkmate', 'resignation', 'checkmate', 'resignation', 'agreement', 'stalemate'];

function seedHistory(seedIndex: number): GameRecord[] {
  const p = SEED_PLAYERS[seedIndex];
  return Array.from({ length: 12 }, (_, i) => {
    const r = (k: number) => seeded(seedIndex * 100 + i * 7 + k);
    const opp = SEED_PLAYERS[(seedIndex + 1 + Math.floor(r(1) * (SEED_PLAYERS.length - 1))) % SEED_PLAYERS.length];
    const roll = r(2);
    const outcome = roll < 0.5 ? 'win' : roll < 0.9 ? 'loss' : 'draw';
    const reason = outcome === 'draw' ? 'agreement' : REASONS[Math.floor(r(3) * 4)];
    return {
      id: `${p.id}-g${i}`,
      kind: r(4) < 0.6 ? 'ranked' : 'casual',
      playedAt: new Date(Date.now() - (i + 1) * (3 + r(5) * 20) * 3_600_000).toISOString(),
      color: r(6) < 0.5 ? 'w' : 'b',
      opponent: { username: opp.username, iconId: opp.iconId, rankLabel: rankOf(opp.mmr).label },
      outcome,
      reason,
      moves: 30 + Math.floor(r(7) * 70),
      accuracy: Math.round(55 + r(8) * 40),
      mmrDelta: null,
      coinsDelta: 0,
    };
  });
}

// ------------------------------------------------------------------ profiles (lookup part)

export const profileLookups: Pick<ProfileService, 'get' | 'publicHistory' | 'search' | 'suggestions'> = {
  async get(usernameOrId) {
    await wait(150, 400);
    return findPlayer(usernameOrId);
  },

  async publicHistory(userId) {
    await wait();
    const seedIndex = SEED_PLAYERS.findIndex((p) => p.id === userId);
    if (seedIndex >= 0) return seedHistory(seedIndex);
    return (db.history[userId] ?? []).map((g) => ({ ...g, mmrDelta: null }));
  },

  async search(query) {
    await wait(150, 350);
    const me = session().profile.id;
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allPlayers()
      .filter((p) => p.id !== me && p.username.toLowerCase().includes(q))
      .sort((a, b) => Number(b.username.toLowerCase().startsWith(q)) - Number(a.username.toLowerCase().startsWith(q)) || a.username.localeCompare(b.username))
      .slice(0, 20);
  },

  async suggestions() {
    await wait();
    const { profile } = session();
    const s = socialOf(profile.id);
    const known = new Set([profile.id, ...Object.keys(s.friends), ...Object.keys(s.incoming), ...Object.keys(s.outgoing)]);
    return SEED_PLAYERS.filter((p) => !known.has(p.id))
      .sort((a, b) => Math.abs(a.mmr - profile.mmr) - Math.abs(b.mmr - profile.mmr))
      .slice(0, 6)
      .map((p) => findPlayer(p.id)!);
  },
};

// ------------------------------------------------------------------ friends

function relationTo(me: string, other: string): Relation {
  if (me === other) return 'self';
  const s = socialOf(me);
  if (s.friends[other]) return 'friend';
  if (s.incoming[other]) return 'incoming';
  if (s.outgoing[other]) return 'outgoing';
  return 'none';
}

function befriend(a: string, b: string): void {
  const at = now();
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    const s = socialOf(x);
    delete s.incoming[y];
    delete s.outgoing[y];
    s.friends[y] = at;
  }
}

export const friends: FriendsService = {
  async list() {
    await wait();
    const me = session().profile.id;
    return Object.entries(socialOf(me).friends)
      .map(([id, since]) => ({ profile: findPlayer(id), since }))
      .filter((f): f is { profile: PublicProfile; since: string } => !!f.profile)
      .sort((a, b) => Number(b.profile.online) - Number(a.profile.online) || a.profile.username.localeCompare(b.profile.username));
  },

  async requests() {
    await wait(150, 400);
    const s = socialOf(session().profile.id);
    const list = (m: Record<string, string>) =>
      Object.entries(m)
        .map(([id, at]) => ({ profile: findPlayer(id)!, at }))
        .filter((r) => r.profile)
        .sort((a, b) => b.at.localeCompare(a.at));
    return { incoming: list(s.incoming), outgoing: list(s.outgoing) };
  },

  async relation(userId) {
    return relationTo(session().profile.id, userId);
  },

  async request(userId) {
    await wait();
    const me = session().profile.id;
    const rel = relationTo(me, userId);
    if (rel === 'friend' || rel === 'outgoing' || rel === 'self') return;
    if (rel === 'incoming') return this.accept(userId);
    const at = now();
    socialOf(me).outgoing[userId] = at;
    socialOf(userId).incoming[me] = at;
    save();
    // demo: online demo players accept after a moment
    const target = player(userId);
    if (isSeed(userId) && target.online) {
      later(() => {
        if (relationTo(me, userId) !== 'outgoing') return;
        befriend(me, userId);
        save();
        emit({ type: 'friends', text: t('{name} accepted your friend request.', { name: target.username }) });
      }, 3000, 6000);
    }
  },

  async accept(userId) {
    await wait();
    const me = session().profile.id;
    if (relationTo(me, userId) !== 'incoming') throw new ApiError('no_request', t('That request is no longer there.'));
    befriend(me, userId);
    save();
    emit({ type: 'friends' });
  },

  async decline(userId) {
    await wait();
    const me = session().profile.id;
    delete socialOf(me).incoming[userId];
    delete socialOf(userId).outgoing[me];
    save();
    emit({ type: 'friends' });
  },

  async cancel(userId) {
    await wait();
    const me = session().profile.id;
    delete socialOf(me).outgoing[userId];
    delete socialOf(userId).incoming[me];
    save();
    emit({ type: 'friends' });
  },

  async remove(userId) {
    await wait();
    const me = session().profile.id;
    delete socialOf(me).friends[userId];
    delete socialOf(userId).friends[me];
    save();
    emit({ type: 'friends' });
  },
};

// ------------------------------------------------------------------ messages

const REPLIES = [
  tk('Haha, nice one!'),
  tk('Sure, give me five minutes ♟️'),
  tk('That last game was wild. The queen sacrifice!'),
  tk("I'm practising the Sicilian, watch out."),
  tk('gg! Rematch tomorrow?'),
  tk("Can't right now, but later for sure."),
  tk('Did you see my new rank? 😄'),
];

function otherMember(c: StoredConversation, me: string): string {
  return c.members[0] === me ? c.members[1] : c.members[0];
}

function view(c: StoredConversation, me: string): Conversation {
  const read = c.readAt[me] ?? '';
  return {
    id: c.id,
    with: player(otherMember(c, me)),
    last: c.messages.at(-1) ?? null,
    unread: c.messages.filter((m) => m.from !== me && m.at > read).length,
  };
}

function mine(conversationId: string): StoredConversation {
  const me = session().profile.id;
  const c = db.conversations[conversationId];
  if (!c || !c.members.includes(me)) throw new ApiError('not_found', t('Conversation not found.'));
  return c;
}

export const messages: MessagesService = {
  async conversations() {
    await wait(150, 400);
    const me = session().profile.id;
    return Object.values(db.conversations)
      .filter((c) => c.members.includes(me))
      .map((c) => view(c, me))
      .sort((a, b) => (b.last?.at ?? '').localeCompare(a.last?.at ?? ''));
  },

  async open(userId) {
    await wait(100, 250);
    const me = session().profile.id;
    let c = Object.values(db.conversations).find((x) => x.members.includes(me) && x.members.includes(userId));
    if (!c) {
      player(userId);
      c = { id: newId('conv'), members: [me, userId], messages: [], readAt: {} };
      db.conversations[c.id] = c;
      save();
    }
    return view(c, me);
  },

  async messages(conversationId) {
    await wait(100, 300);
    return [...mine(conversationId).messages];
  },

  async send(conversationId, body, invite) {
    await wait(120, 300);
    const me = session().profile.id;
    const c = mine(conversationId);
    const text = body.trim().slice(0, 1000);
    if (!text && !invite) throw new ApiError('empty', t('Write a message first.'));
    const msg: Message = { id: newId('msg'), conversationId, from: me, body: text, at: now(), kind: invite ? 'invite' : 'text', gameId: invite?.gameId };
    c.messages.push(msg);
    c.readAt[me] = msg.at;
    save();
    emit({ type: 'messages', conversationId });

    // demo: online demo friends answer
    const other = otherMember(c, me);
    const p = findPlayer(other);
    if (isSeed(other) && p?.online && relationTo(me, other) === 'friend') {
      later(() => {
        const reply: Message = {
          id: newId('msg'),
          conversationId,
          from: other,
          body: invite ? t('Joining now! (demo: send them the link to really play)') : t(REPLIES[Math.floor(Math.random() * REPLIES.length)]),
          at: now(),
          kind: 'text',
        };
        c.messages.push(reply);
        save();
        emit({ type: 'messages', conversationId, text: `${p.username}: ${reply.body}` });
      });
    }
    return msg;
  },

  async markRead(conversationId) {
    const me = session().profile.id;
    const c = mine(conversationId);
    c.readAt[me] = now();
    save();
    emit({ type: 'messages', conversationId });
  },
};

// ------------------------------------------------------------------ account

export const account: AccountService = {
  async changeEmail(newEmail, password) {
    await wait();
    const { account: acc } = session();
    if (acc.provider !== 'email') throw new ApiError('provider', t('Your email is managed by {provider}.', { provider: acc.provider === 'apple' ? 'Apple' : 'Google' }));
    const problem = emailProblem(newEmail);
    if (problem) throw new ApiError('invalid', problem);
    if (acc.password !== password) throw new ApiError('bad_password', t('Your password is not correct.'));
    const email = newEmail.trim().toLowerCase();
    if (db.accounts.some((a) => a.email === email && a.id !== acc.id)) throw new ApiError('email_taken', t('That email is already used by another account.'));
    acc.email = email;
    save();
    return strip(acc);
  },

  async changePassword(current, next) {
    await wait();
    const { account: acc } = session();
    if (acc.provider !== 'email') throw new ApiError('provider', t('You sign in with Apple or Google, so there is no password to change.'));
    if (acc.password !== current) throw new ApiError('bad_password', t('Your current password is not correct.'));
    const problem = passwordProblem(next);
    if (problem) throw new ApiError('invalid', problem);
    acc.password = next;
    save();
  },

  async deleteAccount(username) {
    await wait(400, 800);
    const { account: acc, profile } = session();
    if (username !== profile.username) throw new ApiError('confirm', t('Type your username exactly to confirm.'));
    db.accounts = db.accounts.filter((a) => a.id !== acc.id);
    delete db.profiles[acc.id];
    delete db.history[acc.id];
    delete db.social[acc.id];
    for (const s of Object.values(db.social)) {
      delete s.friends[acc.id];
      delete s.incoming[acc.id];
      delete s.outgoing[acc.id];
    }
    for (const [id, c] of Object.entries(db.conversations)) if (c.members.includes(acc.id)) delete db.conversations[id];
    db.sessionId = null;
    save();
  },
};

export { publicProfile, seedById };

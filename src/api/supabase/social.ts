// Friends, chat, player lookups and "who is online" on Supabase. Players read their own
// rows directly (row-level security); every change goes through the `social` Edge
// Function. Realtime brings new messages and friend requests; presence tells who is
// online. Rank, stats and look of other players come from their showcase, which each
// player's app keeps up to date (see syncShowcase) until the competitive back-end.
import { FunctionsHttpError, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_LOADOUT } from '#shared/shop.ts';
import { parseShowcase, type Showcase } from '#shared/social.ts';
import { TIERS } from '#shared/rating.ts';
import { t } from '../../i18n';
import { rankInfo } from '../mock/db';
import {
  ApiError,
  type ApiEvent,
  type Conversation,
  type FriendsService,
  type Message,
  type MessagesService,
  type Profile,
  type ProfileService,
  type PublicProfile,
  type RankInfo,
  type Relation,
} from '../types';

interface ProfileRecord {
  id: string;
  username: string | null;
  icon_id: string | null;
  created_at: string;
  showcase: unknown;
}

interface MessageRecord {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  kind: 'text' | 'invite';
  game_id: string | null;
  created_at: string;
}

interface FriendshipRecord {
  user_a: string;
  user_b: string;
  status: 'pending' | 'accepted';
  requested_by: string;
  created_at: string;
  accepted_at: string | null;
}

const PROFILE_COLUMNS = 'id, username, icon_id, created_at, showcase';
const NO_STATS = { wins: 0, losses: 0, draws: 0, winStreak: 0, rankedStreak: 0, bestStreak: 0 };
const ROMAN = ['I', 'II', 'III', 'IV'];

/** The `social` function's errors → translated ApiErrors. */
function socialError(code: string): ApiError {
  switch (code) {
    case 'not_friends':
      return new ApiError(code, t('You can only message your friends.'));
    case 'no_request':
      return new ApiError(code, t('That request is no longer there.'));
    case 'too_many_requests':
      return new ApiError(code, t('You have too many friend requests waiting for an answer.'));
    case 'too_many_friends':
      return new ApiError(code, t('You have reached the friend limit.'));
    case 'rate_limited':
      return new ApiError(code, t('You are sending messages too fast. Wait a moment.'));
    case 'empty':
      return new ApiError(code, t('Write a message first.'));
    case 'too_long':
      return new ApiError(code, t('That message is too long.'));
    case 'not_found':
      return new ApiError(code, t('Player not found.'));
    case 'not_ready':
      return new ApiError(code, t('Choose a username and an icon first.'));
    case 'unauthorized':
    case 'guest':
      return new ApiError('unauthorized', t('Please sign in again.'));
    case 'network':
      return new ApiError(code, t('Could not reach the server. Check your connection.'));
    default:
      return new ApiError('server_error', t('Something went wrong. Please try again.'));
  }
}

function rankFromShowcase(rank: Showcase['rank']): RankInfo {
  const tier = TIERS.find((x) => x.id === rank.tier)!;
  return {
    tier: tier.id,
    division: rank.division,
    label: rank.division ? `${tier.name} ${ROMAN[rank.division - 1]}` : tier.name,
    progress: rank.progress,
  };
}

/** The snapshot of the signed-in player that other players see. */
export function showcaseOf(p: Profile): Showcase {
  const r = rankInfo(p.mmr);
  return {
    rank: { tier: r.tier, division: r.division as Showcase['rank']['division'], progress: r.progress },
    stats: { ...NO_STATS, ...p.stats },
    loadout: { ...DEFAULT_LOADOUT, ...p.loadout },
  };
}

export function createSocial(
  client: SupabaseClient,
  local: { profiles: ProfileService; me: () => string | null },
  emit: (event: ApiEvent) => void,
) {
  let online = new Set<string>();
  let presence: RealtimeChannel | null = null;
  let changes: RealtimeChannel | null = null;
  let watching: string | null = null;
  const names = new Map<string, string>();

  function me(): string {
    const id = local.me();
    if (!id) throw socialError('unauthorized');
    return id;
  }

  async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.functions.invoke<T>('social', { body: { action, ...body } });
    if (!error) return data!;
    if (error instanceof FunctionsHttpError) {
      const payload = await (error.context as Response).json().catch(() => null);
      throw socialError(payload?.code ?? 'server_error');
    }
    throw socialError('network');
  }

  function toPublic(row: ProfileRecord): PublicProfile {
    names.set(row.id, row.username ?? 'Player');
    const showcase = parseShowcase(row.showcase);
    return {
      id: row.id,
      username: row.username ?? 'Player',
      iconId: row.icon_id ?? 'guest',
      rank: showcase ? rankFromShowcase(showcase.rank) : rankInfo(1000),
      stats: showcase?.stats ?? { ...NO_STATS },
      loadout: showcase?.loadout ?? { ...DEFAULT_LOADOUT },
      createdAt: row.created_at,
      online: online.has(row.id),
    };
  }

  async function profilesById(ids: string[]): Promise<Map<string, PublicProfile>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const { data, error } = await client.from('profiles').select(PROFILE_COLUMNS).in('id', unique);
    if (error) throw socialError('network');
    return new Map((data as ProfileRecord[]).map((r) => [r.id, toPublic(r)]));
  }

  async function friendships(): Promise<FriendshipRecord[]> {
    const { data, error } = await client.from('friendships').select('user_a, user_b, status, requested_by, created_at, accepted_at');
    if (error) throw socialError('network');
    return data as FriendshipRecord[];
  }

  const other = (f: { user_a: string; user_b: string }, self: string) => (f.user_a === self ? f.user_b : f.user_a);

  function toMessage(m: MessageRecord): Message {
    return {
      id: m.id,
      conversationId: m.conversation_id,
      from: m.sender_id,
      body: m.body,
      at: m.created_at,
      kind: m.kind,
      gameId: m.game_id ?? undefined,
    };
  }

  async function nameOf(id: string): Promise<string> {
    if (!names.has(id)) await profilesById([id]).catch(() => null);
    return names.get(id) ?? t('A player');
  }

  // ---------------------------------------------------------------- profiles (lookups)

  const lookups: Pick<ProfileService, 'get' | 'publicHistory' | 'search' | 'suggestions'> = {
    async get(usernameOrId) {
      const self = local.me();
      if (self && usernameOrId === self) return local.profiles.get(self);
      const isId = /^[0-9a-f-]{36}$/.test(usernameOrId);
      const query = client.from('profiles').select(PROFILE_COLUMNS).not('onboarded_at', 'is', null);
      const { data, error } = await (isId
        ? query.eq('id', usernameOrId)
        : query.ilike('username', usernameOrId.replace(/[\\%_]/g, (c) => `\\${c}`))
      ).maybeSingle();
      if (error) throw socialError('network');
      if (!data) return null;
      if (self && data.id === self) return local.profiles.get(self);
      return toPublic(data as ProfileRecord);
    },

    async publicHistory(userId) {
      // other players' games move to the server with the competitive back-end
      return userId === local.me() ? local.profiles.publicHistory(userId) : [];
    },

    async search(query) {
      const q = query.trim();
      if (!q) return [];
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const { data, error } = await client
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .not('onboarded_at', 'is', null)
        .neq('id', me())
        .ilike('username', pattern)
        .order('username')
        .limit(20);
      if (error) throw socialError('network');
      const lower = q.toLowerCase();
      return (data as ProfileRecord[])
        .map(toPublic)
        .sort((a, b) => Number(b.username.toLowerCase().startsWith(lower)) - Number(a.username.toLowerCase().startsWith(lower)));
    },

    async suggestions() {
      const self = me();
      const known = new Set([self, ...(await friendships()).map((f) => other(f, self))]);
      const { data, error } = await client
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .not('onboarded_at', 'is', null)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw socialError('network');
      return (data as ProfileRecord[])
        .filter((r) => !known.has(r.id))
        .map(toPublic)
        .sort((a, b) => Number(b.online) - Number(a.online))
        .slice(0, 6);
    },
  };

  // ---------------------------------------------------------------- friends

  const friends: FriendsService = {
    async list() {
      const self = me();
      const rows = (await friendships()).filter((f) => f.status === 'accepted');
      const people = await profilesById(rows.map((f) => other(f, self)));
      return rows
        .map((f) => ({ profile: people.get(other(f, self))!, since: f.accepted_at ?? f.created_at }))
        .filter((f) => f.profile)
        .sort((a, b) => Number(b.profile.online) - Number(a.profile.online) || a.profile.username.localeCompare(b.profile.username));
    },

    async requests() {
      const self = me();
      const rows = (await friendships()).filter((f) => f.status === 'pending');
      const people = await profilesById(rows.map((f) => other(f, self)));
      const list = (incoming: boolean) =>
        rows
          .filter((f) => (f.requested_by !== self) === incoming)
          .map((f) => ({ profile: people.get(other(f, self))!, at: f.created_at }))
          .filter((r) => r.profile)
          .sort((a, b) => b.at.localeCompare(a.at));
      return { incoming: list(true), outgoing: list(false) };
    },

    async relation(userId): Promise<Relation> {
      const self = me();
      if (userId === self) return 'self';
      const row = (await friendships()).find((f) => other(f, self) === userId);
      if (!row) return 'none';
      if (row.status === 'accepted') return 'friend';
      return row.requested_by === self ? 'outgoing' : 'incoming';
    },

    async request(userId) {
      await call('request', { userId });
      emit({ type: 'friends' });
    },
    async accept(userId) {
      await call('accept', { userId });
      emit({ type: 'friends' });
    },
    async decline(userId) {
      await call('decline', { userId });
      emit({ type: 'friends' });
    },
    async cancel(userId) {
      await call('cancel', { userId });
      emit({ type: 'friends' });
    },
    async remove(userId) {
      await call('remove', { userId });
      emit({ type: 'friends' });
    },
  };

  // ---------------------------------------------------------------- messages

  interface ListRow {
    id: string;
    other_id: string;
    last_id: string | null;
    last_sender_id: string | null;
    last_body: string | null;
    last_kind: 'text' | 'invite' | null;
    last_game_id: string | null;
    last_at: string | null;
    unread: number;
  }

  async function listRows(id?: string): Promise<Conversation[]> {
    let query = client.from('conversation_list').select('*').order('last_message_at', { ascending: false, nullsFirst: false });
    if (id) query = query.eq('id', id);
    const { data, error } = await query;
    if (error) throw socialError('network');
    const rows = data as ListRow[];
    const people = await profilesById(rows.map((r) => r.other_id));
    return rows
      .filter((r) => people.has(r.other_id))
      .map((r) => ({
        id: r.id,
        with: people.get(r.other_id)!,
        last: r.last_id
          ? toMessage({
              id: r.last_id,
              conversation_id: r.id,
              sender_id: r.last_sender_id!,
              body: r.last_body ?? '',
              kind: r.last_kind ?? 'text',
              game_id: r.last_game_id,
              created_at: r.last_at!,
            })
          : null,
        unread: r.unread,
      }));
  }

  const messages: MessagesService = {
    conversations: () => listRows(),

    async open(userId) {
      const { conversationId } = await call<{ conversationId: string }>('open', { userId });
      const [conversation] = await listRows(conversationId);
      if (!conversation) throw socialError('server_error');
      return conversation;
    },

    async messages(conversationId) {
      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw socialError('network');
      return (data as MessageRecord[]).reverse().map(toMessage);
    },

    async send(conversationId, body, invite) {
      const { message } = await call<{ message: MessageRecord }>('send', { conversationId, body, gameId: invite?.gameId });
      emit({ type: 'messages', conversationId });
      return toMessage(message);
    },

    async markRead(conversationId) {
      await call('read', { conversationId });
      emit({ type: 'messages', conversationId });
    },
  };

  // ---------------------------------------------------------------- live updates

  /** Listen for messages and friend requests, and show this player as online. */
  function start(userId: string): void {
    if (watching === userId) return;
    stop();
    watching = userId;

    changes = client
      .channel(`social:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const m = p.new as MessageRecord;
        if (m.sender_id === userId) return;
        void nameOf(m.sender_id).then((name) =>
          emit({ type: 'messages', conversationId: m.conversation_id, text: `${name}: ${m.kind === 'invite' ? t('invites you to a game') : m.body}` }),
        );
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friendships' }, (p) => {
        const f = p.new as FriendshipRecord;
        if (f.requested_by === userId) return;
        void nameOf(f.requested_by).then((name) => emit({ type: 'friends', text: t('{name} sent you a friend request.', { name }) }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friendships' }, (p) => {
        const f = p.new as FriendshipRecord;
        if (f.status !== 'accepted' || f.requested_by !== userId) return;
        void nameOf(other(f, userId)).then((name) => emit({ type: 'friends', text: t('{name} accepted your friend request.', { name }) }));
      })
      .subscribe();

    presence = client.channel('online', { config: { presence: { key: userId } } });
    presence
      .on('presence', { event: 'sync' }, () => {
        online = new Set(Object.keys(presence?.presenceState() ?? {}));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void presence?.track({ at: Date.now() });
      });
  }

  function stop(): void {
    watching = null;
    online = new Set();
    if (changes) void client.removeChannel(changes);
    if (presence) void client.removeChannel(presence);
    changes = presence = null;
  }

  return { lookups, friends, messages, start, stop };
}

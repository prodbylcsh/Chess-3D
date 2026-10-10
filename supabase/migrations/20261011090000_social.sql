-- Friends and chat (milestone "social"). Clients only READ their own rows; every write
-- goes through the `social` Edge Function, which applies functions/_shared/social.ts.
-- Deleting an account removes its friendships, conversations and messages (cascade).

-- What other players see of someone's rank, stats and look (see _shared/social.ts).
alter table public.profiles add column showcase jsonb;

-- A surrogate key: realtime sends deleted rows' keys to every subscriber, and a pair of
-- user ids would tell who unfriended whom.
create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  user_a       uuid not null references auth.users (id) on delete cascade,
  user_b       uuid not null references auth.users (id) on delete cascade,
  status       text not null check (status in ('pending', 'accepted')),
  requested_by uuid not null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  constraint friendships_pair unique (user_a, user_b),
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_requester check (requested_by in (user_a, user_b))
);
create index friendships_user_b_idx on public.friendships (user_b);

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references auth.users (id) on delete cascade,
  user_b          uuid not null references auth.users (id) on delete cascade,
  -- when each member last read the conversation (unread = newer messages from the other)
  a_read_at       timestamptz,
  b_read_at       timestamptz,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint conversations_pair unique (user_a, user_b),
  constraint conversations_ordered check (user_a < user_b)
);
create index conversations_user_b_idx on public.conversations (user_b);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references auth.users (id) on delete cascade,
  body            text not null check (char_length(body) <= 1000),
  kind            text not null default 'text' check (kind in ('text', 'invite')),
  game_id         text,
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_sender_idx on public.messages (sender_id, created_at);

alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "players see their own friendships"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy "players see their own conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy "players see messages of their conversations"
  on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (select auth.uid()) in (c.user_a, c.user_b)
  ));

-- Conversation list with the last message and the unread count, for the signed-in
-- player. security_invoker: row-level security of the caller applies.
create view public.conversation_list with (security_invoker = true) as
select
  c.id,
  case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end as other_id,
  c.last_message_at,
  last.id as last_id,
  last.sender_id as last_sender_id,
  last.body as last_body,
  last.kind as last_kind,
  last.game_id as last_game_id,
  last.created_at as last_at,
  (
    select count(*) from public.messages m
    where m.conversation_id = c.id
      and m.sender_id <> (select auth.uid())
      and m.created_at > coalesce(case when c.user_a = (select auth.uid()) then c.a_read_at else c.b_read_at end, '-infinity')
  )::int as unread
from public.conversations c
left join lateral (
  select * from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1
) last on true;

grant select, insert, update, delete on table public.friendships, public.conversations, public.messages to service_role;
grant select on table public.friendships, public.conversations, public.messages, public.conversation_list to authenticated;
revoke all on table public.friendships, public.conversations, public.messages, public.conversation_list from anon;
revoke insert, update, delete, truncate, references, trigger on table public.friendships, public.conversations, public.messages from authenticated;

-- New messages and friend requests reach the players right away. The app listens to
-- inserts and updates only: row-level security cannot be applied to deletes, whose
-- events carry nothing but the (random) primary key.
alter publication supabase_realtime add table public.friendships, public.messages;

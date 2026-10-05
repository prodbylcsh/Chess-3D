// Single entry point for every write to an online game.
//
// POST { action: 'create', name, color: 'w' | 'b' | 'random' }
// POST { action: 'join', id, name }
// POST { action: 'move', id, move: { from, to, promotion? } }
// POST { action: 'resign' | 'offer_draw' | 'accept_draw' | 'decline_draw' | 'rematch', id }
//
// Responds with { game } (the updated row; for 'rematch', the new game) or
// { error, code } with an HTTP error status. Every action is validated against
// the current stored row, and the write is conditional on the row's version so
// concurrent requests cannot both apply.
import { createClient } from '@supabase/supabase-js';
import * as rules from '../_shared/rules.ts';
import { RuleError, type GameRow, type Patch } from '../_shared/rules.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function newId(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

class Conflict extends Error {}

async function load(id: unknown): Promise<GameRow> {
  if (typeof id !== 'string') throw new RuleError('bad_request', 'Missing game id.');
  const { data, error } = await admin.from('games').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new RuleError('not_found', 'Game not found.', 404);
  return data as GameRow;
}

/** Write a patch only if nobody else changed the row since it was loaded. */
async function save(row: GameRow, patch: Patch): Promise<GameRow> {
  const { data, error } = await admin
    .from('games')
    .update({ ...patch, version: row.version + 1, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('version', row.version)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Conflict();
  return data as GameRow;
}

async function insert(patch: Patch): Promise<GameRow> {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await admin.from('games').insert({ id: newId(), ...patch }).select().single();
    if (!error) return data as GameRow;
    if (error.code !== '23505' || attempt >= 3) throw error; // retry only on an id collision
  }
}

type Update = (row: GameRow, userId: string, body: Record<string, unknown>) => Patch;

const UPDATES: Record<string, Update> = {
  move: (row, user, body) => rules.move(row, user, body.move as rules.MoveInput),
  resign: (row, user) => rules.resign(row, user),
  offer_draw: (row, user) => rules.offerDraw(row, user),
  accept_draw: (row, user) => rules.acceptDraw(row, user),
  decline_draw: (row, user) => rules.declineDraw(row, user),
};

async function handle(userId: string, body: Record<string, unknown>): Promise<GameRow> {
  if (body.action === 'create') return insert(rules.newGame(userId, body.name, body.color));

  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await load(body.id);
    try {
      if (body.action === 'join') {
        const patch = rules.join(row, userId, body.name);
        return patch ? await save(row, patch) : row;
      }
      if (body.action === 'rematch') {
        if (row.rematch_id) return await load(row.rematch_id);
        const next = await insert(rules.rematch(row, userId));
        try {
          await save(row, { rematch_id: next.id });
        } catch (err) {
          await admin.from('games').delete().eq('id', next.id);
          throw err;
        }
        return next;
      }
      const update = UPDATES[body.action as string];
      if (!update) throw new RuleError('bad_request', 'Unknown action.');
      return await save(row, update(row, userId, body));
    } catch (err) {
      if (!(err instanceof Conflict)) throw err;
      // someone else wrote first: re-validate against the fresh row
    }
  }
  throw new RuleError('busy', 'The game is busy, please try again.', 409);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed', code: 'bad_request' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return reply({ error: 'Please sign in again.', code: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid JSON.', code: 'bad_request' }, 400);
  }

  try {
    return reply({ game: await handle(auth.user.id, body) });
  } catch (err) {
    if (err instanceof RuleError) return reply({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return reply({ error: 'Server error.', code: 'server_error' }, 500);
  }
});

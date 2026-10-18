// Úložiště stavu: localStorage (vždy) + volitelně Supabase (sdílení v rodině).
import { CONFIG } from './config.js';

const KEY = 'cokveceri.state.v1';
const SB_CDN = 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const defaultState = () => ({
  settings: { adults: 3, kids: [{ age: 12, on: true }, { age: 17, on: false }], gap: 7 },
  pantry: [],
  blacklist: [],
  principles: [],
  recipes: [],
  meals: [],
  planRuns: [],
  sources: [
    { name: 'Vlastní sbírka (diktované recepty)', status: 'ok' },
    { name: 'Biokuchařka Hanky Zemanové', status: 'ok' },
    { name: 'Fitrecepty', status: 'ok' },
    { name: 'Zásadně zdravě (Jana Králíková)', status: 'ok' },
    { name: 'Děvče u plotny', status: 'ok' },
    { name: 'Vařím a peču s láskou', status: 'ok' },
    { name: 'Jíme zdravě (Rohlík Chef)', status: 'ok' },
    { name: 'Jiří Babica', status: 'banned' },
  ],
});

const merge = (s) => {
  const d = defaultState();
  return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
};

let sb = null, hid = null, saveTimer = null;
export const sync = { enabled: !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey), user: null, code: null, status: 'local', onRemote: null };

export function loadLocal() {
  try { return merge(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return defaultState(); }
}
function saveLocal(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* plné úložiště */ } }

export async function initSync() {
  if (!sync.enabled) return;
  const { createClient } = await import(SB_CDN);
  sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  const { data } = await sb.auth.getSession();
  sync.user = data.session?.user || null;
  sb.auth.onAuthStateChange((_e, sess) => { sync.user = sess?.user || null; });
  if (sync.user) await findHousehold();
}

async function findHousehold() {
  const { data, error } = await sb.rpc('cv_my_household');
  if (error) { sync.status = 'error: ' + error.message; return; }
  if (data && data.length) { hid = data[0].id; sync.code = data[0].join_code; sync.status = 'sync'; }
}

export const signIn = (email) => sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } });
export const signOut = async () => { await sb.auth.signOut(); sync.user = null; hid = null; sync.status = 'local'; };
export const hasHousehold = () => !!hid;

export async function createHousehold(name) {
  const { data, error } = await sb.rpc('cv_create_household', { p_name: name });
  if (error) throw error;
  hid = data[0].id; sync.code = data[0].join_code; sync.status = 'sync';
}
export async function joinHousehold(code) {
  const { error } = await sb.rpc('cv_join_household', { p_code: code });
  if (error) throw error;
  await findHousehold();
}

export async function pull() {
  if (!hid) return null;
  const { data, error } = await sb.from('cv_state').select('data,updated_at').eq('household_id', hid).single();
  if (error) { sync.status = 'error: ' + error.message; return null; }
  sync.status = 'sync';
  return data.data && Object.keys(data.data).length ? merge(data.data) : null;
}

async function push(s) {
  if (!hid) return;
  const { error } = await sb.from('cv_state').update({ data: s, updated_at: new Date().toISOString(), updated_by: sync.user.id }).eq('household_id', hid);
  sync.status = error ? 'error: ' + error.message : 'sync';
  sync.onRemote?.();
}

export function save(s) {
  saveLocal(s);
  if (!hid) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => push(s), 600);
}

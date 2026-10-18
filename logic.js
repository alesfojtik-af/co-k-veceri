// Čistá logika aplikace (bez DOM a bez sítě), aby šla testovat v Node.

export const MEALS = ['oběd', 'svačina', 'večeře', 'koláč'];
export const STAPLES = ['mouka', 'cukr', 'sůl', 'olej', 'rýže', 'těstoviny', 'cibule', 'česnek', 'vejce'];
export const BANNED_SOURCES = ['jiří babica', 'jiri babica', 'babica'];
const WD = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const REL = { '-2': 'Předevčírem', '-1': 'Včera', '0': 'Dnes', '1': 'Zítra', '2': 'Pozítří' };

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------- data ----------
export const isoDay = (d = new Date()) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return isoDay(dt);
};
export const diffDays = (a, b) => {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
};
export function dayLabel(iso, today) {
  const off = diffDays(iso, today);
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WD[new Date(y, m - 1, d).getDay()];
  const pre = REL[String(off)];
  return `${pre ? pre + ' · ' : ''}${wd} ${d}. ${m}.`;
}

// ---------- parsování diktátu ----------
const NUM = { jedna: 1, jednu: 1, jeden: 1, dva: 2, dvě: 2, dvou: 2, tři: 3, čtyři: 4, pět: 5, šest: 6, sedm: 7, osm: 8, devět: 9, deset: 10 };
const splitItems = (t) => t.split(/[,;\n]|\s+a\s+/).map((x) => x.trim()).filter(Boolean);

export function parsePantry(text) {
  return splitItems(String(text))
    .map((x) => x.toLowerCase().replace(/^(mám|máme|doma|v lednici|ještě|také|taky)\s+/g, '').replace(/^\d+[.,]?\d*\s*(ks|kg|g|dkg|l|ml)?\s*/, '').trim())
    .filter((x) => x && x.length < 40);
}

export function parseWishes(text) {
  const w = { meatGap: false, noSweet: false, unrec: [] };
  String(text).toLowerCase().split(/[,;.]|\s+a\s+/).map((f) => f.trim()).filter(Boolean).forEach((f) => {
    if (/maso/.test(f) && /(dva|dvou|2)/.test(f)) w.meatGap = true;
    else if (/(žádn|bez).{0,12}sladk/.test(f)) w.noSweet = true;
    else w.unrec.push(f);
  });
  return w;
}

export function ruleFromPrinciple(text) {
  if (/zelenin/i.test(text)) return { id: 'veg', text: 'preferovat jídla se zeleninou' };
  if (/smaž/i.test(text)) return { id: 'fried', text: 'nezahrnovat smažená jídla' };
  return { id: null, text: 'uloženo jen jako poznámka, návrhy neovlivní' };
}

export function parseRecipeDictation(raw) {
  const text = String(raw).trim();
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const name = (sentences[0] || 'Bez názvu').replace(/[.!?]+$/, '').slice(0, 80);
  const lower = text.toLowerCase();
  let kind = 'večeře';
  if (/koláč|dort|buchta|bábovk|štrúdl/.test(lower)) kind = 'koláč';
  else if (/svačin/.test(lower)) kind = 'svačina';
  else if (/oběd|polévk/.test(lower)) kind = 'oběd';
  let time = '';
  const mm = lower.match(/(\d+)\s*(minut|min)/), hh = lower.match(/(\d+)\s*hodin/);
  if (/půl hodiny/.test(lower)) time = '30 min';
  else if (mm) time = `${mm[1]} min`;
  else if (hh) time = `${Number(hh[1]) * 60} min`;
  else if (/hodinu/.test(lower)) time = '60 min';
  const ingSent = sentences.slice(1).find((s) => /(potřebuj|potřebuje|budete potřebovat|ingredience|vezmeme|vezmu)/i.test(s)) || sentences.slice(1).find((s) => s.split(',').length >= 3);
  let ingredients = [];
  if (ingSent) {
    const list = ingSent.replace(/^.*?(potřebuj\w*|budete potřebovat|ingredience|vezmeme|vezmu)[:\s]*/i, '').replace(/[.!?]+$/, '');
    ingredients = splitItems(list).map((x) => {
      const m = x.match(/^(\w+)\s+(.*)$/);
      if (m && NUM[m[1].toLowerCase()] != null) return { name: m[2].trim().toLowerCase(), qty: String(NUM[m[1].toLowerCase()]) };
      const d = x.match(/^(\d+[.,]?\d*)\s*(g|kg|dkg|ml|l|ks)?\s+(.*)$/i);
      if (d) return { name: d[3].trim().toLowerCase(), qty: `${d[1]}${d[2] ? ' ' + d[2] : ''}` };
      return { name: x.toLowerCase(), qty: '' };
    });
  }
  const steps = sentences.slice(1).filter((s) => s !== ingSent && !/uvaří se|upeče se|za (půl )?hodin/.test(s.toLowerCase())).map((s) => s.replace(/[.!?]+$/, ''));
  return { raw: text, name, kind, time, ingredients, steps };
}

export function isBannedSource(...texts) {
  const t = norm(texts.join(' '));
  return BANNED_SOURCES.some((b) => t.includes(norm(b)));
}

// ---------- recepty a pravidla ----------
export function recipeFlags(r) {
  const names = r.ingredients.map((i) => norm(i.name));
  return {
    meat: r.meat ?? names.some((n) => /kur|kure|vepr|hovez|ryb|losos|sunk|slanin|maso|treska|tunak/.test(n)),
    sweet: r.sweet ?? r.kind === 'koláč',
  };
}

export function lastUse(recipeId, meals, today) {
  const days = meals.filter((m) => m.recipeId === recipeId && m.status !== 'skipped').map((m) => diffDays(today, m.day));
  // kladné = před N dny, záporné = naplánováno do budoucna
  if (!days.length) return null;
  return days.some((d) => d < 0) ? -1 : Math.min(...days.filter((d) => d >= 0));
}

export function missing(r, pantry, extraStaples = []) {
  const have = new Set([...pantry, ...STAPLES, ...extraStaples].map(norm));
  // trvanlivé suroviny (fresh === false) se nehlídají; vlastní recepty a nejisté položky ano
  return r.ingredients.filter((i) => i.fresh !== false && !have.has(norm(i.name))).map((i) => i.name);
}

export function kindOK(r, meal) {
  // stažené recepty mají víc druhů (kinds); bez určeného druhu se nenavrhují
  const kinds = r.kinds || [r.kind];
  return meal === 'oběd' || meal === 'večeře' ? kinds.some((k) => ['hlavní', meal].includes(k)) : kinds.includes(meal);
}

export function makeCtx(state, today, opts = {}) {
  const wishes = opts.wishes || { meatGap: false, noSweet: false, unrec: [] };
  const rules = { veg: false, fried: false };
  state.principles.forEach((p) => { const r = ruleFromPrinciple(p); if (r.id) rules[r.id] = true; });
  return { state, today, wishes, rules, relax: !!opts.relax };
}
export const gapEff = (ctx) => (ctx.relax ? Math.min(3, ctx.state.settings.gap) : ctx.state.settings.gap);

function bannedByList(r, blacklist) {
  const t = norm(`${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`);
  return blacklist.some((b) => t.includes(norm(b)));
}

// důvod vyřazení nebo null, když je recept povolený
export function excludedBy(r, ctx, meal, dayOffset = 0, usedIds = []) {
  const f = recipeFlags(r);
  if (!kindOK(r, meal)) return 'jiný druh jídla';
  if (bannedByList(r, ctx.state.blacklist)) return 'černá listina';
  const lu = lastUse(r.id, ctx.state.meals, ctx.today);
  if (lu != null && (lu < 0 || lu < gapEff(ctx))) return 'pauza';
  if (ctx.wishes.noSweet && f.sweet) return 'sladké';
  if (ctx.rules.fried && (r.tags || []).includes('smažené')) return 'smažené';
  if (usedIds.includes(r.id)) return 'už v plánu';
  return null;
}

export function suggest(ctx, meal, n = 3) {
  const { recipes, pantry } = ctx.state;
  const ok = recipes.filter((r) => !excludedBy(r, ctx, meal) && missing(r, pantry).length === 0);
  ok.sort((a, b) => (ctx.rules.veg ? Number((b.tags || []).includes('zelenina')) - Number((a.tags || []).includes('zelenina')) : 0));
  return ok.slice(0, n);
}

export function why(ctx, meal, dayOffset = 0, usedIds = []) {
  const c = {};
  let any = false;
  ctx.state.recipes.forEach((r) => {
    if (!kindOK(r, meal)) return;
    any = true;
    const ex = excludedBy(r, ctx, meal, dayOffset, usedIds) || (dayOffset === 0 && missing(r, ctx.state.pantry).length ? 'chybí suroviny' : null);
    if (ex) c[ex] = (c[ex] || 0) + 1;
  });
  if (!any) return 've sbírce není žádný recept tohoto druhu';
  return Object.entries(c).map(([k, v]) => `${k} (${v})`).join(', ') || 'nic';
}

export function buildPlan(ctx, { daysAhead, meals }) {
  const out = [], used = [];
  let lastMeat = -9;
  const { pantry, meals: existing } = ctx.state;
  const order = MEALS.filter((m) => meals.includes(m));
  for (let d = 0; d <= daysAhead; d++) {
    const day = addDays(ctx.today, d);
    for (const meal of order) {
      const has = existing.find((e) => e.day === day && e.meal === meal);
      if (has) { if (has.recipeId) used.push(has.recipeId); out.push({ day, meal, kept: has }); continue; }
      let best = null, bs = 1e9;
      for (const r of ctx.state.recipes) {
        if (excludedBy(r, ctx, meal, d, used)) continue;
        const f = recipeFlags(r);
        if (ctx.wishes.meatGap && f.meat && d - lastMeat < 2) continue;
        const m = missing(r, pantry).length;
        if (d === 0 && m > 0) continue;
        const sc = m * 2 - (ctx.rules.veg && (r.tags || []).includes('zelenina') ? 1 : 0);
        if (sc < bs) { bs = sc; best = r; }
      }
      if (best) { used.push(best.id); if (recipeFlags(best).meat) lastMeat = d; out.push({ day, meal, recipe: best, missing: missing(best, pantry) }); }
      else out.push({ day, meal, recipe: null, why: why(ctx, meal, d, used) });
    }
  }
  return out;
}

export function planMissing(plan, pantry) {
  const set = [];
  plan.forEach((s) => { const r = s.recipe || null; if (r) missing(r, pantry).forEach((i) => { if (!set.includes(i)) set.push(i); }); });
  return set;
}

export const HEAVY_FOODS = ['kuře', 'ryba', 'maso', 'losos', 'šunka'];
export const isMeatName = (n) => /kur|ryb|losos|maso|sunk|šunk|vepř|hověz|slanin|tuňák|treska/.test(norm(n));

export function householdSize(settings) {
  return settings.adults + settings.kids.filter((k) => k.on).length;
}

export function scaleQty(qty, from, to) {
  const m = String(qty).match(/^(\d+[.,]?\d*)\s*(.*)$/);
  if (!m || !from) return qty;
  const n = Number(m[1].replace(',', '.')) * (to / from);
  return `${Math.round(n * 10) / 10}${m[2] ? ' ' + m[2] : ''}`;
}

export function historyView(state, today, daysBack = 5) {
  const rows = [];
  for (let i = 0; i >= -daysBack; i--) {
    const day = addDays(today, i);
    const entries = state.meals.filter((m) => m.day === day && m.status === 'cooked');
    rows.push({ day, entries });
  }
  return rows;
}

export function historyGaps(state, today) {
  const gaps = [];
  [-2, -1].forEach((off) => {
    const day = addDays(today, off);
    ['oběd', 'večeře'].forEach((meal) => {
      if (!state.meals.some((m) => m.day === day && m.meal === meal && m.status === 'cooked')) gaps.push({ day, meal });
    });
  });
  return gaps;
}

export function searchRecipes(state, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return state.recipes.slice();
  return state.recipes.filter((r) => {
    const hay = norm(`${r.name} ${r.ingredients.map((i) => i.name).join(' ')} ${(r.tags || []).join(' ')} ${r.note || ''}`);
    return words.every((w) => hay.includes(w));
  });
}

// Parsování stažených stránek s receptem (schema.org Recipe v JSON-LD). Bez sítě, aby šlo testovat.
import { createHash } from 'node:crypto';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s) => String(s ?? '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ENT[n])
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function findRecipeLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const t = [].concat(n['@type'] || []);
    if (t.includes('Recipe')) out.push(n);
    if (n['@graph']) walk(n['@graph']);
  };
  while ((m = re.exec(html))) { try { walk(JSON.parse(m[1].trim())); } catch { /* neplatný blok */ } }
  return out[0] || null;
}

const isoMinutes = (d) => {
  const m = String(d || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return '';
  const min = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return min ? `${min} min` : '';
};

function steps(ins) {
  const out = [];
  const walk = (x) => {
    if (!x) return;
    if (typeof x === 'string') return decode(x).split(/\n|(?<=\.)\s{2,}/).forEach((s) => s.trim() && out.push(s.trim()));
    if (Array.isArray(x)) return x.forEach(walk);
    if (x.itemListElement) return walk(x.itemListElement);
    if (x.text) out.push(decode(x.text));
    else if (x.name) out.push(decode(x.name));
  };
  walk(ins);
  return out.filter(Boolean);
}

const UNIT = ['kg', 'dkg', 'g', 'mg', 'ml', 'dl', 'cl', 'l', 'ks', 'lžíce', 'lžic', 'lžičky', 'lžičku', 'lžičk', 'lžička', 'hrst', 'hrsti', 'špetka', 'špetky', 'stroužky', 'stroužek', 'stroužků', 'plechovka', 'plechovky', 'balení', 'svazek', 'svazku', 'kostka', 'kostky', 'plátky', 'plátek']
  .sort((x, y) => y.length - x.length).join('|');
const QTY = new RegExp(`^((?:[\\d½¼¾⅓.,/–-]+\\s*)+(?:(?:${UNIT})(?![\\p{L}])\\.?)?)\\s+(.+)$`, 'iu');
export function splitIngredient(raw) {
  const t = decode(raw);
  const m = t.match(QTY);
  const qty = m ? m[1].trim() : '';
  const name = (m ? m[2] : t).replace(/^(z|ze|po)\s+/i, '').trim().toLowerCase();
  return { name, qty };
}

// čerstvost podle pravidel; true = čerstvá, false = trvanlivá/základní, null = nejisté
const NOT_FRESH = /mouk|cukr|\bsul\b|pepr|olej|ocet|koreni|skorice|kmin|mleta paprika|sladka paprika|palciva paprika|prasek|\bsoda\b|vanil|kakao|\bmed\b|sojova omacka|konzerv|passata|protlak|\bmak\b|orech|mandl|semink|vlock|\bryz|testovin|spagety|nudle|kuskus|bulgur|\bcaj\b|drozdi|zelatin|skrob|bobkov|oregano|tymian|majoran/;
const FRESH = /kur(e|ec)|krut|vepr|hovez|maso|sunk|slanin|klobas|\bryb|losos|treska|pstruh|brokolic|mrkev|cuket|rajc|paprik|okurk|spenat|salat|zeli|kvetak|kedluben|brambor|batat|dyne|lilek|celer|\bpor\b|houb|redkv|fazolk|avokad|citron|limet|jablk|banan|jahod|boruvk|malin|hrusk|pomeranc|petrzel|kopr|snitl|mleko|smetan|jogurt|tvaroh|\bsyr|mozzarell|eidam|parmaz|maslo|kefir|zakysan/;
export function freshness(name) {
  const n = norm(name);
  if (NOT_FRESH.test(n)) return false;
  if (FRESH.test(n)) return true;
  return null;
}

const KIND_RULES = [
  ['snídaně', /snidan|brunch/], ['svačina', /svacin/], ['dezert', /dezert|zakusk|sladk|pohar|puding|zmrzlin/],
  ['koláč', /kolac|babovk|buchta|dort|strudl|moucnik/],
  ['oběd', /obed|hlavn|polevk/], ['večeře', /vecer|hlavn/],
];
export function kindsOf(category, keywords, name) {
  const t = norm([].concat(category || [], keywords || [], name || []).join(' '));
  const k = new Set();
  KIND_RULES.forEach(([kind, re]) => { if (re.test(t)) k.add(kind); });
  return [...k];
}

export function toRecipe(ld, url, sourceName, now = new Date()) {
  if (!ld || !ld.name || !ld.recipeIngredient) return null;
  const ingredients = [].concat(ld.recipeIngredient).map(splitIngredient).filter((i) => i.name).map((i) => ({ ...i, fresh: freshness(i.name) }));
  const st = steps(ld.recipeInstructions);
  if (!ingredients.length || !st.length) return null;
  const name = decode(ld.name);
  const kinds = kindsOf(ld.recipeCategory, ld.keywords, name);
  const yieldN = String([].concat(ld.recipeYield || '')[0] || '').match(/\d+/);
  const text = norm(name + ' ' + st.join(' '));
  const tags = [];
  if (ingredients.some((i) => i.fresh && /brokolic|mrkev|cuket|rajc|paprik|okurk|spenat|salat|zeli|kvetak|kedluben|lilek|celer|por\b|fazolk/.test(norm(i.name)))) tags.push('zelenina');
  if (/smaz|fritov/.test(text)) tags.push('smažené');
  return {
    id: 'dl-' + createHash('sha1').update(url).digest('hex').slice(0, 10),
    origin: 'stazeno', url, source: sourceName, fetchedAt: now.toISOString().slice(0, 10),
    name, kinds, kind: kinds[0] || '', time: isoMinutes(ld.totalTime) || isoMinutes(ld.cookTime) || '',
    servings: yieldN ? +yieldN[0] : 4, ingredients, steps: st, tags, note: '',
  };
}

// robots.txt: zakázané prefixy pro User-agent: *
export function robotsDisallow(txt) {
  const out = [];
  let on = false;
  String(txt).split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
    if (!m) return;
    const k = m[1].toLowerCase();
    if (k === 'user-agent') on = m[2] === '*';
    else if (k === 'disallow' && on && m[2]) out.push(m[2]);
  });
  return out;
}
export const allowed = (url, dis) => { const p = new URL(url).pathname; return !dis.some((d) => p.startsWith(d.replace(/\*.*$/, ''))); };
export const locs = (xml) => [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]));

// Stáhne recepty ze zdrojů do recepty-stazene.json. Node 18+, bez závislostí.
// Použití: node scripts/scrape.mjs [--per-site 5] [--out recepty-stazene.json] [--delay 2000]
import { readFile, writeFile } from 'node:fs/promises';
import { findRecipeLd, toRecipe, robotsDisallow, allowed, locs } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PER = +arg('per-site', 5), OUT = arg('out', 'recepty-stazene.json'), DELAY = +arg('delay', 2000);
const UA = 'CoKVeceriBot/1.0 (osobni pouziti rodiny, kontakt: ales.fojtik@gmail.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BANNED = /babica/i;

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'cs' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function candidates(base, dis) {
  let robots = '';
  try { robots = await get(base + '/robots.txt'); } catch { /* bez robots.txt */ }
  const maps = [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
  if (!maps.length) maps.push(base + '/sitemap.xml');
  const urls = [], seen = new Set();
  const queue = [...maps];
  while (queue.length && seen.size < 12) {
    const m = queue.shift();
    if (seen.has(m)) continue;
    seen.add(m);
    await sleep(DELAY);
    let xml;
    try { xml = await get(m); } catch { continue; }
    const l = locs(xml);
    if (/<sitemapindex/i.test(xml)) {
      l.sort((a, b) => Number(/recept|recipe/i.test(b)) - Number(/recept|recipe/i.test(a))).forEach((x) => queue.push(x));
    } else l.forEach((u) => { if (/recept|recipe/i.test(m + u) && allowed(u, dis)) urls.push(u); });
    if (urls.length >= PER * 8) break;
  }
  return urls;
}

const sources = JSON.parse(await readFile(new URL('./sources.json', import.meta.url), 'utf8'));
const recipes = [], report = [];
for (const s of sources) {
  const rep = { source: s.name, base: s.base, ok: 0, tried: 0, errors: [], noKind: 0 };
  report.push(rep);
  try {
    let dis = [];
    try { dis = (await import('./lib.mjs')).robotsDisallow(await get(s.base + '/robots.txt')); } catch { /* ok */ }
    const urls = await candidates(s.base, dis);
    if (!urls.length) rep.errors.push('v sitemapě nenalezeny adresy receptů');
    for (const u of urls) {
      if (rep.ok >= PER || rep.tried >= PER * 4) break;
      rep.tried++;
      await sleep(DELAY);
      try {
        const html = await get(u);
        const r = toRecipe(findRecipeLd(html), u, s.name);
        if (!r) { rep.errors.push(`${u}: bez strukturovaného receptu`); continue; }
        if (BANNED.test(JSON.stringify(r))) { rep.errors.push(`${u}: zakázaný autor, vynecháno`); continue; }
        if (!r.kinds.length) rep.noKind++;
        recipes.push(r); rep.ok++;
      } catch (e) { rep.errors.push(`${u}: ${e.message}`); }
    }
  } catch (e) { rep.errors.push(e.message); }
  console.log(`${s.name}: ${rep.ok}/${PER}`, rep.errors.slice(0, 3));
}
await writeFile(OUT, JSON.stringify({ generated: new Date().toISOString(), recipes }, null, 1));
await writeFile(OUT.replace(/\.json$/, '-report.json'), JSON.stringify(report, null, 1));
console.log(`Hotovo: ${recipes.length} receptů v ${OUT}`);

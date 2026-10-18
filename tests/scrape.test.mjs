import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecipeLd, toRecipe, splitIngredient, freshness, robotsDisallow, allowed, locs } from '../scripts/lib.mjs';

const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},
{"@type":"Recipe","name":"Kuře s brokolicí &amp; rýží","totalTime":"PT45M","recipeYield":"4 porce","recipeCategory":["Hlavní jídla","Večeře"],
"recipeIngredient":["400 g kuřecí prsa","1 lžíce olivový olej","2 hrsti brokolice","2 dl rýže","sůl"],
"recipeInstructions":[{"@type":"HowToStep","text":"Maso nakrájet."},{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Orestovat."}]}]}]}</script></head></html>`;

test('JSON-LD recept se rozparsuje včetně kategorií, času a čerstvosti', () => {
  const r = toRecipe(findRecipeLd(html), 'https://x.cz/recept/kure', 'Test', new Date('2026-10-18'));
  assert.equal(r.name, 'Kuře s brokolicí & rýží');
  assert.equal(r.time, '45 min');
  assert.equal(r.servings, 4);
  assert.deepEqual(r.kinds, ['oběd', 'večeře']);
  assert.equal(r.origin, 'stazeno');
  assert.equal(r.url, 'https://x.cz/recept/kure');
  assert.deepEqual(r.steps, ['Maso nakrájet.', 'Orestovat.']);
  const f = Object.fromEntries(r.ingredients.map((i) => [i.name, i.fresh]));
  assert.equal(f['kuřecí prsa'], true);
  assert.equal(f['brokolice'], true);
  assert.equal(f['olivový olej'], false);
  assert.equal(f['sůl'], false);
  assert.ok(r.tags.includes('zelenina'));
});
test('stránka bez receptu vrátí null, neznámá kategorie zůstane prázdná', () => {
  assert.equal(findRecipeLd('<html></html>'), null);
  const ld = { '@type': 'Recipe', name: 'Něco', recipeIngredient: ['2 ks cuketa'], recipeInstructions: 'Uvařit.' };
  assert.deepEqual(toRecipe(ld, 'https://x.cz/a', 'T').kinds, []);
});
test('množství a nejisté suroviny', () => {
  assert.deepEqual(splitIngredient('2 lžíce citronové šťávy'), { name: 'citronové šťávy', qty: '2 lžíce' });
  assert.deepEqual(splitIngredient('400 g špenát'), { name: 'špenát', qty: '400 g' });
  assert.equal(freshness('tuňák'), null);
  assert.equal(freshness('mletá sladká paprika'), false);
});
test('robots a sitemapa', () => {
  const d = robotsDisallow('User-agent: Google\nDisallow: /g\nUser-agent: *\nDisallow: /admin\nDisallow:\n');
  assert.deepEqual(d, ['/admin']);
  assert.ok(!allowed('https://x.cz/admin/a', d));
  assert.ok(allowed('https://x.cz/recept/a', d));
  assert.deepEqual(locs('<urlset><url><loc>https://x.cz/a</loc></url><url><loc> https://x.cz/b?x=1&amp;y=2 </loc></url></urlset>'), ['https://x.cz/a', 'https://x.cz/b?x=1&y=2']);
});

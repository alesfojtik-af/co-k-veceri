import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { defaultState } from '../store.js';

const rec = (id, name, kind, ings, tags = []) => ({ id, name, kind, ingredients: ings.map((n) => ({ name: n, qty: '' })), steps: [], tags });
const mk = (extra = {}) => { const s = defaultState(); Object.assign(s, extra); return s; };
const T = '2026-10-18';

test('dayLabel', () => {
  assert.equal(L.dayLabel('2026-10-19', T), 'Zítra · pondělí 19. 10.');
  assert.equal(L.dayLabel('2026-10-22', T), 'čtvrtek 22. 10.');
});
test('pauza 7 dní vyřadí nedávno uvařené, po 7 dnech pustí', () => {
  const r = rec('a', 'Rýže s kuřetem', 'večeře', ['kuře']);
  const s = mk({ recipes: [r], pantry: ['kuře'], meals: [{ id: 'm', day: '2026-10-14', meal: 'večeře', recipeId: 'a', name: r.name, status: 'cooked' }] });
  assert.equal(L.suggest(L.makeCtx(s, T), 'večeře').length, 0);
  s.meals[0].day = '2026-10-11';
  assert.equal(L.suggest(L.makeCtx(s, T), 'večeře').length, 1);
});
test('relax zkrátí pauzu na 3 dny', () => {
  const r = rec('a', 'X', 'večeře', ['kuře']);
  const s = mk({ recipes: [r], pantry: ['kuře'], meals: [{ id: 'm', day: '2026-10-14', meal: 'večeře', recipeId: 'a', name: 'X', status: 'cooked' }] });
  assert.equal(L.suggest(L.makeCtx(s, T, { relax: true }), 'večeře').length, 1);
});
test('chybějící surovina = žádný návrh pro dnešek, základní suroviny se nepočítají', () => {
  const s = mk({ recipes: [rec('a', 'X', 'večeře', ['kuře', 'mouka', 'brokolice'])], pantry: ['kuře'] });
  assert.equal(L.suggest(L.makeCtx(s, T), 'večeře').length, 0);
  s.pantry.push('brokolice');
  assert.equal(L.suggest(L.makeCtx(s, T), 'večeře').length, 1);
});
test('černá listina a druh jídla', () => {
  const s = mk({ recipes: [rec('a', 'Játra', 'večeře', ['játra']), rec('b', 'Koláč', 'koláč', ['tvaroh'])], pantry: ['játra', 'tvaroh'], blacklist: ['játra'] });
  assert.equal(L.suggest(L.makeCtx(s, T), 'večeře').length, 0);
  assert.equal(L.suggest(L.makeCtx(s, T), 'koláč').length, 1);
});
test('přání: žádné sladké vyřadí koláč', () => {
  const s = mk({ recipes: [rec('b', 'Koláč', 'koláč', ['tvaroh'])], pantry: ['tvaroh'] });
  const w = L.parseWishes('maso jen jednou za dva dny, žádné sladké');
  assert.deepEqual([w.meatGap, w.noSweet], [true, true]);
  assert.equal(L.suggest(L.makeCtx(s, T, { wishes: w }), 'koláč').length, 0);
});
test('plán: dnešek jen ze zásob, další dny s dokoupením, bez opakování', () => {
  const s = mk({ recipes: [rec('a', 'A', 'večeře', ['kuře']), rec('b', 'B', 'večeře', ['ryba', 'špenát'])], pantry: ['kuře'] });
  const p = L.buildPlan(L.makeCtx(s, T), { daysAhead: 1, meals: ['večeře'] });
  assert.equal(p[0].recipe.id, 'a');
  assert.equal(p[1].recipe.id, 'b');
  assert.deepEqual(L.planMissing(p, s.pantry), ['ryba', 'špenát']);
});
test('plán zachová už naplánované jídlo', () => {
  const s = mk({ recipes: [rec('a', 'A', 'večeře', ['kuře'])], pantry: ['kuře'], meals: [{ id: 'm', day: T, meal: 'večeře', recipeId: 'a', name: 'A', status: 'planned' }] });
  const p = L.buildPlan(L.makeCtx(s, T), { daysAhead: 0, meals: ['večeře'] });
  assert.ok(p[0].kept);
});
test('diktát receptu se rozdělí', () => {
  const p = L.parseRecipeDictation('Cizrnové kari. Je to večeře na 30 minut. Potřebujeme 400 g cizrny, dvě cibule, kokosové mléko. Cibuli osmažit. Přidat cizrnu.');
  assert.equal(p.name, 'Cizrnové kari');
  assert.equal(p.kind, 'večeře');
  assert.equal(p.time, '30 min');
  assert.equal(p.ingredients.length, 3);
  assert.equal(p.ingredients[0].qty, '400 g');
  assert.equal(L.parseRecipeDictation('Jablečný koláč. Upeče se.').kind, 'koláč');
});
test('zakázaný zdroj', () => {
  assert.ok(L.isBannedSource('recept od Jiří Babica'));
  assert.ok(L.isBannedSource('Jiri BABICA'));
  assert.ok(!L.isBannedSource('Fitrecepty'));
});
test('škálování porcí', () => {
  assert.equal(L.scaleQty('400 g', 4, 2), '200 g');
  assert.equal(L.scaleQty('dle chuti', 4, 2), 'dle chuti');
});
test('počet jedlíků a mezery v historii', () => {
  const s = mk();
  assert.equal(L.householdSize(s.settings), 4);
  assert.equal(L.historyGaps(s, T).length, 4);
});

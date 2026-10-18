import * as L from './logic.js';
import * as store from './store.js';
import { CONFIG } from './config.js';

const { MEALS } = L;
let S = store.loadLocal();
const today = () => L.isoDay();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

const ui = {
  tab: 'dnes', meal: new Date().getHours() < 14 ? 'oběd' : 'večeře', f: {}, msg: null,
  wishes: { meatGap: false, noSweet: false, unrec: [] }, relax: false,
  sugg: null, detail: null, portions: null, plan: null, draft: null,
};
const val = (k) => ui.f[k] ?? '';
const commit = () => { store.save(S); render(); };
const say = (m, ok = false) => { ui.msg = m ? { m, ok } : null; };
const ctx = () => L.makeCtx(S, today(), { wishes: ui.wishes, relax: ui.relax });
const recipe = (id) => S.recipes.find((r) => r.id === id);
const mealOrder = (m) => MEALS.indexOf(m);

// ---------- hlas ----------
function dictate(targetId) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) { say('Diktování tento prohlížeč nepodporuje. Použijte mikrofon na klávesnici telefonu.'); return render(); }
  const rec = new R();
  rec.lang = 'cs-CZ';
  rec.onresult = (e) => {
    const t = [...e.results].map((r) => r[0].transcript).join(' ');
    const el = $(targetId);
    if (!el) return;
    el.value = el.value ? `${el.value} ${t}` : t;
    ui.f[el.dataset.bind] = el.value;
  };
  rec.onerror = () => { say('Diktování se nepodařilo. Zkuste to znovu nebo napište text.'); render(); };
  rec.start();
}
const field = (id, ph = '', multi = false) => `<div class="field">${multi
  ? `<textarea id="${id}" data-bind="${id}" placeholder="${esc(ph)}">${esc(val(id))}</textarea>`
  : `<input type="text" id="${id}" data-bind="${id}" value="${esc(val(id))}" placeholder="${esc(ph)}">`}
  <button class="mic" data-act="mic" data-id="${id}" aria-label="Diktovat">🎤</button></div>`;

// ---------- pohledy ----------
function viewDnes() {
  if (ui.detail) return viewDetail();
  const t = today();
  const planned = S.meals.filter((m) => m.status === 'planned').sort((a, b) => a.day.localeCompare(b.day) || mealOrder(a.meal) - mealOrder(b.meal));
  const runs = S.planRuns.filter((d) => L.diffDays(t, d) < 7);
  const wishChips = [ui.wishes.meatGap && 'maso jen jednou za dva dny', ui.wishes.noSweet && 'žádné sladké'].filter(Boolean);
  return `
  <h1>Co vařit teď</h1><p class="note">${esc(L.dayLabel(t, t))}</p>
  <div>${MEALS.map((m) => `<button class="chip" aria-pressed="${ui.meal === m}" data-act="meal" data-v="${m}">${m}</button>`).join('')}</div>

  <h2>Zásoby (čerstvé suroviny)</h2>
  <div>${S.pantry.map((p, i) => `<button class="chip rm" data-act="pantryRm" data-i="${i}" aria-label="Odebrat ${esc(p)}">${esc(p)}</button>`).join('') || '<span class="note">Zatím prázdné. Nadiktujte, co je doma.</span>'}</div>
  ${field('pantryText', 'např. kuřecí prsa, brokolice, mrkev')}
  <div class="row2"><button class="btn ghost" data-act="pantryAdd">Přidat</button><button class="btn ghost" data-act="pantrySet">Nahradit vše</button></div>

  <h2>Přání pro dnešek</h2>
  <div>${wishChips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}${ui.wishes.unrec.map((c) => `<span class="chip" style="background:var(--warn-bg)">nerozumím: ${esc(c)}</span>`).join('')}</div>
  ${field('wishText', 'např. maso jen jednou za dva dny, žádné sladké')}
  <button class="btn ghost" data-act="wishSet">Použít přání</button>

  <button class="btn" data-act="suggest">Navrhnout ze zásob</button>
  ${viewSugg()}

  <details><summary>Plán na více dní</summary>
    <p class="note">Dnešek se vybírá jen ze zásob, další dny s nákupním seznamem. Plán lze sestavit nejvýše 2× týdně (za posledních 7 dní: ${runs.length}).</p>
    <label>Dny dopředu <select data-bind="planDays">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${String(val('planDays') || 4) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <div>${['oběd', 'večeře'].map((m) => `<label class="chk"><input type="checkbox" data-plan-meal="${m}" ${ui.f['pm_' + m] === false ? '' : 'checked'}>${m}</label>`).join('')}</div>
    <button class="btn" data-act="planBuild" ${runs.length >= 2 ? 'disabled' : ''}>Sestavit plán</button>
    ${runs.length >= 2 ? '<p class="note">Limit 2× týdně je vyčerpán.</p>' : ''}
    ${viewPlan()}
  </details>

  <h2>Naplánováno</h2>
  ${planned.length ? planned.map((m) => `<div class="row"><div><b>${esc(L.dayLabel(m.day, t))}, ${esc(m.meal)}</b><br>${esc(m.name)}</div>
    <div class="acts"><button data-act="mealDone" data-id="${m.id}">Uvařeno</button><button data-act="mealDel" data-id="${m.id}" aria-label="Zrušit">✕</button></div></div>`).join('') : '<p class="note">Nic naplánováno.</p>'}

  <h2>Pravidla, která platí</h2>
  <p class="note">Pauza ${S.settings.gap} dní · černá listina: ${S.blacklist.length} · zásady: ${S.principles.length} (upravíte v Nastavení)</p>`;
}

function viewSugg() {
  if (!ui.sugg) return '';
  const c = ctx();
  if (!ui.sugg.length) {
    return `<div class="banner">Nic nevyhovuje. Vyřazeno kvůli: ${esc(L.why(c, ui.meal))}.</div>
      ${S.recipes.length ? `<button class="btn ghost" data-act="relax">Uvolnit pauzu na 3 dny a zkusit znovu</button>` : '<p class="note">Sbírka je prázdná. Přidejte první recept v záložce Recepty.</p>'}`;
  }
  return `<h2>Návrhy: ${esc(ui.meal)}</h2>${ui.relax ? '<p class="note">Pauza dočasně uvolněna na 3 dny.</p>' : ''}` + ui.sugg.map((r) => `
    <button class="card" data-act="open" data-id="${r.id}"><b>${esc(r.name)}</b><div class="meta">${esc(r.time || '')} · ${esc(r.source || 'vlastní')}</div>
    ${(r.tags || []).map((g) => `<span class="tag">${esc(g)}</span>`).join('')}</button>`).join('');
}

function viewPlan() {
  if (!ui.plan) return '';
  const t = today();
  const missingAll = L.planMissing(ui.plan, S.pantry);
  return `<h3>Návrh plánu</h3>` + ui.plan.map((s) => {
    const name = s.kept ? s.kept.name : s.recipe ? s.recipe.name : null;
    return `<div class="row"><div><b>${esc(L.dayLabel(s.day, t))}, ${esc(s.meal)}</b><br>${name ? esc(name) : `<span class="note">nic vhodného (${esc(s.why || '')})</span>`}
    ${s.kept ? '<span class="tag">už naplánováno</span>' : ''}${s.missing?.length ? `<br><span class="tag warm">dokoupit: ${esc(s.missing.join(', '))}</span>` : ''}</div></div>`;
  }).join('') + `<p class="note">K dokoupení celkem: ${missingAll.length ? esc(missingAll.join(', ')) : 'nic'}</p>
    <button class="btn" data-act="planSave">Uložit plán</button>`;
}

function viewDetail() {
  const r = recipe(ui.detail);
  if (!r) { ui.detail = null; return viewDnes(); }
  const base = r.servings || 4, p = ui.portions || L.householdSize(S.settings);
  return `<button class="back" data-act="back">‹ Zpět</button>
  <h1>${esc(r.name)}</h1><p class="meta">${esc(r.kind)} · ${esc(r.time || 'čas neuveden')} · zdroj: ${esc(r.source || 'vlastní')}</p>
  <h2>Ingredience pro ${p} ${p === 1 ? 'osobu' : p < 5 ? 'osoby' : 'osob'}</h2>
  <div class="row2"><button class="btn ghost" data-act="portions" data-d="-1">− porce</button><button class="btn ghost" data-act="portions" data-d="1">+ porce</button></div>
  ${r.ingredients.map((i) => `<div class="row"><span>${esc(i.name)}</span><span>${esc(i.qty ? L.scaleQty(i.qty, base, p) : '')}</span></div>`).join('')}
  <h2>Postup</h2><ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  ${r.note ? `<p class="note">Poznámka: ${esc(r.note)}</p>` : ''}
  <h2>Co s tím</h2>
  <button class="btn" data-act="cookNow" data-id="${r.id}">Vařím teď (${esc(ui.meal)})</button>
  <label>Naplánovat na <select data-bind="planDay">${[0, 1, 2, 3, 4].map((n) => `<option value="${n}" ${String(val('planDay') || 1) === String(n) ? 'selected' : ''}>${esc(L.dayLabel(L.addDays(today(), n), today()))}</option>`).join('')}</select></label>
  <button class="btn ghost" data-act="planOne" data-id="${r.id}">Naplánovat jako ${esc(ui.meal)}</button>
  <button class="btn ghost" data-act="edit" data-id="${r.id}">Upravit recept</button>
  <button class="btn danger" data-act="recipeDel" data-id="${r.id}">Smazat recept</button>`;
}

function viewHistorie() {
  const t = today();
  const rows = L.historyView(S, t, 5);
  const gaps = L.historyGaps(S, t);
  const hq = val('hq');
  const found = hq ? L.searchRecipes(S, hq) : [];
  const foundMeals = hq ? S.meals.filter((m) => m.status === 'cooked' && L.norm(m.name).includes(L.norm(hq))) : [];
  return `<h1>Historie</h1>
  ${gaps.length ? `<div class="banner">Chybí záznamy: ${gaps.map((g) => `${esc(L.dayLabel(g.day, t))} (${esc(g.meal)})`).join(', ')}.</div>` : ''}
  ${rows.map((r) => `<h3>${esc(L.dayLabel(r.day, t))}</h3>` + (r.entries.length ? [...r.entries].sort((a, b) => mealOrder(a.meal) - mealOrder(b.meal)).map((m) => `
    <div class="row"><div><span class="tag">${esc(m.meal || 'volně')}</span> ${esc(m.name)}${m.recipeId ? '' : ' <span class="tag warm">volně zadáno</span>'}</div>
    <div class="acts"><button data-act="mealDel" data-id="${m.id}" aria-label="Smazat">✕</button></div></div>`).join('') : '<p class="note">nic zapsáno</p>')).join('')}

  <h2>Doplnit, co se jedlo</h2>
  <div class="row2"><select data-bind="hDay">${[0, -1, -2, -3, -4, -5].map((n) => `<option value="${n}" ${String(val('hDay') || -1) === String(n) ? 'selected' : ''}>${esc(L.dayLabel(L.addDays(t, n), t))}</option>`).join('')}</select>
  <select data-bind="hMeal">${MEALS.map((m) => `<option ${((val('hMeal')) || 'oběd') === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
  ${field('hName', 'co to bylo, např. rýže s kuřetem')}
  <button class="btn" data-act="histAdd">Zapsat</button>

  <h2>Hledat</h2>
  ${field('hq', 'např. cizrna, kuře, polévka')}
  <button class="btn ghost" data-act="rerender">Hledat</button>
  ${hq ? `${found.map((r) => `<button class="card" data-act="open" data-id="${r.id}"><b>${esc(r.name)}</b><div class="meta">${esc(r.kind)} · ${esc(r.time || '')}</div></button>`).join('')}
  ${foundMeals.map((m) => `<div class="row"><span>${esc(L.dayLabel(m.day, t))} · ${esc(m.meal)}: ${esc(m.name)}</span></div>`).join('')}
  ${!found.length && !foundMeals.length ? '<p class="note">Nic nenalezeno.</p>' : ''}` : ''}`;
}

function shopping() {
  const t = today();
  const groups = { 'Maso a ryby (Rohlík nebo řeznictví)': [], 'Ostatní (místní samoobsluha)': [] };
  S.meals.filter((m) => m.status === 'planned' && m.day >= t && m.recipeId).forEach((m) => {
    const r = recipe(m.recipeId);
    if (!r) return;
    L.missing(r, S.pantry).forEach((i) => {
      const g = L.isMeatName(i) ? 'Maso a ryby (Rohlík nebo řeznictví)' : 'Ostatní (místní samoobsluha)';
      if (!groups[g].includes(i)) groups[g].push(i);
    });
  });
  return groups;
}

function viewNakup() {
  const g = shopping();
  const text = Object.entries(g).filter(([, v]) => v.length).map(([k, v]) => `${k}:\n${v.map((i) => `- ${i}`).join('\n')}`).join('\n\n');
  return `<h1>Nákup</h1><p class="note">Seznam vzniká z naplánovaných jídel, od dneška. Co máte v zásobách a základní věci (mouka, cukr, sůl, olej, rýže, těstoviny, cibule, česnek, vejce) se nepočítá.</p>
  ${text ? `<pre class="list" id="shopText">${esc(text)}</pre><button class="btn" data-act="copyShop">Zkopírovat seznam</button>` : '<p>Není co kupovat.</p>'}
  <div class="banner">Seznam se zatím jen kopíruje. Košík na Rohlíku aplikace nepřipravuje, nikdy nevybírá čas dodávky a nepotvrzuje objednávku.</div>`;
}

function viewRecepty() {
  if (ui.draft) return viewDraft();
  const q = val('rq');
  const list = L.searchRecipes(S, q);
  return `<h1>Recepty</h1>
  <p class="note">Aplikace žádné recepty nevymýšlí. Sbírka obsahuje jen to, co sem sami nadiktujete a potvrdíte.</p>
  <h2>Přidat recept diktátem</h2>
  <p class="note">Řekněte název, druh jídla (oběd, večeře, svačina, koláč), čas, „potřebujeme …“ a postup po větách.</p>
  ${field('recDict', 'Nadiktujte nebo napište celý recept', true)}
  <button class="btn" data-act="recSplit">Rozdělit na položky</button>
  <h2>Sbírka (${S.recipes.length})</h2>
  ${field('rq', 'hledat název nebo surovinu')}
  <button class="btn ghost" data-act="rerender">Hledat</button>
  ${list.map((r) => `<button class="card" data-act="open" data-id="${r.id}"><b>${esc(r.name)}</b><div class="meta">${esc(r.kind)} · ${esc(r.time || '')} · ${esc(r.source || 'vlastní')}</div></button>`).join('') || '<p class="note">Zatím žádný recept.</p>'}
  <h2>Zdroje</h2>
  <p class="note">Webové zdroje se v první verzi nestahují. Seznam určuje, co se smí do sbírky přidat.</p>
  ${S.sources.map((s, i) => `<div class="row"><div>${esc(s.name)}<br><span class="tag ${s.status === 'ok' ? '' : 'warm'}">${s.status === 'ok' ? 'schváleno' : s.status === 'banned' ? 'zakázáno' : 'čeká na schválení'}</span></div>
    <div class="acts">${s.status === 'pending' ? `<button data-act="srcOk" data-i="${i}">Schválit</button>` : ''}${s.status !== 'banned' ? `<button data-act="srcBan" data-i="${i}">Zakázat</button>` : ''}${s.status !== 'banned' || !L.isBannedSource(s.name) ? `<button data-act="srcDel" data-i="${i}" aria-label="Odebrat">✕</button>` : ''}</div></div>`).join('')}
  ${field('srcName', 'název nového zdroje')}
  <button class="btn ghost" data-act="srcAdd">Přidat ke schválení</button>`;
}

function viewDraft() {
  const d = ui.draft;
  return `<button class="back" data-act="draftCancel">‹ Zrušit</button>
  <h1>Zkontrolujte rozdělení</h1><p class="note">Opravte, co je špatně, a potvrďte. Teprve potom se recept uloží.</p>
  <label>Název<input type="text" data-draft="name" value="${esc(d.name)}"></label>
  <div class="row2"><label>Druh<select data-draft="kind">${MEALS.map((m) => `<option ${d.kind === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
  <label>Čas<input type="text" data-draft="time" value="${esc(d.time)}" placeholder="např. 30 min"></label></div>
  <label>Počet porcí v receptu<input type="number" data-draft="servings" min="1" value="${esc(d.servings)}"></label>
  <label>Ingredience (jedna na řádek, „název | množství“)<textarea data-draft="ing" style="min-height:140px">${esc(d.ing)}</textarea></label>
  <label>Postup (jeden krok na řádek)<textarea data-draft="steps" style="min-height:140px">${esc(d.steps)}</textarea></label>
  <label>Zdroj<input type="text" data-draft="source" value="${esc(d.source)}"></label>
  <label>Poznámka<input type="text" data-draft="note" value="${esc(d.note)}"></label>
  <button class="btn" data-act="draftSave">Potvrdit a uložit</button>
  <button class="btn ghost" data-act="draftCancel">Zrušit</button>`;
}

function viewNastaveni() {
  const s = S.settings;
  const sy = store.sync;
  return `<h1>Nastavení</h1>
  <h2>Domácnost</h2>
  <div class="row"><span>Dospělí</span><div class="acts"><button data-act="adults" data-d="-1" aria-label="méně">−</button><b>${s.adults}</b><button data-act="adults" data-d="1" aria-label="více">+</button></div></div>
  ${s.kids.map((k, i) => `<div class="row"><span>Dítě ${i + 1}, věk <input type="number" min="1" max="25" style="width:70px" data-kidage="${i}" value="${k.age}"></span>
    <div class="acts"><button data-act="kidOn" data-i="${i}" aria-pressed="${k.on}">${k.on ? 'dnes jí' : 'dnes nejí'}</button><button data-act="kidDel" data-i="${i}" aria-label="Odebrat">✕</button></div></div>`).join('')}
  <button class="btn ghost" data-act="kidAdd">Přidat dítě</button>
  <div class="row"><span>Pauza mezi stejnými jídly (dny)</span><div class="acts"><button data-act="gap" data-d="-1">−</button><b>${s.gap}</b><button data-act="gap" data-d="1">+</button></div></div>
  <p class="note">Počet jedlíků dnes: ${L.householdSize(s)}</p>

  <h2>Černá listina jídel a surovin</h2>
  <div>${S.blacklist.map((b, i) => `<button class="chip rm" data-act="blDel" data-i="${i}">${esc(b)}</button>`).join('') || '<span class="note">Prázdná.</span>'}</div>
  ${field('blText', 'např. játra, houby')}
  <button class="btn ghost" data-act="blAdd">Přidat</button>

  <h2>Zásady vaření</h2>
  <div>${S.principles.map((p, i) => `<button class="chip rm" data-act="prDel" data-i="${i}">${esc(p)}</button>`).join('') || '<span class="note">Žádné.</span>'}</div>
  ${field('prText', 'např. nesmažit, víc zeleniny')}
  <button class="btn ghost" data-act="prAdd">Přidat</button>
  <p class="note">Návrhy ovlivní zatím „zelenina“ a „nesmažit“. Ostatní se uloží jen jako poznámka.</p>

  <h2>Sdílení v rodině</h2>
  ${!sy.enabled ? '<p class="note">Sdílení není nastavené. Data jsou jen v tomto telefonu. Postup je v README.</p>'
    : !sy.user ? `<p class="note">Přihlášení odkazem z e-mailu.</p><input type="email" data-bind="email" value="${esc(val('email'))}" placeholder="váš e-mail"><button class="btn" data-act="login">Poslat přihlašovací odkaz</button>`
    : !store.hasHousehold() ? `<p class="note">Přihlášen: ${esc(sy.user.email)}</p><button class="btn" data-act="hhCreate">Vytvořit domácnost z dat v tomto telefonu</button>
        <input type="text" data-bind="joinCode" value="${esc(val('joinCode'))}" placeholder="kód od druhého člena rodiny" style="margin-top:8px"><button class="btn ghost" data-act="hhJoin">Připojit se kódem</button>`
    : `<p class="note">Přihlášen: ${esc(sy.user.email)} · stav: ${esc(sy.status)}</p><p>Kód pro pozvání: <b>${esc(sy.code)}</b></p>
        <button class="btn ghost" data-act="pull">Načíst ze sdílení</button><button class="btn ghost" data-act="logout">Odhlásit</button>`}

  <h2>Záloha</h2>
  <button class="btn ghost" data-act="backup">Zkopírovat zálohu</button>
  <textarea data-bind="restore" placeholder="Sem vložte zálohu a stiskněte Obnovit">${esc(val('restore'))}</textarea>
  <button class="btn danger" data-act="restore">Obnovit ze zálohy (přepíše vše)</button>`;
}

const TABS = [['dnes', '🍽️', 'Dnes'], ['historie', '🕘', 'Historie'], ['nakup', '🛒', 'Nákup'], ['recepty', '📖', 'Recepty'], ['nastaveni', '⚙️', 'Nastavení']];
function render() {
  const views = { dnes: viewDnes, historie: viewHistorie, nakup: viewNakup, recepty: viewRecepty, nastaveni: viewNastaveni };
  const y = window.scrollY;
  $('screen').innerHTML = (ui.msg ? `<div class="banner ${ui.msg.ok ? 'ok' : ''}" role="status">${esc(ui.msg.m)}</div>` : '') + views[ui.tab]();
  $('nav').innerHTML = TABS.map(([k, ic, l]) => `<button data-act="tab" data-v="${k}" ${ui.tab === k ? 'aria-current="true"' : ''}><span class="ico">${ic}</span>${l}</button>`).join('');
  window.scrollTo(0, y);
}

// ---------- akce ----------
const addUnique = (arr, items) => items.forEach((i) => { if (i && !arr.some((a) => L.norm(a) === L.norm(i))) arr.push(i); });
const mealEntry = (day, meal, r, name, status) => ({ id: uid(), day, meal, recipeId: r ? r.id : null, name: r ? r.name : name, status });

function toDraft(p, base = {}) {
  return { id: base.id || null, name: p.name, kind: p.kind, time: p.time, servings: base.servings || 4,
    ing: p.ingredients.map((i) => (i.qty ? `${i.name} | ${i.qty}` : i.name)).join('\n'), steps: p.steps.join('\n'),
    source: base.source || 'Vlastní recept', note: base.note || '', tags: base.tags || [] };
}

const actions = {
  tab: (e) => { ui.tab = e.v; ui.detail = null; ui.draft = null; say(null); render(); window.scrollTo(0, 0); },
  mic: (e) => dictate(e.id),
  rerender: () => render(),
  meal: (e) => { ui.meal = e.v; ui.sugg = null; render(); },
  pantryAdd: () => { addUnique(S.pantry, L.parsePantry(val('pantryText'))); ui.f.pantryText = ''; say(null); commit(); },
  pantrySet: () => { S.pantry = []; addUnique(S.pantry, L.parsePantry(val('pantryText'))); ui.f.pantryText = ''; commit(); },
  pantryRm: (e) => { S.pantry.splice(+e.i, 1); ui.sugg = null; commit(); },
  wishSet: () => { ui.wishes = L.parseWishes(val('wishText')); ui.sugg = null; render(); },
  suggest: () => { ui.relax = false; ui.sugg = L.suggest(ctx(), ui.meal, 3); say(null); render(); },
  relax: () => { ui.relax = true; ui.sugg = L.suggest(ctx(), ui.meal, 3); render(); },
  open: (e) => { ui.detail = e.id; ui.portions = null; ui.tab = ui.tab === 'dnes' || ui.tab === 'recepty' || ui.tab === 'historie' ? ui.tab : 'dnes'; render(); window.scrollTo(0, 0); },
  back: () => { ui.detail = null; render(); },
  portions: (e) => { ui.portions = Math.max(1, (ui.portions || L.householdSize(S.settings)) + +e.d); render(); },
  cookNow: (e) => { S.meals.push(mealEntry(today(), ui.meal, recipe(e.id), '', 'cooked')); ui.detail = null; ui.sugg = null; say('Zapsáno do historie jako uvařeno.', true); commit(); },
  planOne: (e) => {
    const day = L.addDays(today(), +(val('planDay') || 1));
    if (S.meals.some((m) => m.day === day && m.meal === ui.meal && m.status === 'planned')) { say(`Na ${L.dayLabel(day, today())} už je ${ui.meal} naplánovaný.`); return render(); }
    S.meals.push(mealEntry(day, ui.meal, recipe(e.id), '', 'planned')); ui.detail = null; say('Naplánováno.', true); commit();
  },
  mealDone: (e) => { const m = S.meals.find((x) => x.id === e.id); if (m) { m.status = 'cooked'; m.day = m.day > today() ? today() : m.day; } commit(); },
  mealDel: (e) => { S.meals = S.meals.filter((x) => x.id !== e.id); commit(); },
  planBuild: () => {
    const meals = ['oběd', 'večeře'].filter((m) => ui.f['pm_' + m] !== false);
    if (!meals.length) { say('Vyberte aspoň oběd nebo večeři.'); return render(); }
    ui.plan = L.buildPlan(ctx(), { daysAhead: +(val('planDays') || 4), meals });
    say(null); render();
  },
  planSave: () => {
    ui.plan.forEach((s) => { if (s.recipe) S.meals.push(mealEntry(s.day, s.meal, s.recipe, '', 'planned')); });
    S.planRuns.push(today()); S.planRuns = S.planRuns.filter((d) => L.diffDays(today(), d) < 30);
    ui.plan = null; say('Plán uložen. Dokoupit uvidíte v záložce Nákup.', true); commit();
  },
  histAdd: () => {
    const name = val('hName').trim();
    if (!name) { say('Napište, co se jedlo.'); return render(); }
    const day = L.addDays(today(), +(val('hDay') || -1)), meal = val('hMeal') || 'oběd';
    const r = S.recipes.find((x) => L.norm(x.name) === L.norm(name));
    S.meals = S.meals.filter((m) => !(m.day === day && m.meal === meal && m.status === 'cooked' && L.norm(m.name) === L.norm(name)));
    S.meals.push(mealEntry(day, meal, r, name, 'cooked'));
    ui.f.hName = ''; say('Zapsáno.', true); commit();
  },
  copyShop: async () => {
    try { await navigator.clipboard.writeText($('shopText').textContent); say('Zkopírováno.', true); } catch { say('Kopírování se nepovedlo, označte text ručně.'); }
    render();
  },
  recSplit: () => {
    const t = val('recDict').trim();
    if (!t) { say('Nejdřív recept nadiktujte nebo napište.'); return render(); }
    ui.draft = toDraft(L.parseRecipeDictation(t)); say(null); render(); window.scrollTo(0, 0);
  },
  edit: (e) => { const r = recipe(e.id); ui.draft = toDraft({ name: r.name, kind: r.kind, time: r.time, ingredients: r.ingredients, steps: r.steps }, r); ui.detail = null; ui.tab = 'recepty'; render(); },
  draftCancel: () => { ui.draft = null; render(); },
  draftSave: () => {
    const d = ui.draft;
    const ingredients = d.ing.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [n, q] = l.split('|'); return { name: n.trim().toLowerCase(), qty: (q || '').trim() }; });
    const steps = d.steps.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!d.name.trim() || !ingredients.length) { say('Recept potřebuje název a aspoň jednu ingredienci.'); return render(); }
    if (L.isBannedSource(d.name, d.source, d.note, d.ing, d.steps)) { say('Tento zdroj je na černé listině. Recept se neuloží.'); return render(); }
    const src = S.sources.find((s) => L.norm(s.name) === L.norm(d.source));
    if (src && src.status !== 'ok') { say('Zdroj není schválený.'); return render(); }
    const rec = { id: d.id || uid(), name: d.name.trim(), kind: d.kind, time: d.time.trim(), servings: Math.max(1, +d.servings || 4), ingredients, steps, tags: d.tags, source: d.source.trim() || 'Vlastní recept', note: d.note.trim() };
    const i = S.recipes.findIndex((r) => r.id === rec.id);
    if (i >= 0) S.recipes[i] = rec; else S.recipes.push(rec);
    ui.draft = null; ui.f.recDict = ''; say('Recept uložen do sbírky.', true); commit();
  },
  recipeDel: (e) => { if (!confirm('Opravdu smazat recept?')) return; S.recipes = S.recipes.filter((r) => r.id !== e.id); ui.detail = null; commit(); },
  srcOk: (e) => { S.sources[+e.i].status = 'ok'; commit(); },
  srcBan: (e) => { S.sources[+e.i].status = 'banned'; commit(); },
  srcDel: (e) => { S.sources.splice(+e.i, 1); commit(); },
  srcAdd: () => {
    const n = val('srcName').trim();
    if (!n) return;
    if (L.isBannedSource(n)) { say('Tento zdroj je zakázaný.'); return render(); }
    S.sources.push({ name: n, status: 'pending' }); ui.f.srcName = ''; commit();
  },
  adults: (e) => { S.settings.adults = Math.max(1, S.settings.adults + +e.d); commit(); },
  gap: (e) => { S.settings.gap = Math.max(0, Math.min(30, S.settings.gap + +e.d)); commit(); },
  kidOn: (e) => { const k = S.settings.kids[+e.i]; k.on = !k.on; commit(); },
  kidDel: (e) => { S.settings.kids.splice(+e.i, 1); commit(); },
  kidAdd: () => { S.settings.kids.push({ age: 10, on: true }); commit(); },
  blAdd: () => { addUnique(S.blacklist, val('blText').split(/[,;\n]/).map((x) => x.trim().toLowerCase())); ui.f.blText = ''; ui.sugg = null; commit(); },
  blDel: (e) => { S.blacklist.splice(+e.i, 1); commit(); },
  prAdd: () => { addUnique(S.principles, [val('prText').trim()]); ui.f.prText = ''; commit(); },
  prDel: (e) => { S.principles.splice(+e.i, 1); commit(); },
  backup: async () => { try { await navigator.clipboard.writeText(JSON.stringify(S)); say('Záloha zkopírována do schránky.', true); } catch { say('Kopírování se nepovedlo.'); } render(); },
  restore: () => {
    try { const o = JSON.parse(val('restore')); if (!o || !Array.isArray(o.recipes)) throw new Error(); S = { ...store.defaultState(), ...o }; ui.f.restore = ''; say('Obnoveno.', true); commit(); }
    catch { say('Záloha není platná.'); render(); }
  },
  login: async () => {
    const { error } = await store.signIn(val('email').trim());
    say(error ? `Přihlášení selhalo: ${error.message}` : 'Odkaz je na cestě do e-mailu. Otevřete ho na tomto telefonu.', !error); render();
  },
  logout: async () => { await store.signOut(); render(); },
  hhCreate: async () => { try { await store.createHousehold('Domácnost'); store.save(S); await pushNow(); say('Domácnost vytvořena. Kód pošlete rodině.', true); } catch (e) { say('Nepovedlo se: ' + e.message); } render(); },
  hhJoin: async () => {
    try { await store.joinHousehold(val('joinCode')); const r = await store.pull(); if (r) S = r; else store.save(S); say('Připojeno.', true); } catch (e) { say('Nepovedlo se: ' + e.message); }
    render();
  },
  pull: async () => { const r = await store.pull(); if (r) { S = r; say('Načteno.', true); } render(); },
};
const pushNow = async () => { store.save(S); };

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const fn = actions[t.dataset.act];
  if (fn) fn({ ...t.dataset });
});
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.dataset.bind) ui.f[t.dataset.bind] = t.value;
  else if (t.dataset.draft) ui.draft[t.dataset.draft] = t.value;
  else if (t.dataset.kidage !== undefined) { S.settings.kids[+t.dataset.kidage].age = Math.max(1, +t.value || 1); store.save(S); }
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset.planMeal) ui.f['pm_' + t.dataset.planMeal] = t.checked;
  if (t.tagName === 'SELECT' && t.dataset.bind) ui.f[t.dataset.bind] = t.value;
});
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && store.hasHousehold() && !ui.draft) { const r = await store.pull(); if (r) { S = r; render(); } }
});

// ---------- start ----------
(async () => {
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (CONFIG.supabaseUrl) {
    try {
      await store.initSync();
      if (store.hasHousehold()) { const r = await store.pull(); if (r) S = r; }
      render();
    } catch { /* offline: běží lokálně */ }
  }
})();

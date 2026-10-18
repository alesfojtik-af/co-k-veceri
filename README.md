# Co k večeři

Mobilní PWA pro rodinu: navrhne jídlo (oběd, svačina, večeře, koláč) ze zásob, hlídá pauzu mezi stejnými jídly, plánuje až 4 dny dopředu a z plánu udělá nákupní seznam. Bez build kroku (čisté ES moduly), hostuje se na GitHub Pages.

## Pravidla zabudovaná v aplikaci
- Žádné vymýšlení receptů. Sbírka je prázdná; recepty se diktují a před uložením se potvrdí.
- Zdroj Jiří Babica je zakázaný (recept s ním se neuloží).
- Košík na Rohlíku se nepřipravuje; seznam se jen kopíruje.
- Výživové cíle zatím nejsou v aplikaci (chybí čísla a data z receptů), přijde v další verzi.
- Webové zdroje se v první verzi nestahují.

## Spuštění bez Supabase
Otevřít stránku. Data jsou jen v tomto telefonu (localStorage). V Nastavení je záloha do schránky.

## Zapnutí GitHub Pages
Repozitář musí být veřejný (zdarma). Settings > Pages > Source: Deploy from a branch > `main` / `/ (root)`. Adresa: `https://alesfojtik-af.github.io/co-k-veceri/`.

## Sdílení v rodině (Supabase, existující projekt)
1. SQL Editor: vložit a spustit `supabase/schema.sql`. Vzniknou jen tabulky `cv_*` a funkce `cv_*`, nic stávajícího se nemění.
2. Authentication > URL Configuration: Site URL a Redirect URL nastavit na adresu Pages (výše).
3. Settings > API: zkopírovat Project URL a `anon` klíč do `config.js`. Service role klíč nikdy.
4. Commit a push. V aplikaci Nastavení > Sdílení: e-mail, odkaz z e-mailu, „Vytvořit domácnost“, kód předat rodině.

Pozn.: všechna data domácnosti jsou jeden dokument, poslední uložení vyhrává. Pro rodinu stačí, při souběžné editaci dvou lidí se může jedna změna ztratit.

## Vývoj
`node --test tests/logic.test.mjs` spustí testy logiky. Lokálně: `python3 -m http.server`.

## Stažené recepty
`node scripts/scrape.mjs --per-site 5` (Node 18+, bez závislostí) projde zdroje ze `scripts/sources.json`, přečte strukturovaná data receptu (schema.org JSON-LD), respektuje `robots.txt`, čeká 2 s mezi dotazy a zapíše `recepty-stazene.json` + `recepty-stazene-report.json` (co se povedlo, co ne). Aplikace soubor sama načte; recepty jsou označené „stažený“ s odkazem na původní stránku. Po úpravě se recept uloží jako „vlastní“. Druh jídla se bere jen z kategorií webu; bez kategorie se recept nenavrhuje. Čerstvost surovin určují pravidla v `scripts/lib.mjs`, nejisté jsou označené `null` a počítají se jako nutné mít doma.

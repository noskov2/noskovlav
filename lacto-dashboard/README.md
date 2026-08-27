# Lacto Dashboard

Aplicație de analiză managerială și raportare pentru Lacto Solomonescu — locală,
în browser, fără backend. Datele sunt stocate persistent în IndexedDB (Dexie.js).

Acest folder conține **Etapa 1 (fundația)** din planul de implementare al
specificației complete (import Excel, mapare coloane, validare, salvare în
IndexedDB, istoric importuri, detectare fișier duplicat). Etapele următoare
(nomenclator clienți/produse + fuzzy matching, motorul de analiză, rapoartele,
report builder, export Excel, backup) urmează în iterații separate — vezi
„Ce urmează" mai jos.

## Rulare

```bash
npm install
npm run dev       # http://localhost:5173
```

Build de producție (fișiere statice, fără server):

```bash
npm run build      # generează dist/
npm run preview    # servește build-ul local pentru verificare
```

`dist/` este static (HTML + JS + CSS) — poate fi deschis printr-un server
static simplu (ex. `python3 -m http.server` din `dist/`) sau găzduit oriunde.
Nu poate fi deschis direct din `file://` (limitare browser pentru module
JS + Web Workers), dar nu necesită niciun backend sau bază de date externă.

> Notă: cerința inițială preferă un singur fișier HTML standalone. Din cauza
> parsării Excel pe Web Worker (necesară ca interfața să nu îngheață la
> fișiere mari), build-ul actual produce câteva fișiere statice în loc de unul
> singur. Dacă un singur `.html` e strict necesar, se poate adăuga ulterior
> `vite-plugin-singlefile` (inline worker via blob) — nu a fost prioritizat
> în Etapa 1.

## Ce funcționează acum

- **Import date** (`/import`): drag & drop sau selector de fișiere pentru cele
  4 surse Mentor (REȚELE MARI, MAGAZINE PROPRII, DISTRIBUȚIE, DISTRIBUȚIE 2),
  cu:
  - detectare automată a anteturilor + wizard de mapare a coloanelor;
  - mapare memorată automat pentru importurile viitoare cu aceeași structură;
  - validare rânduri (client/produs/dată obligatorii);
  - normalizare numere (virgulă/punct zecimal) și date (dd.mm.yyyy, dd/mm/yyyy,
    serial Excel);
  - standardizare canal (DISTRIBUȚIE 2 → DISTRIBUȚIE, cu sursa originală
    păstrată separat);
  - parsare + validare pe Web Worker, deci interfața nu se blochează;
  - detectarea fișierelor deja importate (hash pe conținut), cu opțiunile
    Anulează / Importă oricum / Înlocuiește importul precedent.
- **Istoric importuri** (`/importuri`): listă batch-uri, vizualizare/descărcare
  (CSV) a rândurilor respinse, ștergere completă a unui batch fără să afecteze
  celelalte luni.

Testat cu date sintetice: 100.000 rânduri într-un singur fișier (fără
blocarea interfeței), import duplicat detectat corect, parsare numere cu
virgulă zecimală validată. Vezi `scripts/dev/`.

Restul paginilor din sidebar (Dashboard, Analize, Rapoarte, Nomenclatoare
etc.) sunt marcate „curând" — intenționat nefuncționale încă, pentru a nu
avea butoane decorative.

## Testare / date sintetice

```bash
npm run fixtures:gen   # generează xlsx de test în scripts/dev/fixtures (ignorat de git)
npm run dev            # într-un terminal separat, pe portul implicit al scriptului (5183)
npm run test:smoke     # rulează fluxul complet de import într-un Chromium headless
```

## Arhitectură

```
src/
  types/            tipuri de domeniu (tranzacție, batch import, mapare coloane)
  lib/               utilitare pure: formate RO (numere/date), hash
  db/                schema Dexie (IndexedDB)
  import/            fields.ts (câmpuri standard + auto-detect mapare),
                      importEngine.ts (orchestrare pe main thread), stages.ts
  workers/           importWorker.ts — parsare Excel + validare + normalizare
  components/        Sidebar, Layout, FileDropZone, ColumnMappingModal, DuplicateFileDialog
  pages/             ImportPage, ImportHistoryPage
```

Schema `transactions` din IndexedDB include deja câmpurile pentru identificarea
canonică a clienților/produselor (`canonicalClientId`, `canonicalProductId`),
dar acestea rămân `null` până la Etapa 2 (nomenclator + fuzzy matching) —
nu există încă unificare automată a denumirilor de clienți.

## Ce urmează (Etapele 2-6 din specificație)

2. Nomenclator clienți/produse, aliasuri, fuzzy matching, coadă de verificare.
3. Motor de analiză: perioade, filtre globale, comparații, agregări precompute.
4. Rapoartele principale (Dashboard, Canale, Categorii, Clienți, Produse, Lunar, Preț, Sezonalitate).
5. Analytics avansat (Client 360°, Produs 360°, Pareto, ABC, clienți noi/pierduți, cross-sell, alerte).
6. Report builder, export Excel, backup/restore, calitatea datelor.

# Lacto Dashboard

Aplicație de analiză managerială și raportare pentru Lacto Solomonescu — locală,
în browser, fără backend. Datele sunt stocate persistent în IndexedDB (Dexie.js).

Acest folder conține **Etapele 1-3** din planul de implementare al specificației
complete: fundația (import Excel, validare, salvare), nomenclatoarele de
clienți/produse cu fuzzy matching, și motorul de analiză (perioade, filtre,
agregări) cu un Dashboard funcțional. Etapele următoare (restul rapoartelor,
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
> `vite-plugin-singlefile` (inline worker via blob) — nu a fost prioritizat încă.

## Ce funcționează acum

**Dashboard** (`/dashboard`, pagina implicită): KPI-uri calculate din datele
reale importate (total vânzări/cantitate, nr. tranzacții, clienți/produse
active, mediile pe lună/client/tranzacție/produs, preț mediu, creștere față
de perioada de comparație), top canal/client/produs/categorie, cea mai
bună/slabă lună, grafic de evoluție lunară și grafic pe canale. Filtrabil
după perioadă (cu preseturile din spec §13 și comparație), canal, client,
produs, categorie — toate multi-select. Fără date hardcodate: dacă nu există
încă niciun import, sau filtrele nu găsesc nimic, apare starea goală
corespunzătoare, nu un mockup.

**Import date** (`/import`): drag & drop sau selector de fișiere pentru cele
4 surse Mentor (REȚELE MARI, MAGAZINE PROPRII, DISTRIBUȚIE, DISTRIBUȚIE 2), cu:
- detectare automată a anteturilor + wizard de mapare a coloanelor, memorată
  automat pentru importurile viitoare cu aceeași structură;
- validare (client/produs/dată obligatorii), normalizare numere (virgulă/punct
  zecimal) și date (dd.mm.yyyy, dd/mm/yyyy, serial Excel);
- standardizare canal (DISTRIBUȚIE 2 → DISTRIBUȚIE, sursa originală păstrată);
- **identificare automată client/produs** (cod Mentor → CUI → alias confirmat
  → nume normalizat exact → propunere fuzzy — spec §5), pe Web Worker, deci
  interfața nu se blochează nici la 100.000+ rânduri;
- detectarea fișierelor deja importate (hash pe conținut), cu opțiunile
  Anulează / Importă oricum / Înlocuiește importul precedent.

**Istoric importuri** (`/importuri`): listă batch-uri, vizualizare/descărcare
(CSV) a rândurilor respinse, ștergere completă a unui batch fără să afecteze
celelalte luni.

**Potriviri clienți** (`/potriviri-clienti`): coada de verificare (spec §7) —
denumiri de clienți fără o potrivire sigură, cu candidați propuși (scor
0-100%) și acțiunile Este X / Creează client nou / Ignoră / Nu mai propune.
Fuzzy matching-ul NU unește niciodată automat pe bază de scor (spec §38) —
doar cod Mentor, CUI, alias deja confirmat sau nume normalizat identic produc
o asociere automată.

**Nomenclator clienți** (`/nomenclator-clienti`): clienți canonici, aliasuri
(adăugare/mutare/ștergere), merge între doi clienți (cu jurnal de audit),
editare cod Mentor/CUI.

**Nomenclator produse** (`/nomenclator-produse`): produse canonice, cod
Mentor, categorie (creabilă din mers), unitate de măsură, activ/inactiv,
aliasuri.

Restul paginilor din sidebar (Alerte, Analize, Rapoarte, Calitatea datelor
etc.) sunt marcate „curând" — intenționat nefuncționale încă, pentru a nu
avea butoane decorative.

### Fuzzy matching — cum funcționează

Algoritmul (`src/lib/fuzzy.ts`) combină Jaro-Winkler, Levenshtein și
similaritate pe tokeni (insensibilă la ordine, cu potrivire "soft" per-token
pentru denumiri cu un singur cuvânt). Formele juridice (SRL/SA/SC) sunt
ignorate la scor. Pragul minim pentru a propune un candidat e 60% — calibrat
astfel încât retaileri clar diferiți (ex. KAUFLAND vs. AUCHAN) să NU treacă
pragul, dar variante reale ale aceluiași client (ANABELA/ANABELLA
SRL/ANABELLA IMPEX) să fie propuse.

La un prim import, denumirile noi se compară și între ele în cadrul aceluiași
fișier (nu doar cu nomenclatorul deja existent) — altfel ANABELLA, ANABELA și
ANABELLA SRL ar deveni fiecare un client nou separat, fără nicio propunere,
pur și simplu pentru că nomenclatorul era gol la începutul importului.

## Testare / date sintetice

```bash
npm run fixtures:gen           # genereaza xlsx de test in scripts/dev/fixtures (ignorat de git)
npm run dev                    # intr-un terminal separat, pe portul implicit al scriptului (5183)
npm run test:smoke             # fluxul complet de import (Etapa 1) intr-un Chromium headless
npm run test:client-matching   # scenariul din spec §41: variante ANABELLA nu se unesc automat
npm run test:dashboard         # Etapa 3: KPI-urile Dashboard-ului corespund exact datelor importate
```

## Arhitectură

```
src/
  types/            tipuri de domeniu (tranzacție, client, produs, coadă verificare...)
  lib/               utilitare pure: formate RO, hash, fuzzy matching, perioade, KPI
  db/                schema Dexie (IndexedDB, v2)
  import/            fields.ts, matching.ts (motor identificare), importEngine.ts, stages.ts
  workers/           importWorker.ts — parsare + validare + normalizare + identificare
  nomenclature/      clientService.ts, productService.ts — CRUD Dexie pentru nomenclatoare
  analytics/         filters.ts (model filtre globale), aggregate.ts (motor de agregare)
  components/        Sidebar, Layout, FileDropZone, ColumnMappingModal, DuplicateFileDialog,
                     PeriodSelector, MultiSelectFilter, KpiCard
  pages/             DashboardPage, ImportPage, ImportHistoryPage, ClientMatchQueuePage,
                     ClientNomenclaturePage, ProductNomenclaturePage
```

Identificarea la import e în doi timpi, ca lucrul greu să rămână în worker
fără să blocheze UI: worker-ul citește fișierul, calculează pentru fiecare
denumire distinctă (memoizat) o rezoluție — client existent, denumire nouă,
sau candidat ambiguu — pe baza unui snapshot al nomenclatorului trimis de pe
main thread; apoi main thread-ul creează clienții/produsele noi și
actualizează coada de verificare în Dexie, trimite înapoi id-urile reale, iar
worker-ul finalizează și trimite rândurile complete spre salvare, în chunk-uri.

### Motorul de analiză — cum funcționează

`analytics/aggregate.ts` interoghează `transactions` folosind indexul pe
`date` pentru a restrânge rapid la perioada selectată, apoi aplică restul
filtrelor și calculează toate agregările (KPI + breakdown pe canal/client/
produs/categorie/lună) într-un singur pass în memorie. La sute de mii de
rânduri asta rămâne suficient de rapid pentru un dashboard (sub o secundă
într-un browser real — acest sandbox de dezvoltare are IndexedDB vizibil mai
lent decât o mașină obișnuită). Agregările precompute zilnice/lunare cerute
de spec §34 pentru scala de milioane de rânduri **nu sunt construite încă** —
rămân de adăugat quando volumul real o cere.

## Ce urmează (Etapele 4-6 din specificație)

4. Restul rapoartelor principale (Canale, Categorii, Clienți, Produse, Lunar, Preț, Sezonalitate) — Dashboard-ul din Etapa 3 acoperă deja partea de KPI-uri/top-uri.
5. Analytics avansat (Client 360°, Produs 360°, Pareto, ABC, clienți noi/pierduți, cross-sell, matrice creștere, alerte).
6. Report builder, export Excel, backup/restore, calitatea datelor.

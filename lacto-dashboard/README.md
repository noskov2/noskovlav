# Lacto Dashboard

Aplicație de analiză managerială și raportare pentru Lacto Solomonescu — locală,
în browser, fără backend. Datele sunt stocate persistent în IndexedDB (Dexie.js).

Acest folder conține **Etapele 1-6** din planul de implementare al specificației
complete: fundația (import Excel, validare, salvare), nomenclatoarele de
clienți/produse cu fuzzy matching, motorul de analiză (perioade, filtre,
agregări) cu un Dashboard funcțional, rapoartele principale pe dimensiune
(Canale, Categorii, Clienți, Produse, Analiză lunară, Sezonalitate, Prețuri),
analytics avansat (Client 360°, Produs 360°, Pareto/ABC, dinamica
clienților, matrice creștere, cross-sell, risc de concentrare, alerte) și
setul final (calitatea datelor, Generator de rapoarte pe orice dimensiune,
rapoarte salvate, export Excel/Executive Report, backup/restore). Toate cele
6 etape din roadmap-ul specificației sunt complete.

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

**Rapoartele pe dimensiune** (spec §16), toate cu filtre globale, comparație
și tabel sortabil/filtrabil:
- **Canale** (`/canale`), **Categorii** (`/categorii`), **Clienți** (`/clienti`),
  **Produse** (`/produse`, cu coloană Categorie): valoare, cantitate,
  tranzacții, clienți/produse distincte, preț mediu, pondere, diferență %
  față de perioada de comparație.
- **Analiză lunară** (`/analiza-lunara`): evoluție lună de lună cu diferență
  față de luna precedentă din interval.
- **Sezonalitate** (`/sezonalitate`): pivot lună × categorie/produs/canal
  (alegere), cu coeficient de variație și trend (crescător/descrescător/stabil).
- **Prețuri** (`/preturi`): preț mediu ponderat pe canal/client/categorie/produs
  și modificarea lui față de perioada de comparație.

**Analytics avansat** (spec §17-27):
- **Client 360°** (`/clienti/:id`, accesibil apăsând un client din Analiză clienți):
  KPI-uri complete (vânzări, comenzi, valoare medie comandă, prima/ultima
  achiziție, frecvență medie, evoluție YoY), evoluție lunară, top produse/
  categorii, produse noi/pierdute și categorii în creștere/scădere față de
  perioada de comparație.
- **Produs 360°** (`/produse/:id`, din Analiză produse): vânzări, clienți
  activi, preț min/median/mediu ponderat/max, top clienți/canale, evoluție
  lunară, pondere în total companie, clienți care au încetat să-l cumpere.
- **Pareto / ABC** (`/pareto`): ce % din vânzări vine din Top 5/10/20/50
  (clienți sau produse), câți clienți/produse generează 50/70/80/90% din
  vânzări, clasificare ABC cu filtrare pe clasă.
- **Dinamica clienților** (`/dinamica-clienti`): clienți noi, pierduți,
  reactivați, activi, în creștere/scădere, cu prag ajustabil.
- **Matrice creștere** (`/matrice-crestere`): scatter valoare × creștere %,
  patru cadrane (client mare/mic × creștere/scădere).
- **Risc de concentrare** (`/risc-concentrare`): pondere Top 1/5/10/20,
  indice Herfindahl-Hirschman, clienți peste 5% din cifra de afaceri.
- **Cross-sell / White space** (`/cross-sell`): pentru un client ales, ce
  cumpără și ce cumpără clienți similari (același canal principal) dar el nu.
- **Outlieri preț** (`/outlieri-pret`): pentru un produs ales, prețul plătit
  de fiecare client față de media ponderată, cu outlierii marcați.
- **Alerte & Insight-uri** (`/alerte`): semnale calculate din date — clienți
  în creștere/scădere semnificativă, clienți inactivi de peste 45 zile,
  produse care pierd clienți, canalul care generează cea mai mare parte din
  creștere, prețuri sub media produsului. Nimic hardcodat.

**Calitatea datelor** (`/calitatea-datelor`): scor 0-100 calculat pe toate
tranzacțiile/nomenclatoarele din baza de date (nu doar perioada filtrată) —
clienți/produse neidentificate, cantități/valori zero sau negative, rânduri
duplicate, produse fără categorie, perechi client/produs posibil duplicate
(fuzzy, prag mai strict decât la import), luni lipsă din interval, importuri
cu conținut identic. Fiecare problemă e o listă concretă, nu doar un număr.

**Generator de rapoarte** (`/generator-raport`, spec §29): dimensiune la
alegere (client/produs/categorie/canal/lună/județ/localitate/agent — inclusiv
cele fără nomenclator propriu, grupate direct pe textul brut din tranzacție),
indicatori comutabili individual (Valoare/Cantitate/Tranzacții/Clienți/Preț
mediu/Pondere/Diferență/Diferență %) și Top N (Toate/Top5/10/20/50/Bottom10).
Nu e un raport fix — motorul `analytics/genericBreakdown.ts` calculează orice
combinație cerută.

**Rapoarte salvate** (`/rapoarte-salvate`, spec §30): preseturi complete
(dimensiune + filtre + indicatori + Top N) salvate din Generator, redeschise
cu configurația exactă restaurată.

**Export Excel** (spec §31): din Generator, „Exportă Excel" descarcă exact
tabelul afișat; „Executive Report" (buton propriu sau pagina dedicată
`/executive-report`) generează un singur `.xlsx` multi-sheet (Rezumat, Canale,
Categorii, Clienți, Produse, Evoluție lunară, Alerte) pentru perioada
selectată. Ediția community a `xlsx` nu suportă stilizare de celule la
scriere — coloanele monetare/procentuale sunt numere simple, fără culori
condiționate, o limitare documentată, nu simulată.

**Backup / Restore** (`/backup`, spec §32): export JSON cu toate tabelele
Dexie (generic, prin `db.tables` — nicio tabelă nouă nu e omisă din greșeală);
restaurarea golește și repopulează totul într-o singură tranzacție Dexie,
păstrând id-urile originale (relațiile dintre tabele rămân valide), urmată de
reîncărcarea paginii pentru o stare curată peste tot.

Două intrări din sidebar („Vânzări" în ANALIZE, „Setări" în SISTEM) rămân
marcate „curând" — nu corespund niciunei secțiuni numerotate din roadmap-ul
celor 6 etape, așa că sunt lăsate intenționat nefuncționale (disabled, fără
navigare) în loc de butoane decorative care ar părea să ducă undeva.

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
npm run test:reports           # Etapa 4: sumele din Canale/Categorii/Clienți/Produse corespund cu Dashboard-ul
npm run test:advanced          # Etapa 5: Client 360°/Produs 360°/Pareto/Dinamica/Matrice/Alerte/Cross-sell/Outlieri se încarcă fără erori
npm run test:data-quality      # Etapa 6: scor + probleme reale, pe bază goală și cu date
npm run test:report-builder    # Etapa 6: toate cele 8 dimensiuni, comutare indicatori, Top N
npm run test:saved-reports     # Etapa 6: salvare → listă → deschidere cu restaurare exactă → ștergere
npm run test:excel-export      # Etapa 6: descarcă și citește raportul curent + Executive Report
npm run test:backup-restore    # Etapa 6: backup → modifică starea → restaurare → verifică revenirea exactă
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
  analytics/         filters.ts, filterRows.ts (predicat comun de filtrare), aggregate.ts
                     (motor de agregare), genericBreakdown.ts (breakdown pe orice dimensiune,
                     folosit de Generatorul de rapoarte), compare.ts (diff vs. comparație),
                     seasonality.ts, clientProfile.ts, productProfile.ts, pareto.ts,
                     clientDynamics.ts, concentration.ts, crossSell.ts, priceOutliers.ts,
                     alerts.ts, dataQuality.ts, savedReportsService.ts
  export/            excelExport.ts — export raport curent + Executive Report (xlsx)
  backup/            backupService.ts — export/import JSON al tuturor tabelelor Dexie
  hooks/             useReportData.ts — stare comună (filtre + rezultat) pentru orice pagină de raport
  components/        Sidebar, Layout, FileDropZone, ColumnMappingModal, DuplicateFileDialog,
                     PeriodSelector, MultiSelectFilter, FilterBar, KpiCard, BreakdownTable, ReportShell
  pages/             DashboardPage, ChannelsPage, CategoriesPage, ClientsPage, ProductsPage,
                     MonthlyAnalysisPage, SeasonalityPage, PricesPage, ClientProfilePage,
                     ProductProfilePage, ParetoPage, ClientDynamicsPage, GrowthMatrixPage,
                     AlertsPage, ConcentrationRiskPage, CrossSellPage, PriceOutliersPage,
                     DataQualityPage, ReportBuilderPage, SavedReportsPage, ExecutiveReportPage,
                     BackupPage, ImportPage, ImportHistoryPage, ClientMatchQueuePage,
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

Toate paginile de raport împart aceeași stare (`hooks/useReportData.ts`) și
aceeași bară de filtre (`components/FilterBar.tsx`), ca „aplicația să
recalculeze instant raportul" la orice schimbare de filtru (spec §14), fără
cod duplicat între pagini.

### Analytics avansat — note de scop

„Dinamica clienților" definește *client nou* ca fiind activ acum, fără istoric
înainte de perioada de comparație; *reactivat* = la fel, dar cu istoric mai
vechi. Pragul de creștere/scădere semnificativă e ajustabil din UI (spec §19:
„permite ajustarea regulilor"). „Cross-sell" e scopat la un singur client
(varianta acționabilă a matricei client×categorie din spec §23) — o matrice
completă client×produs pentru toți clienții deodată ar fi imposibil de citit
într-un tabel. „Matrice creștere" desparte clienții mari/mici la mediana
valorii lor (spec nu specifică pragul exact).

## Stare finală

Toate cele 6 etape din roadmap-ul specificației sunt implementate și testate
end-to-end (Playwright, date sintetice, inclusiv un import de 100.000 de
rânduri). Ce rămâne intenționat neconstruit, documentat mai sus unde e cazul:
agregările precompute zilnice/lunare (spec §34, pentru scala de milioane de
rânduri), stilizarea condiționată a celulelor la exportul Excel (limitare a
ediției community a `xlsx`), și cele două intrări de sidebar fără o secțiune
numerotată corespunzătoare în roadmap („Vânzări", „Setări").

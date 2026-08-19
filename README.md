# PECO Dashboard

Aplicație web pentru managementul și analiza unei stații PECO: import periodic de
Excel-uri cu vânzări/achiziții din softul stației, statistici actualizate automat,
și module dedicate de analiză (vânzare slabă, performanță zilnică, profitabilitate,
cross-sell & performanța casierilor, furnizori & evoluția prețurilor).

## Pornire locală

```bash
npm install
npm run dev
```

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- Dexie (IndexedDB) pentru stocare locală, persistentă între sesiuni
- SheetJS (`xlsx`) pentru citirea fișierelor Excel
- Recharts pentru grafice
- Zustand pentru state global (filtre, date, drill-down)
- React Router pentru navigare

## Structura codului

```
src/
  types/domain.ts        Tipuri de domeniu (Tranzacție, Produs, Casier, ...)
  data/                   Schema IndexedDB (Dexie) + repository-uri (CRUD/query)
  import/                 Parsare Excel, mapare coloane, import vânzări/achiziții
  processing/             Normalizare: tură din oră, alias casier/produs, euristici grupuri
  kpi/                    Calcule pure de KPI (filtre, agregări, profitabilitate, cross-sell...)
  store/                  Zustand: date din DB, filtre globale, drill-down modal
  components/             UI reutilizabil (KPI card, tabel sortabil, grafice, filtre, modal)
  pages/                  Un modul din meniul principal per fișier/folder
```

Stratul de stocare (`src/data`) este izolat de restul aplicației prin funcții de
repository — poate fi înlocuit ulterior cu un backend/bază de date server fără a
schimba logica de import, procesare sau calcul KPI.

## Module

1. **Dashboard** — rezumat perioadă + insight-uri generate automat.
2. **Import date** — import Excel cu mapare de coloane configurabilă (se memorează).
3. **Vânzare slabă** — produse cu vânzări slabe/fără vânzare, bani blocați în stoc.
4. **Zi de vânzare** — orice zi din calendar, pe tură/casier, cu comparații automate.
5. **Profitabilitate** — marjă/profit pe produs și categorie, clasamente.
6. **Cross-sell & Casieri** — carburant+marfă, cafea, dulciuri vitrină, sandwich-uri,
   limonade/ceaiuri, scor general per casier.
7. **Furnizori & Prețuri** — evoluția prețului de achiziție, comparație furnizori.
8. **Nomenclator** — produse (categorie, prețuri, grupuri speciale), casieri, alias-uri.
9. **Setări** — ture, mapare coloane salvată.

Datele sunt salvate local, în IndexedDB, în acest browser, și rămân disponibile
după refresh.

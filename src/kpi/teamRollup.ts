// Only NO_TEAM_ID survives here — productAnalysisData.ts's "Analiza Produse"
// Excel report still uses it as the bucket key for cashiers with no team
// assigned (via Cashier.teamHistory, resolved per-transaction date). The
// row-rollup that used to live in this file (computeTeamRollup, grouping by
// Cashier.teamId) was removed: it attributed sales to whichever team the
// CASHIER currently belongs to, but employees swap shifts informally, so
// that could disagree with which team was actually rostered for a given
// date+tură. Cross-sell & Casieri's "Pe echipă" view and the Dashboard's
// Clasament echipe now use computePontajTeamReport (@/kpi/pontajTeamReport)
// instead, which attributes sales by the pre-set schedule (pontaj) on the
// Target page — the source of truth for "which team worked this shift".
export const NO_TEAM_ID = '__no-team__'

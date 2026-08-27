import type { ImportStage } from '../types'

export const STAGE_LABELS: Record<ImportStage, string> = {
  citire: 'Citire fișier',
  validare: 'Validare',
  normalizare: 'Normalizare',
  'identificare-clienti': 'Identificare clienți',
  salvare: 'Salvare',
  'recalculare-agregari': 'Recalculare agregări',
  finalizat: 'Finalizat',
  eroare: 'Eroare',
}

export const STAGE_ORDER: ImportStage[] = [
  'citire',
  'normalizare',
  'identificare-clienti',
  'salvare',
  'recalculare-agregari',
  'finalizat',
]

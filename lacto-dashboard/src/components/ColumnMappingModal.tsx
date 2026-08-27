import { useState } from 'react'
import { STANDARD_FIELDS } from '../import/fields'
import { sourceFileLabel } from '../types'
import type { SourceFileType, StandardFieldId } from '../types'

interface Props {
  sourceFileType: SourceFileType
  headers: string[]
  sample: unknown[][]
  suggestion: Partial<Record<StandardFieldId, string>>
  onConfirm: (mapping: Partial<Record<StandardFieldId, string>>) => void
  onCancel: () => void
}

const NONE = '__NONE__'

export function ColumnMappingModal({ sourceFileType, headers, sample, suggestion, onConfirm, onCancel }: Props) {
  const [mapping, setMapping] = useState<Partial<Record<StandardFieldId, string>>>(suggestion)

  const missingRequired = STANDARD_FIELDS.filter((f) => f.required && !mapping[f.id])

  function setField(id: StandardFieldId, header: string) {
    setMapping((prev) => {
      const next = { ...prev }
      if (header === NONE) {
        delete next[id]
      } else {
        next[id] = header
      }
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-white dark:bg-slate-900 shadow-xl p-6">
        <h2 className="text-lg font-semibold mb-1">Mapare coloane — {sourceFileLabel(sourceFileType)}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Am detectat automat anteturile. Verifică sau corectează maparea; va fi memorată pentru
          importurile viitoare cu aceeași structură.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {STANDARD_FIELDS.map((field) => (
            <div key={field.id} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {field.label}
                {field.required && <span className="text-rose-500"> *</span>}
              </label>
              <select
                className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
                value={mapping[field.id] ?? NONE}
                onChange={(e) => setField(field.id, e.target.value)}
              >
                <option value={NONE}>— nemapat —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {sample.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Previzualizare date</div>
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
              <table className="text-xs w-full">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="px-2 py-1 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sample.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      {headers.map((_, ci) => (
                        <td key={ci} className="px-2 py-1 whitespace-nowrap">
                          {String(row[ci] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {missingRequired.length > 0 && (
          <div className="mb-4 text-sm text-rose-600 dark:text-rose-400">
            Câmpuri obligatorii nemapate: {missingRequired.map((f) => f.label).join(', ')}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            onClick={onCancel}
          >
            Anulează
          </button>
          <button
            className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={missingRequired.length > 0}
            onClick={() => onConfirm(mapping)}
          >
            Confirmă maparea
          </button>
        </div>
      </div>
    </div>
  )
}

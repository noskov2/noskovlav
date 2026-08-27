import { useRef, useState } from 'react'

interface Option {
  value: string
  label: string
}

interface Props {
  label: string
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
}

/** Filtru multi-select generic (spec §14: „Toate selecțiile trebuie să accepte MULTI-SELECT"). */
export function MultiSelectFilter({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value))
    else onChange([...selected, value])
  }

  const summary = selected.length === 0 ? 'toate' : selected.length === 1 ? options.find((o) => o.value === selected[0])?.label : `${selected.length} selectate`

  return (
    <div className="relative" ref={ref}>
      <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>
      <button
        type="button"
        className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm min-w-[140px] text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {summary}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-64 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg min-w-[200px] p-1">
            {selected.length > 0 && (
              <button
                className="w-full text-left px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                onClick={() => onChange([])}
              >
                golește selecția
              </button>
            )}
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                {o.label}
              </label>
            ))}
            {options.length === 0 && <div className="px-2 py-1 text-xs text-slate-400">Nicio opțiune.</div>}
          </div>
        </>
      )}
    </div>
  )
}

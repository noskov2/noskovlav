import { useRef, useState } from 'react'
import type { DragEvent } from 'react'

interface Props {
  label: string
  disabled: boolean
  fileName?: string
  onFile: (file: File) => void
}

export function FileDropZone({ label, disabled, fileName, onFile }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer ${
        disabled
          ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-800'
          : dragOver
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950'
            : 'border-slate-300 dark:border-slate-700 hover:border-emerald-400'
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <div className="font-medium text-sm">{label}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        {fileName ?? 'Trage fișierul Excel aici sau apasă pentru a alege'}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

import { Link } from 'react-router-dom'

export function EmptyState({
  icon = '📥',
  title = 'Nicio dată încărcată încă',
  description = 'Mergi la modulul Import date pentru a încărca primul fișier Excel cu vânzări din softul stației.',
  actionTo = '/import',
  actionLabel = 'Mergi la Import',
}: {
  icon?: string
  title?: string
  description?: string
  actionTo?: string
  actionLabel?: string
}) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-4xl">{icon}</p>
      <h2 className="mt-3 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1.5 text-sm text-slate-500">{description}</p>
      {actionTo && (
        <Link
          to={actionTo}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600"
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  )
}

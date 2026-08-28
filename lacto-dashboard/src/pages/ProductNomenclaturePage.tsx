import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import {
  addProductAlias,
  createCategory,
  createProduct,
  deleteProductAlias,
  moveProductAlias,
  updateProduct,
} from '../nomenclature/productService'
import { formatNumber } from '../lib/ro-format'
import type { CategoryRecord, ProductAlias, ProductRecord } from '../types'

export function ProductNomenclaturePage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const products = useLiveQuery(() => db.products.toArray(), [])
  const categories = useLiveQuery(() => db.categories.orderBy('name').toArray(), [])
  const aliases = useLiveQuery(
    () => (selectedId !== null ? db.productAliases.where('productId').equals(selectedId).toArray() : Promise.resolve<ProductAlias[]>([])),
    [selectedId],
  )

  const filtered = (products ?? [])
    .filter((p) => p.canonicalName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'ro'))

  const selected = products?.find((p) => p.id === selectedId) ?? null
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c.name]))

  function categoryPath(product: ProductRecord): string {
    const catName = product.categoryId != null ? categoryById.get(product.categoryId) : undefined
    const subName = product.subcategoryId != null ? categoryById.get(product.subcategoryId) : undefined
    if (!catName) return ''
    return subName ? `${catName} › ${subName}` : catName
  }

  async function handleCreateProduct() {
    const name = prompt('Denumire produs nou:')
    if (!name?.trim()) return
    const id = await createProduct(name.trim())
    setSelectedId(id)
  }

  async function handleAddAlias() {
    if (!selected?.id) return
    const raw = prompt(`Adaugă alias pentru „${selected.canonicalName}":`)
    if (!raw?.trim()) return
    setBusy(true)
    try {
      await addProductAlias(selected.id, raw.trim())
    } finally {
      setBusy(false)
    }
  }

  async function handleMoveAlias(aliasId: number) {
    if (!products) return
    const targetName = prompt('Mută acest alias la produsul (denumire exactă):')
    if (!targetName?.trim()) return
    const target = products.find((p) => p.canonicalName.toLowerCase() === targetName.trim().toLowerCase())
    if (!target?.id) {
      alert('Nu am găsit un produs cu această denumire exactă.')
      return
    }
    setBusy(true)
    try {
      await moveProductAlias(aliasId, target.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Nomenclator produse</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Produse canonice, cod Mentor, categorie/subcategorie, unitate de măsură (§11). Denumirile noi apărute la
        import devin automat produse noi — le poți categoriza și corecta aici, sau{' '}
        <Link to="/import-catalog-produse" className="text-emerald-700 dark:text-emerald-400 hover:underline">
          importă catalogul complet dintr-un Excel
        </Link>
        .
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <div>
          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
              placeholder="Caută produs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="text-xs px-2 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={handleCreateProduct}
            >
              + produs
            </button>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg max-h-[60vh] overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                className={`block w-full text-left px-3 py-2 text-sm border-b border-slate-100 dark:border-slate-800 last:border-0 ${
                  p.id === selectedId ? 'bg-emerald-50 dark:bg-emerald-950' : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
                onClick={() => setSelectedId(p.id ?? null)}
              >
                <div>{p.canonicalName}</div>
                {categoryPath(p) && <div className="text-[11px] text-slate-400">{categoryPath(p)}</div>}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-sm text-slate-400">Niciun produs.</div>}
          </div>
        </div>

        <div>
          {!selected ? (
            <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
              Selectează un produs din listă.
            </div>
          ) : (
            <ProductDetail
              product={selected}
              categories={categories ?? []}
              aliases={aliases ?? []}
              busy={busy}
              onSave={(patch) => selected.id && updateProduct(selected.id, patch)}
              onCreateCategory={createCategory}
              onAddAlias={handleAddAlias}
              onDeleteAlias={(id) => deleteProductAlias(id)}
              onMoveAlias={handleMoveAlias}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ProductDetail({
  product,
  categories,
  aliases,
  busy,
  onSave,
  onCreateCategory,
  onAddAlias,
  onDeleteAlias,
  onMoveAlias,
}: {
  product: ProductRecord
  categories: CategoryRecord[]
  aliases: { id?: number; rawName: string; source: string }[]
  busy: boolean
  onSave: (patch: Partial<ProductRecord>) => void
  onCreateCategory: (name: string, parentId: number | null) => Promise<number>
  onAddAlias: () => void
  onDeleteAlias: (aliasId: number) => void
  onMoveAlias: (aliasId: number) => void
}) {
  const [name, setName] = useState(product.canonicalName)
  const [productCode, setProductCode] = useState(product.productCode ?? '')
  const [unit, setUnit] = useState(product.unit ?? '')

  const NONE = '__none__'
  const NEW = '__new__'

  const topCategories = categories.filter((c) => !c.parentId)
  const subcategories = product.categoryId != null ? categories.filter((c) => c.parentId === product.categoryId) : []

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs font-medium text-slate-500">Denumire canonică</label>
          <input
            className="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== product.canonicalName && onSave({ canonicalName: name.trim() })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Cod produs Mentor</label>
          <input
            className="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm mt-1"
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            onBlur={() => productCode !== (product.productCode ?? '') && onSave({ productCode: productCode || undefined })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Categorie</label>
          <select
            className="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm mt-1"
            value={product.categoryId ?? NONE}
            onChange={async (e) => {
              if (e.target.value === NEW) {
                const catName = prompt('Denumire categorie nouă:')
                if (!catName?.trim()) return
                const id = await onCreateCategory(catName.trim(), null)
                onSave({ categoryId: id, subcategoryId: null })
              } else if (e.target.value === NONE) {
                onSave({ categoryId: null, subcategoryId: null })
              } else {
                onSave({ categoryId: Number(e.target.value), subcategoryId: null })
              }
            }}
          >
            <option value={NONE}>— fără categorie —</option>
            {topCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW}>+ categorie nouă…</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Subcategorie</label>
          <select
            className="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm mt-1 disabled:opacity-50"
            value={product.subcategoryId ?? NONE}
            disabled={product.categoryId == null}
            onChange={async (e) => {
              if (product.categoryId == null) return
              if (e.target.value === NEW) {
                const subName = prompt('Denumire subcategorie nouă:')
                if (!subName?.trim()) return
                const id = await onCreateCategory(subName.trim(), product.categoryId)
                onSave({ subcategoryId: id })
              } else if (e.target.value === NONE) {
                onSave({ subcategoryId: null })
              } else {
                onSave({ subcategoryId: Number(e.target.value) })
              }
            }}
          >
            <option value={NONE}>— fără subcategorie —</option>
            {subcategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW}>+ subcategorie nouă…</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Unitate de măsură</label>
          <input
            className="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm mt-1"
            value={unit}
            placeholder="kg, buc, L…"
            onChange={(e) => setUnit(e.target.value)}
            onBlur={() => unit !== (product.unit ?? '') && onSave({ unit: unit || undefined })}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm mb-4">
        <input type="checkbox" checked={product.active} onChange={(e) => onSave({ active: e.target.checked })} />
        Activ
      </label>

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-slate-500">Aliasuri ({formatNumber(aliases.length)})</div>
        <button className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs disabled:opacity-50" disabled={busy} onClick={onAddAlias}>
          + adaugă alias
        </button>
      </div>
      <div className="border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-100 dark:divide-slate-800">
        {aliases.length === 0 && <div className="px-3 py-3 text-sm text-slate-400">Niciun alias.</div>}
        {aliases.map((a) => (
          <div key={a.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
            <span>
              {a.rawName} <span className="text-xs text-slate-400">({a.source === 'import-exact' ? 'din import' : 'manual'})</span>
            </span>
            <span className="flex gap-2 text-xs">
              <button className="text-slate-500 hover:underline disabled:opacity-50" disabled={busy} onClick={() => a.id && onMoveAlias(a.id)}>
                mută
              </button>
              <button className="text-rose-600 hover:underline disabled:opacity-50" disabled={busy} onClick={() => a.id && onDeleteAlias(a.id)}>
                șterge
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

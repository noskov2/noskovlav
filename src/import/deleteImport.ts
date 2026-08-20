import { deleteImportBatch } from '@/data/repo/importBatches'
import { deleteImportBatchTransactions } from '@/data/repo/transactions'
import { deleteImportBatchSupplierReceipts } from '@/data/repo/suppliers'
import {
  deleteImportBatchStockSnapshots,
  getLatestSnapshotForProduct,
  listStockSnapshotsByImportBatch,
} from '@/data/repo/stockSnapshots'
import { getProduct, upsertProduct } from '@/data/repo/products'
import type { ImportBatch } from '@/types/domain'

/**
 * Deletes every row a single import brought in, plus the batch record
 * itself. For a stock import this also rolls back the `currentStock`/
 * `salePrice` it set on each affected product: after removal, each product
 * is re-pointed at whichever remaining snapshot (if any) is now the latest
 * by `asOf`, so a deleted snapshot never leaves a stale value behind.
 */
export async function deleteImportBatchData(batch: ImportBatch): Promise<void> {
  if (batch.kind === 'sales') {
    await deleteImportBatchTransactions(batch.id)
  } else if (batch.kind === 'purchases') {
    await deleteImportBatchSupplierReceipts(batch.id)
  } else {
    const rows = await listStockSnapshotsByImportBatch(batch.id)
    const affectedProductIds = Array.from(new Set(rows.map((r) => r.productId)))
    await deleteImportBatchStockSnapshots(batch.id)

    for (const productId of affectedProductIds) {
      const product = await getProduct(productId)
      if (!product) continue
      const latest = await getLatestSnapshotForProduct(productId)
      await upsertProduct({
        ...product,
        currentStock: latest?.quantity ?? null,
        salePrice: latest?.salePrice ?? product.salePrice,
      })
    }
  }

  await deleteImportBatch(batch.id)
}

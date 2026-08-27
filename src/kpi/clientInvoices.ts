import type { Client, ClientInvoiceLine } from '@/types/domain'

export interface ClientSummary {
  client: Client
  invoiceCount: number
  totalValue: number
  creditCount: number
  creditValue: number
  lastInvoiceDate: string | null
}

// Only clients with at least one invoice in the given (already month-filtered)
// set show up — a client whose only invoices fall outside the selected month
// has nothing to say for that month, so it should disappear from the list
// rather than show a row of zeroes.
export function computeClientSummaries(clients: Client[], invoices: ClientInvoiceLine[]): ClientSummary[] {
  const byClient = new Map<string, ClientInvoiceLine[]>()
  for (const inv of invoices) {
    const list = byClient.get(inv.clientId)
    if (list) list.push(inv)
    else byClient.set(inv.clientId, [inv])
  }
  const summaries: ClientSummary[] = []
  for (const client of clients) {
    const lines = byClient.get(client.id)
    if (!lines || lines.length === 0) continue
    const creditLines = lines.filter((l) => l.onCredit)
    summaries.push({
      client,
      invoiceCount: lines.length,
      totalValue: lines.reduce((s, l) => s + l.value, 0),
      creditCount: creditLines.length,
      creditValue: creditLines.reduce((s, l) => s + l.value, 0),
      lastInvoiceDate: lines.reduce<string | null>((max, l) => (!max || l.date > max ? l.date : max), null),
    })
  }
  return summaries
}

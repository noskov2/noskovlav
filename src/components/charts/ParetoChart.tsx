import { Bar, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { formatLei, formatPct } from '@/lib/format'

export interface ParetoPoint {
  name: string
  value: number
  cumulativePct: number
}

export function ParetoChart({ data, height = 260 }: { data: ParetoPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="name" tick={false} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
        <YAxis
          yAxisId="value"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => formatLei(v)}
        />
        <YAxis
          yAxisId="pct"
          orientation="right"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          formatter={(v, key) => (key === 'cumulativePct' ? formatPct(Number(v)) : formatLei(Number(v)))}
          labelFormatter={(name) => String(name)}
          contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
        />
        <ReferenceLine yAxisId="pct" y={80} stroke="#d97706" strokeDasharray="4 4" />
        <Bar yAxisId="value" dataKey="value" fill="#1fa46c" radius={[3, 3, 0, 0]} />
        <Line yAxisId="pct" type="monotone" dataKey="cumulativePct" stroke="#d97706" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

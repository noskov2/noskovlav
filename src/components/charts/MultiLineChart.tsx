import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { formatNumber } from '@/lib/format'

export interface LineSeriesDef {
  key: string
  label: string
  color: string
  yAxisId?: 'left' | 'right'
}

export function MultiLineChart({
  data,
  series,
  xKey = 'ts',
  xTickFormatter,
  height = 260,
  yFormatter = (v: number) => formatNumber(v),
  rightYFormatter,
}: {
  data: Record<string, unknown>[]
  series: LineSeriesDef[]
  xKey?: string
  xTickFormatter: (v: unknown) => string
  height?: number
  yFormatter?: (v: number) => string
  rightYFormatter?: (v: number) => string
}) {
  const hasRight = series.some((s) => s.yAxisId === 'right')
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey={xKey}
          tickFormatter={xTickFormatter}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={{ stroke: '#e2e8f0' }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => yFormatter(v)}
        />
        {hasRight && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v: number) => (rightYFormatter ?? yFormatter)(v)}
          />
        )}
        <Tooltip
          formatter={(v, name) => {
            const def = series.find((s) => s.label === name)
            const fmt = def?.yAxisId === 'right' ? (rightYFormatter ?? yFormatter) : yFormatter
            return fmt(Number(v))
          }}
          labelFormatter={(v) => xTickFormatter(v)}
          contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line
            key={s.key}
            yAxisId={s.yAxisId ?? 'left'}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

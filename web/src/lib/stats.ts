// 统计汇总（纯函数，有单元测试）

/** 最近 n 个月的月份键，如 ['2026-06', …, '2026-11']（按北京时间的今天计算） */
export function recentMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number]
  const result: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i
    result.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`)
  }
  return result
}

export interface MonthlyRow {
  month: string
  count: number
  quantity: number
  revenue: number
}

/** 按月汇总换芯记录：次数、滤芯数量、费用 */
export function aggregateByMonth(
  rows: { replaced_on: string | null; quantity?: number | null; cost?: number | string | null }[],
  months: string[],
): MonthlyRow[] {
  const map = new Map(months.map((month) => [month, { month, count: 0, quantity: 0, revenue: 0 }]))
  for (const row of rows) {
    const bucket = row.replaced_on ? map.get(row.replaced_on.slice(0, 7)) : undefined
    if (!bucket) continue
    bucket.count++
    bucket.quantity += Number(row.quantity) || 1
    bucket.revenue += Number(row.cost) || 0
  }
  return months.map((m) => {
    const r = map.get(m)!
    return { ...r, revenue: Math.round(r.revenue * 100) / 100 }
  })
}

/** 按字段分组计数，降序；空值归为"未填" */
export function countBy<T>(rows: T[], key: (row: T) => string | null | undefined, limit = 10): { name: string; value: number }[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    const name = key(row) || '未填'
    map.set(name, (map.get(name) ?? 0) + 1)
  }
  const sorted = [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  if (sorted.length <= limit) return sorted
  const rest = sorted.slice(limit - 1).reduce((sum, r) => sum + r.value, 0)
  return [...sorted.slice(0, limit - 1), { name: '其他', value: rest }]
}

export const DUE_BUCKETS = [
  { key: 'overdue', label: '已超期', test: (d: number) => d < 0 },
  { key: 'week', label: '7 天内', test: (d: number) => d >= 0 && d <= 7 },
  { key: 'twoWeeks', label: '8–14 天', test: (d: number) => d >= 8 && d <= 14 },
  { key: 'month', label: '15–30 天', test: (d: number) => d >= 15 && d <= 30 },
  { key: 'twoMonths', label: '31–60 天', test: (d: number) => d >= 31 && d <= 60 },
  { key: 'later', label: '60 天以上', test: (d: number) => d > 60 },
] as const

/** 到期分布：每个时间段有多少台设备；没有日期的单独计数 */
export function dueDistribution(days: (number | null)[]): { label: string; value: number }[] {
  const result = DUE_BUCKETS.map((b) => ({ label: b.label, value: 0 }))
  let none = 0
  for (const d of days) {
    if (d === null || d === undefined) {
      none++
      continue
    }
    const index = DUE_BUCKETS.findIndex((b) => b.test(d))
    result[index]!.value++
  }
  return [...result, { label: '未设置日期', value: none }]
}

import { describe, expect, it } from 'vitest'
import { aggregateByMonth, countBy, dueDistribution, recentMonths } from './stats'

describe('recentMonths', () => {
  it('跨年', () => {
    expect(recentMonths('2026-02-15', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(recentMonths('2026-11-18', 1)).toEqual(['2026-11'])
  })
})

describe('aggregateByMonth', () => {
  it('按月汇总次数、数量、费用，忽略范围外和无日期', () => {
    const rows = [
      { replaced_on: '2026-10-03', quantity: 2, cost: '100.5' },
      { replaced_on: '2026-10-20', quantity: null, cost: 50 },
      { replaced_on: '2026-11-01', quantity: 1, cost: null },
      { replaced_on: '2025-01-01', quantity: 9, cost: 999 },
      { replaced_on: null, quantity: 1, cost: 1 },
    ]
    expect(aggregateByMonth(rows, ['2026-10', '2026-11'])).toEqual([
      { month: '2026-10', count: 2, quantity: 3, revenue: 150.5 },
      { month: '2026-11', count: 1, quantity: 1, revenue: 0 },
    ])
  })
})

describe('countBy', () => {
  it('降序、空值归为未填、超出部分合并为其他', () => {
    const rows = ['深圳', '深圳', '广州', '', '惠州', '珠海']
    expect(countBy(rows, (r) => r, 3)).toEqual([
      { name: '深圳', value: 2 },
      { name: '广州', value: 1 },
      { name: '其他', value: 3 },
    ])
  })
})

describe('dueDistribution', () => {
  it('分段计数', () => {
    expect(dueDistribution([-3, 0, 7, 8, 30, 31, 61, null]).map((b) => b.value)).toEqual([1, 2, 1, 1, 1, 1, 1])
  })
})

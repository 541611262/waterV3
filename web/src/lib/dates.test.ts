import { describe, expect, it } from 'vitest'
import {
  addDays,
  beijingDate,
  buildDate,
  daysBetween,
  daysUntil,
  excelSerialToDate,
  latestDate,
  parseFlexibleDate,
  toSheetDate,
  todayStr,
} from './dates'

describe('北京时间', () => {
  it('测试运行在与北京不同的时区', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Chicago')
  })

  it('美国晚上 = 北京第二天', () => {
    // 芝加哥 2026-11-17 19:30 = UTC 2026-11-18 01:30 = 北京 2026-11-18 09:30
    expect(todayStr(new Date('2026-11-18T01:30:00Z'))).toBe('2026-11-18')
    expect(beijingDate('2026-11-17T15:59:59Z')).toBe('2026-11-17')
    expect(beijingDate('2026-11-17T16:00:00Z')).toBe('2026-11-18')
  })
})

describe('日期计算', () => {
  it('加减天数跨月、跨年、闰年', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('', 5)).toBe('')
  })

  it('跨越美国夏令时切换日也是整天数', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
  })

  it('距今天数', () => {
    expect(daysUntil('2026-11-20', '2026-11-18')).toBe(2)
    expect(daysUntil('2026-11-15', '2026-11-18')).toBe(-3)
    expect(daysUntil('', '2026-11-18')).toBeNull()
  })

  it('取最晚日期，忽略空值和非法值', () => {
    expect(latestDate(['2024-01-01', '', null, '2025-06-01', 'abc', undefined])).toBe('2025-06-01')
    expect(latestDate([])).toBe('')
  })
})

describe('识别各种日期写法', () => {
  it.each([
    ['2011.9.9', '2011-09-09'],
    ['2012.03.02', '2012-03-02'],
    ['23.10.11', '2023-10-11'],
    ['2024-01-15', '2024-01-15'],
    ['2024/5/6', '2024-05-06'],
    ['2024年7月8日', '2024-07-08'],
    ['２０２４年７月８日', '2024-07-08'],
    ['20250620', '2025-06-20'],
    ['03/15/2025', '2025-03-15'],
    ['15/03/2025', '2025-03-15'],
    ['2025-01-15 10:30:00', '2025-01-15'],
    ['45693', '2025-02-05'],
  ])('%s → %s', (input, expected) => {
    expect(parseFlexibleDate(input)).toBe(expected)
  })

  it.each([['2023.13.45'], ['待定'], ['2023-02-30'], ['1970-01-01'], ['']])('无法识别：%s', (input) => {
    expect(parseFlexibleDate(input)).toBe('')
  })

  it('数字：Excel 序列号与 8 位数字', () => {
    expect(parseFlexibleDate(45693)).toBe('2025-02-05')
    expect(parseFlexibleDate(20250115)).toBe('2025-01-15')
    expect(excelSerialToDate(0)).toBe('')
  })

  it('非法的年月日组合', () => {
    expect(buildDate(2025, 2, 29)).toBe('')
    expect(buildDate(24, 2, 29)).toBe('2024-02-29')
  })

  it('导出为样板写法', () => {
    expect(toSheetDate('2011-09-09')).toBe('2011.09.09')
    expect(toSheetDate('')).toBe('')
  })
})

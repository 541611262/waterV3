import { describe, expect, it } from 'vitest'
import { describeDue, describeRemind, dialablePhones, formatMoney } from './format'
import { sanitizeKeyword } from '@/api/data'

describe('describeDue', () => {
  it('按天数分档', () => {
    expect(describeDue(null).level).toBe('none')
    expect(describeDue(-3)).toEqual({ level: 'overdue', text: '已超期 3 天', tag: 'danger' })
    expect(describeDue(0).level).toBe('today')
    expect(describeDue(7).level).toBe('week')
    expect(describeDue(8).level).toBe('month')
    expect(describeDue(30).level).toBe('month')
    expect(describeDue(31).level).toBe('normal')
  })
})

describe('describeRemind', () => {
  it('催款文字', () => {
    expect(describeRemind(null)).toBe('')
    expect(describeRemind(-2)).toBe('应催款（已过 2 天）')
    expect(describeRemind(0)).toBe('今日催款')
    expect(describeRemind(5)).toBe('5 天后催款')
  })
})

describe('formatMoney', () => {
  it('处理字符串金额与空值', () => {
    expect(formatMoney('1234.5')).toBe('¥1,234.5')
    expect(formatMoney(0)).toBe('¥0')
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney('abc')).toBe('—')
  })
})

describe('dialablePhones', () => {
  it('从混合文字中提取号码', () => {
    expect(dialablePhones('陈经理 13800001111 / 0755-12345678')).toEqual(['13800001111', '075512345678'])
    expect(dialablePhones('')).toEqual([])
    expect(dialablePhones('无')).toEqual([])
  })
})

describe('sanitizeKeyword', () => {
  it('去掉会破坏查询语法的字符', () => {
    expect(sanitizeKeyword('a,b(c)*d%e:f')).toBe('a b c  d e f')
    expect(sanitizeKeyword('  华南 ')).toBe('华南')
    expect(sanitizeKeyword(undefined)).toBe('')
  })
})

// 表头识别：把表格的列对应到样板字段
import { ALIAS_MATCH_ORDER, FIELD_BY_KEY, SHEET_FIELDS, type SheetFieldKey } from './fields'
import { isBlank } from '../values'

export type ColumnMapping = Partial<Record<SheetFieldKey, number[]>> & {
  /** 旧格式"自定义间隔(月)"按每月 30 天换算 */
  intervalInMonths?: boolean
}

export function normalizeHeader(header: unknown): string {
  return String(header ?? '')
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .toLowerCase()
}

export function detectColumnMapping(headers: unknown[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader)
  const mapping: ColumnMapping = {}
  const used = new Set<number>()
  const assign = (key: SheetFieldKey, index: number) => {
    ;(mapping[key] ??= []).push(index)
    used.add(index)
  }

  // 第一轮：与样板表头完全一致
  SHEET_FIELDS.forEach((field) => {
    const target = normalizeHeader(field.header)
    normalized.forEach((header, index) => {
      if (!used.has(index) && header === target && (field.multi || !mapping[field.key])) assign(field.key, index)
    })
  })

  // 第二轮：关键字匹配，兼容旧格式和手工整理的表格
  ALIAS_MATCH_ORDER.forEach((key) => {
    const field = FIELD_BY_KEY[key]
    normalized.forEach((header, index) => {
      if (!header || used.has(index) || (mapping[key] && !field.multi)) return
      const matched = field.aliases.some((alias) =>
        Array.isArray(alias) ? alias.every((part) => header.includes(part)) : header.includes(alias),
      )
      if (matched) assign(key, index)
    })
  })

  const intervalHeader = mapping.customInterval ? normalized[mapping.customInterval[0]] : ''
  mapping.intervalInMonths = intervalHeader.includes('月') && !intervalHeader.includes('天')
  return mapping
}

export function countMappedFields(mapping: ColumnMapping): number {
  return SHEET_FIELDS.filter((field) => mapping[field.key]).length
}

export function isRowEmpty(row: unknown[] | undefined): boolean {
  return !row || row.every(isBlank)
}

/**
 * 在前 10 行中找表头：能识别出"客户名称"列、且识别出的列最多的一行。
 * （表格上方常有"XX客户台账"之类的标题行，不能只看是否含"客户"二字）
 */
export function findHeaderRow(rows: unknown[][]): { index: number; mapping: ColumnMapping } | null {
  let best: { index: number; mapping: ColumnMapping; score: number } | null = null
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (isRowEmpty(rows[i])) continue
    const mapping = detectColumnMapping(rows[i])
    const score = countMappedFields(mapping)
    if (mapping.name && (!best || score > best.score)) best = { index: i, mapping, score }
  }
  return best && { index: best.index, mapping: best.mapping }
}

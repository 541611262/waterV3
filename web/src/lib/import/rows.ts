// 表格行 → 结构化数据（只包含表格中填写了的值，便于重复导入时只更新有内容的字段）
import { parseFlexibleDate, type IsoDate } from '../dates'
import { cellText, normalizePhone, parseBool, parsePositiveInt } from '../values'
import { parseFollowUpsCell, parseHistoryCell, type ParsedFollowUp, type ParsedReplacement } from './cells'
import { findHeaderRow, isRowEmpty, type ColumnMapping } from './columns'
import { SHEET_FIELDS } from './fields'

export interface ParsedCustomer {
  name?: string
  province?: string
  region?: string
  longTermPartner?: boolean
}

export interface ParsedDevice {
  address?: string
  phoneNumber?: string
  contactPerson?: string
  installDate?: IsoDate
  model?: string
  quantity?: number
  location?: string
  filterPurchaseDate?: IsoDate
  customInterval?: number
  notes?: string
  needWaterTest?: boolean
  hasUnpaid?: boolean
  unpaidInterval?: number
}

export interface ParsedRow {
  /** Excel 中的行号（从 1 开始） */
  rowNumber: number
  customer: ParsedCustomer
  device: ParsedDevice
  followUps: ParsedFollowUp[]
  history: ParsedReplacement[]
}

export interface ParsedSheet {
  headerRowNumber: number
  mapping: ColumnMapping
  rows: ParsedRow[]
  /** 没有客户名称而跳过的行号 */
  skippedRows: number[]
  /** 无法识别的日期，如 `第11行「装机时间」2023.13.45` */
  badDates: string[]
}

export function parseImportRow(row: unknown[], mapping: ColumnMapping, rowNumber: number, badDates: string[]): ParsedRow {
  const parsed: ParsedRow = { rowNumber, customer: {}, device: {}, followUps: [], history: [] }

  for (const field of SHEET_FIELDS) {
    for (const column of mapping[field.key] ?? []) {
      const raw = row[column]
      const text = cellText(raw)
      const target = (field.level === 'customer' ? parsed.customer : parsed.device) as Record<string, unknown>

      switch (field.type) {
        case 'date': {
          if (!text) break
          const date = parseFlexibleDate(raw)
          if (date) target[field.key] = date
          else badDates.push(`第${rowNumber}行「${field.header}」${text}`)
          break
        }
        case 'int': {
          const number = parsePositiveInt(raw)
          if (number !== null) {
            target[field.key] = field.key === 'customInterval' && mapping.intervalInMonths ? number * 30 : number
          }
          break
        }
        case 'bool': {
          const bool = parseBool(raw)
          if (bool !== null) target[field.key] = bool
          break
        }
        case 'phone':
          if (text) target[field.key] = normalizePhone(raw)
          break
        case 'followUps':
          if (text) parsed.followUps.push(...parseFollowUpsCell(text))
          break
        case 'history':
          if (text) parsed.history.push(...parseHistoryCell(text))
          break
        default:
          if (text) target[field.key] = text
      }
    }
  }
  return parsed
}

/** 解析整张表；找不到"客户名称"列时返回 null */
export function parseSheet(rows: unknown[][]): ParsedSheet | null {
  const header = findHeaderRow(rows)
  if (!header) return null

  const result: ParsedSheet = { headerRowNumber: header.index + 1, mapping: header.mapping, rows: [], skippedRows: [], badDates: [] }
  for (let i = header.index + 1; i < rows.length; i++) {
    if (isRowEmpty(rows[i])) continue
    const parsed = parseImportRow(rows[i], header.mapping, i + 1, result.badDates)
    if (parsed.customer.name) result.rows.push(parsed)
    else result.skippedRows.push(i + 1)
  }
  return result
}

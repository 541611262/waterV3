// 两个"详情"列的解析：最新跟踪记录详情、历史记录详情
import { LEADING_DATE_RE, parseFlexibleDate, type IsoDate } from '../dates'
import { parseAmount, parsePositiveInt } from '../values'

export interface ParsedFollowUp {
  date: IsoDate
  content: string
}

export interface ParsedReplacement {
  date: IsoDate
  filterModel: string
  quantity: number
  cost: number
  operator: string
  notes: string
}

const LINE_SPLIT_RE = /\r?\n|[;；]/

/** 每行一条，行首可带日期 */
export function parseFollowUpsCell(text: string): ParsedFollowUp[] {
  return String(text)
    .split(LINE_SPLIT_RE)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = LEADING_DATE_RE.exec(line)
      const date = match ? parseFlexibleDate(match[1]) : ''
      return { date, content: date && match ? match[2].trim() : line }
    })
}

function replacement(fields: Partial<Record<keyof ParsedReplacement, unknown>>): ParsedReplacement {
  return {
    date: (fields.date as IsoDate) || '',
    filterModel: String(fields.filterModel ?? '').trim(),
    quantity: parsePositiveInt(fields.quantity) ?? 1,
    cost: parseAmount(fields.cost) ?? 0,
    operator: String(fields.operator ?? '').trim(),
    notes: String(fields.notes ?? '').trim(),
  }
}

/** 单条历史记录：日期|型号|数量|费用|操作人|备注；兼容旧的逗号格式和手写的"日期 + 说明" */
export function parseHistoryEntry(entry: string): ParsedReplacement | null {
  const text = entry.trim()
  if (!text || text === '无历史记录' || text === '无') return null

  if (text.includes('|')) {
    const f = text.split('|').map((s) => s.trim())
    return replacement({
      date: parseFlexibleDate(f[0]),
      filterModel: f[1],
      quantity: f[2],
      cost: f[3],
      operator: f[4],
      notes: f.slice(5).join('|'),
    })
  }

  const commaFields = text.split(/[,，]/).map((s) => s.trim())
  if (commaFields.length > 1 && parseFlexibleDate(commaFields[0])) {
    // 旧格式：日期,型号,数量,费用,备注,操作人
    return replacement({
      date: parseFlexibleDate(commaFields[0]),
      filterModel: commaFields[1],
      quantity: commaFields[2],
      cost: commaFields[3],
      notes: commaFields[4],
      operator: commaFields[5],
    })
  }

  const match = LEADING_DATE_RE.exec(text)
  if (match && parseFlexibleDate(match[1])) {
    return replacement({ date: parseFlexibleDate(match[1]), notes: match[2] })
  }

  // 没有日期的文字也保留下来，避免丢数据
  return replacement({ notes: text })
}

export function parseHistoryCell(text: string): ParsedReplacement[] {
  return String(text)
    .split(LINE_SPLIT_RE)
    .map(parseHistoryEntry)
    .filter((r): r is ParsedReplacement => r !== null)
}

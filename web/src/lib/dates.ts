// 日期工具。系统的使用者在中国："今天"和显示的时间一律按北京时间。
// 日期统一用 'YYYY-MM-DD' 字符串表示，计算时按 UTC 进行，结果与运行环境的时区无关。

export const APP_TIME_ZONE = 'Asia/Shanghai'

/** 'YYYY-MM-DD'，空字符串表示没有日期 */
export type IsoDate = string

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE })

/** 某个时间点对应的北京日期 */
export function beijingDate(value: Date | string | number = new Date()): IsoDate {
  return dayFormatter.format(value instanceof Date ? value : new Date(value))
}

export function todayStr(now: Date = new Date()): IsoDate {
  return beijingDate(now)
}

function toUtcMs(date: IsoDate | null | undefined): number | null {
  const match = ISO_DATE_RE.exec(date ?? '')
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const ms = toUtcMs(date)
  return ms === null ? '' : fromUtcMs(ms + days * DAY_MS)
}

/** 从 from 到 to 的天数（to 更晚为正） */
export function daysBetween(from: IsoDate, to: IsoDate): number | null {
  const a = toUtcMs(from)
  const b = toUtcMs(to)
  return a === null || b === null ? null : Math.round((b - a) / DAY_MS)
}

/** 距今天还有几天，负数表示已经过去 */
export function daysUntil(date: IsoDate, today: IsoDate = todayStr()): number | null {
  return daysBetween(today, date)
}

export function latestDate(dates: Array<IsoDate | null | undefined>): IsoDate {
  const valid = dates.filter((d): d is IsoDate => Boolean(d) && ISO_DATE_RE.test(d as string)).sort()
  return valid.length ? valid[valid.length - 1] : ''
}

/** 校验并组装日期；两位年份按 20xx 处理（样板中有 "23.10.11"） */
export function buildDate(year: number | string, month: number | string, day: number | string): IsoDate {
  let y = Number(year)
  if (y < 100) y += 2000
  const m = Number(month)
  const d = Number(day)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (y < 1980 || y > 2100 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return ''
  return fromUtcMs(date.getTime())
}

export function excelSerialToDate(serial: number): IsoDate {
  if (!(serial > 0) || serial > 2958465) return ''
  const date = new Date(Math.round((serial - 25569) * DAY_MS))
  return buildDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/**
 * 识别各种日期写法：2011.9.9 / 2012.03.02 / 23.10.11 / 2025-01-15 / 2025/1/5 / 2025年1月5日 /
 * 03/15/2025 / 20250115 / Excel 日期序列号。无法识别时返回空字符串。
 */
export function parseFlexibleDate(value: unknown): IsoDate {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : beijingDate(value)
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 19800101 && value <= 21001231) {
      const s = String(value)
      return buildDate(s.slice(0, 4), s.slice(4, 6), s.slice(6, 8))
    }
    return excelSerialToDate(value)
  }
  const text = String(value)
    .trim()
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  let match = /^(\d{4}|\d{2})\s*[.\-/年]\s*(\d{1,2})\s*[.\-/月]\s*(\d{1,2})\s*日?(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(text)
  if (match) return buildDate(match[1], match[2], match[3])
  match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text)
  if (match) {
    // 美式 月/日/年；第一段大于 12 时按 日/月/年
    return Number(match[1]) > 12 ? buildDate(match[3], match[2], match[1]) : buildDate(match[3], match[1], match[2])
  }
  if (/^\d{8}$/.test(text)) return buildDate(text.slice(0, 4), text.slice(4, 6), text.slice(6, 8))
  if (/^\d{4,5}(\.\d+)?$/.test(text)) return excelSerialToDate(parseFloat(text))
  return ''
}

/** 文本开头的日期，例如 "2024.3.7 电话回访，下月更换" */
export const LEADING_DATE_RE = /^((?:\d{4}|\d{2})[.\-/年]\d{1,2}[.\-/月]\d{1,2}日?)\s*[:：,，、]?\s*([\s\S]*)$/

/** 导出到表格时使用样板中的 2011.09.09 写法 */
export function toSheetDate(date: IsoDate | null | undefined): string {
  return date ? date.replace(/-/g, '.') : ''
}

export function formatBeijingDateTime(value: Date | string | number): string {
  return new Date(value).toLocaleString('zh-CN', { timeZone: APP_TIME_ZONE, hour12: false })
}

export function formatBeijingDisplayDate(value: Date | string | number): string {
  return new Date(value).toLocaleDateString('zh-CN', { timeZone: APP_TIME_ZONE })
}

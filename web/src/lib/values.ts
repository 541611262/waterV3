// 表格单元格的值解析

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

export function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

/** 正整数；"90天"、"3台" 也能识别。无法识别或不大于 0 时返回 null */
export function parsePositiveInt(value: unknown): number | null {
  if (isBlank(value)) return null
  const number = typeof value === 'number' ? value : parseFloat((String(value).match(/\d+(\.\d+)?/) ?? [''])[0])
  return number > 0 ? Math.round(number) : null
}

/** 金额（元），保留两位小数；无法识别时返回 null */
export function parseAmount(value: unknown): number | null {
  if (isBlank(value)) return null
  const number = typeof value === 'number' ? value : parseFloat(String(value).replace(/[,，¥￥元\s]/g, ''))
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null
}

const TRUE_WORDS = ['是', '有', '需要', '要', 'y', 'yes', 'true', '1', '√', '✓', '✔']

/** 是 / 否；空白返回 null（表示"未填写"，重复导入时不覆盖已有值） */
export function parseBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = cellText(value).toLowerCase()
  if (!text) return null
  return TRUE_WORDS.includes(text)
}

/** Excel 中的电话常被存成数字 13800138000，统一转成文本 */
export function normalizePhone(value: unknown): string {
  if (typeof value === 'number') return String(Math.round(value))
  return cellText(value).replace(/^(\d+)\.0+$/, '$1')
}

function maskDigits(run: string): string {
  return run.length >= 11 ? `${run.slice(0, 3)}****${run.slice(-4)}` : `${run.slice(0, 2)}****${run.slice(-2)}`
}

/** 7 位以上的连续数字都视为可能的电话号码并打码（用于发送给 AI 的内容） */
export function maskPhones(value: unknown): string {
  return cellText(value).replace(/\d{7,}/g, maskDigits)
}

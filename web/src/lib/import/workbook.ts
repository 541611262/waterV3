// Excel / CSV 文件 → 二维数组
import { read, utils } from 'xlsx'
import { decodeText, parseDelimitedText } from './csv'

/** 读取第一个有数据的工作表；合并单元格会把左上角的值填充到整个合并区域 */
export function readWorkbookRows(buffer: ArrayBuffer): unknown[][] {
  const workbook = read(new Uint8Array(buffer), { type: 'array' })
  const sheetName = workbook.SheetNames.find((name) => workbook.Sheets[name]['!ref'])
  if (!sheetName) throw new Error('Excel 文件中没有数据')

  const sheet = workbook.Sheets[sheetName]
  const range = utils.decode_range(sheet['!ref'] as string)
  // raw：保留数字原值（电话、数量、日期序列号），由各列按类型解析
  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: true })

  for (const merge of sheet['!merges'] ?? []) {
    const topLeft = rows[merge.s.r - range.s.r]
    const value = topLeft ? topLeft[merge.s.c - range.s.c] : ''
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      const rowIndex = r - range.s.r
      rows[rowIndex] ??= []
      for (let c = merge.s.c; c <= merge.e.c; c++) rows[rowIndex][c - range.s.c] = value
    }
  }
  return rows
}

export function readTableFile(fileName: string, buffer: ArrayBuffer): unknown[][] {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return parseDelimitedText(decodeText(buffer))
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return readWorkbookRows(buffer)
  throw new Error('不支持的文件格式，请选择 CSV 或 Excel 文件')
}

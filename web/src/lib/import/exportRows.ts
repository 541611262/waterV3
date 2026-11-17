// 导出为《格式样板》19 列（纯函数，有单元测试）。导出的文件可以直接重新导入。
import { toSheetDate } from '../dates'
import { SHEET_FIELDS, type SheetFieldKey } from './fields'

export interface ExportEntry {
  client: { name: string; province: string; region: string; long_term_partner: boolean }
  /** 没有装机记录的客户导出一行空设备 */
  device: {
    address: string
    phone: string
    contact_person: string
    install_date: string | null
    model: string
    quantity: number | null
    location: string
    filter_purchase_date: string | null
    interval_days: number | null
    notes: string
    need_water_test: boolean
  } | null
  followUps: { followed_on: string | null; content: string }[]
  replacements: {
    replaced_on: string | null
    filter_model: string
    quantity: number
    cost: number | string
    operator_name: string
    notes: string
  }[]
  /** 是否有未结清的应收，以及催款周期 */
  unpaid: { open: boolean; interval: number | null }
}

const byDateDesc = <T>(items: T[], date: (item: T) => string | null) =>
  [...items].sort((a, b) => (date(b) ?? '').localeCompare(date(a) ?? ''))

function cell(entry: ExportEntry, key: SheetFieldKey): string | number {
  const d = entry.device
  switch (key) {
    case 'name':
      return entry.client.name
    case 'province':
      return entry.client.province
    case 'region':
      return entry.client.region
    case 'longTermPartner':
      return entry.client.long_term_partner ? '是' : '否'
    case 'followUps':
      return byDateDesc(entry.followUps, (f) => f.followed_on)
        .map((f) => `${toSheetDate(f.followed_on)} ${f.content}`.trim())
        .join('\n')
    case 'replacementHistory':
      return byDateDesc(entry.replacements, (r) => r.replaced_on)
        .map((r) => `${r.replaced_on ?? ''}|${r.filter_model}|${r.quantity || 1}|${Number(r.cost) || 0}|${r.operator_name}|${r.notes}`)
        .join('\n')
    case 'hasUnpaid':
      return d ? (entry.unpaid.open ? '是' : '否') : ''
    case 'unpaidInterval':
      return d && entry.unpaid.open && entry.unpaid.interval ? entry.unpaid.interval : ''
  }
  if (!d) return ''
  switch (key) {
    case 'address':
      return d.address
    case 'phoneNumber':
      return d.phone
    case 'contactPerson':
      return d.contact_person
    case 'installDate':
      return toSheetDate(d.install_date)
    case 'model':
      return d.model
    case 'quantity':
      return d.quantity ?? ''
    case 'location':
      return d.location
    case 'filterPurchaseDate':
      return toSheetDate(d.filter_purchase_date)
    case 'customInterval':
      return d.interval_days ?? ''
    case 'notes':
      return d.notes
    case 'needWaterTest':
      return d.need_water_test ? '是' : '否'
  }
  return ''
}

export function buildExportRows(entries: ExportEntry[]): (string | number)[][] {
  return [SHEET_FIELDS.map((f) => f.header), ...entries.map((entry) => SHEET_FIELDS.map((f) => cell(entry, f.key)))]
}

export const EXPORT_COLUMN_WIDTHS = SHEET_FIELDS.map((f) => ({ wch: f.width }))

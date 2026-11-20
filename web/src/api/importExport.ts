// 表格导入导出：读取数据库中的相关数据，交给纯函数计算，再提交到数据库
import { utils, writeFile } from 'xlsx'
import { todayStr } from '@/lib/dates'
import { buildExportRows, EXPORT_COLUMN_WIDTHS, type ExportEntry } from '@/lib/import/exportRows'
import { buildImportPlan, type ExistingClient, type ImportPlan } from '@/lib/import/plan'
import { parseSheet, type ParsedSheet } from '@/lib/import/rows'
import { readTableFile } from '@/lib/import/workbook'
import { AppError, db, unwrap } from './cloud'
import type { Client, Device, DeviceOverview, FollowUp, ReceivableOverview, Replacement } from './types'

const CHUNK = 100

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

/** 按 id 列表分批查询（URL 长度有限） */
async function selectIn<T>(table: string, columns: string, column: string, values: string[], extra?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!values.length) return []
  const rdb = await db()
  const groups = await Promise.all(
    chunks([...new Set(values)]).map(async (group) => {
      let query = rdb.from(table).select(columns).in(column, group)
      if (extra) query = extra(query)
      return unwrap<T[]>(await query.limit(10000)) ?? []
    }),
  )
  return groups.flat()
}

// ---------- 导入 ----------

export interface ImportPreview {
  fileName: string
  sheet: ParsedSheet
  plan: ImportPlan
}

export async function readImportFile(file: File): Promise<ParsedSheet> {
  if (file.size === 0) throw new AppError('文件是空的')
  const rows = readTableFile(file.name, await file.arrayBuffer())
  const sheet = parseSheet(rows)
  if (!sheet) throw new AppError('没有找到"客户名称"列，请检查表头是否与导入模板一致')
  if (!sheet.rows.length) throw new AppError('表格中没有可导入的数据行')
  return sheet
}

/** 读取本人负责的、与表格中客户同名的已有数据 */
async function loadExisting(names: string[], ownerId: string): Promise<ExistingClient[]> {
  const clients = await selectIn<Client>('clients', 'id, version, name, province, region, long_term_partner', 'name', names, (q) =>
    q.eq('owner_id', ownerId).is('deleted_at', null),
  )
  const clientIds = clients.map((c) => c.id)
  const [devices, followUps] = await Promise.all([
    selectIn<Device>('devices', 'id, version, client_id, address, location, install_date, model, quantity', 'client_id', clientIds, (q) =>
      q.is('deleted_at', null).order('created_at'),
    ),
    selectIn<FollowUp>('follow_ups', 'client_id, followed_on, content', 'client_id', clientIds, (q) => q.is('deleted_at', null)),
  ])
  const deviceIds = devices.map((d) => d.id)
  const [replacements, receivables] = await Promise.all([
    selectIn<Replacement>('replacements', 'device_id, replaced_on, filter_model, quantity, notes', 'device_id', deviceIds, (q) =>
      q.is('deleted_at', null),
    ),
    selectIn<ReceivableOverview>('receivable_overview', 'id, version, device_id, amount, remind_interval_days', 'device_id', deviceIds, (q) =>
      q.eq('settled', false),
    ),
  ])

  return clients.map((c) => ({
    id: c.id,
    version: c.version,
    name: c.name,
    province: c.province,
    region: c.region,
    long_term_partner: c.long_term_partner,
    followUps: followUps.filter((f) => f.client_id === c.id),
    devices: devices
      .filter((d) => d.client_id === c.id)
      .map((d) => ({
        id: d.id,
        version: d.version,
        address: d.address,
        location: d.location,
        install_date: d.install_date,
        model: d.model,
        quantity: d.quantity,
        replacements: replacements.filter((r) => r.device_id === d.id),
        openReceivables: receivables.filter((r) => r.device_id === d.id).map((r) => ({ id: r.id, version: r.version, amount: r.amount, remind_interval_days: r.remind_interval_days })),
      })),
  }))
}

export async function previewImport(file: File, ownerId: string, operatorName: string): Promise<ImportPreview> {
  const sheet = await readImportFile(file)
  const names = [...new Set(sheet.rows.map((r) => r.customer.name!))]
  const existing = await loadExisting(names, ownerId)
  return { fileName: file.name, sheet, plan: buildImportPlan(sheet, existing, operatorName) }
}

/** 在一个数据库事务里执行导入计划，要么全部成功，要么全部不生效 */
export async function applyImport(plan: ImportPlan): Promise<void> {
  const rdb = await db()
  const { stats: _stats, ...payload } = plan
  void _stats
  unwrap(await rdb.rpc('v4_apply_import', { p_plan: payload }))
}

// ---------- 导出 ----------

async function fetchAllDevices(filter: { ids?: string[] }): Promise<DeviceOverview[]> {
  if (filter.ids) return selectIn<DeviceOverview>('device_overview', '*', 'id', filter.ids)
  const rdb = await db()
  const all: DeviceOverview[] = []
  for (let from = 0; ; from += 1000) {
    const rows = unwrap<DeviceOverview[]>(await rdb.from('device_overview').select('*').order('client_name').order('created_at').range(from, from + 999))
    all.push(...rows)
    if (rows.length < 1000) break
  }
  return all
}

export async function collectExportEntries(filter: { ids?: string[]; includeEmptyClients?: boolean } = {}): Promise<ExportEntry[]> {
  const devices = await fetchAllDevices(filter)
  const clientIds = [...new Set(devices.map((d) => d.client_id))]
  const [replacements, followUps, receivables] = await Promise.all([
    selectIn<Replacement>('replacements', 'device_id, replaced_on, filter_model, quantity, cost, operator_name, notes', 'device_id', devices.map((d) => d.id), (q) =>
      q.is('deleted_at', null),
    ),
    selectIn<FollowUp>('follow_ups', 'client_id, followed_on, content', 'client_id', clientIds, (q) => q.is('deleted_at', null)),
    selectIn<ReceivableOverview>('receivable_overview', 'device_id, remind_interval_days', 'device_id', devices.map((d) => d.id), (q) =>
      q.eq('settled', false),
    ),
  ])

  const entries: ExportEntry[] = devices.map((d) => {
    const open = receivables.filter((r) => r.device_id === d.id)
    return {
      client: { name: d.client_name, province: d.province, region: d.region, long_term_partner: d.long_term_partner },
      device: d,
      followUps: followUps.filter((f) => f.client_id === d.client_id),
      replacements: replacements.filter((r) => r.device_id === d.id),
      unpaid: { open: open.length > 0, interval: open.find((r) => r.remind_interval_days)?.remind_interval_days ?? null },
    }
  })

  // 全部导出时，没有装机记录的客户也导出一行，保证重新导入不丢客户
  if (filter.includeEmptyClients && !filter.ids) {
    const rdb = await db()
    const empty = unwrap<{ id: string; name: string; province: string; region: string; long_term_partner: boolean }[]>(
      await rdb.from('client_overview').select('id, name, province, region, long_term_partner').eq('device_count', 0).limit(10000),
    )
    const emptyFollowUps = await selectIn<FollowUp>('follow_ups', 'client_id, followed_on, content', 'client_id', empty.map((c) => c.id), (q) =>
      q.is('deleted_at', null),
    )
    for (const c of empty) {
      entries.push({ client: c, device: null, followUps: emptyFollowUps.filter((f) => f.client_id === c.id), replacements: [], unpaid: { open: false, interval: null } })
    }
  }
  return entries
}

export function downloadWorkbook(entries: ExportEntry[], fileBaseName = `滤芯客户数据_${todayStr()}`) {
  const sheet = utils.aoa_to_sheet(buildExportRows(entries))
  sheet['!cols'] = EXPORT_COLUMN_WIDTHS
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, sheet, 'Sheet1')
  writeFile(workbook, `${fileBaseName}.xlsx`)
}

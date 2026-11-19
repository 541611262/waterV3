// 业务数据读写。权限全部由数据库行级安全（RLS）保证，这里只负责组装查询。
// 列表一律服务端分页、排序、筛选；更新一律带 version，返回 0 行即视为冲突。
import { todayStr } from '@/lib/dates'
import { db, expectUpdated, unwrap } from './cloud'
import type {
  AuditEntry,
  Client,
  ClientOverview,
  Device,
  DeviceOverview,
  FilterStage,
  FilterStageOverview,
  FollowUp,
  Page,
  Payment,
  Receivable,
  ReceivableOverview,
  Replacement,
  WorkOrder,
  WorkOrderStatus,
} from './types'

export type SortOrder = 'asc' | 'desc'
export interface Sort {
  field: string
  order: SortOrder
}

export interface PageQuery {
  page: number
  pageSize: number
  sort?: Sort | null
}

// ---------- 通用 ----------

/** 去掉 PostgREST 过滤语法中的特殊字符，防止关键字破坏查询 */
export function sanitizeKeyword(keyword: string | undefined): string {
  return (keyword ?? '').replace(/[,()*%:"\\.]/g, ' ').trim()
}

function keywordFilter(columns: string[], keyword: string | undefined): string | null {
  const kw = sanitizeKeyword(keyword)
  if (!kw) return null
  return columns.map((c) => `${c}.ilike.*${kw}*`).join(',')
}

function range(q: PageQuery): [number, number] {
  const from = (q.page - 1) * q.pageSize
  return [from, from + q.pageSize - 1]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST 查询构造器
type Builder = any

function applySort(query: Builder, sort: Sort | null | undefined, fallback: Sort): Builder {
  const s = sort ?? fallback
  return query.order(s.field, { ascending: s.order === 'asc', nullsFirst: false })
}

async function pageOf<T>(query: Builder): Promise<Page<T>> {
  const result = await query
  const rows = unwrap<T[]>(result) ?? []
  return { rows, total: typeof result.count === 'number' ? result.count : rows.length }
}

async function insertRow<T>(table: string, values: Record<string, unknown>): Promise<T> {
  const rdb = await db()
  const rows = unwrap<T[]>(await rdb.from(table).insert(values).select())
  return rows[0] as T
}

async function updateRow<T>(table: string, id: string, version: number, patch: Record<string, unknown>): Promise<T> {
  const rdb = await db()
  return expectUpdated(unwrap<T[]>(await rdb.from(table).update(patch).eq('id', id).eq('version', version).select()))
}

export type SoftDeletable = 'clients' | 'devices' | 'filter_stages' | 'replacements' | 'follow_ups' | 'receivables' | 'payments' | 'work_orders'

export function softDelete(table: SoftDeletable, id: string, version: number) {
  return updateRow(table, id, version, { deleted_at: new Date().toISOString() })
}

export function restore(table: SoftDeletable, id: string, version: number) {
  return updateRow(table, id, version, { deleted_at: null })
}

/** 只有管理员能彻底删除；没有权限时数据库返回 0 行 */
export async function purge(table: SoftDeletable, id: string): Promise<void> {
  const rdb = await db()
  const rows = unwrap<unknown[]>(await rdb.from(table).delete().eq('id', id).select('id'))
  if (!rows?.length) throw new Error('只有管理员可以彻底删除')
}

// ---------- 装机记录（设备） ----------

/** 列表筛选状态，可多选（多个状态之间是"或"的关系） */
export const DEVICE_STATUSES = [
  { key: 'overdue', label: '已超期', filter: 'days_until_due.lt.0' },
  { key: 'today', label: '今日到期', filter: 'days_until_due.eq.0' },
  { key: 'week', label: '7 天内', filter: 'and(days_until_due.gte.1,days_until_due.lte.7)' },
  { key: 'month', label: '30 天内', filter: 'and(days_until_due.gte.8,days_until_due.lte.30)' },
  { key: 'normal', label: '30 天以上', filter: 'days_until_due.gt.30' },
  { key: 'none', label: '未设置日期', filter: 'next_due_on.is.null' },
  { key: 'unpaid', label: '待收款', filter: 'open_receivable_count.gt.0' },
  { key: 'waterTest', label: '需验水', filter: 'need_water_test.is.true' },
  { key: 'partner', label: '长期合作', filter: 'long_term_partner.is.true' },
] as const
export type DeviceStatusKey = (typeof DEVICE_STATUSES)[number]['key']

export interface DeviceQuery extends PageQuery {
  keyword?: string
  statuses?: DeviceStatusKey[]
  ownerId?: string
  region?: string
  clientId?: string
  ids?: string[]
  /** 距到期天数下限（含） */
  dueMin?: number
  /** 距到期天数上限（含），可为负数 */
  dueWithin?: number
}

export async function listDevices(q: DeviceQuery): Promise<Page<DeviceOverview>> {
  const rdb = await db()
  let query = rdb.from('device_overview').select('*', { count: 'exact' })
  const kw = keywordFilter(['client_name', 'address', 'contact_person', 'phone', 'model', 'location', 'region'], q.keyword)
  if (kw) query = query.or(kw)
  if (q.statuses?.length) {
    query = query.or(q.statuses.map((s) => DEVICE_STATUSES.find((d) => d.key === s)!.filter).join(','))
  }
  if (q.ownerId) query = query.eq('owner_id', q.ownerId)
  if (q.region) query = query.eq('region', q.region)
  if (q.clientId) query = query.eq('client_id', q.clientId)
  if (q.ids?.length) query = query.in('id', q.ids)
  if (q.dueMin !== undefined) query = query.gte('days_until_due', q.dueMin)
  if (q.dueWithin !== undefined) query = query.lte('days_until_due', q.dueWithin)
  query = applySort(query, q.sort, { field: 'next_due_on', order: 'asc' })
  return pageOf<DeviceOverview>(query.range(...range(q)))
}

export async function listClientDevices(clientId: string): Promise<DeviceOverview[]> {
  const rdb = await db()
  // 最急的排在前面；没有日期的放最后
  return (
    unwrap(
      await rdb
        .from('device_overview')
        .select('*')
        .eq('client_id', clientId)
        .order('next_due_on', { ascending: true, nullsFirst: false })
        .order('created_at'),
    ) ?? []
  )
}

export async function getDevice(id: string): Promise<Device | null> {
  const rdb = await db()
  const rows = unwrap<Device[]>(await rdb.from('devices').select('*').eq('id', id))
  return rows[0] ?? null
}

export type DeviceInput = Pick<
  Device,
  | 'address'
  | 'contact_person'
  | 'phone'
  | 'install_date'
  | 'model'
  | 'quantity'
  | 'location'
  | 'filter_purchase_date'
  | 'interval_days'
  | 'need_water_test'
  | 'notes'
>

export function createDevice(clientId: string, input: DeviceInput) {
  return insertRow<Device>('devices', { ...input, client_id: clientId })
}

export function updateDevice(id: string, version: number, patch: Partial<DeviceInput> & { client_id?: string }) {
  return updateRow<Device>('devices', id, version, patch)
}

// ---------- 滤芯分级 ----------

export async function listStages(deviceId: string): Promise<FilterStageOverview[]> {
  const rdb = await db()
  return unwrap(await rdb.from('filter_stage_overview').select('*').eq('device_id', deviceId).order('position')) ?? []
}

export type StageInput = Pick<FilterStage, 'position' | 'name' | 'interval_days' | 'started_on' | 'notes'>

export function createStage(deviceId: string, input: StageInput) {
  // client_id 由数据库触发器根据设备自动填写
  return insertRow<FilterStage>('filter_stages', { ...input, device_id: deviceId })
}

export function updateStage(id: string, version: number, patch: Partial<StageInput>) {
  return updateRow<FilterStage>('filter_stages', id, version, patch)
}

// ---------- 客户 ----------

export interface ClientQuery extends PageQuery {
  keyword?: string
  ownerId?: string
  region?: string
  dueOnly?: boolean
  unpaidOnly?: boolean
}

export async function listClients(q: ClientQuery): Promise<Page<ClientOverview>> {
  const rdb = await db()
  let query = rdb.from('client_overview').select('*', { count: 'exact' })
  const kw = keywordFilter(['name', 'province', 'region', 'notes'], q.keyword)
  if (kw) query = query.or(kw)
  if (q.ownerId) query = query.eq('owner_id', q.ownerId)
  if (q.region) query = query.eq('region', q.region)
  if (q.dueOnly) query = query.lte('days_until_due', 7)
  if (q.unpaidOnly) query = query.gt('open_receivable_count', 0)
  query = applySort(query, q.sort, { field: 'name', order: 'asc' })
  return pageOf<ClientOverview>(query.range(...range(q)))
}

/** 客户选择器：按名称搜索 */
export async function searchClients(keyword: string, limit = 20): Promise<Pick<Client, 'id' | 'name' | 'region'>[]> {
  const rdb = await db()
  let query = rdb.from('clients').select('id, name, region').is('deleted_at', null)
  const kw = sanitizeKeyword(keyword)
  if (kw) query = query.ilike('name', `*${kw}*`)
  return unwrap(await query.order('name').limit(limit)) ?? []
}

export async function getClient(id: string): Promise<Client | null> {
  const rdb = await db()
  const rows = unwrap<Client[]>(await rdb.from('clients').select('*').eq('id', id))
  return rows[0] ?? null
}

export async function getClientOverview(id: string): Promise<ClientOverview | null> {
  const rdb = await db()
  const rows = unwrap<ClientOverview[]>(await rdb.from('client_overview').select('*').eq('id', id))
  return rows[0] ?? null
}

export type ClientInput = Pick<Client, 'name' | 'province' | 'region' | 'long_term_partner' | 'notes'> & { owner_id?: string }

export function createClient(input: ClientInput) {
  return insertRow<Client>('clients', { ...input })
}

export function updateClient(id: string, version: number, patch: Partial<ClientInput>) {
  return updateRow<Client>('clients', id, version, patch)
}

/** 省份 / 区域的已有取值（筛选下拉用） */
export async function listRegions(): Promise<{ provinces: string[]; regions: string[] }> {
  const rdb = await db()
  const rows = unwrap<{ province: string; region: string }[]>(
    await rdb.from('clients').select('province, region').is('deleted_at', null).limit(5000),
  )
  const uniq = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'))
  return { provinces: uniq(rows.map((r) => r.province)), regions: uniq(rows.map((r) => r.region)) }
}

// ---------- 换芯记录 ----------

export async function listReplacements(filter: { clientId?: string; deviceId?: string }): Promise<Replacement[]> {
  const rdb = await db()
  let query = rdb.from('replacements').select('*').is('deleted_at', null)
  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.deviceId) query = query.eq('device_id', filter.deviceId)
  return unwrap(await query.order('replaced_on', { ascending: false, nullsFirst: false })) ?? []
}

export type ReplacementInput = Pick<
  Replacement,
  'device_id' | 'stage_id' | 'work_order_id' | 'replaced_on' | 'filter_model' | 'quantity' | 'cost' | 'operator_name' | 'notes'
>

export function createReplacement(input: ReplacementInput) {
  return insertRow<Replacement>('replacements', { ...input })
}

export function updateReplacement(id: string, version: number, patch: Partial<ReplacementInput>) {
  return updateRow<Replacement>('replacements', id, version, patch)
}

// ---------- 跟踪记录 ----------

export async function listFollowUps(clientId: string): Promise<FollowUp[]> {
  const rdb = await db()
  return (
    unwrap(
      await rdb
        .from('follow_ups')
        .select('*')
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .order('followed_on', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
    ) ?? []
  )
}

export type FollowUpInput = Pick<FollowUp, 'followed_on' | 'content' | 'operator_name'> & { device_id?: string | null }

export function createFollowUp(clientId: string, input: FollowUpInput) {
  return insertRow<FollowUp>('follow_ups', { ...input, client_id: clientId })
}

// ---------- 应收与收款 ----------

export interface ReceivableQuery extends PageQuery {
  keyword?: string
  clientId?: string
  status?: 'open' | 'due' | 'settled' | 'all'
  ownerId?: string
}

export async function listReceivables(q: ReceivableQuery): Promise<Page<ReceivableOverview>> {
  const rdb = await db()
  let query = rdb.from('receivable_overview').select('*', { count: 'exact' })
  const kw = keywordFilter(['client_name', 'title', 'notes'], q.keyword)
  if (kw) query = query.or(kw)
  if (q.clientId) query = query.eq('client_id', q.clientId)
  if (q.ownerId) query = query.eq('owner_id', q.ownerId)
  if (q.status === 'open') query = query.eq('settled', false)
  if (q.status === 'due') query = query.eq('settled', false).lte('days_until_remind', 0)
  if (q.status === 'settled') query = query.eq('settled', true)
  query = applySort(query, q.sort, { field: 'next_remind_on', order: 'asc' })
  return pageOf<ReceivableOverview>(query.range(...range(q)))
}

export type ReceivableInput = Pick<Receivable, 'title' | 'amount' | 'billed_on' | 'remind_interval_days' | 'notes'> & {
  device_id?: string | null
}

export function createReceivable(clientId: string, input: ReceivableInput) {
  return insertRow<Receivable>('receivables', { ...input, client_id: clientId })
}

export function updateReceivable(id: string, version: number, patch: Partial<ReceivableInput> & { closed_at?: string | null }) {
  return updateRow<Receivable>('receivables', id, version, patch)
}

export async function listPayments(receivableId: string): Promise<Payment[]> {
  const rdb = await db()
  return (
    unwrap(
      await rdb.from('payments').select('*').eq('receivable_id', receivableId).is('deleted_at', null).order('paid_on', { ascending: false }),
    ) ?? []
  )
}

export type PaymentInput = Pick<Payment, 'amount' | 'paid_on' | 'method' | 'notes'>

export function createPayment(receivableId: string, input: PaymentInput) {
  return insertRow<Payment>('payments', { ...input, receivable_id: receivableId })
}

// ---------- 工单 ----------

export interface WorkOrderQuery extends PageQuery {
  keyword?: string
  statuses?: WorkOrderStatus[]
  assigneeId?: string
  clientId?: string
  mine?: boolean
  uid?: string
}

export interface WorkOrderRow extends WorkOrder {
  clients: { name: string; region: string; owner_id: string } | null
  devices: { address: string; contact_person: string; phone: string; model: string; location: string } | null
}

export async function listWorkOrders(q: WorkOrderQuery): Promise<Page<WorkOrderRow>> {
  const rdb = await db()
  let query = rdb
    .from('work_orders')
    .select('*, clients(name, region, owner_id), devices(address, contact_person, phone, model, location)', { count: 'exact' })
    .is('deleted_at', null)
  const kw = sanitizeKeyword(q.keyword)
  if (kw) query = query.or(`title.ilike.*${kw}*,description.ilike.*${kw}*,result.ilike.*${kw}*`)
  if (q.statuses?.length) query = query.in('status', q.statuses)
  if (q.assigneeId) query = query.eq('assignee_id', q.assigneeId)
  if (q.clientId) query = query.eq('client_id', q.clientId)
  query = applySort(query, q.sort, { field: 'scheduled_on', order: 'asc' })
  if (!q.sort) query = query.order('order_no', { ascending: false })
  return pageOf<WorkOrderRow>(query.range(...range(q)))
}

export type WorkOrderInput = Pick<WorkOrder, 'client_id' | 'device_id' | 'type' | 'assignee_id' | 'scheduled_on' | 'title' | 'description'>

export function createWorkOrder(input: WorkOrderInput) {
  return insertRow<WorkOrder>('work_orders', { ...input })
}

/** 批量派单：每台设备一张工单（一次请求写入） */
export async function createWorkOrders(inputs: WorkOrderInput[]): Promise<WorkOrder[]> {
  const rdb = await db()
  return unwrap<WorkOrder[]>(await rdb.from('work_orders').insert(inputs).select())
}

export async function countOpenWorkOrders(uid: string): Promise<number> {
  return countOf('work_orders', (q) => q.is('deleted_at', null).in('status', ['pending', 'in_progress']).eq('assignee_id', uid))
}

export function updateWorkOrder(
  id: string,
  version: number,
  patch: Partial<WorkOrderInput> & { status?: WorkOrderStatus; result?: string },
) {
  return updateRow<WorkOrder>('work_orders', id, version, patch)
}

// ---------- 操作日志 ----------

export async function listAudit(q: PageQuery & { clientId?: string }): Promise<Page<AuditEntry>> {
  const rdb = await db()
  let query = rdb.from('audit_log').select('*', { count: 'exact' })
  if (q.clientId) query = query.eq('client_id', q.clientId)
  return pageOf<AuditEntry>(query.order('at', { ascending: false }).range(...range(q)))
}

// ---------- 回收站 ----------

export async function listDeleted<T>(table: SoftDeletable, limit = 200): Promise<T[]> {
  const rdb = await db()
  return (
    unwrap(await rdb.from(table).select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(limit)) ?? []
  )
}

// ---------- 工作台统计 ----------

async function countOf(table: string, apply: (q: Builder) => Builder): Promise<number> {
  const rdb = await db()
  const result = await apply(rdb.from(table).select('id', { count: 'exact' })).range(0, 0)
  unwrap(result)
  return typeof result.count === 'number' ? result.count : 0
}

export interface DashboardStats {
  devices: number
  overdue: number
  dueThisWeek: number
  unpaidDue: number
  openWorkOrders: number
  replacementsThisMonth: number
  revenueThisMonth: number
}

export async function dashboardStats(uid: string): Promise<DashboardStats> {
  const today = todayStr()
  const monthStart = `${today.slice(0, 7)}-01`
  const rdb = await db()
  const [devices, overdue, dueThisWeek, unpaidDue, openWorkOrders, monthRows] = await Promise.all([
    countOf('device_overview', (q) => q),
    countOf('device_overview', (q) => q.lt('days_until_due', 0)),
    countOf('device_overview', (q) => q.gte('days_until_due', 0).lte('days_until_due', 7)),
    countOf('receivable_overview', (q) => q.eq('settled', false).lte('days_until_remind', 0)),
    countOf('work_orders', (q) => q.is('deleted_at', null).in('status', ['pending', 'in_progress']).eq('assignee_id', uid)),
    rdb
      .from('replacements')
      .select('cost')
      .is('deleted_at', null)
      .gte('replaced_on', monthStart)
      .lte('replaced_on', today)
      .limit(10000)
      .then((r: { data?: { cost: number | string }[]; error?: unknown }) => unwrap(r) ?? []),
  ])
  return {
    devices,
    overdue,
    dueThisWeek,
    unpaidDue,
    openWorkOrders,
    replacementsThisMonth: monthRows.length,
    revenueThisMonth: monthRows.reduce((sum: number, r: { cost: number | string }) => sum + Number(r.cost || 0), 0),
  }
}

// ---------- 回收站（统一格式） ----------

export interface DeletedItem {
  table: SoftDeletable
  id: string
  version: number
  title: string
  subtitle: string
  deleted_at: string
  updated_by: string | null
}

const DELETED_SOURCES: { table: SoftDeletable; select: string; describe: (row: Record<string, unknown>) => [string, string] }[] = [
  { table: 'clients', select: 'id, version, deleted_at, updated_by, name, region', describe: (r) => [String(r.name), String(r.region ?? '')] },
  {
    table: 'devices',
    select: 'id, version, deleted_at, updated_by, address, location, model, clients(name)',
    describe: (r) => [String(r.address || r.location || r.model || '（未填地址）'), clientName(r)],
  },
  {
    table: 'replacements',
    select: 'id, version, deleted_at, updated_by, replaced_on, filter_model, clients(name)',
    describe: (r) => [`换芯 ${r.replaced_on ?? ''} ${r.filter_model ?? ''}`.trim(), clientName(r)],
  },
  {
    table: 'follow_ups',
    select: 'id, version, deleted_at, updated_by, followed_on, content, clients(name)',
    describe: (r) => [String(r.content ?? '').slice(0, 40), clientName(r)],
  },
  {
    table: 'receivables',
    select: 'id, version, deleted_at, updated_by, title, amount, clients(name)',
    describe: (r) => [String(r.title || '应收款'), clientName(r)],
  },
  {
    table: 'work_orders',
    select: 'id, version, deleted_at, updated_by, order_no, title, clients(name)',
    describe: (r) => [`工单 #${r.order_no} ${r.title ?? ''}`.trim(), clientName(r)],
  },
]

function clientName(row: Record<string, unknown>): string {
  return String((row.clients as { name?: string } | null)?.name ?? '')
}

export async function listDeletedItems(): Promise<DeletedItem[]> {
  const rdb = await db()
  const groups = await Promise.all(
    DELETED_SOURCES.map(async (source) => {
      const rows = unwrap<Record<string, unknown>[]>(
        await rdb.from(source.table).select(source.select).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(200),
      )
      return (rows ?? []).map((row): DeletedItem => {
        const [title, subtitle] = source.describe(row)
        return {
          table: source.table,
          id: String(row.id),
          version: Number(row.version),
          title,
          subtitle,
          deleted_at: String(row.deleted_at),
          updated_by: (row.updated_by as string | null) ?? null,
        }
      })
    }),
  )
  return groups.flat().sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
}

// ---------- 系统设置 ----------

export interface AppSettings {
  replacement_interval_days: number
  unpaid_interval_days: number
}

export async function getSettings(): Promise<AppSettings> {
  const rdb = await db()
  const rows = unwrap<{ key: string; value: unknown }[]>(await rdb.from('app_settings').select('key, value'))
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]))
  return {
    replacement_interval_days: map.get('replacement_interval_days') || 90,
    unpaid_interval_days: map.get('unpaid_interval_days') || 30,
  }
}

export async function updateSetting(key: keyof AppSettings, value: number): Promise<void> {
  const rdb = await db()
  const rows = unwrap<unknown[]>(await rdb.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key).select('key'))
  if (!rows?.length) throw new Error('只有管理员可以修改系统设置')
}

// ---------- 统计用的原始数据（数据量为几千条以内，在浏览器中汇总） ----------

export interface ReplacementFact {
  replaced_on: string | null
  quantity: number
  cost: number | string
  operator_name: string
  client_id: string
  created_by: string | null
}

export async function fetchReplacementsSince(start: string): Promise<ReplacementFact[]> {
  const rdb = await db()
  const all: ReplacementFact[] = []
  for (let from = 0; ; from += 1000) {
    const rows = unwrap<ReplacementFact[]>(
      await rdb
        .from('replacements')
        .select('replaced_on, quantity, cost, operator_name, client_id, created_by')
        .is('deleted_at', null)
        .gte('replaced_on', start)
        .order('replaced_on')
        .range(from, from + 999),
    )
    all.push(...rows)
    if (rows.length < 1000) break
  }
  return all
}

export type DeviceFact = Pick<DeviceOverview, 'id' | 'days_until_due' | 'region' | 'province' | 'owner_id' | 'owner_name' | 'model' | 'client_id'>

export async function fetchDeviceFacts(): Promise<DeviceFact[]> {
  const rdb = await db()
  const all: DeviceFact[] = []
  for (let from = 0; ; from += 1000) {
    const rows = unwrap<DeviceFact[]>(
      await rdb
        .from('device_overview')
        .select('id, days_until_due, region, province, owner_id, owner_name, model, client_id')
        .order('id')
        .range(from, from + 999),
    )
    all.push(...rows)
    if (rows.length < 1000) break
  }
  return all
}

// ---------- 收款汇总 ----------

export interface ReceivableSummary {
  openCount: number
  /** 已登记金额的未收合计 */
  outstanding: number
  /** 金额未登记的未结清笔数 */
  unknownAmount: number
  dueCount: number
  collectedThisMonth: number
}

export async function receivableSummary(): Promise<ReceivableSummary> {
  const rdb = await db()
  const monthStart = `${todayStr().slice(0, 7)}-01`
  const [open, payments] = await Promise.all([
    rdb.from('receivable_overview').select('amount, outstanding, days_until_remind').eq('settled', false).limit(10000),
    rdb.from('payments').select('amount').is('deleted_at', null).gte('paid_on', monthStart).limit(10000),
  ])
  const openRows = unwrap<{ amount: unknown; outstanding: unknown; days_until_remind: number | null }[]>(open) ?? []
  const paymentRows = unwrap<{ amount: unknown }[]>(payments) ?? []
  return {
    openCount: openRows.length,
    outstanding: openRows.reduce((sum, r) => sum + (Number(r.outstanding) || 0), 0),
    unknownAmount: openRows.filter((r) => r.amount === null).length,
    dueCount: openRows.filter((r) => (r.days_until_remind ?? 1) <= 0).length,
    collectedThisMonth: paymentRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
  }
}

/** 同型号的其他设备中已经设置过的分级（用于复制） */
export async function findStagesByModel(model: string, excludeDeviceId: string): Promise<{ device_id: string; stages: FilterStageOverview[] } | null> {
  if (!model.trim()) return null
  const rdb = await db()
  const devices = unwrap<{ id: string }[]>(
    await rdb.from('device_overview').select('id').eq('model', model).gt('stage_count', 0).neq('id', excludeDeviceId).limit(1),
  )
  if (!devices.length) return null
  return { device_id: devices[0]!.id, stages: await listStages(devices[0]!.id) }
}

export interface WorkOrderFact {
  status: WorkOrderStatus
  type: string
  assignee_id: string | null
  completed_by: string | null
  completed_at: string | null
  created_at: string
}

export async function fetchWorkOrdersSince(start: string): Promise<WorkOrderFact[]> {
  const rdb = await db()
  return (
    unwrap<WorkOrderFact[]>(
      await rdb
        .from('work_orders')
        .select('status, type, assignee_id, completed_by, completed_at, created_at')
        .is('deleted_at', null)
        .gte('created_at', start)
        .limit(10000),
    ) ?? []
  )
}

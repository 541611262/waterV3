// AI 小助手的工具：在浏览器中执行，只使用当前账号有权查看的数据（数据库 RLS 已过滤）。
// 工具名称和参数与云函数 cloudfunctions/ai-chat/index.js 中的定义一致（V3 / V4 共用同一个云函数）。
// - 发给 AI 的电话号码一律打码；回答中的 [[tel:设备ID]] 由网页在本地还原成真实号码
// - 修改只生成"待确认"的提案，用户点击确认后才写入数据库；没有删除能力
import {
  getClient,
  listClientDevices,
  listDevices,
  listFollowUps,
  listReceivables,
  listReplacements,
  searchClients,
  type DeviceStatusKey,
} from '@/api/data'
import type { DeviceOverview } from '@/api/types'
import { parseFlexibleDate, todayStr } from '@/lib/dates'
import { describeDue, describeRemind } from '@/lib/format'
import { maskPhones, normalizePhone, parsePositiveInt } from '@/lib/values'

const MAX_RESULTS = 30

export interface ToolContext {
  isAdmin: boolean
  uid: string
  /** 把待确认的修改交给界面显示确认卡片 */
  propose: (proposal: Proposal) => void
}

export type ProposalAction =
  | { kind: 'follow_up'; clientId: string; date: string; content: string; closeUnpaid: boolean }
  | { kind: 'replacement'; device: DeviceOverview; date: string; filterModel: string; quantity: number; cost: number; notes: string }
  | { kind: 'device_update'; device: DeviceOverview; patch: Record<string, unknown>; unpaid?: boolean; unpaidInterval?: number | null }

export interface Proposal {
  id: string
  title: string
  rows: [string, string][]
  action: ProposalAction
  status: 'pending' | 'saving' | 'done' | 'cancelled' | 'failed'
  message?: string
}

const mask = (value: unknown) => {
  const text = maskPhones(value)
  return text || undefined
}

function compact<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}

/** 一条装机记录发给 AI 的摘要（电话打码，附带可还原的引用） */
export function summarizeDevice(d: DeviceOverview, ctx: Pick<ToolContext, 'isAdmin' | 'uid'>) {
  return compact({
    record_id: d.id,
    customer_id: d.client_id,
    customer: d.client_name,
    province: d.province || undefined,
    region: d.region || undefined,
    address: mask(d.address),
    location: mask(d.location),
    model: mask(d.model),
    quantity: d.quantity || undefined,
    contact: d.contact_person || undefined,
    phone: d.phone ? mask(d.phone) : undefined,
    phone_ref: d.phone ? `[[tel:${d.id}]]` : undefined,
    install_date: d.install_date || undefined,
    last_change: d.last_service_on || undefined,
    next_change: d.next_due_on || undefined,
    due_status: describeDue(d.days_until_due).text,
    interval_days: d.effective_interval_days,
    filter_stages: d.stage_count || undefined,
    water_test: d.need_water_test || undefined,
    long_term_partner: d.long_term_partner || undefined,
    unpaid: d.open_receivable_count > 0 || undefined,
    notes: mask(d.notes),
    owner: ctx.isAdmin && d.owner_id !== ctx.uid ? d.owner_name || '未知' : undefined,
  })
}

function pack(rows: DeviceOverview[], total: number, ctx: ToolContext, limit = 20) {
  const count = Math.min(Math.max(limit || 20, 1), MAX_RESULTS)
  return compact({
    total,
    returned: Math.min(count, rows.length),
    records: rows.slice(0, count).map((d) => summarizeDevice(d, ctx)),
    note: total > count ? `还有 ${total - count} 条未列出，可以缩小范围再查` : undefined,
  })
}

const asArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String).filter(Boolean) : value ? [String(value)] : [])

async function findDevice(id: unknown): Promise<DeviceOverview | null> {
  if (!id) return null
  const result = await listDevices({ page: 1, pageSize: 1, ids: [String(id)] })
  return result.rows[0] ?? null
}

// ---------- 只读工具 ----------

async function searchRecords(args: Record<string, unknown>, ctx: ToolContext) {
  const flags = asArray(args.flags)
  const statuses: DeviceStatusKey[] = []
  if (flags.includes('unpaid')) statuses.push('unpaid')
  if (flags.includes('water_test')) statuses.push('waterTest')
  if (flags.includes('long_term_partner')) statuses.push('partner')
  const regions = asArray(args.regions)
  const within = args.due_within_days === null || args.due_within_days === undefined ? null : Number(args.due_within_days)
  const limit = Number(args.limit) || 20
  // 多个标记需要同时满足：先按第一个标记查询，其余在本地过滤
  const result = await listDevices({
    page: 1,
    pageSize: 500,
    keyword: String(args.keyword ?? ''),
    statuses: statuses.slice(0, 1),
    sort: { field: 'next_due_on', order: 'asc' },
    dueWithin: within !== null && Number.isFinite(within) ? within : undefined,
  })
  const rows = result.rows.filter(
    (d) =>
      (!flags.includes('unpaid') || d.open_receivable_count > 0) &&
      (!flags.includes('water_test') || d.need_water_test) &&
      (!flags.includes('long_term_partner') || d.long_term_partner) &&
      (!regions.length || regions.some((r) => d.region === r || d.province === r || d.region.includes(r))),
  )
  return pack(rows, regions.length || statuses.length > 1 ? rows.length : result.total, ctx, limit)
}

const DUE_TYPES: Record<string, { min?: number; max?: number }> = {
  overdue_or_today: { max: 0 },
  this_week: { min: 1, max: 7 },
  this_month: { min: 8, max: 30 },
  next_month: { min: 31, max: 60 },
}

async function getDueList(args: Record<string, unknown>, ctx: ToolContext) {
  const type = String(args.type ?? '')
  if (type === 'unpaid') {
    const result = await listReceivables({ page: 1, pageSize: MAX_RESULTS, status: 'open', sort: { field: 'next_remind_on', order: 'asc' } })
    const rows = result.rows.filter((r) => (r.days_until_remind ?? 999) <= 7)
    return compact({
      total: rows.length,
      receivables: rows.map((r) => ({
        customer_id: r.client_id,
        record_id: r.device_id ?? undefined,
        customer: r.client_name,
        title: r.title,
        amount: r.amount === null ? '金额未登记' : Number(r.amount),
        outstanding: r.outstanding === null ? undefined : Number(r.outstanding),
        remind: `${r.next_remind_on}（${describeRemind(r.days_until_remind)}）`,
      })),
    })
  }
  const range = DUE_TYPES[type]
  if (!range) return { error: 'type 必须是 overdue_or_today、this_week、this_month、next_month、unpaid 之一' }
  const result = await listDevices({ page: 1, pageSize: MAX_RESULTS, dueMin: range.min, dueWithin: range.max, sort: { field: 'next_due_on', order: 'asc' } })
  return pack(result.rows, result.total, ctx, MAX_RESULTS)
}

async function resolveClient(args: Record<string, unknown>): Promise<{ id?: string; candidates?: { customer_id: string; name: string }[] }> {
  if (args.customer_id) {
    const client = await getClient(String(args.customer_id)).catch(() => null)
    if (client && !client.deleted_at) return { id: client.id }
  }
  const name = String(args.customer_name ?? '').trim()
  if (!name) return {}
  const found = await searchClients(name, 10)
  const exact = found.filter((c) => c.name === name)
  if (exact.length === 1) return { id: exact[0]!.id }
  if (found.length === 1) return { id: found[0]!.id }
  if (found.length > 1) return { candidates: found.map((c) => ({ customer_id: c.id, name: c.name })) }
  return {}
}

async function getCustomerDetail(args: Record<string, unknown>, ctx: ToolContext) {
  const { id, candidates } = await resolveClient(args)
  if (candidates) return { error: '匹配到多个客户，请指定 customer_id', candidates }
  if (!id) return { error: '找不到该客户，请先用 search_records 查找' }
  const [client, devices, followUps, replacements, receivables] = await Promise.all([
    getClient(id),
    listClientDevices(id),
    listFollowUps(id),
    listReplacements({ clientId: id }),
    listReceivables({ page: 1, pageSize: 50, clientId: id, status: 'open' }),
  ])
  return compact({
    customer_id: id,
    name: client?.name,
    province: client?.province || undefined,
    region: client?.region || undefined,
    long_term_partner: client?.long_term_partner || undefined,
    notes: mask(client?.notes),
    follow_ups: followUps.slice(0, 20).map((f) => ({ date: f.followed_on || '日期未知', content: mask(f.content) })),
    open_receivables: receivables.rows.map((r) => ({
      title: r.title,
      amount: r.amount === null ? '金额未登记' : Number(r.amount),
      paid: Number(r.paid_amount),
      remind: describeRemind(r.days_until_remind),
    })),
    records: devices.map((d) => ({
      ...summarizeDevice(d, ctx),
      replacement_history: replacements
        .filter((r) => r.device_id === d.id)
        .slice(0, 10)
        .map((r) => compact({ date: r.replaced_on || '日期未知', filter_model: mask(r.filter_model), quantity: r.quantity, cost: Number(r.cost) || undefined, notes: mask(r.notes) })),
    })),
  })
}

async function allDevices(): Promise<DeviceOverview[]> {
  const all: DeviceOverview[] = []
  for (let page = 1; page <= 20; page++) {
    const result = await listDevices({ page, pageSize: 500 })
    all.push(...result.rows)
    if (all.length >= result.total || !result.rows.length) break
  }
  return all
}

async function getStats() {
  const devices = await allDevices()
  const byRegion: Record<string, number> = {}
  for (const d of devices) {
    const key = d.region || d.province || '未填写'
    byRegion[key] = (byRegion[key] ?? 0) + 1
  }
  const inRange = (min: number | undefined, max: number) => devices.filter((d) => d.days_until_due !== null && d.days_until_due <= max && (min === undefined || d.days_until_due >= min)).length
  return {
    customers: new Set(devices.map((d) => d.client_id)).size,
    records: devices.length,
    records_by_region: byRegion,
    overdue_or_today: inRange(undefined, 0),
    this_week: inRange(1, 7),
    this_month: inRange(8, 30),
    next_month: inRange(31, 60),
    no_date: devices.filter((d) => d.next_due_on === null).length,
    unpaid_records: devices.filter((d) => d.open_receivable_count > 0).length,
    water_test_records: devices.filter((d) => d.need_water_test).length,
    long_term_partner_customers: new Set(devices.filter((d) => d.long_term_partner).map((d) => d.client_id)).size,
  }
}

async function checkDataQuality() {
  const devices = await allDevices()
  const issues: Record<string, { record_id: string; customer: string; location?: string }[]> = {
    no_contact_or_phone: [],
    no_dates: [],
    no_model: [],
    no_quantity: [],
    no_address: [],
  }
  for (const d of devices) {
    const ref = compact({ record_id: d.id, customer: d.client_name, location: mask(d.location) })
    if (!d.contact_person && !d.phone) issues.no_contact_or_phone!.push(ref)
    if (!d.last_service_on) issues.no_dates!.push(ref)
    if (!d.model) issues.no_model!.push(ref)
    if (!d.quantity) issues.no_quantity!.push(ref)
    if (!d.address) issues.no_address!.push(ref)
  }
  return Object.fromEntries(Object.entries(issues).map(([k, list]) => [k, { count: list.length, examples: list.slice(0, 15) }]))
}

// ---------- 修改：只生成确认卡片 ----------

let proposalSeq = 0
function propose(ctx: ToolContext, title: string, rows: [string, string][], action: ProposalAction) {
  const id = `p${++proposalSeq}`
  ctx.propose({ id, title, rows, action, status: 'pending' })
  return { status: 'waiting_for_user_confirmation', proposal_id: id, message: '已在界面上生成确认卡片，等待用户点击确认。不要说已经保存。' }
}

/** 把 AI 写在内容里的 [[tel:设备ID]] 换回真实号码 */
export async function resolveTelTokens(text: unknown): Promise<string> {
  const value = String(text ?? '')
  const ids = [...value.matchAll(/\[\[tel:([^\]]+)\]\]/g)].map((m) => m[1]!)
  let result = value
  for (const id of ids) {
    const d = await findDevice(id)
    result = result.replace(`[[tel:${id}]]`, d?.phone || '（电话未知）')
  }
  return result
}

const canEdit = (d: { owner_id: string }, ctx: ToolContext) => ctx.isAdmin || d.owner_id === ctx.uid

async function proposeFollowUp(args: Record<string, unknown>, ctx: ToolContext) {
  const { id } = await resolveClient({ customer_id: args.customer_id })
  if (!id) return { error: '找不到该客户，请先用 search_records 或 get_customer_detail 查到 customer_id' }
  const client = await getClient(id)
  const content = (await resolveTelTokens(args.content)).trim()
  if (!content) return { error: '跟踪内容不能为空' }
  const date = parseFlexibleDate(args.date) || todayStr()
  const closeUnpaid = Boolean(args.clear_unpaid)
  return propose(ctx, '添加跟踪记录', [['客户', client?.name ?? ''], ['日期', date], ['内容', content], ...(closeUnpaid ? ([['同时', '结清该客户所有未结清的应收款']] as [string, string][]) : [])], {
    kind: 'follow_up',
    clientId: id,
    date,
    content,
    closeUnpaid,
  })
}

async function proposeReplacement(args: Record<string, unknown>, ctx: ToolContext) {
  const device = await findDevice(args.record_id)
  if (!device) return { error: '找不到该装机记录，请先用 search_records 查到 record_id' }
  const date = parseFlexibleDate(args.date) || todayStr()
  const filterModel = String(args.filter_model || device.model || '标准滤芯').trim()
  const quantity = parsePositiveInt(args.quantity) || device.quantity || 1
  const cost = Number(args.cost) > 0 ? Number(args.cost) : 0
  const notes = (await resolveTelTokens(args.notes)).trim()
  return propose(
    ctx,
    '登记换芯',
    [
      ['客户', device.client_name],
      ['装机记录', [device.address || device.location, device.model].filter(Boolean).join(' · ') || '（未命名）'],
      ['更换日期', date],
      ['滤芯型号', filterModel],
      ['数量', String(quantity)],
      ['费用', cost ? `${cost} 元` : '未记录'],
      ...(notes ? ([['备注', notes]] as [string, string][]) : []),
    ],
    { kind: 'replacement', device, date, filterModel, quantity, cost, notes },
  )
}

/** AI 使用的字段名（与 V3 相同）→ V4 数据库列 */
const EDITABLE: Record<string, { column: string; label: string; type: 'text' | 'phone' | 'int' | 'date' | 'bool' }> = {
  contactPerson: { column: 'contact_person', label: '联系人', type: 'text' },
  phoneNumber: { column: 'phone', label: '联系电话', type: 'phone' },
  address: { column: 'address', label: '详细地址', type: 'text' },
  location: { column: 'location', label: '安装位置', type: 'text' },
  model: { column: 'model', label: '型号', type: 'text' },
  quantity: { column: 'quantity', label: '数量', type: 'int' },
  notes: { column: 'notes', label: '备注', type: 'text' },
  installDate: { column: 'install_date', label: '装机时间', type: 'date' },
  filterPurchaseDate: { column: 'filter_purchase_date', label: '滤芯购买日期', type: 'date' },
  customInterval: { column: 'interval_days', label: '更换间隔(天)', type: 'int' },
  needWaterTest: { column: 'need_water_test', label: '需要验水', type: 'bool' },
}

const show = (value: unknown, type: string) =>
  value === null || value === undefined || value === '' ? '（空）' : type === 'bool' ? (value ? '是' : '否') : String(value)

async function proposeRecordUpdate(args: Record<string, unknown>, ctx: ToolContext) {
  const device = await findDevice(args.record_id)
  if (!device) return { error: '找不到该装机记录，请先用 search_records 查到 record_id' }
  if (!canEdit(device, ctx)) return { error: '没有权限修改该记录（只能修改自己负责的客户）' }
  const input = args.changes && typeof args.changes === 'object' ? (args.changes as Record<string, unknown>) : {}
  const patch: Record<string, unknown> = {}
  const rows: [string, string][] = [
    ['客户', device.client_name],
    ['装机记录', [device.address || device.location, device.model].filter(Boolean).join(' · ') || '（未命名）'],
  ]
  let unpaid: boolean | undefined
  let unpaidInterval: number | null | undefined

  for (const [key, raw] of Object.entries(input)) {
    if (key === 'hasUnpaid') {
      unpaid = Boolean(raw)
      const now = device.open_receivable_count > 0
      if (unpaid !== now) rows.push(['未收款', `${now ? '有' : '无'} → ${unpaid ? '有（新建一笔金额未登记的应收）' : '无（结清未结清的应收）'}`])
      else unpaid = undefined
      continue
    }
    if (key === 'unpaidInterval') {
      unpaidInterval = parsePositiveInt(raw)
      rows.push(['催款间隔(天)', show(unpaidInterval, 'int')])
      continue
    }
    const field = EDITABLE[key]
    if (!field) return { error: `不支持修改字段 ${key}` }
    let value: unknown
    if (field.type === 'bool') value = Boolean(raw)
    else if (field.type === 'int') value = raw === null || raw === '' ? null : parsePositiveInt(raw)
    else if (field.type === 'date') {
      value = raw ? parseFlexibleDate(raw) || '' : null
      if (raw && !value) return { error: `${field.label} 的日期无法识别：${raw}` }
    } else if (field.type === 'phone') {
      value = normalizePhone(await resolveTelTokens(raw))
      if (String(value).includes('*')) return { error: '电话号码不完整（含 *），请让用户提供完整号码' }
    } else value = (await resolveTelTokens(raw)).trim()
    const current = (device as unknown as Record<string, unknown>)[field.column]
    if (show(value, field.type) === show(current, field.type)) continue
    patch[field.column] = value
    rows.push([field.label, `${show(current, field.type)} → ${show(value, field.type)}`])
  }
  if (!Object.keys(patch).length && unpaid === undefined && unpaidInterval === undefined) return { error: '没有需要修改的内容（新值与原值相同）' }
  return propose(ctx, '修改装机记录', rows, { kind: 'device_update', device, patch, unpaid, unpaidInterval })
}

const TOOLS: Record<string, (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>> = {
  search_records: searchRecords,
  get_due_list: getDueList,
  get_customer_detail: getCustomerDetail,
  get_stats: () => getStats(),
  check_data_quality: () => checkDataQuality(),
  propose_follow_up: proposeFollowUp,
  propose_replacement: proposeReplacement,
  propose_record_update: proposeRecordUpdate,
}

export async function executeTool(name: string | undefined, rawArgs: string | undefined, ctx: ToolContext): Promise<unknown> {
  let args: Record<string, unknown> = {}
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {}
  } catch {
    return { error: '工具参数不是有效的 JSON' }
  }
  const fn = name ? TOOLS[name] : undefined
  if (!fn) return { error: `未知工具：${name}` }
  try {
    return await fn(args ?? {}, ctx)
  } catch (error) {
    return { error: `工具执行出错：${error instanceof Error ? error.message : String(error)}` }
  }
}

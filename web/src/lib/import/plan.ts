// 导入计划：把解析后的表格与数据库中已有的数据对比，算出要新增 / 更新哪些记录（纯函数，有单元测试）
// 合并规则与 V3 一致：
//   - 客户按名称匹配（只匹配自己负责的客户）
//   - 装机记录按表格中出现的关键列（地址、安装位置、装机时间、型号、数量）匹配导入前已有的记录；
//     匹配上就只更新表格里填了值的字段，匹配不上就新增；同一文件里的相同两行视为两台设备
//   - 换芯记录按 日期|型号|数量|备注 去重，跟踪记录按 日期|内容 去重
//   - "是否有未收款"：是 → 没有未结清应收时新建一笔（金额未登记）；否 → 结清该设备金额未登记的应收
import type { ParsedDevice, ParsedSheet } from './rows'
import { DEVICE_KEY_FIELDS, type SheetFieldKey } from './fields'

export interface ExistingReplacement {
  replaced_on: string | null
  filter_model: string
  quantity: number
  notes: string
}

export interface ExistingReceivable {
  id: string
  version: number
  amount: number | string | null
  remind_interval_days?: number | null
}

export interface ExistingDevice {
  id: string
  version: number
  address: string
  location: string
  install_date: string | null
  model: string
  quantity: number | null
  replacements: ExistingReplacement[]
  /** 未结清的应收 */
  openReceivables: ExistingReceivable[]
}

export interface ExistingClient {
  id: string
  version: number
  name: string
  province: string
  region: string
  long_term_partner: boolean
  followUps: { followed_on: string | null; content: string }[]
  devices: ExistingDevice[]
}

export type Ref = { id: string } | { ref: string }

export interface DeviceFields {
  address?: string
  contact_person?: string
  phone?: string
  install_date?: string
  model?: string
  quantity?: number
  location?: string
  filter_purchase_date?: string
  interval_days?: number
  notes?: string
  need_water_test?: boolean
}

export interface ClientFields {
  province?: string
  region?: string
  long_term_partner?: boolean
}

export interface ImportPlan {
  newClients: ({ ref: string; name: string } & Required<ClientFields>)[]
  clientUpdates: { id: string; version: number; patch: ClientFields }[]
  newDevices: { ref: string; client: Ref; fields: DeviceFields }[]
  deviceUpdates: { id: string; version: number; patch: DeviceFields }[]
  replacements: {
    device: Ref
    replaced_on: string | null
    filter_model: string
    quantity: number
    cost: number
    operator_name: string
    notes: string
  }[]
  followUps: { client: Ref; followed_on: string | null; content: string; operator_name: string }[]
  newReceivables: { device: Ref; remind_interval_days: number | null }[]
  receivableUpdates: { id: string; version: number; remind_interval_days?: number; close?: boolean }[]
  stats: {
    newClients: number
    newDevices: number
    updatedDevices: number
    replacements: number
    followUps: number
    skippedRows: number[]
    badDates: string[]
  }
}

/** 表格字段 → 数据库列 */
const DEVICE_COLUMN: Partial<Record<keyof ParsedDevice, keyof DeviceFields>> = {
  address: 'address',
  contactPerson: 'contact_person',
  phoneNumber: 'phone',
  installDate: 'install_date',
  model: 'model',
  quantity: 'quantity',
  location: 'location',
  filterPurchaseDate: 'filter_purchase_date',
  customInterval: 'interval_days',
  notes: 'notes',
  needWaterTest: 'need_water_test',
}

const KEY_COLUMN: Partial<Record<SheetFieldKey, keyof ExistingDevice & keyof DeviceFields>> = {
  address: 'address',
  location: 'location',
  installDate: 'install_date',
  model: 'model',
  quantity: 'quantity',
}

function keyText(value: unknown): string {
  return String(value ?? '').trim()
}

export function toDeviceFields(device: ParsedDevice): DeviceFields {
  const fields: DeviceFields = {}
  for (const [from, to] of Object.entries(DEVICE_COLUMN) as [keyof ParsedDevice, keyof DeviceFields][]) {
    const value = device[from]
    if (value === undefined) continue
    if (to === 'interval_days' && (typeof value !== 'number' || value > 3650)) continue
    ;(fields as Record<string, unknown>)[to] = value
  }
  return fields
}

const historyKey = (r: { replaced_on: string | null; filter_model: string; quantity: number; notes: string }) =>
  `${r.replaced_on ?? ''}|${r.filter_model}|${r.quantity}|${r.notes}`
const followUpKey = (f: { followed_on: string | null; content: string }) => `${f.followed_on ?? ''}|${f.content}`

export function buildImportPlan(sheet: ParsedSheet, existing: ExistingClient[], operatorName: string): ImportPlan {
  const plan: ImportPlan = {
    newClients: [],
    clientUpdates: [],
    newDevices: [],
    deviceUpdates: [],
    replacements: [],
    followUps: [],
    newReceivables: [],
    receivableUpdates: [],
    stats: {
      newClients: 0,
      newDevices: 0,
      updatedDevices: 0,
      replacements: 0,
      followUps: 0,
      skippedRows: [...sheet.skippedRows],
      badDates: [...sheet.badDates],
    },
  }

  const keyFields = DEVICE_KEY_FIELDS.filter((key) => sheet.mapping[key]?.length)
  const existingByName = new Map(existing.map((c) => [c.name, c]))

  interface ClientState {
    ref: Ref
    fields: Required<ClientFields>
    original: Required<ClientFields> | null
    version: number
    partnerConfirmed: boolean
    followUpKeys: Set<string>
    pool: ExistingDevice[]
  }
  const clients = new Map<string, ClientState>()
  const deviceUpdates = new Map<string, { version: number; patch: DeviceFields }>()
  const deviceHistoryKeys = new Map<string, Set<string>>()
  const receivableUpdates = new Map<string, { id: string; version: number; remind_interval_days?: number; close?: boolean }>()

  for (const row of sheet.rows) {
    const name = row.customer.name!
    let state = clients.get(name)
    if (!state) {
      const found = existingByName.get(name)
      if (found) {
        const fields = { province: found.province, region: found.region, long_term_partner: found.long_term_partner }
        state = {
          ref: { id: found.id },
          fields: { ...fields },
          original: fields,
          version: found.version,
          partnerConfirmed: false,
          followUpKeys: new Set(found.followUps.map(followUpKey)),
          pool: [...found.devices],
        }
      } else {
        const ref = `c${plan.newClients.length + 1}`
        state = {
          ref: { ref },
          fields: { province: '', region: '', long_term_partner: false },
          original: null,
          version: 0,
          partnerConfirmed: false,
          followUpKeys: new Set(),
          pool: [],
        }
        plan.newClients.push({ ref, name, ...state.fields })
        plan.stats.newClients++
      }
      clients.set(name, state)
    }

    // 客户级字段
    if (row.customer.province) state.fields.province = row.customer.province
    if (row.customer.region) state.fields.region = row.customer.region
    if (row.customer.longTermPartner === true) {
      state.fields.long_term_partner = true
      state.partnerConfirmed = true
    } else if (row.customer.longTermPartner === false && !state.partnerConfirmed) {
      state.fields.long_term_partner = false
    }

    for (const f of row.followUps) {
      const item = { followed_on: f.date || null, content: f.content }
      const key = followUpKey(item)
      if (state.followUpKeys.has(key)) continue
      state.followUpKeys.add(key)
      plan.followUps.push({ client: state.ref, ...item, operator_name: operatorName })
      plan.stats.followUps++
    }

    // 装机记录
    const fields = toDeviceFields(row.device)
    const parsedKey = keyFields.map((k) => keyText(row.device[k as keyof ParsedDevice])).join('|')
    const matchIndex = keyFields.length
      ? state.pool.findIndex((d) => keyFields.map((k) => keyText(d[KEY_COLUMN[k]!])).join('|') === parsedKey)
      : -1

    let deviceRef: Ref
    let existingDevice: ExistingDevice | null = null
    if (matchIndex >= 0) {
      existingDevice = state.pool.splice(matchIndex, 1)[0]!
      deviceRef = { id: existingDevice.id }
      const update = deviceUpdates.get(existingDevice.id) ?? { version: existingDevice.version, patch: {} }
      Object.assign(update.patch, fields)
      deviceUpdates.set(existingDevice.id, update)
      plan.stats.updatedDevices++
    } else {
      const ref = `d${plan.newDevices.length + 1}`
      deviceRef = { ref }
      plan.newDevices.push({ ref, client: state.ref, fields })
      plan.stats.newDevices++
    }

    // 换芯记录（已有设备按键去重；新设备全部加入，与 V3 一致）
    const keys = existingDevice
      ? (deviceHistoryKeys.get(existingDevice.id) ?? new Set(existingDevice.replacements.map(historyKey)))
      : null
    if (existingDevice && keys) deviceHistoryKeys.set(existingDevice.id, keys)
    for (const h of row.history) {
      const item = { replaced_on: h.date || null, filter_model: h.filterModel, quantity: h.quantity || 1, notes: h.notes }
      if (keys) {
        const key = historyKey(item)
        if (keys.has(key)) continue
        keys.add(key)
      }
      plan.replacements.push({ device: deviceRef, ...item, cost: h.cost || 0, operator_name: h.operator })
      plan.stats.replacements++
    }

    // 未收款
    const interval = row.device.unpaidInterval && row.device.unpaidInterval <= 3650 ? row.device.unpaidInterval : undefined
    const open = existingDevice?.openReceivables ?? []
    const intervalChanged = (r: ExistingReceivable) => interval !== undefined && r.remind_interval_days !== interval
    if (row.device.hasUnpaid === true) {
      if (open.length) {
        if (intervalChanged(open[0]!)) mergeReceivableUpdate(receivableUpdates, open[0]!, { remind_interval_days: interval })
      } else {
        plan.newReceivables.push({ device: deviceRef, remind_interval_days: interval ?? null })
      }
    } else if (row.device.hasUnpaid === false) {
      for (const r of open.filter((r) => r.amount === null)) mergeReceivableUpdate(receivableUpdates, r, { close: true })
    } else if (open.length && intervalChanged(open[0]!)) {
      mergeReceivableUpdate(receivableUpdates, open[0]!, { remind_interval_days: interval })
    }
  }

  for (const [name, state] of clients) {
    if ('ref' in state.ref) {
      const target = plan.newClients.find((c) => c.name === name)!
      Object.assign(target, state.fields)
    } else if (state.original) {
      const patch: ClientFields = {}
      for (const key of ['province', 'region', 'long_term_partner'] as const) {
        if (state.fields[key] !== state.original[key]) (patch as Record<string, unknown>)[key] = state.fields[key]
      }
      if (Object.keys(patch).length) plan.clientUpdates.push({ id: state.ref.id, version: state.version, patch })
    }
  }
  for (const [id, update] of deviceUpdates) {
    if (Object.keys(update.patch).length) plan.deviceUpdates.push({ id, ...update })
  }
  plan.receivableUpdates = [...receivableUpdates.values()]
  return plan
}

function mergeReceivableUpdate(
  map: Map<string, { id: string; version: number; remind_interval_days?: number; close?: boolean }>,
  receivable: ExistingReceivable,
  change: { remind_interval_days?: number; close?: boolean },
) {
  const current = map.get(receivable.id) ?? { id: receivable.id, version: receivable.version }
  map.set(receivable.id, { ...current, ...change })
}

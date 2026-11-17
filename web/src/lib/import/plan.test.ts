import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildImportPlan, type ExistingClient, type ImportPlan } from './plan'
import { parseSheet, type ParsedSheet } from './rows'
import { readTableFile } from './workbook'

const EXAMPLES = resolve(process.cwd(), '../examples/测试表格')

function load(file: string): ParsedSheet {
  const path = resolve(EXAMPLES, file)
  const bytes = readFileSync(path)
  return parseSheet(readTableFile(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))!
}

/** 测试用：把导入计划"执行"到内存中的已有数据上，模拟数据库 */
function applyPlan(existing: ExistingClient[], plan: ImportPlan): ExistingClient[] {
  let seq = 0
  const clients = structuredClone(existing)
  const clientIds = new Map<string, string>()
  const deviceIds = new Map<string, string>()
  const resolveClient = (r: { id: string } | { ref: string }) => ('id' in r ? r.id : clientIds.get(r.ref)!)
  const resolveDevice = (r: { id: string } | { ref: string }) => ('id' in r ? r.id : deviceIds.get(r.ref)!)
  const findDevice = (id: string) => clients.flatMap((c) => c.devices).find((d) => d.id === id)!

  for (const c of plan.newClients) {
    const id = `client-${++seq}`
    clientIds.set(c.ref, id)
    clients.push({ id, version: 1, name: c.name, province: c.province, region: c.region, long_term_partner: c.long_term_partner, followUps: [], devices: [] })
  }
  for (const u of plan.clientUpdates) Object.assign(clients.find((c) => c.id === u.id)!, u.patch)
  for (const d of plan.newDevices) {
    const id = `device-${++seq}`
    deviceIds.set(d.ref, id)
    clients.find((c) => c.id === resolveClient(d.client))!.devices.push({
      id,
      version: 1,
      address: d.fields.address ?? '',
      location: d.fields.location ?? '',
      install_date: d.fields.install_date ?? null,
      model: d.fields.model ?? '',
      quantity: d.fields.quantity ?? null,
      replacements: [],
      openReceivables: [],
    })
  }
  for (const u of plan.deviceUpdates) Object.assign(findDevice(u.id), u.patch)
  for (const r of plan.replacements) findDevice(resolveDevice(r.device)).replacements.push(r)
  for (const f of plan.followUps) clients.find((c) => c.id === resolveClient(f.client))!.followUps.push(f)
  for (const r of plan.newReceivables) findDevice(resolveDevice(r.device)).openReceivables.push({ id: `r-${++seq}`, version: 1, amount: null })
  return clients
}

describe('导入计划与 V3 一致', () => {
  // V3 实际导入同样文件时显示的结果（在旧版中实测）：
  //   01：新增客户 8 个，新增装机记录 20 条，更换记录 22 条，跟踪记录 4 条
  //   05（在 01 之后）：新增客户 1 个，新增装机记录 3 条，更新已有记录 20 条，更换记录 4 条，跟踪记录 1 条
  it('空数据导入 01', () => {
    const plan = buildImportPlan(load('01_标准格式_多客户多设备.xlsx'), [], '甲')
    expect(plan.stats).toMatchObject({ newClients: 8, newDevices: 20, updatedDevices: 0, replacements: 22, followUps: 4 })
    expect(plan.clientUpdates).toEqual([])
    expect(plan.deviceUpdates).toEqual([])
  })

  it('在 01 的基础上导入 05：已有记录被更新，不重复', () => {
    const afterFirst = applyPlan([], buildImportPlan(load('01_标准格式_多客户多设备.xlsx'), [], '甲'))
    const plan = buildImportPlan(load('05_更新导入_请在01之后导入.xlsx'), afterFirst, '甲')
    expect(plan.stats).toMatchObject({ newClients: 1, newDevices: 3, updatedDevices: 20, replacements: 4, followUps: 1 })
  })

  it('同一文件导入两次，第二次不新增任何记录', () => {
    const sheet = load('01_标准格式_多客户多设备.xlsx')
    const after = applyPlan([], buildImportPlan(sheet, [], '甲'))
    const again = buildImportPlan(sheet, after, '甲')
    expect(again.stats).toMatchObject({ newClients: 0, newDevices: 0, replacements: 0, followUps: 0, updatedDevices: 20 })
    expect(again.newReceivables).toEqual([])
    expect(again.clientUpdates).toEqual([])
  })

  it('日期无法识别的单元格会被报告', () => {
    const plan = buildImportPlan(load('02_日期格式混合.xlsx'), [], '甲')
    expect(plan.stats.badDates).toHaveLength(2)
    expect(plan.stats.newDevices).toBe(11)
  })

  it('无客户名称的行被跳过', () => {
    const plan = buildImportPlan(load('04_手工台账_非标准表头.xlsx'), [], '乙')
    expect(plan.stats.skippedRows).toHaveLength(1)
    expect(plan.stats.newClients).toBe(2)
    expect(plan.stats.newDevices).toBe(3)
  })
})

describe('未收款', () => {
  const base: ExistingClient = {
    id: 'c1',
    version: 3,
    name: '客户甲',
    province: '广东',
    region: '深圳',
    long_term_partner: false,
    followUps: [],
    devices: [
      {
        id: 'd1',
        version: 2,
        address: 'A栋',
        location: '',
        install_date: null,
        model: '',
        quantity: null,
        replacements: [],
        openReceivables: [{ id: 'r1', version: 1, amount: null }],
      },
    ],
  }
  const sheet = (hasUnpaid: boolean | undefined, unpaidInterval?: number): ParsedSheet => ({
    headerRowNumber: 1,
    mapping: { name: [0], address: [1] },
    rows: [{ rowNumber: 2, customer: { name: '客户甲' }, device: { address: 'A栋', hasUnpaid, unpaidInterval }, followUps: [], history: [] }],
    skippedRows: [],
    badDates: [],
  })

  it('"否"结清金额未登记的应收', () => {
    expect(buildImportPlan(sheet(false), [base], '甲').receivableUpdates).toEqual([{ id: 'r1', version: 1, close: true }])
  })

  it('"是"且已有未结清应收时不重复新建，只更新催款周期', () => {
    const plan = buildImportPlan(sheet(true, 15), [base], '甲')
    expect(plan.newReceivables).toEqual([])
    expect(plan.receivableUpdates).toEqual([{ id: 'r1', version: 1, remind_interval_days: 15 }])
  })

  it('新设备"是"→ 新建应收', () => {
    const plan = buildImportPlan(
      { ...sheet(true), rows: [{ ...sheet(true).rows[0]!, device: { address: 'B栋', hasUnpaid: true } }] },
      [base],
      '甲',
    )
    expect(plan.newReceivables).toEqual([{ device: { ref: 'd1' }, remind_interval_days: null }])
  })

  it('催款周期与现有相同时不产生更新', () => {
    const same = structuredClone(base)
    same.devices[0]!.openReceivables[0]!.remind_interval_days = 15
    expect(buildImportPlan(sheet(true, 15), [same], '甲').receivableUpdates).toEqual([])
  })

  it('客户字段没有变化时不产生更新', () => {
    const plan = buildImportPlan(sheet(undefined), [base], '甲')
    expect(plan.clientUpdates).toEqual([])
    expect(plan.deviceUpdates).toEqual([{ id: 'd1', version: 2, patch: { address: 'A栋' } }])
  })
})

describe('导出后重新导入（往返）', () => {
  it('导出的 19 列文件重新导入不会产生任何新记录，字段内容不变', async () => {
    const { buildExportRows } = await import('./exportRows')
    const sheet = load('01_标准格式_多客户多设备.xlsx')
    const plan = buildImportPlan(sheet, [], '甲')

    // 按计划组装"数据库中的数据"，再导出
    const entries = plan.newDevices.map((d) => {
      const client = plan.newClients.find((c) => 'ref' in d.client && c.ref === d.client.ref)!
      return {
        client,
        device: {
          address: d.fields.address ?? '',
          phone: d.fields.phone ?? '',
          contact_person: d.fields.contact_person ?? '',
          install_date: d.fields.install_date ?? null,
          model: d.fields.model ?? '',
          quantity: d.fields.quantity ?? null,
          location: d.fields.location ?? '',
          filter_purchase_date: d.fields.filter_purchase_date ?? null,
          interval_days: d.fields.interval_days ?? null,
          notes: d.fields.notes ?? '',
          need_water_test: d.fields.need_water_test ?? false,
        },
        followUps: plan.followUps.filter((f) => 'ref' in f.client && f.client.ref === client.ref),
        replacements: plan.replacements.filter((r) => 'ref' in r.device && r.device.ref === d.ref),
        unpaid: { open: plan.newReceivables.some((r) => 'ref' in r.device && r.device.ref === d.ref), interval: null },
      }
    })
    const exported = parseSheet(buildExportRows(entries))!
    expect(exported.badDates).toEqual([])

    const again = buildImportPlan(exported, applyPlan([], plan), '甲')
    expect(again.stats).toMatchObject({ newClients: 0, newDevices: 0, replacements: 0, followUps: 0 })
    expect(again.newReceivables).toEqual([])
    // 重新导入时每台设备的字段与原始导入完全相同
    const original = plan.newDevices.map((d) => d.fields)
    const reimported = exported.rows.map((r) => buildImportPlan({ ...exported, rows: [r] }, [], '甲').newDevices[0]!.fields)
    expect(reimported).toEqual(original)
  })
})

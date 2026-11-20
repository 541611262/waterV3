import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFollowUpsCell, parseHistoryCell } from './cells'
import { detectColumnMapping, findHeaderRow } from './columns'
import { parseDelimitedText, toCsv } from './csv'
import { SHEET_FIELDS } from './fields'
import { parseSheet } from './rows'
import { readTableFile } from './workbook'

// 测试在 web/ 目录下运行，示例表格在仓库根目录的 examples/ 中
const EXAMPLES = resolve(process.cwd(), '../examples')

function loadExample(relativePath: string) {
  const path = resolve(EXAMPLES, relativePath)
  const bytes = readFileSync(path)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return parseSheet(readTableFile(path, buffer))!
}

const customerCount = (sheet: ReturnType<typeof loadExample>) => new Set(sheet.rows.map((r) => r.customer.name)).size

describe('表头识别', () => {
  it('样板的 19 列全部识别', () => {
    const mapping = detectColumnMapping(SHEET_FIELDS.map((f) => f.header))
    SHEET_FIELDS.forEach((field, index) => expect(mapping[field.key]).toEqual([index]))
  })

  it('"未收款自定义间隔(天)"不会被识别成滤芯更换间隔', () => {
    const mapping = detectColumnMapping(['客户名称', '未收款自定义间隔(天)', '更换间隔'])
    expect(mapping.unpaidInterval).toEqual([1])
    expect(mapping.customInterval).toEqual([2])
  })

  it('旧格式：间隔按月换算，多列历史记录', () => {
    const mapping = detectColumnMapping(['客户名称', '联系人', '自定义间隔(月)', '历史记录1', '历史记录2'])
    expect(mapping.intervalInMonths).toBe(true)
    expect(mapping.replacementHistory).toEqual([3, 4])
  })

  it('标题行含"客户"二字时，选识别列最多的一行作为表头', () => {
    const header = findHeaderRow([['2026年客户设备台账'], [], ['公司名称', '手机', '安装日期', '机型', '台数']])
    expect(header?.index).toBe(2)
  })
})

describe('详情列', () => {
  it('跟踪记录：每行一条，行首日期', () => {
    expect(parseFollowUpsCell('2025.09.20 电话回访，下月换芯\n没有日期的备注')).toEqual([
      { date: '2025-09-20', content: '电话回访，下月换芯' },
      { date: '', content: '没有日期的备注' },
    ])
  })

  it('历史记录：竖线格式、旧逗号格式、手写格式、无日期文字', () => {
    const records = parseHistoryCell(
      [
        '2025-06-01|CY-2H 滤芯|2|300|admin|定期更换',
        '2024-12-01,标准滤芯,1,100,定期更换,admin',
        '2024.3.7 更换2支',
        '客户自己换过一次',
        '无历史记录',
      ].join('\n'),
    )
    expect(records).toHaveLength(4)
    expect(records[0]).toEqual({ date: '2025-06-01', filterModel: 'CY-2H 滤芯', quantity: 2, cost: 300, operator: 'admin', notes: '定期更换' })
    expect(records[1]).toMatchObject({ date: '2024-12-01', filterModel: '标准滤芯', cost: 100, notes: '定期更换', operator: 'admin' })
    expect(records[2]).toMatchObject({ date: '2024-03-07', notes: '更换2支' })
    expect(records[3]).toMatchObject({ date: '', notes: '客户自己换过一次' })
  })
})

describe('CSV', () => {
  it('引号内的逗号和换行、转义引号；导出后可原样读回', () => {
    const rows = [
      ['客户名称', '型号'],
      ['甲,乙公司', 'RO-400\n106"金色"'],
    ]
    const csv = toCsv(rows)
    expect(parseDelimitedText(csv.replace(/^﻿/, ''))).toEqual(rows)
  })
})

// 与 examples/测试表格/说明.md 中的预期一致
describe('示例表格', () => {
  it('01 标准格式：8 个客户、20 条装机记录、22 条更换记录、4 条跟踪记录', () => {
    const sheet = loadExample('测试表格/01_标准格式_多客户多设备.xlsx')
    expect(customerCount(sheet)).toBe(8)
    expect(sheet.rows).toHaveLength(20)
    expect(sheet.rows.reduce((n, r) => n + r.history.length, 0)).toBe(22)
    expect(new Set(sheet.rows.flatMap((r) => r.followUps.map((f) => `${r.customer.name}${f.content}`))).size).toBe(4)
    expect(sheet.rows[3].device.model).toContain('\n')
  })

  it('02 日期格式：9 个识别成功，2 个报告无法识别', () => {
    const sheet = loadExample('测试表格/02_日期格式混合.xlsx')
    expect(sheet.rows).toHaveLength(11)
    expect(sheet.rows.filter((r) => r.device.installDate)).toHaveLength(9)
    expect(sheet.badDates).toHaveLength(2)
    expect(sheet.rows.find((r) => r.device.notes?.startsWith('两位年份'))?.device.installDate).toBe('2023-10-11')
  })

  it('03 合并单元格：每行都带上客户名称和地址', () => {
    const sheet = loadExample('测试表格/03_合并单元格.xlsx')
    expect(sheet.rows).toHaveLength(5)
    expect(sheet.rows.every((r) => r.customer.name && r.device.address)).toBe(true)
  })

  it('04 手工台账：标题行、非标准表头、数字电话、"3台"、缺名称的行被跳过', () => {
    const sheet = loadExample('测试表格/04_手工台账_非标准表头.xlsx')
    expect(sheet.headerRowNumber).toBe(3)
    expect(sheet.rows).toHaveLength(3)
    expect(sheet.skippedRows).toHaveLength(1)
    expect(sheet.rows[0].device).toMatchObject({ phoneNumber: '13700010001', quantity: 3, customInterval: 120, needWaterTest: true, hasUnpaid: true })
    expect(sheet.rows[0].followUps).toHaveLength(1)
  })

  it('旧版 V3 CSV 与更早的旧格式仍可导入', () => {
    expect(loadExample('测试数据_V3格式.csv').rows[0].history).toHaveLength(3)
    const old = loadExample('测试数据_旧格式.csv')
    expect(old.rows.map((r) => r.device.filterPurchaseDate)).toEqual(['2025-02-05', '2025-02-20', '2025-03-15'])
    expect(old.rows[2].device.customInterval).toBe(180)
  })
})

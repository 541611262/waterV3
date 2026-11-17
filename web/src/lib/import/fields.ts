// 《格式样板》19 列的定义。导入导出的列顺序、表头、列宽与样板一致。

export type FieldType = 'text' | 'textarea' | 'phone' | 'date' | 'int' | 'bool' | 'followUps' | 'history'
export type FieldLevel = 'customer' | 'device'

export type SheetFieldKey =
  | 'name'
  | 'province'
  | 'region'
  | 'address'
  | 'phoneNumber'
  | 'contactPerson'
  | 'installDate'
  | 'model'
  | 'quantity'
  | 'location'
  | 'filterPurchaseDate'
  | 'customInterval'
  | 'notes'
  | 'followUps'
  | 'replacementHistory'
  | 'needWaterTest'
  | 'longTermPartner'
  | 'hasUnpaid'
  | 'unpaidInterval'

export interface SheetField {
  key: SheetFieldKey
  header: string
  level: FieldLevel
  type: FieldType
  /** Excel 列宽（字符） */
  width: number
  /** 允许多列（如旧格式的"历史记录1、历史记录2"） */
  multi?: boolean
  /** 表头关键字；数组表示需要同时包含 */
  aliases: Array<string | string[]>
}

export const SHEET_FIELDS: SheetField[] = [
  { key: 'name', header: '客户名称', level: 'customer', type: 'text', width: 27, aliases: ['客户', '名称', '公司', '单位', 'name'] },
  { key: 'province', header: '省份', level: 'customer', type: 'text', width: 6, aliases: ['省'] },
  { key: 'region', header: '区域', level: 'customer', type: 'text', width: 6, aliases: ['区域', '地区', '城市', 'region', 'area'] },
  { key: 'address', header: '详细地址', level: 'device', type: 'text', width: 21, aliases: ['地址', 'address'] },
  { key: 'phoneNumber', header: '联系电话', level: 'device', type: 'phone', width: 12, aliases: ['电话', '手机', 'phone', 'tel'] },
  { key: 'contactPerson', header: '联系人', level: 'device', type: 'text', width: 10, aliases: ['联系人', '负责人', 'contact'] },
  { key: 'installDate', header: '装机时间', level: 'device', type: 'date', width: 14, aliases: ['装机', '安装时间', '安装日期'] },
  { key: 'model', header: '型号', level: 'device', type: 'textarea', width: 11, aliases: ['型号', '机型', 'model'] },
  { key: 'quantity', header: '数量', level: 'device', type: 'int', width: 8, aliases: ['数量', '台数', 'quantity'] },
  { key: 'location', header: '安装位置', level: 'device', type: 'text', width: 8, aliases: ['位置', 'location'] },
  { key: 'filterPurchaseDate', header: '滤芯购买日期', level: 'device', type: 'date', width: 17, aliases: ['购买', '日期', 'purchase', 'date'] },
  { key: 'customInterval', header: '更换滤芯自定义间隔(天)', level: 'device', type: 'int', width: 22, aliases: ['间隔', '天数', 'interval'] },
  { key: 'notes', header: '备注', level: 'device', type: 'textarea', width: 8, aliases: ['备注', '说明', 'notes'] },
  { key: 'followUps', header: '最新跟踪记录详情', level: 'customer', type: 'followUps', width: 16, aliases: ['跟踪', '跟进'] },
  { key: 'replacementHistory', header: '历史记录详情', level: 'device', type: 'history', width: 16, multi: true, aliases: ['历史', 'history'] },
  { key: 'needWaterTest', header: '是否需要验水', level: 'device', type: 'bool', width: 14, aliases: ['验水'] },
  { key: 'longTermPartner', header: '是否长期合作', level: 'customer', type: 'bool', width: 13, aliases: ['长期合作'] },
  { key: 'hasUnpaid', header: '是否有未收款', level: 'device', type: 'bool', width: 13, aliases: ['未收款', '欠款'] },
  {
    key: 'unpaidInterval',
    header: '未收款自定义间隔(天)',
    level: 'device',
    type: 'int',
    width: 22,
    aliases: [
      ['收款', '间隔'],
      ['收款', '天'],
    ],
  },
]

export const FIELD_BY_KEY = Object.fromEntries(SHEET_FIELDS.map((field) => [field.key, field])) as Record<
  SheetFieldKey,
  SheetField
>

/** 关键字匹配顺序：越具体的越靠前，避免"未收款自定义间隔(天)"被识别成滤芯更换间隔 */
export const ALIAS_MATCH_ORDER: SheetFieldKey[] = [
  'unpaidInterval',
  'hasUnpaid',
  'needWaterTest',
  'longTermPartner',
  'followUps',
  'replacementHistory',
  'installDate',
  'filterPurchaseDate',
  'customInterval',
  'contactPerson',
  'phoneNumber',
  'address',
  'location',
  'province',
  'model',
  'quantity',
  'notes',
  'region',
  'name',
]

/** 重复导入时用来认出"同一条装机记录"的字段 */
export const DEVICE_KEY_FIELDS: SheetFieldKey[] = ['address', 'location', 'installDate', 'model', 'quantity']

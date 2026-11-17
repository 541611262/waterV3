// 界面展示用的纯函数（有单元测试）

export type DueLevel = 'overdue' | 'today' | 'week' | 'month' | 'normal' | 'none'

export interface DueInfo {
  level: DueLevel
  text: string
  /** Element Plus 标签颜色 */
  tag: 'danger' | 'warning' | 'primary' | 'success' | 'info'
}

/** 换芯到期描述（与 V3 的分档一致：超期 / 今日 / 7 天内 / 30 天内 / 更久） */
export function describeDue(days: number | null | undefined): DueInfo {
  if (days === null || days === undefined) return { level: 'none', text: '未设置日期', tag: 'info' }
  if (days < 0) return { level: 'overdue', text: `已超期 ${-days} 天`, tag: 'danger' }
  if (days === 0) return { level: 'today', text: '今日到期', tag: 'danger' }
  if (days <= 7) return { level: 'week', text: `${days} 天后到期`, tag: 'warning' }
  if (days <= 30) return { level: 'month', text: `${days} 天后到期`, tag: 'primary' }
  return { level: 'normal', text: `${days} 天后到期`, tag: 'success' }
}

/** 催款描述 */
export function describeRemind(days: number | null | undefined): string {
  if (days === null || days === undefined) return ''
  if (days < 0) return `应催款（已过 ${-days} 天）`
  if (days === 0) return '今日催款'
  return `${days} 天后催款`
}

const moneyFormatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** 金额：数据库 numeric 可能以字符串返回；空值显示为 "—" */
export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? `¥${moneyFormatter.format(n)}` : '—'
}

/** 从电话字段中提取可拨打的号码（字段里可能有多个号码或夹杂文字） */
export function dialablePhones(text: string | null | undefined): string[] {
  if (!text) return []
  const matches = String(text).match(/\+?\d[\d-]{5,}\d/g) ?? []
  return [...new Set(matches.map((m) => m.replace(/-/g, '')))]
}

export const WORK_ORDER_TYPES = {
  replacement: '换芯',
  repair: '维修',
  water_test: '验水',
  install: '安装',
  collection: '催款',
  other: '其他',
} as const

export const WORK_ORDER_STATUSES = {
  pending: { label: '待处理', tag: 'warning' },
  in_progress: { label: '处理中', tag: 'primary' },
  done: { label: '已完成', tag: 'success' },
  cancelled: { label: '已取消', tag: 'info' },
} as const

/** 操作日志字段的中文名 */
export const FIELD_LABELS: Record<string, string> = {
  name: '名称',
  province: '省份',
  region: '区域',
  long_term_partner: '长期合作',
  owner_id: '负责人',
  notes: '备注',
  address: '地址',
  contact_person: '联系人',
  phone: '电话',
  install_date: '装机时间',
  model: '型号',
  quantity: '数量',
  location: '安装位置',
  filter_purchase_date: '滤芯购买日期',
  interval_days: '更换周期(天)',
  need_water_test: '需要验水',
  deleted_at: '删除时间',
  replaced_on: '更换日期',
  filter_model: '滤芯型号',
  cost: '费用',
  operator_name: '操作人',
  followed_on: '跟踪日期',
  content: '内容',
  title: '标题',
  amount: '金额',
  billed_on: '开单日期',
  remind_interval_days: '催款周期(天)',
  closed_at: '结清时间',
  paid_on: '收款日期',
  method: '收款方式',
  status: '状态',
  assignee_id: '指派给',
  scheduled_on: '预约日期',
  description: '说明',
  result: '处理结果',
  type: '类型',
}

export const TABLE_LABELS: Record<string, string> = {
  clients: '客户',
  devices: '装机记录',
  filter_stages: '滤芯分级',
  replacements: '换芯记录',
  follow_ups: '跟踪记录',
  receivables: '应收款',
  payments: '收款',
  work_orders: '工单',
}

export const AUDIT_ACTIONS: Record<string, string> = {
  insert: '新增',
  update: '修改',
  delete: '彻底删除',
  soft_delete: '删除',
  restore: '恢复',
  migrate: '迁移',
}

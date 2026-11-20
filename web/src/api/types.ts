// 与数据库表 / 视图一一对应的类型（cloudbase/v4/001_schema.sql、002_views.sql）
// 日期字段为 'YYYY-MM-DD' 字符串；金额为数字（numeric 经接口返回时可能是字符串，读取时用 Number() 转换）

export type Role = 'admin' | 'member'

export interface Member {
  uid: string
  username: string
  role: Role
}

export interface MemberName {
  uid: string
  username: string
}

interface RowMeta {
  id: string
  created_at: string
  updated_at: string
  version: number
}

interface SoftDelete {
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export interface Client extends RowMeta, SoftDelete {
  owner_id: string
  name: string
  province: string
  region: string
  long_term_partner: boolean
  notes: string
  legacy_id: string | null
}

export interface Device extends RowMeta, SoftDelete {
  client_id: string
  address: string
  contact_person: string
  phone: string
  install_date: string | null
  model: string
  quantity: number | null
  location: string
  filter_purchase_date: string | null
  interval_days: number | null
  need_water_test: boolean
  notes: string
  legacy_id: string | null
}

export interface FilterStage extends RowMeta, SoftDelete {
  client_id: string
  device_id: string
  position: number
  name: string
  interval_days: number
  started_on: string | null
  notes: string
}

export type WorkOrderType = 'replacement' | 'repair' | 'water_test' | 'install' | 'collection' | 'other'
export type WorkOrderStatus = 'pending' | 'in_progress' | 'done' | 'cancelled'

export interface WorkOrder extends RowMeta, SoftDelete {
  order_no: number
  client_id: string
  device_id: string | null
  type: WorkOrderType
  status: WorkOrderStatus
  assignee_id: string | null
  scheduled_on: string | null
  title: string
  description: string
  result: string
  completed_at: string | null
  completed_by: string | null
}

export interface Replacement extends RowMeta, SoftDelete {
  client_id: string
  device_id: string
  stage_id: string | null
  work_order_id: string | null
  replaced_on: string | null
  filter_model: string
  quantity: number
  cost: number | string
  operator_name: string
  notes: string
}

export interface FollowUp extends RowMeta, SoftDelete {
  client_id: string
  device_id: string | null
  followed_on: string | null
  content: string
  operator_name: string
}

export interface Receivable extends RowMeta, SoftDelete {
  client_id: string
  device_id: string | null
  title: string
  amount: number | string | null
  billed_on: string | null
  remind_interval_days: number | null
  closed_at: string | null
  notes: string
}

export interface Payment extends RowMeta, SoftDelete {
  client_id: string
  receivable_id: string
  amount: number | string
  paid_on: string
  method: string
  notes: string
}

export interface AuditEntry {
  id: number
  at: string
  actor_id: string | null
  table_name: string
  row_id: string | null
  client_id: string | null
  action: 'insert' | 'update' | 'delete' | 'soft_delete' | 'restore' | 'migrate'
  changes: Record<string, unknown>
}

// ---------- 视图 ----------

export interface DeviceOverview {
  id: string
  client_id: string
  address: string
  contact_person: string
  phone: string
  install_date: string | null
  model: string
  quantity: number | null
  location: string
  filter_purchase_date: string | null
  interval_days: number | null
  need_water_test: boolean
  notes: string
  created_at: string
  updated_at: string
  version: number
  client_name: string
  owner_id: string
  owner_name: string | null
  province: string
  region: string
  long_term_partner: boolean
  last_replaced_on: string | null
  replacement_count: number
  stage_count: number
  effective_interval_days: number
  last_service_on: string | null
  next_due_on: string | null
  days_until_due: number | null
  open_receivable_count: number
}

export interface FilterStageOverview {
  id: string
  client_id: string
  device_id: string
  position: number
  name: string
  interval_days: number
  started_on: string | null
  notes: string
  version: number
  last_service_on: string | null
  next_due_on: string | null
  days_until_due: number | null
}

export interface ReceivableOverview {
  id: string
  client_id: string
  device_id: string | null
  title: string
  amount: number | string | null
  billed_on: string | null
  remind_interval_days: number | null
  closed_at: string | null
  notes: string
  created_at: string
  version: number
  client_name: string
  owner_id: string
  owner_name: string | null
  paid_amount: number | string
  payment_count: number
  last_paid_on: string | null
  outstanding: number | string | null
  settled: boolean
  next_remind_on: string | null
  days_until_remind: number | null
}

export interface ClientOverview {
  id: string
  owner_id: string
  owner_name: string | null
  name: string
  province: string
  region: string
  long_term_partner: boolean
  notes: string
  created_at: string
  updated_at: string
  version: number
  device_count: number
  next_due_on: string | null
  days_until_due: number | null
  last_followed_on: string | null
  last_follow_up: string | null
  open_receivable_count: number
  outstanding_total: number | string
}

export interface Page<T> {
  rows: T[]
  total: number
}

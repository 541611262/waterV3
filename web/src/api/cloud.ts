// 云开发 CloudBase 连接：登录、数据库（PostgREST 风格的 rdb）、云函数
// SDK 体积较大（约 600KB），按需动态加载，不拖慢首屏
import { appConfig } from '@/config'

/* eslint-disable @typescript-eslint/no-explicit-any -- SDK 的类型定义不完整，这里集中处理，对外只暴露有类型的接口 */
type CloudApp = any
type CloudAuth = any
export type Rdb = any
/* eslint-enable @typescript-eslint/no-explicit-any */

export class AppError extends Error {
  readonly code: string
  constructor(message: string, code = '') {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

/** 保存时发现别人已经修改过这条记录（version 不匹配） */
export class ConflictError extends AppError {
  constructor() {
    super('这条记录刚被其他人修改过，请刷新后再改', 'conflict')
    this.name = 'ConflictError'
  }
}

let appPromise: Promise<CloudApp> | null = null
let authInstance: CloudAuth | null = null

export function isCloudConfigured(): boolean {
  return Boolean(appConfig.cloudbaseEnv)
}

export function gatewayUrl(): string {
  return `https://${appConfig.cloudbaseEnv}.api.tcloudbasegateway.com`
}

async function getApp(): Promise<CloudApp> {
  if (!isCloudConfigured()) throw new AppError('没有配置云开发环境 ID（VITE_CLOUDBASE_ENV）', 'config')
  appPromise ??= import('@cloudbase/js-sdk').then((mod) => {
    const cloudbase = (mod as { default?: unknown }).default ?? mod
    return (cloudbase as CloudApp).init({ env: appConfig.cloudbaseEnv, region: appConfig.cloudbaseRegion })
  })
  return appPromise
}

export async function getAuth(): Promise<CloudAuth> {
  if (!authInstance) {
    const app = await getApp()
    authInstance = typeof app.auth === 'function' ? app.auth({ persistence: 'local' }) : app.auth
  }
  return authInstance
}

export async function db(): Promise<Rdb> {
  return (await getApp()).rdb()
}

export function describeError(error: unknown): string {
  if (error instanceof AppError) return error.message
  const e = (error ?? {}) as { code?: unknown; error?: unknown; message?: unknown; error_description?: unknown; details?: unknown }
  const code = String(e.code ?? e.error ?? '')
  const message = String(e.message ?? e.error_description ?? '')
  const text = `${code} ${message}`
  if (/invalid_grant|password|credential|user_not|not_found_user/i.test(text)) return '用户名或密码错误'
  if (/42501|row-level security|permission denied|PERMISSION_DENIED/i.test(text)) {
    // 数据库触发器给出的中文原因（如"只能修改工单的状态和处理结果"）直接展示
    return /[一-龥]/.test(message) ? message : '没有权限进行这个操作'
  }
  if (/23505|duplicate key/i.test(text)) return '记录重复'
  if (/23503|foreign key/i.test(text)) return '关联的记录不存在或已被删除'
  if (/23514|check constraint/i.test(text)) return '填写的内容不符合要求'
  if (/Failed to fetch|NetworkError|network/i.test(text)) return '网络连接失败，请检查网络'
  if (/[一-龥]/.test(message)) return message
  return message || code || '未知错误'
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const code = String((error as { code?: unknown })?.code ?? '')
  return new AppError(describeError(error), code)
}

/** SDK 返回 { data, error, count }；有 error 时抛出可读的中文错误 */
export function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result?.error) throw toAppError(result.error)
  return result?.data as T
}

/** 带 version 的更新：返回 0 行说明版本已变（被别人改过）或没有权限 */
export function expectUpdated<T>(rows: T[] | null | undefined): T {
  if (!rows || rows.length === 0) throw new ConflictError()
  return rows[0] as T
}

export async function getAccessToken(): Promise<string> {
  const auth = await getAuth()
  const token = await auth.getAccessToken()
  const accessToken = token?.accessToken ?? token?.access_token
  if (!accessToken) throw new AppError('登录已过期，请重新登录', 'auth')
  return accessToken
}

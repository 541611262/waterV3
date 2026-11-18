// AI 小助手：调用云函数 ai-chat、执行用户确认后的修改
import type { ProposalAction } from '@/lib/ai/tools'
import { AppError, gatewayUrl, getAccessToken } from './cloud'
import { createFollowUp, createReceivable, createReplacement, listReceivables, updateDevice, updateReceivable } from './data'

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  reasoning_content?: string
}

/** 聊天窗口可选的档位（云函数只接受这几种，不能指定任意模型） */
export type AssistantMode = 'flash' | 'pro' | 'pro-thinking'

export const ASSISTANT_MODES: { key: AssistantMode; label: string; hint: string }[] = [
  { key: 'flash', label: '快速', hint: 'deepseek-flash：回答快、费用低，日常查询够用' },
  { key: 'pro', label: '高级', hint: 'deepseek-v4-pro：多步查询、排计划更可靠，费用约为快速的 4 倍' },
  { key: 'pro-thinking', label: '高级 · 深度思考', hint: '先思考再回答，复杂规划最好，回答会慢几秒' },
]

export interface AssistantPayload {
  messages: ChatMessage[]
  userName: string
  userRole: string
  model?: 'flash' | 'pro'
  thinking?: boolean
}

export interface AssistantReply {
  ok: boolean
  /** 实际使用的档位 / 模型 */
  tier?: 'flash' | 'pro'
  model?: string
  /** 管理员是否允许选择高级档 */
  allowPro?: boolean
  message?: { content?: string; tool_calls?: ToolCall[]; reasoning_content?: string }
  remaining?: number
  limit?: number
  error?: string
}

/** 通过网关调用云函数；登录凭证同时放在请求体里，由云函数交给数据库校验身份和扣减次数 */
export async function callAssistant(payload: AssistantPayload): Promise<AssistantReply> {
  const accessToken = await getAccessToken()
  let response: Response
  try {
    response = await fetch(`${gatewayUrl()}/v1/functions/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ ...payload, accessToken }),
    })
  } catch {
    throw new AppError('无法连接小助手服务，请检查网络')
  }
  const text = await response.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    throw new AppError(`小助手服务返回异常（HTTP ${response.status}）`)
  }
  // 网关可能把函数返回值包在 result 中
  if (data && !('ok' in data) && data.result && typeof data.result === 'object') data = data.result as Record<string, unknown>
  if (!response.ok && !('ok' in data)) {
    if (response.status === 404) throw new AppError('小助手云函数 ai-chat 还没有部署到这个环境')
    throw new AppError(`小助手服务调用失败（HTTP ${response.status}${data.message ? '：' + String(data.message) : ''}）`)
  }
  const remaining = typeof data.remaining === 'number' ? data.remaining : undefined
  const limit = typeof data.limit === 'number' ? data.limit : undefined
  if (!data.ok) return { ok: false, error: String(data.message ?? '小助手暂时不可用，请稍后再试'), remaining, limit }
  return {
    ok: true,
    message: data.message as AssistantReply['message'],
    remaining,
    limit,
    tier: data.tier === 'pro' ? 'pro' : data.tier === 'flash' ? 'flash' : undefined,
    model: typeof data.model === 'string' ? data.model : undefined,
    allowPro: typeof data.allowPro === 'boolean' ? data.allowPro : undefined,
  }
}

/** 用户点击确认后执行修改（与手动操作走相同的数据接口和权限） */
export async function applyProposal(action: ProposalAction, operatorName: string): Promise<void> {
  const now = () => new Date().toISOString()
  if (action.kind === 'follow_up') {
    await createFollowUp(action.clientId, { followed_on: action.date, content: action.content, operator_name: operatorName })
    if (action.closeUnpaid) {
      const open = await listReceivables({ page: 1, pageSize: 200, clientId: action.clientId, status: 'open' })
      for (const r of open.rows) await updateReceivable(r.id, r.version, { closed_at: now() })
    }
    return
  }
  if (action.kind === 'replacement') {
    await createReplacement({
      device_id: action.device.id,
      stage_id: null,
      work_order_id: null,
      replaced_on: action.date,
      filter_model: action.filterModel,
      quantity: action.quantity,
      cost: action.cost,
      operator_name: operatorName,
      notes: action.notes,
    })
    return
  }
  const d = action.device
  if (Object.keys(action.patch).length) await updateDevice(d.id, d.version, action.patch)
  if (action.unpaid === undefined && action.unpaidInterval === undefined) return
  const open = await listReceivables({ page: 1, pageSize: 50, clientId: d.client_id, status: 'open' })
  const mine = open.rows.filter((r) => r.device_id === d.id)
  if (action.unpaid === true && !mine.length) {
    await createReceivable(d.client_id, {
      device_id: d.id,
      title: '未收款（小助手登记）',
      amount: null,
      billed_on: null,
      remind_interval_days: action.unpaidInterval ?? null,
      notes: '',
    })
  } else if (action.unpaid === false) {
    for (const r of mine) await updateReceivable(r.id, r.version, { closed_at: now() })
  } else if (action.unpaidInterval !== undefined && mine[0]) {
    await updateReceivable(mine[0].id, mine[0].version, { remind_interval_days: action.unpaidInterval })
  }
}

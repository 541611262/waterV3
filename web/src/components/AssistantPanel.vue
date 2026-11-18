<script setup lang="ts">
// AI 小助手：右下角悬浮按钮 + 对话面板。工具在浏览器中执行（tools.ts），只用当前账号能看到的数据
import { ArrowDown, ChatDotRound, Close, Promotion } from '@element-plus/icons-vue'
import { useMediaQuery, useStorage } from '@vueuse/core'
import { nextTick, reactive, ref } from 'vue'
import {
  applyProposal,
  ASSISTANT_MODES,
  callAssistant,
  type AssistantMode,
  type AssistantPayload,
  type AssistantReply,
  type ChatMessage,
} from '@/api/assistant'
import { describeError } from '@/api/cloud'
import { listDevices } from '@/api/data'
import { appConfig } from '@/config'
import { renderAssistantText, collectTokenIds, type TokenData } from '@/lib/ai/render'
import { executeTool, type Proposal } from '@/lib/ai/tools'
import { useSessionStore } from '@/stores/session'

const MAX_TOOL_ROUNDS = 6
const MAX_HISTORY_TURNS = 10
const QUICK_PROMPTS = ['今天该联系谁？', '本周到期的有哪些？', '哪些客户该催款了？', '帮我排一下明天的上门计划', '检查一下数据有什么问题']

const session = useSessionStore()
const isMobile = useMediaQuery('(max-width: 768px)')
const open = ref(false)
const input = ref('')
const busy = ref(false)
const status = ref('')
const remaining = ref('')
// 每人自己选择的档位，记在本机；默认「快速」
const mode = useStorage<AssistantMode>('v4.ai.mode', 'flash')
const allowPro = ref(true)
const modeInfo = () => ASSISTANT_MODES.find((m) => m.key === mode.value) ?? ASSISTANT_MODES[0]!
const modeNote = ref('')
const scroller = ref<HTMLElement>()

type Item = { kind: 'user' | 'assistant' | 'error'; text: string; html?: string } | { kind: 'proposal'; proposal: Proposal }
const items = ref<Item[]>([])
let history: ChatMessage[] = []
const tokenData: TokenData = reactive({ phones: new Map(), clients: new Map() })

// 测试时可以通过 window.__aiTransport 注入模拟回答
type Transport = (payload: AssistantPayload) => Promise<AssistantReply>
const transport = (): Transport => (window as unknown as { __aiTransport?: Transport }).__aiTransport ?? callAssistant

async function scrollDown() {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
}

/** 回答中引用的设备：在本地查出真实电话和所属客户（RLS 保证只能查到有权查看的） */
async function resolveTokens(text: string) {
  const ids = collectTokenIds(text).filter((id) => !tokenData.phones.has(id) && !tokenData.clients.has(id))
  if (!ids.length) return
  try {
    const result = await listDevices({ page: 1, pageSize: ids.length, ids })
    for (const d of result.rows) {
      if (d.phone) tokenData.phones.set(d.id, d.phone)
      tokenData.clients.set(d.id, d.client_id)
    }
  } catch {
    // 查不到时显示为"电话未知"
  }
}

async function addAssistant(text: string) {
  await resolveTokens(text)
  items.value.push({ kind: 'assistant', text, html: renderAssistantText(text, tokenData) })
}

function trimHistory() {
  const userIndexes = history.map((m, i) => (m.role === 'user' ? i : -1)).filter((i) => i >= 0)
  if (userIndexes.length > MAX_HISTORY_TURNS) history = history.slice(userIndexes[userIndexes.length - MAX_HISTORY_TURNS])
}

async function ask(text?: string) {
  const question = (text ?? input.value).trim()
  if (!question || busy.value) return
  input.value = ''
  busy.value = true
  items.value.push({ kind: 'user', text: question })
  void scrollDown()
  trimHistory()
  const checkpoint = history.length
  history.push({ role: 'user', content: question })
  const ctx = {
    isAdmin: session.isAdmin,
    uid: session.uid,
    propose: (proposal: Proposal) => {
      items.value.push({ kind: 'proposal', proposal: reactive(proposal) as Proposal })
      void scrollDown()
    },
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      status.value = round === 0 ? '思考中…' : '正在查询数据…'
      const reply = await transport()({
        messages: history,
        userName: session.member?.username ?? '',
        userRole: session.member?.role ?? 'member',
        model: mode.value === 'flash' ? 'flash' : 'pro',
        thinking: mode.value === 'pro-thinking',
      })
      if (Number.isFinite(reply.remaining) && Number.isFinite(reply.limit)) remaining.value = `今日剩余 ${reply.remaining} / ${reply.limit} 次`
      if (reply.allowPro === false) {
        allowPro.value = false
        if (mode.value !== 'flash') {
          mode.value = 'flash'
          modeNote.value = '管理员已关闭「高级」档，本次按「快速」回答'
        }
      }
      if (!reply.ok) {
        history.length = checkpoint
        items.value.push({ kind: 'error', text: reply.error ?? '小助手暂时不可用' })
        return
      }
      const message = reply.message ?? {}
      const calls = message.tool_calls ?? []
      // 思考模式下要把 reasoning_content 原样带回给云函数（DeepSeek 的要求）
      history.push({
        role: 'assistant',
        content: message.content ?? '',
        ...(calls.length ? { tool_calls: calls } : {}),
        ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
      })
      if (!calls.length) {
        await addAssistant(message.content || '（没有回答）')
        return
      }
      if (message.content) await addAssistant(message.content)
      for (const call of calls) {
        const result = await executeTool(call.function?.name, call.function?.arguments, ctx)
        history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      }
    }
    history.length = checkpoint
    items.value.push({ kind: 'error', text: '这个问题需要查询的步骤太多了，请换个更具体的问法。' })
  } catch (error) {
    history.length = checkpoint
    items.value.push({ kind: 'error', text: describeError(error) })
  } finally {
    busy.value = false
    status.value = ''
    void scrollDown()
  }
}

async function confirm(p: Proposal) {
  if (p.status !== 'pending') return
  p.status = 'saving'
  try {
    await applyProposal(p.action, session.member?.username ?? '')
    p.status = 'done'
    p.message = '已保存'
    history.push({ role: 'user', content: `（系统消息：用户已确认并保存了「${p.title}」，proposal_id=${p.id}）` })
  } catch (error) {
    p.status = 'failed'
    p.message = describeError(error)
  }
}

function cancel(p: Proposal) {
  if (p.status !== 'pending') return
  p.status = 'cancelled'
  p.message = '已取消'
  history.push({ role: 'user', content: `（系统消息：用户取消了「${p.title}」，proposal_id=${p.id}）` })
}

function clearChat() {
  items.value = []
  history = []
}

function onKey(event: KeyboardEvent | Event) {
  const e = event as KeyboardEvent
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    void ask()
  }
}
</script>

<template>
  <template v-if="appConfig.aiAssistant">
    <button v-show="!open" class="fab" aria-label="打开 AI 小助手" @click="open = true">
      <el-icon :size="22"><ChatDotRound /></el-icon>
      <span v-if="!isMobile">小助手</span>
    </button>

    <transition name="panel">
      <section v-if="open" class="panel" :class="{ mobile: isMobile }" aria-label="AI 小助手">
        <header class="panel-head">
          <div class="title">
            <span class="dot" />
            <div>
              <strong>滤芯小助手</strong>
              <span>{{ remaining || '查询客户、到期提醒、登记跟踪与换芯' }}</span>
            </div>
          </div>
          <el-dropdown trigger="click" :disabled="busy" @command="(m: AssistantMode) => ((mode = m), (modeNote = ''))">
            <button class="mode-btn" :title="modeInfo().hint">
              {{ modeInfo().label }}
              <el-icon><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="m in ASSISTANT_MODES"
                  :key="m.key"
                  :command="m.key"
                  :disabled="m.key !== 'flash' && !allowPro"
                  :class="{ 'mode-active': m.key === mode }"
                >
                  <div class="mode-item">
                    <strong>{{ m.label }}{{ m.key === mode ? ' ✓' : '' }}</strong>
                    <span>{{ m.key !== 'flash' && !allowPro ? '管理员已关闭' : m.hint }}</span>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button v-if="items.length" link size="small" @click="clearChat">清空</el-button>
          <button class="close" aria-label="关闭" @click="open = false"><el-icon><Close /></el-icon></button>
        </header>

        <div ref="scroller" class="messages">
          <div v-if="!items.length" class="welcome">
            <p>你好，{{ session.member?.username }}！我可以帮你查到期设备、整理上门计划、记录跟踪和换芯。</p>
            <p class="text-muted small">发给 AI 的电话号码都会打码；任何修改都需要你点击确认才会保存，我不能删除数据。</p>
            <div class="quick">
              <button v-for="q in QUICK_PROMPTS" :key="q" @click="ask(q)">{{ q }}</button>
            </div>
          </div>

          <template v-for="(item, i) in items" :key="i">
            <div v-if="item.kind === 'user'" class="msg user">{{ item.text }}</div>
            <!-- eslint-disable-next-line vue/no-v-html -- 内容已在 renderAssistantText 中转义 -->
            <div v-else-if="item.kind === 'assistant'" class="msg assistant" v-html="item.html" />
            <div v-else-if="item.kind === 'error'" class="msg error">{{ item.text }}</div>
            <div v-else-if="item.kind === 'proposal'" class="proposal" :class="item.proposal.status">
              <div class="proposal-title">📝 {{ item.proposal.title }}</div>
              <dl>
                <template v-for="[k, v] in item.proposal.rows" :key="k">
                  <dt>{{ k }}</dt>
                  <dd>{{ v }}</dd>
                </template>
              </dl>
              <div v-if="item.proposal.status === 'pending' || item.proposal.status === 'saving'" class="proposal-actions">
                <el-button size="small" type="primary" round :loading="item.proposal.status === 'saving'" @click="confirm(item.proposal)">确认保存</el-button>
                <el-button size="small" round :disabled="item.proposal.status === 'saving'" @click="cancel(item.proposal)">取消</el-button>
              </div>
              <div v-else class="proposal-status">{{ item.proposal.message }}</div>
            </div>
          </template>
          <div v-if="modeNote" class="msg error">{{ modeNote }}</div>
          <div v-if="busy" class="msg assistant typing"><span /><span /><span /> {{ status }}</div>
        </div>

        <footer class="composer">
          <el-input
            v-model="input"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
            resize="none"
            placeholder="问点什么，比如：明天去惠州要拜访哪些客户？"
            :disabled="busy"
            @keydown="onKey"
          />
          <el-button type="primary" circle :icon="Promotion" :disabled="busy || !input.trim()" aria-label="发送" @click="ask()" />
        </footer>
      </section>
    </transition>
  </template>
</template>

<style scoped>
.fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2000;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  background: var(--brand-gradient);
  box-shadow: 0 10px 30px rgba(37, 99, 235, 0.35);
  cursor: pointer;
  transition: transform 0.15s;
}
.fab:hover {
  transform: translateY(-2px);
}
.panel {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2000;
  width: 400px;
  height: min(640px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 20px;
  box-shadow: var(--app-shadow-lg);
  overflow: hidden;
}
.panel.mobile {
  inset: 0;
  width: auto;
  height: auto;
  border-radius: 0;
}
.panel-enter-active,
.panel-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-border);
  background:
    radial-gradient(400px 120px at 0% 0%, rgba(37, 99, 235, 0.1), transparent 70%),
    var(--app-surface);
}
.title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.title div {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  min-width: 0;
}
.title span {
  font-size: 12px;
  color: var(--app-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--brand-gradient);
  box-shadow: 0 0 0 4px var(--brand-50);
  flex-shrink: 0;
}
.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text-2);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.mode-btn:hover {
  color: var(--brand-600);
  border-color: var(--el-color-primary-light-7);
}
.mode-item {
  display: flex;
  flex-direction: column;
  line-height: 1.5;
  padding: 2px 0;
  max-width: 260px;
  white-space: normal;
}
.mode-item span {
  font-size: 12px;
  color: var(--app-text-3);
}
.close {
  border: none;
  background: none;
  color: var(--app-text-3);
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--app-surface-muted);
}
.welcome p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.6;
}
.small {
  font-size: 12px !important;
}
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.quick button {
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text-2);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.quick button:hover {
  border-color: var(--brand-500);
  color: var(--brand-600);
}
.msg {
  max-width: 92%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}
.msg.user {
  align-self: flex-end;
  background: var(--brand-gradient);
  color: #fff;
  border-bottom-right-radius: 4px;
  white-space: pre-wrap;
}
.msg.assistant {
  align-self: flex-start;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-bottom-left-radius: 4px;
}
.msg.assistant :deep(p) {
  margin: 0 0 6px;
}
.msg.assistant :deep(p:last-child) {
  margin-bottom: 0;
}
.msg.assistant :deep(ul),
.msg.assistant :deep(ol) {
  margin: 4px 0 6px;
  padding-left: 20px;
}
.msg.assistant :deep(a) {
  color: var(--brand-600);
  text-decoration: none;
  font-weight: 500;
}
.msg.assistant :deep(.ai-heading) {
  margin: 10px 0 4px;
}
.msg.assistant :deep(.ai-heading:first-child) {
  margin-top: 0;
}
.msg.assistant :deep(.ai-table) {
  overflow-x: auto;
  margin: 6px 0 8px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
}
.msg.assistant :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 12.5px;
  line-height: 1.5;
}
.msg.assistant :deep(th),
.msg.assistant :deep(td) {
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--app-border);
  white-space: nowrap;
}
.msg.assistant :deep(td:last-child) {
  white-space: normal;
  min-width: 80px;
}
.msg.assistant :deep(th) {
  background: var(--app-surface-muted);
  color: var(--app-text-2);
  font-weight: 600;
}
.msg.assistant :deep(tbody tr:last-child td) {
  border-bottom: none;
}
.msg.assistant :deep(blockquote) {
  margin: 6px 0;
  padding: 6px 10px;
  border-left: 3px solid var(--tone-warning);
  background: var(--tone-warning-bg);
  border-radius: 0 8px 8px 0;
}
.msg.assistant :deep(hr) {
  border: none;
  border-top: 1px dashed var(--app-border);
  margin: 10px 0;
}
.msg.assistant :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--app-surface-muted);
}
.msg.assistant :deep(li + li) {
  margin-top: 2px;
}
.msg.error {
  align-self: flex-start;
  background: var(--tone-danger-bg);
  color: var(--tone-danger);
  font-size: 13px;
}
.typing {
  color: var(--app-text-3);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-500);
  animation: blink 1.2s infinite;
}
.typing span:nth-child(2) {
  animation-delay: 0.2s;
}
.typing span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.25;
  }
  40% {
    opacity: 1;
  }
}
.proposal {
  align-self: stretch;
  background: var(--app-surface);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 13px;
}
.proposal.done {
  border-color: var(--tone-success);
}
.proposal.failed {
  border-color: var(--tone-danger);
}
.proposal.cancelled {
  opacity: 0.6;
}
.proposal-title {
  font-weight: 600;
  margin-bottom: 8px;
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0 0 10px;
}
dt {
  color: var(--app-text-3);
}
dd {
  margin: 0;
  white-space: pre-wrap;
}
.proposal-actions {
  display: flex;
  gap: 6px;
}
.proposal-status {
  font-weight: 600;
  color: var(--app-text-2);
}
.proposal.done .proposal-status {
  color: var(--tone-success);
}
.proposal.failed .proposal-status {
  color: var(--tone-danger);
}
.composer {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 12px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}
.composer :deep(.el-textarea__inner) {
  border-radius: 14px;
  padding: 8px 12px;
}
@media (max-width: 768px) {
  .fab {
    right: 16px;
    bottom: 16px;
    width: 52px;
    height: 52px;
    padding: 0;
    justify-content: center;
  }
}
</style>

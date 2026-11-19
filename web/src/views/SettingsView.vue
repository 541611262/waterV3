<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { changePassword } from '@/api/auth'
import { describeError } from '@/api/cloud'
import { getSettings, listDeletedItems, purge, restore, updateSetting, type AppSettings, type DeletedItem } from '@/api/data'
import { appConfig } from '@/config'
import { formatBeijingDateTime } from '@/lib/dates'
import { TABLE_LABELS } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const tab = ref(typeof route.query.tab === 'string' ? route.query.tab : 'account')

// ---------- 添加到手机桌面 ----------
const baseUrl = import.meta.env.BASE_URL
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const installPrompt = ref<InstallPrompt | null>(null)
const installed = ref(window.matchMedia('(display-mode: standalone)').matches)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt.value = e as InstallPrompt
})
async function install() {
  if (!installPrompt.value) return
  await installPrompt.value.prompt()
  const choice = await installPrompt.value.userChoice
  if (choice.outcome === 'accepted') installed.value = true
  installPrompt.value = null
}

// ---------- 修改密码 ----------
const pwd = reactive({ old: '', next: '', confirm: '' })
const pwdSaving = ref(false)

async function submitPassword() {
  if (!pwd.old || !pwd.next) return ElMessage.warning('请填写原密码和新密码')
  if (pwd.next.length < 8) return ElMessage.warning('新密码至少 8 位')
  if (pwd.next !== pwd.confirm) return ElMessage.warning('两次输入的新密码不一致')
  pwdSaving.value = true
  try {
    await changePassword(pwd.old, pwd.next)
    Object.assign(pwd, { old: '', next: '', confirm: '' })
    ElMessage.success('密码已修改，下次登录请使用新密码')
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    pwdSaving.value = false
  }
}

// ---------- 回收站 ----------
const deleted = ref<DeletedItem[]>([])
const binLoading = ref(false)

async function loadBin() {
  binLoading.value = true
  try {
    deleted.value = await listDeletedItems()
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    binLoading.value = false
  }
}

async function restoreItem(item: DeletedItem) {
  try {
    await restore(item.table, item.id, item.version)
    ElMessage.success(`已恢复：${item.title}`)
    await loadBin()
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}

async function purgeItem(item: DeletedItem) {
  try {
    await ElMessageBox.prompt(
      `彻底删除后无法在回收站恢复（只能由管理员从每日备份中找回）。请输入「删除」确认。`,
      `彻底删除${TABLE_LABELS[item.table]}「${item.title}」`,
      { confirmButtonText: '彻底删除', cancelButtonText: '取消', inputPattern: /^删除$/, inputErrorMessage: '请输入「删除」', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await purge(item.table, item.id)
    ElMessage.success('已彻底删除')
    await loadBin()
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}

// ---------- 系统设置 ----------
const settings = ref<AppSettings | null>(null)
const settingsSaving = ref(false)

async function loadSettings() {
  try {
    settings.value = await getSettings()
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}

async function saveSettings() {
  if (!settings.value) return
  settingsSaving.value = true
  try {
    await updateSetting('replacement_interval_days', settings.value.replacement_interval_days)
    await updateSetting('unpaid_interval_days', settings.value.unpaid_interval_days)
    ElMessage.success('系统设置已保存，所有没有单独设置周期的设备会按新周期计算')
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    settingsSaving.value = false
  }
}

watch(tab, (value) => {
  if (value === 'bin') void loadBin()
  if (value === 'system') void loadSettings()
})
onMounted(() => {
  if (tab.value === 'bin') void loadBin()
  if (tab.value === 'system') void loadSettings()
})
</script>

<template>
  <el-card shadow="never">
    <el-tabs v-model="tab">
      <el-tab-pane label="我的账号" name="account">
        <el-descriptions :column="1" border class="block" label-width="84px">
          <el-descriptions-item label="用户名">{{ session.member?.username }}</el-descriptions-item>
          <el-descriptions-item label="角色">{{ session.isAdmin ? '管理员（可查看和管理全部数据）' : '普通成员（查看自己负责的客户）' }}</el-descriptions-item>
          <el-descriptions-item label="所在环境">{{ appConfig.envLabel || '正式环境' }}（{{ appConfig.cloudbaseEnv }}）</el-descriptions-item>
        </el-descriptions>

        <h3>添加到手机桌面</h3>
        <div class="install">
          <img :src="`${baseUrl}icons/icon-192.png`" alt="" width="48" height="48" />
          <div class="install-text">
            <template v-if="installed">已经从桌面图标打开，体验和手机应用一样。</template>
            <template v-else>
              <p>添加后从桌面图标打开，全屏显示，不用每次输入网址。</p>
              <p class="sub">iPhone：用 Safari 打开本网站 → 点底部「分享」→「添加到主屏幕」。安卓：浏览器菜单 →「添加到主屏幕」或「安装应用」。</p>
            </template>
          </div>
          <el-button v-if="installPrompt && !installed" type="primary" @click="install">一键安装</el-button>
        </div>

        <h3>修改密码</h3>
        <el-form label-width="96px" class="pwd-form" @submit.prevent="submitPassword">
          <el-form-item label="原密码">
            <el-input v-model="pwd.old" type="password" show-password autocomplete="current-password" />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="pwd.next" type="password" show-password autocomplete="new-password" placeholder="至少 8 位，建议字母加数字" />
          </el-form-item>
          <el-form-item label="确认新密码">
            <el-input v-model="pwd.confirm" type="password" show-password autocomplete="new-password" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" native-type="submit" :loading="pwdSaving">修改密码</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="回收站" name="bin">
        <p class="sub">
          删除的客户、装机记录、换芯和跟踪记录会先放在这里，可以随时恢复。{{ session.isAdmin ? '管理员可以彻底删除。' : '' }}
          恢复装机记录前，请先恢复它所属的客户。
        </p>
        <el-table v-loading="binLoading" :data="deleted" empty-text="回收站是空的" size="small">
          <el-table-column label="类型" width="100">
            <template #default="{ row }">{{ TABLE_LABELS[row.table] }}</template>
          </el-table-column>
          <el-table-column prop="title" label="内容" min-width="200" show-overflow-tooltip />
          <el-table-column prop="subtitle" label="所属客户 / 区域" min-width="160" show-overflow-tooltip />
          <el-table-column label="删除时间" width="160">
            <template #default="{ row }">{{ formatBeijingDateTime(row.deleted_at) }}</template>
          </el-table-column>
          <el-table-column label="删除人" width="100">
            <template #default="{ row }">{{ session.memberName(row.updated_by) || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="restoreItem(row as DeletedItem)">恢复</el-button>
              <el-button v-if="session.isAdmin" link type="danger" @click="purgeItem(row as DeletedItem)">彻底删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="系统设置" name="system">
        <template v-if="settings">
          <el-form label-width="160px" class="sys-form" @submit.prevent="saveSettings">
            <el-form-item label="默认换芯周期（天）">
              <el-input-number v-model="settings.replacement_interval_days" :min="1" :max="3650" :disabled="!session.isAdmin" />
              <span class="hint">设备没有单独设置周期时使用</span>
            </el-form-item>
            <el-form-item label="默认催款周期（天）">
              <el-input-number v-model="settings.unpaid_interval_days" :min="1" :max="3650" :disabled="!session.isAdmin" />
              <span class="hint">应收款没有单独设置催款周期时使用</span>
            </el-form-item>
            <el-form-item v-if="session.isAdmin">
              <el-button type="primary" native-type="submit" :loading="settingsSaving">保存</el-button>
            </el-form-item>
            <el-alert v-else type="info" :closable="false" title="只有管理员可以修改系统设置" />
          </el-form>
        </template>
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>

<style scoped>
.block {
  max-width: 560px;
}
h3 {
  margin: 24px 0 12px;
  font-size: 15px;
}
.pwd-form,
.sys-form {
  max-width: 560px;
}
.sub {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0 0 12px;
}
.install {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 640px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-surface-muted);
}
.install img {
  border-radius: 12px;
  flex-shrink: 0;
}
.install-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
}
.install-text p {
  margin: 0;
}
.hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>

<script setup lang="ts">
// 表格导入：选择文件 → 预览将要新增 / 更新的数量 → 确认后一次性写入（全部成功或全部不生效）
import { UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { applyImport, downloadWorkbook, previewImport, type ImportPreview } from '@/api/importExport'
import { useSessionStore } from '@/stores/session'

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ imported: [] }>()

const session = useSessionStore()
const fileInput = ref<HTMLInputElement>()
const reading = ref(false)
const applying = ref(false)
const preview = ref<ImportPreview | null>(null)
const error = ref('')

watch(open, (value) => {
  if (value) {
    preview.value = null
    error.value = ''
  }
})

const nothingToDo = computed(() => {
  const p = preview.value?.plan
  if (!p) return true
  return (
    !p.newClients.length &&
    !p.clientUpdates.length &&
    !p.newDevices.length &&
    !p.deviceUpdates.length &&
    !p.replacements.length &&
    !p.followUps.length &&
    !p.newReceivables.length &&
    !p.receivableUpdates.length
  )
})

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  reading.value = true
  error.value = ''
  preview.value = null
  try {
    preview.value = await previewImport(file, session.uid, session.member?.username ?? '')
  } catch (e) {
    error.value = describeError(e)
  } finally {
    reading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function confirmImport() {
  if (!preview.value) return
  applying.value = true
  try {
    await applyImport(preview.value.plan)
    const s = preview.value.plan.stats
    ElMessage.success(`导入完成：新增客户 ${s.newClients} 个、装机记录 ${s.newDevices} 条，更新 ${s.updatedDevices} 条`)
    open.value = false
    emit('imported')
  } catch (e) {
    error.value = describeError(e)
  } finally {
    applying.value = false
  }
}

function downloadTemplate() {
  downloadWorkbook(
    [
      {
        client: { name: '示例科技有限公司', province: '广东', region: '深圳', long_term_partner: true },
        device: {
          address: '南山区示例路1号A栋',
          phone: '13800000000',
          contact_person: '张经理',
          install_date: '2025-03-01',
          model: 'CY-2H',
          quantity: 2,
          location: '3楼茶水间',
          filter_purchase_date: '',
          interval_days: null,
          notes: '示例数据，导入前请删除这一行',
          need_water_test: false,
        },
        followUps: [{ followed_on: '2026-01-10', content: '电话回访，客户满意' }],
        replacements: [{ replaced_on: '2025-09-01', filter_model: 'CY-2H 滤芯', quantity: 2, cost: 300, operator_name: '张三', notes: '定期更换' }],
        unpaid: { open: false, interval: null },
      },
    ],
    '滤芯客户导入模板',
  )
}
</script>

<template>
  <el-dialog v-model="open" title="从表格导入" width="min(600px, 94vw)" append-to-body>
    <div class="intro">
      <p>
        支持《格式样板》的 19 列 Excel（.xlsx / .xls）和 CSV。表头不必完全一致，系统会自动识别；
        同名客户、地址等信息一致的装机记录会<strong>更新</strong>而不是重复添加，可以反复导入同一份表格。
      </p>
      <p class="sub">导入的客户负责人为你自己（{{ session.member?.username }}）；只会与你自己负责的同名客户合并。</p>
      <el-button link type="primary" @click="downloadTemplate">下载导入模板</el-button>
    </div>

    <label class="drop" :class="{ busy: reading }">
      <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv,.txt" hidden @change="onFile" />
      <el-icon :size="36"><UploadFilled /></el-icon>
      <span>{{ reading ? '正在读取…' : '点击选择文件' }}</span>
    </label>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="mt" />

    <template v-if="preview">
      <h4>{{ preview.fileName }}：识别到第 {{ preview.sheet.headerRowNumber }} 行为表头，共 {{ preview.sheet.rows.length }} 行数据</h4>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="新增客户">{{ preview.plan.stats.newClients }}</el-descriptions-item>
        <el-descriptions-item label="更新客户资料">{{ preview.plan.clientUpdates.length }}</el-descriptions-item>
        <el-descriptions-item label="新增装机记录">{{ preview.plan.stats.newDevices }}</el-descriptions-item>
        <el-descriptions-item label="更新装机记录">{{ preview.plan.stats.updatedDevices }}</el-descriptions-item>
        <el-descriptions-item label="新增换芯记录">{{ preview.plan.stats.replacements }}</el-descriptions-item>
        <el-descriptions-item label="新增跟踪记录">{{ preview.plan.stats.followUps }}</el-descriptions-item>
        <el-descriptions-item label="新增未收款">{{ preview.plan.newReceivables.length }}</el-descriptions-item>
        <el-descriptions-item label="结清 / 更新未收款">{{ preview.plan.receivableUpdates.length }}</el-descriptions-item>
      </el-descriptions>
      <el-alert
        v-if="preview.plan.stats.skippedRows.length"
        type="warning"
        :closable="false"
        class="mt"
        :title="`第 ${preview.plan.stats.skippedRows.slice(0, 10).join('、')} 行没有客户名称，将被跳过`"
      />
      <el-alert v-if="preview.plan.stats.badDates.length" type="warning" :closable="false" class="mt" title="以下日期无法识别，将留空：">
        <div v-for="d in preview.plan.stats.badDates.slice(0, 8)" :key="d">{{ d }}</div>
        <div v-if="preview.plan.stats.badDates.length > 8">…等 {{ preview.plan.stats.badDates.length }} 处</div>
      </el-alert>
      <el-alert v-if="nothingToDo" type="info" :closable="false" class="mt" title="表格中的内容与现有数据完全一致，没有需要导入的内容" />
    </template>

    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :disabled="!preview || nothingToDo" :loading="applying" @click="confirmImport">确认导入</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.intro p {
  margin: 0 0 6px;
  line-height: 1.6;
}
.sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.drop {
  margin-top: 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
}
.drop:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.drop.busy {
  opacity: 0.6;
  pointer-events: none;
}
.mt {
  margin-top: 10px;
}
h4 {
  margin: 16px 0 8px;
  font-size: 14px;
}
</style>

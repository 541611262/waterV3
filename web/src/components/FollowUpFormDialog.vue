<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { reactive, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { createFollowUp } from '@/api/data'
import { todayStr } from '@/lib/dates'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ clientId: string | null; clientName?: string; deviceId?: string | null }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [] }>()

const session = useSessionStore()
const saving = ref(false)
const form = reactive({ followed_on: todayStr(), content: '', operator_name: '' })

watch(open, (value) => {
  if (value) Object.assign(form, { followed_on: todayStr(), content: '', operator_name: session.member?.username ?? '' })
})

async function save() {
  if (!props.clientId) return
  if (!form.content.trim()) {
    ElMessage.warning('请填写跟踪内容')
    return
  }
  saving.value = true
  try {
    await createFollowUp(props.clientId, {
      followed_on: form.followed_on || null,
      content: form.content.trim(),
      operator_name: form.operator_name.trim(),
      device_id: props.deviceId ?? null,
    })
    ElMessage.success('跟踪记录已添加')
    open.value = false
    emit('saved')
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="`添加跟踪记录${clientName ? ' · ' + clientName : ''}`" width="min(480px, 94vw)" append-to-body>
    <el-form label-width="80px" @submit.prevent="save">
      <el-form-item label="日期">
        <el-date-picker v-model="form.followed_on" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
      </el-form-item>
      <el-form-item label="内容" required>
        <el-input v-model="form.content" type="textarea" :rows="4" maxlength="2000" show-word-limit placeholder="如：电话回访，客户希望下次换芯提前一周通知" />
      </el-form-item>
      <el-form-item label="操作人">
        <el-input v-model="form.operator_name" maxlength="50" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

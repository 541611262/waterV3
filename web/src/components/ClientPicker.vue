<script setup lang="ts">
// 客户选择器：输入名称远程搜索
import { ref, watch } from 'vue'
import { getClient, searchClients } from '@/api/data'

const model = defineModel<string>({ default: '' })
defineProps<{ placeholder?: string }>()

const options = ref<{ id: string; name: string; region: string }[]>([])
const loading = ref(false)

// 已选中的客户不在搜索结果里时，补上它的名称（否则会显示成 ID）
watch(
  model,
  async (id) => {
    if (!id || options.value.some((o) => o.id === id)) return
    const client = await getClient(id)
    if (client) options.value = [{ id: client.id, name: client.name, region: client.region }, ...options.value]
  },
  { immediate: true },
)

async function search(keyword: string) {
  loading.value = true
  try {
    options.value = await searchClients(keyword)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <el-select
    v-model="model"
    filterable
    remote
    :remote-method="search"
    :loading="loading"
    :placeholder="placeholder ?? '输入客户名称搜索'"
    @visible-change="(v: boolean) => v && !options.length && search('')"
  >
    <el-option v-for="c in options" :key="c.id" :label="c.name" :value="c.id">
      <span>{{ c.name }}</span>
      <span v-if="c.region" class="region">{{ c.region }}</span>
    </el-option>
  </el-select>
</template>

<style scoped>
.region {
  float: right;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 12px;
}
</style>

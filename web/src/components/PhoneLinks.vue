<script setup lang="ts">
// 电话：手机上点击直接拨号
import { computed } from 'vue'
import { dialablePhones } from '@/lib/format'

const props = defineProps<{ phone: string | null | undefined }>()
const numbers = computed(() => dialablePhones(props.phone))
</script>

<template>
  <span v-if="!phone" class="muted">—</span>
  <span v-else-if="!numbers.length">{{ phone }}</span>
  <span v-else class="phones">
    <a v-for="n in numbers" :key="n" :href="`tel:${n}`" @click.stop>{{ n }}</a>
  </span>
</template>

<style scoped>
.phones {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
a {
  color: var(--el-color-primary);
  text-decoration: none;
}
.muted {
  color: var(--el-text-color-placeholder);
}
</style>

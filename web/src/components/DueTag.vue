<script setup lang="ts">
import { computed } from 'vue'
import { describeDue } from '@/lib/format'

const props = defineProps<{ days: number | null | undefined; date?: string | null }>()
const info = computed(() => describeDue(props.days))
</script>

<template>
  <el-tooltip :content="date ? `下次换芯：${date}` : '没有装机或换芯日期，无法计算'" placement="top">
    <el-tag :type="info.tag" :effect="info.level === 'overdue' || info.level === 'today' ? 'dark' : 'light'" disable-transitions>
      {{ info.text }}
    </el-tag>
  </el-tooltip>
</template>

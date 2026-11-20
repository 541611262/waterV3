<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <el-card shadow="never">
    <el-empty :description="`「${route.meta.title}」功能正在开发中（V4 阶段 3：工单派单、收款明细、统计报表）`" />
  </el-card>
</template>

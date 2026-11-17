<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <el-card shadow="never">
    <el-empty :description="`「${route.meta.title}」页面将在 V4 阶段 2 实现`" />
  </el-card>
</template>

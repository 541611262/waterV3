<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import AppLayout from '@/layouts/AppLayout.vue'
</script>

<template>
  <el-config-provider :locale="zhCn">
    <AppLayout />
  </el-config-provider>
</template>

<style>
html,
body,
#app {
  margin: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif;
}
</style>

<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'

const route = useRoute()
const isPublic = computed(() => Boolean(route.meta.public))
</script>

<template>
  <el-config-provider :locale="zhCn">
    <router-view v-if="isPublic" />
    <AppLayout v-else />
  </el-config-provider>
</template>

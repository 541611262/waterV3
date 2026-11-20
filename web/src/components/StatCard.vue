<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  label: string
  value: string | number
  icon: Component
  tone: 'danger' | 'warning' | 'success' | 'primary' | 'info' | 'violet'
  hint?: string
  to?: string
}>()
</script>

<template>
  <component :is="to ? 'router-link' : 'div'" :to="to" class="stat" :class="`tone-${tone}`">
    <div class="icon">
      <el-icon :size="20"><component :is="icon" /></el-icon>
    </div>
    <div class="content">
      <div class="label">{{ label }}</div>
      <div class="value num">{{ value }}</div>
      <div v-if="hint" class="hint">{{ hint }}</div>
    </div>
  </component>
</template>

<style scoped>
.stat {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  box-shadow: var(--app-shadow-sm);
  text-decoration: none;
  color: inherit;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;
  min-width: 0;
}
a.stat:hover {
  transform: translateY(-2px);
  box-shadow: var(--app-shadow-md);
  border-color: var(--tone-color);
}
.icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tone-color);
  background: var(--tone-bg);
  flex-shrink: 0;
}
.content {
  min-width: 0;
}
.label {
  font-size: 13px;
  color: var(--app-text-2);
}
.value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 4px;
  color: var(--app-text);
}
.hint {
  font-size: 12px;
  color: var(--app-text-3);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 手机上卡片窄：去掉图标、缩小间距，让下面的待办列表在第一屏就能看到；说明文字换行显示完整 */
@media (max-width: 600px) {
  .stat {
    padding: 12px 14px;
  }
  .icon {
    display: none;
  }
  .value {
    font-size: 24px;
    margin-top: 2px;
  }
  .hint {
    white-space: normal;
    line-height: 1.4;
    margin-top: 2px;
  }
}
.tone-danger {
  --tone-color: var(--tone-danger);
  --tone-bg: var(--tone-danger-bg);
}
.tone-warning {
  --tone-color: var(--tone-warning);
  --tone-bg: var(--tone-warning-bg);
}
.tone-success {
  --tone-color: var(--tone-success);
  --tone-bg: var(--tone-success-bg);
}
.tone-primary {
  --tone-color: var(--tone-primary);
  --tone-bg: var(--tone-primary-bg);
}
.tone-info {
  --tone-color: var(--tone-info);
  --tone-bg: var(--tone-info-bg);
}
.tone-violet {
  --tone-color: var(--tone-violet);
  --tone-bg: var(--tone-violet-bg);
}
</style>

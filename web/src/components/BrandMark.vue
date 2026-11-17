<script setup lang="ts">
defineProps<{ size?: number }>()
</script>

<template>
  <svg :width="size ?? 32" :height="size ?? 32" viewBox="0 0 40 40" aria-hidden="true">
    <defs>
      <linearGradient id="brand-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#2563eb" />
        <stop offset="100%" stop-color="#06b6d4" />
      </linearGradient>
    </defs>
    <rect width="40" height="40" rx="11" fill="url(#brand-bg)" />
    <path d="M20 8.5c-4.6 6-8 10.2-8 14.3a8 8 0 0 0 16 0c0-4.1-3.4-8.3-8-14.3z" fill="#fff" fill-opacity="0.95" />
    <path d="M16.2 23.6a4 4 0 0 0 3.8 3.4" stroke="#2563eb" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.7" />
  </svg>
</template>

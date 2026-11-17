/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // 相对路径：网站可以部署在静态托管的任意子目录（如 /water/）下
  base: './',
  plugins: [
    vue(),
    // Element Plus 组件按需引入
    AutoImport({ resolvers: [ElementPlusResolver()], dts: 'src/auto-imports.d.ts' }),
    Components({ resolvers: [ElementPlusResolver()], dts: 'src/components.d.ts' }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // 本地开发用 8080：测试环境的安全域名中已包含 localhost:8080
  server: { port: 8080, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // 故意在与北京不同的时区（开发者所在的美国中部）运行，确保日期逻辑不依赖电脑时区
    env: { TZ: 'America/Chicago' },
  },
})

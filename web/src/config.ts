// 部署配置：按构建模式读取 .env.production / .env.staging / .env.development
export const appConfig = {
  cloudbaseEnv: import.meta.env.VITE_CLOUDBASE_ENV ?? '',
  cloudbaseRegion: import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai',
  aiAssistant: import.meta.env.VITE_AI_ASSISTANT === 'true',
  /** 非空时在页面顶部显示（如"测试环境"），避免把测试环境误当成正式环境 */
  envLabel: import.meta.env.VITE_ENV_LABEL ?? '',
} as const

export const DEFAULT_REPLACEMENT_INTERVAL = 90
export const DEFAULT_UNPAID_INTERVAL = 30

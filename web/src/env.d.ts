/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV?: string
  readonly VITE_CLOUDBASE_REGION?: string
  readonly VITE_AI_ASSISTANT?: string
  readonly VITE_ENV_LABEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

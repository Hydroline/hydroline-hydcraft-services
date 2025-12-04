/// <reference types="vite/client" />

declare module '@nuxt/ui/dist/runtime/components/Switch.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown
  >
  export default component
}

interface ImportMetaEnv {
  readonly VITE_DYNMAP_TILE_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

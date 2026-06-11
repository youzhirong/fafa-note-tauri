/// <reference types="vite/client" />

// 由 vite define 注入的应用元信息（唯一来源：app.config.json，见 vite.config.ts）
declare const __APP_VERSION__: string
declare const __APP_NAME__: string
declare const __APP_DESCRIPTION__: string
declare const __APP_TAGLINE__: string
declare const __APP_AUTHOR__: string
declare const __APP_HOMEPAGE__: string

// 让 TypeScript 认识 .vue 单文件组件
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

/// <reference types="vite/client" />

// 由 vite define 注入的应用版本号（来自 package.json）
declare const __APP_VERSION__: string

// 让 TypeScript 认识 .vue 单文件组件
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

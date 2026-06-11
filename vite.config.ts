import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

// Tauri 在开发时会注入这些环境变量，用来区分目标平台
const host = process.env.TAURI_DEV_HOST

// 应用元信息的唯一来源：app.config.json（发版只改这一处）。
// 这里把它注入为编译期常量，供「关于」页展示；版本号同步到 package.json / tauri.conf.json / Cargo.toml
// 由 scripts/sync-app-config.mjs 负责（npm run sync）。
const appConfig = JSON.parse(readFileSync(new URL('./app.config.json', import.meta.url), 'utf-8'))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],

  define: {
    __APP_VERSION__: JSON.stringify(appConfig.version),
    __APP_NAME__: JSON.stringify(appConfig.productName),
    __APP_DESCRIPTION__: JSON.stringify(appConfig.description),
    __APP_TAGLINE__: JSON.stringify(appConfig.aboutTagline),
    __APP_AUTHOR__: JSON.stringify(appConfig.author),
    __APP_HOMEPAGE__: JSON.stringify(appConfig.homepage),
  },

  // 使用 @ 指向 src，方便后期重构时移动文件不改大量相对路径
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // ---- 下面这些是 Tauri 推荐的开发服务器配置 ----
  // 1. 固定端口，避免 Tauri 找不到前端
  // 2. 端口被占用时直接报错而不是自动换端口（否则 Tauri 会连错）
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 不监听 src-tauri 目录，避免 Rust 改动触发前端热更新
      ignored: ['**/src-tauri/**'],
    },
  },

  // 构建产物输出到 dist，Tauri 的 frontendDist 指向这里
  build: {
    // Tauri 桌面端使用 Chromium / WebView2，可用较新的语法；
    // 但若同时部署到老旧浏览器托管的 Web，可调低到 'es2015'
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false,
    // 不手动分包：md-editor-v3 + highlight.js + CodeMirror 之间依赖交叉，
    // 强行拆分会产生「循环 chunk」告警。交给 Vite 自动分包即可——
    // 重型编辑器栈会落在「笔记页」这个按路由懒加载的 chunk 里，其它路由（设置/统计/回收站）不受其拖累。
    // 该 chunk 体积偏大是 md-editor-v3 自带 CodeMirror 多语言 + 本地 highlight.js 所致，
    // 故调高告警阈值；如需瘦身可按需裁剪语言或换更轻的编辑器。
    chunkSizeWarningLimit: 3500,
  },
})

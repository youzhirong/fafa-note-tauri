/**
 * 平台检测工具。
 *
 * 整个应用「一套代码、多端运行」，很多能力（文件系统、HTTP 代理）在
 * Web 和 Tauri 下的实现不同，统一通过这里判断当前运行环境。
 */

/**
 * 是否运行在 Tauri 容器内（桌面 / 移动）。
 * Tauri 2 会在 window 上注入 __TAURI_INTERNALS__，浏览器里没有。
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** 是否运行在纯浏览器（托管网页）环境 */
export function isWeb(): boolean {
  return !isTauri()
}

/** 简单生成唯一 id：时间戳 + 随机串，足够本地使用 */
export function genId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${Date.now().toString(36)}-${rand}`
}

/**
 * 平台自适应的 HTTP 请求服务（解决 Web 端跨域 / CORS）。
 *
 * 背景：
 *   - 你的 Web 版多数托管在静态网页上，没有后端服务器；
 *     浏览器里直接 fetch 第三方接口经常被 CORS 拦截。
 *   - 解决办法是配置一个「代理地址」(设置页可填)，请求经代理转发，绕过跨域。
 *   - Tauri 桌面/移动端用官方 plugin-http，请求由 Rust 侧发出，天然没有 CORS 限制，
 *     因此 Tauri 下忽略代理、直连即可。
 *
 * 代理地址支持两种写法（见 AppSettings.proxyUrl 注释）：
 *   占位符： https://proxy/?url={url}
 *   前缀：   https://proxy/
 */
import { isTauri } from '@/platform'

/** 把目标 url 套上代理地址 */
export function applyProxy(targetUrl: string, proxyUrl: string): string {
  const proxy = proxyUrl.trim()
  if (!proxy) return targetUrl

  if (proxy.includes('{url}')) {
    // 占位符模式：替换 {url}，并对目标地址做 URL 编码
    return proxy.replace('{url}', encodeURIComponent(targetUrl))
  }
  // 前缀模式：直接拼接（适配 https://proxy/https://target 形式的代理）
  return proxy.replace(/\/$/, '') + '/' + targetUrl
}

export interface HttpOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  /** 当前代理地址，由调用方从 settings store 传入 */
  proxyUrl?: string
}

/**
 * 统一请求入口。返回原始 Response（Tauri 与 Web 的 Response 接口一致）。
 *
 * - Tauri：动态 import plugin-http 的 fetch（不在 Web 打包时报错）；
 * - Web：用浏览器 fetch，按需套代理。
 */
export async function httpRequest(url: string, options: HttpOptions = {}): Promise<Response> {
  const { proxyUrl = '', ...init } = options

  if (isTauri()) {
    // 动态导入：避免在纯 Web 环境里因找不到 Tauri 运行时而报错
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    return tauriFetch(url, init as RequestInit)
  }

  // Web 端：套代理后用浏览器原生 fetch
  const finalUrl = applyProxy(url, proxyUrl)
  return fetch(finalUrl, init as RequestInit)
}

/** 便捷方法：直接拿 JSON */
export async function httpGetJson<T = unknown>(url: string, proxyUrl = ''): Promise<T> {
  const res = await httpRequest(url, { method: 'GET', proxyUrl })
  if (!res.ok) throw new Error(`请求失败: ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

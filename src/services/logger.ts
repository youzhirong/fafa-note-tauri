/**
 * 应用内日志服务。
 *
 * 目的：桌面端（Tauri）打包后看不到浏览器控制台，出错时难以排查。
 * 这里把 console 的输出和全局错误统一收集到内存环形缓冲，供「日志」页查看 / 复制 / 导出。
 *
 * 在 main.ts 里尽早调用 initLogger()，以便捕获启动阶段的错误。
 */
import { ref } from 'vue'

export type LogLevel = 'log' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  time: number
  level: LogLevel
  text: string
}

const MAX = 500 // 环形缓冲上限，避免无限增长占内存
let seq = 0
let initialized = false

/** 响应式日志列表，日志页直接读它 */
export const logs = ref<LogEntry[]>([])

/** 把任意参数格式化成可读字符串（兼容 Error / 对象 / 循环引用） */
function format(arg: unknown): string {
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`
  if (typeof arg === 'string') return arg
  if (typeof arg === 'object' && arg !== null) {
    // DOMException 等特殊对象 JSON 化可能为空，单独兜底
    const anyArg = arg as any
    if (anyArg.name && anyArg.message) return `${anyArg.name}: ${anyArg.message}`
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  }
  return String(arg)
}

function push(level: LogLevel, args: unknown[]) {
  const text = args.map(format).join(' ')
  logs.value.push({ id: seq++, time: Date.now(), level, text })
  if (logs.value.length > MAX) logs.value.splice(0, logs.value.length - MAX)
}

/** 初始化：劫持 console + 监听全局错误（只执行一次） */
export function initLogger() {
  if (initialized) return
  initialized = true

  const levels: LogLevel[] = ['log', 'info', 'warn', 'error']
  for (const level of levels) {
    const orig = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      try {
        push(level, args)
      } catch {
        /* 记录失败不影响原始输出 */
      }
      orig(...args)
    }
  }

  // 未捕获的同步错误
  window.addEventListener('error', (e) => {
    push('error', [e.message, e.error instanceof Error ? e.error.stack : ''])
  })
  // 未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (e) => {
    push('error', ['UnhandledRejection:', e.reason])
  })
}

export function clearLogs() {
  logs.value = []
}

/** 导出为纯文本（复制 / 保存用） */
export function logsToText(): string {
  return logs.value
    .map((l) => `[${new Date(l.time).toLocaleString()}] ${l.level.toUpperCase()} ${l.text}`)
    .join('\n')
}

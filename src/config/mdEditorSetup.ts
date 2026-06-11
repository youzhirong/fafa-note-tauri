/**
 * md-editor-v3 全局配置。
 *
 * 默认情况下 md-editor-v3 会从 CDN(jsDelivr) 按需加载 highlight.js 等资源，
 * 桌面端离线或网络受限时代码块就不会高亮。这里改用**本地**的 highlight.js 实例，
 * 并引入本地高亮主题 CSS，实现完全离线的代码高亮。
 *
 * 本文件在 main.ts 里 import 一次即可（副作用模块）。
 */
import { config } from 'md-editor-v3'
import hljs from 'highlight.js'
// 本地高亮主题（不走 CDN）。github 配色亮暗都可用；需要更深的暗色可换 'github-dark.css'。
import 'highlight.js/styles/github.css'

/**
 * markdown-it 插件：把 [[标题]] 渲染成可点击的双链。
 * 输出 <a class="wikilink" data-wikilink="标题">标题</a>，点击由 NoteEditor 拦截处理。
 */
function wikilinkPlugin(md: any) {
  md.inline.ruler.before('link', 'wikilink', (state: any, silent: boolean) => {
    const start = state.pos
    // 匹配连续两个 '['
    if (state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5b) {
      return false
    }
    const end = state.src.indexOf(']]', start + 2)
    if (end < 0) return false
    const content = state.src.slice(start + 2, end).trim()
    if (!content) return false
    if (!silent) {
      const token = state.push('wikilink', '', 0)
      token.content = content
    }
    state.pos = end + 2
    return true
  })

  md.renderer.rules.wikilink = (tokens: any[], idx: number) => {
    const title = tokens[idx].content
    const esc = md.utils.escapeHtml(title)
    return `<a class="wikilink" data-wikilink="${esc}">${esc}</a>`
  }
}

config({
  editorExtensions: {
    highlight: {
      // 提供本地实例后，md-editor 不再从 CDN 拉取 highlight.js
      instance: hljs,
    },
  },
  markdownItConfig(md) {
    md.use(wikilinkPlugin)
  },
})

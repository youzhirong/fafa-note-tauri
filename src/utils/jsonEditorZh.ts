/**
 * vue3-ts-jsoneditor（底层 vanilla-jsoneditor）的「汉化」辅助。
 *
 * 背景：该库 UI 文字是硬编码英文，没有 i18n props。能改的有两层：
 *   1) 通过 onRenderMenu / onRenderContextMenu 回调改主菜单按钮与右键菜单文字（干净、可靠）；
 *   2) 通过一个「作用域受限」的 MutationObserver 翻译 title 提示气泡、弹窗/菜单内文字
 *      ——只动 title 属性与菜单/弹窗区域，绝不碰 JSON 内容区，避免误改用户数据。
 *
 * 字典只覆盖常见可见文案；底层版本升级若改了英文原文，补字典即可。
 */

/** 英文原文 → 中文。键为编辑器里出现的英文（含快捷键提示的整串）。 */
export const JSE_ZH: Record<string, string> = {
  // —— 主菜单 / 通用按钮（title 提示）——
  Format: '格式化',
  'Format JSON: add proper indentation and new lines (Ctrl+I)': '格式化：添加缩进与换行 (Ctrl+I)',
  Compact: '压缩',
  'Compact JSON: remove all whitespace (Ctrl+Shift+I)': '压缩：移除所有空白 (Ctrl+Shift+I)',
  Sort: '排序',
  'Sort array or object contents': '对数组或对象内容排序',
  'Sort array items': '排序数组项',
  'Sort object keys': '排序对象键',
  Transform: '转换',
  'Transform contents (filter, sort, project)': '转换内容（筛选、排序、投影）',
  'Search (Ctrl+F)': '搜索 (Ctrl+F)',
  'Undo (Ctrl+Z)': '撤销 (Ctrl+Z)',
  'Redo (Ctrl+Shift+Z)': '重做 (Ctrl+Shift+Z)',
  Undo: '撤销',
  Redo: '重做',

  // —— 模式切换 ——
  text: '文本',
  tree: '树形',
  table: '表格',
  'Switch to text mode (current mode: tree)': '切换到文本模式（当前：树形）',
  'Switch to tree mode (current mode: text)': '切换到树形模式（当前：文本）',
  'Switch to table mode': '切换到表格模式',

  // —— 右键 / 上下文菜单 ——
  Edit: '编辑',
  'Edit key': '编辑键',
  'Edit value': '编辑值',
  'Edit the key (Double-click on the key)': '编辑键（双击键）',
  'Edit the value (Double-click on the value)': '编辑值（双击值）',
  'Edit row': '编辑行',
  'Edit array': '编辑数组',
  'Edit object': '编辑对象',
  Insert: '插入',
  'Insert before': '在前插入',
  'Insert after': '在后插入',
  'Insert:': '插入：',
  'Convert to:': '转换为：',
  Duplicate: '复制',
  'Duplicate selected contents (Ctrl+D)': '复制所选内容 (Ctrl+D)',
  'Duplicate row': '复制行',
  Extract: '提取',
  'Extract selected contents': '提取所选内容',
  Remove: '删除',
  'Remove selected contents (Delete)': '删除所选内容 (Delete)',
  'Remove row': '删除行',
  Cut: '剪切',
  'Cut formatted': '剪切（格式化）',
  'Cut compacted': '剪切（压缩）',
  Copy: '复制',
  'Copy formatted': '复制（格式化）',
  'Copy compacted': '复制（压缩）',
  'Copy (Ctrl+C)': '复制 (Ctrl+C)',
  Paste: '粘贴',
  'Paste clipboard contents (Ctrl+V)': '粘贴剪贴板内容 (Ctrl+V)',
  'Copy selected path to the clipboard': '复制所选路径到剪贴板',

  // —— 展开 / 折叠 ——
  'Expand all': '全部展开',
  'Collapse all': '全部折叠',

  // —— 弹窗 / 校验 / 操作 ——
  Apply: '应用',
  Cancel: '取消',
  Ok: '确定',
  OK: '确定',
  'Apply fixed JSON': '应用修复后的 JSON',
  'Cancel repair': '取消修复',
  'Collapse validation errors': '折叠校验错误',
  'Paste as JSON instead': '改为按 JSON 粘贴',
  'Paste as string instead': '改为按字符串粘贴',
}

/** 把英文文案翻成中文；查不到则原样返回。 */
function tr(text: string | undefined): string | undefined {
  if (text == null) return text
  return JSE_ZH[text] ?? text
}

/**
 * onRenderMenu：翻译主菜单按钮的 text / title。
 * 原样返回数组（不增删项），仅替换文字。
 */
export function renderMenuZh(items: unknown[]): unknown[] {
  for (const it of items) {
    if (it && typeof it === 'object') {
      const m = it as { text?: string; title?: string }
      if (typeof m.text === 'string') m.text = tr(m.text)!
      if (typeof m.title === 'string') m.title = tr(m.title)!
    }
  }
  return items
}

/** onRenderContextMenu：递归翻译右键菜单项的 text / title（含子菜单 / 行内分组）。 */
export function renderContextMenuZh(items: unknown[]): unknown[] {
  const walk = (arr: unknown[]) => {
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue
      const m = it as { text?: string; title?: string; items?: unknown[]; type?: string }
      if (typeof m.text === 'string') m.text = tr(m.text)!
      if (typeof m.title === 'string') m.title = tr(m.title)!
      if (Array.isArray(m.items)) walk(m.items)
    }
  }
  walk(items)
  return items
}

/** 不应进入文本翻译的区域（JSON 内容区 / 代码编辑器）——只允许翻译菜单与弹窗里的文字。 */
const TEXT_TRANSLATE_OK = '.jse-menu, .jse-context-menu, .jse-modal, .jse-message, .jse-navigation-bar'

/**
 * 启动作用域受限的汉化观察器。
 * @param root 编辑器容器元素
 * @returns 停止函数（组件卸载时调用以断开观察器）
 *
 * 做两件事：
 *   1) 把容器内所有带 [title] 的元素的提示气泡翻成中文（title 不属于 JSON 数据，安全）；
 *   2) 仅在菜单/弹窗区域内，把命中字典的纯文本节点替换成中文。
 * 右键菜单是动态挂到 body 上的，所以也对 document.body 兜底翻译 title + context-menu 文本。
 */
export function localizeJsonEditor(root: HTMLElement): () => void {
  const translateTitles = (scope: ParentNode) => {
    scope.querySelectorAll<HTMLElement>('[title]').forEach((el) => {
      const t = el.getAttribute('title')
      const z = tr(t ?? undefined)
      if (z && z !== t) el.setAttribute('title', z)
    })
  }

  const translateTexts = (scope: ParentNode) => {
    // 只在白名单区域内翻译文本节点
    const regions = scope.querySelectorAll<HTMLElement>(TEXT_TRANSLATE_OK)
    regions.forEach((region) => {
      const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT)
      let node: Node | null
      while ((node = walker.nextNode())) {
        const raw = node.nodeValue ?? ''
        const key = raw.trim()
        if (!key) continue
        const z = JSE_ZH[key]
        if (z && z !== key) node.nodeValue = raw.replace(key, z)
      }
    })
  }

  const run = () => {
    translateTitles(root)
    translateTexts(root)
    // 右键菜单 / 部分弹窗挂在 body 顶层
    translateTitles(document.body)
    translateTexts(document.body)
  }

  run()
  const obs = new MutationObserver(() => run())
  obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] })
  // body 顶层（右键菜单/弹窗）也观察，但只看子节点增减，降低开销
  const bodyObs = new MutationObserver(() => {
    translateTitles(document.body)
    translateTexts(document.body)
  })
  bodyObs.observe(document.body, { childList: true, subtree: true })

  return () => {
    obs.disconnect()
    bodyObs.disconnect()
  }
}

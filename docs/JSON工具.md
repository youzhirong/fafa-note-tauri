# JSON 工具页 —— 开发交接文档

类似 [jsoneditoronline.org](https://jsoneditoronline.org) Compare 模式的本地 JSON 工具：
**左右双栏编辑 + 结构对比 + Excel 导出**，菜单入口「JSON 工具」(`/json`)。

底层编辑器用第三方库 [`vue3-ts-jsoneditor`](https://www.npmjs.com/package/vue3-ts-jsoneditor)
（`vanilla-jsoneditor` 的 Vue3 封装）。Excel 导出用 [`xlsx`](https://www.npmjs.com/package/xlsx)（SheetJS）。

---

## 一、文件结构（改这里）

| 文件 | 职责 |
|---|---|
| `src/views/JsonToolView.vue` | **页面主体**：工具栏、双栏编辑器、对比面板、所有交互逻辑 |
| `src/utils/jsonDiff.ts` | 纯函数 `diffJson()`：递归深比较两份 JSON，产出差异列表 |
| `src/utils/jsonEditorZh.ts` | **汉化**：中文字典 + 菜单/右键翻译回调 + DOM 观察器 |
| `src/utils/jsonToExcel.ts` | JSON → `.xlsx` 字节流（全文本单元格） |
| `src/services/BackupService.ts` | `exportBinaryFile()`：跨平台保存二进制文件（Excel 复用） |
| `src/router/index.ts` | 路由 `/json` |
| `src/config/navigation.ts` | 左侧菜单项 `JSON 工具`（`pi pi-code`） |
| `src-tauri/Info.plist` | **声明 macOS 应用支持中文**，让原生「保存」对话框在中文系统显示中文（见第五节末） |

依赖：`vue3-ts-jsoneditor`、`xlsx`（均已在 `package.json`）。

> 该库**没有 i18n 接口**，安装后核对 API 的方式：读
> `node_modules/vue3-ts-jsoneditor/dist/JsonEditorPlugin.d.ts`（全部 props 在此）。

---

## 二、数据流：为什么每侧有两个 ref（关键，别踩坑）

编辑器的内容更新事件分两种：text 模式发 `update:text`（字符串），tree 模式发
`update:json`（对象）。如果直接把 `:text` 双向绑定到同一个 ref，tree 模式下每次输入都会把
内容回灌给编辑器 → 树被重建、选区/展开态丢失。

所以每侧维护两个字段（`panes[side]`）：

```
feed  ←  推给编辑器的值（:text 绑定它），仅「工具栏操作」时改变
live  ←  编辑器当前内容，由 @update:text / @update:json 同步；用户打字只改它
```

- **用户打字** → 只更新 `live`，不碰 `feed` → 编辑器不会被回灌。
- **工具栏操作**（格式化/压缩/排序键/清空/交换）→ 读 `live`，算出结果，
  用 `setSide()` 同时写回 `feed`（触发编辑器刷新）和 `live`，并清空对比结果。
- **对比 / 导出** → 解析 `live`。

> 新增任何"修改内容"的功能，一律走 `setSide(side, newText)`，别直接改 `feed`/`live`。

模式（文本/树形）两栏共用 `mode`；暗色主题由 `isDark` 跟随 `<html class="dark-theme">`
（`MutationObserver` 监听），传给编辑器的 `:dark-theme`。编辑器样式（含暗色）由库**自动注入**，
无需手动 import CSS。

### 示例数据 & 缓存（IndexedDB）

**为什么用 IndexedDB 而非 localStorage**：JSON 内容可能很大，localStorage 约 5MB 上限、
同步写、超限直接抛 `QuotaExceededError`。缓存改存 IndexedDB（容量数百 MB+、异步），与笔记
（也用 IndexedDB）技术栈一致。

实现走通用 KV 服务 `src/services/kvStore.ts`（独立库 `fafa-note-kv`，**不进笔记库 `fafa-note`**，
与笔记数据完全解耦、且不需给生产笔记库做迁移）。本页用单键 `json-tool:last`，**只保留最后一次**：

- **首次进入**（无缓存）→ `restoreOrSeed()` 载入 `EXAMPLE_LEFT` / `EXAMPLE_RIGHT` 示例
  （左右刻意有差异，进去点「对比」即可看到 added/removed/changed 效果）。
- **再次进入** → `onMounted` 里异步 `kvGet` 恢复上次左右内容与模式。
- **保存时机**：`watch` 左右 `live` + `mode`，**防抖 400ms** 调 `kvSet`；`onBeforeUnmount`
  再立即落盘一次。`restored` 标志确保「恢复完成前」不会用空内容覆盖缓存。
- 顶栏「示例」按钮 = `loadExample()`，随时把示例重新灌回两侧。

> 初始为空、挂载后异步填充（与笔记页一致的异步加载风格，会有极短的空→内容过程）。
> 用户清空两侧后缓存的是空串，下次进入即空白（尊重用户操作，不再弹示例）。
> 想改示例内容直接改 `EXAMPLE_LEFT` / `EXAMPLE_RIGHT` 两个常量。

> `kvStore` 是通用的：其它页面要存大缓存也可直接用 `kvGet`/`kvSet`/`kvRemove`。

---

## 三、汉化机制（`jsonEditorZh.ts`）

库 UI 是硬编码英文，无 i18n。两层汉化：

1. **`renderMenuZh` / `renderContextMenuZh`**：作为 `:on-render-menu` /
   `:on-render-context-menu` 传给编辑器，翻译主菜单按钮和右键菜单的 `text`/`title`。
2. **`localizeJsonEditor(root)`**：一个**作用域受限**的 `MutationObserver`，翻译
   - 所有 `[title]` 提示气泡（title 不属于 JSON 数据，安全）；
   - **仅** `.jse-menu / .jse-context-menu / .jse-modal / .jse-message / .jse-navigation-bar`
     区域内的文本节点（绝不碰 JSON 内容区，避免误改用户数据）。
   右键菜单/弹窗挂在 `document.body`，所以也对 body 兜底观察。返回停止函数，组件卸载时调用。

### 👉 发现没翻译的英文怎么办

往 `JSE_ZH` 字典加一行即可（键 = 编辑器里出现的英文原文，值 = 中文）：

```ts
export const JSE_ZH: Record<string, string> = {
  // ...
  'Some English Text': '某中文',
}
```

字典命中是「整串精确匹配」。带快捷键的提示要连快捷键一起写，如
`'Search (Ctrl+F)': '搜索 (Ctrl+F)'`。少数深层弹窗（如 Transform 转换对话框内部）文案受限于
库实现可能仍为英文。

---

## 四、结构对比（`jsonDiff.ts`）

`diffJson(left, right)` 递归深比较，返回 `JsonDiffEntry[]`：

- `added`：仅右侧有（左侧缺）
- `removed`：仅左侧有（右侧缺）
- `changed`：两侧都有但值/类型不同

对象按 key 并集递归，数组按下标递归，标量用 `Object.is`。路径形如 `root.a.b[0].c`。
视图里映射成中文标签（右侧新增 / 左侧独有 / 值不同）并着色展示。

---

## 五、Excel 导出（`jsonToExcel.ts` + `exportBinaryFile`）

`jsonToXlsxBytes(value)`（**动态 import `xlsx`**，仅首次导出时加载）：

- 顶层是**对象** → 包成单元素数组，导出 **1 行**；
- 顶层是**数组** → 逐行导出；
- 每行都是纯对象 → 列 = 所有行 key 的并集（首次出现顺序），列式表格；
- 否则（基本类型/数组元素/混合）→ 单列「值」。

**所有单元格强制文本**（`cell.t='s'` + `cell.z='@'`，且值都先 `String()`/`JSON.stringify()`），
这样 Excel 不会把大数字/长串数字显示成科学计数法。

保存走 `BackupService.exportBinaryFile(bytes, fileName, mime, title)`：Tauri 弹保存对话框写磁盘
（`fs.writeFile` 二进制，需 `fs:allow-write-file` 权限，已在 capabilities 配好）；Web 触发浏览器下载。
JSON 工具导出时传入 `title='导出 Excel'` 作为对话框标题。

### 保存对话框为什么会是英文 / 怎么改成中文

那个「保存」面板是**操作系统的原生对话框**，不是我们的网页 UI。它上面「存储 / 取消」等按钮的语言
**不由前端代码决定**，而是取「**系统语言 ∩ 应用声明支持的语言**」：

- macOS：若应用包没声明支持中文，即使系统是中文，原生面板也会回退成**英文**。
  已通过 `src-tauri/Info.plist` 的 `CFBundleLocalizations`（含 `zh-Hans`）声明支持中文，
  中文系统下原生保存/打开面板即显示中文。**改后需重新 `npm run tauri:dev` / `tauri:build` 生效**，
  且只对**中文系统**生效（英文系统仍显示英文，属正常行为）。此设置对**所有**原生对话框生效
  （备份/还原、单篇导出等），不止 Excel。
- 标题文案（如「导出 Excel」）是前端能直接控制的，通过 `exportBinaryFile(..., title)` 的 `title` 传入；
  系统按钮仍由上面的本地化机制决定。
- Windows/Linux：原生对话框按钮直接跟随系统语言，无需上述声明。

### ⚠️ 已知精度限制

传入的值是 `JSON.parse` 的结果，**超过 2^53 的整数在 JS 解析阶段就已丢精度**（如
`12345678901234567890` 会变 `12345678901234567000`）。导出文本只解决"显示成科学计数法"，
解决不了"解析时丢精度"。若确有超大整数需求，需在解析阶段换 bigint 解析器（如 `lossless-json`），
超出当前实现范围。

---

## 六、如何扩展

- **加一个工具栏操作**（如「去重数组」「转义/反转义」）：在 `JsonToolView.vue` 写个函数，
  读 `parseSide(side)` → 处理 → `setSide(side, 结果)`；在 `pane-actions` 加一个 `<Button>`。
- **加一种导出格式**（CSV / Markdown 表格）：仿 `jsonToExcel.ts` 写转换函数返回字节/文本，
  Excel 走 `exportBinaryFile`、文本走 `BackupService.exportTextFile`。
- **改对比规则**（如忽略数组顺序）：改 `jsonDiff.ts`，它是纯函数，易测易改。
- **补汉化**：见上面第三节。

---

## 七、验证

```bash
npm run dev          # 纯 Web 预览（最快）
npm run tauri:dev    # 桌面端（验证保存对话框/二进制写盘）
npm run build        # vue-tsc 类型检查 + 打包
```

手动核对：双栏粘贴 JSON → 格式化/压缩/排序键/清空/交换 → 对比列出差异 → 导出 Excel
（对象=1 行、数组=多行、大数字以文本显示不变科学计数法）→ 切换亮/暗主题编辑器跟随 →
右键菜单/提示为中文。

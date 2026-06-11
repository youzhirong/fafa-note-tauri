<script setup lang="ts">
/**
 * JSON 工具页：左右双栏 JSON 编辑器 + 结构对比（类似 jsoneditoronline.org 的 Compare）。
 *
 * 能力：
 *   - 双栏编辑（vue3-ts-jsoneditor，已汉化菜单/提示，见 @/utils/jsonEditorZh）
 *   - 工具栏：格式化 / 压缩 / 排序键 / 清空 / ⇄ 交换 / 对比
 *   - 对比：深比较两侧 JSON，底部列出 新增 / 删除 / 修改 的路径与值
 *   - 主题、模式（文本/树形）跟随；纯前端本地处理，无网络调用
 *
 * 实现要点（避免编辑回灌死循环）：
 *   每侧维护两个 ref——
 *     · feed   ：「推给编辑器」的值，仅在工具栏操作时改变（:text 绑定它）
 *     · live   ：编辑器「当前内容」，由 @update:text / @update:json 同步
 *   工具栏操作读 live、写回 feed+live；用户打字只更新 live，不会反向重置编辑器。
 */
import { ref, reactive, watch, onMounted, onBeforeUnmount, useTemplateRef } from 'vue'
import JsonEditor from 'vue3-ts-jsoneditor'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { diffJson, type JsonDiffEntry } from '@/utils/jsonDiff'
import { renderMenuZh, renderContextMenuZh, localizeJsonEditor } from '@/utils/jsonEditorZh'
import { jsonToXlsxBytes } from '@/utils/jsonToExcel'
import { exportBinaryFile } from '@/services/BackupService'
import { kvGet, kvSet } from '@/services/kvStore'

const toast = useToast()

type Side = 'left' | 'right'
/** 每侧的可编辑状态 */
interface Pane {
  feed: string // 推给编辑器的值（:text 绑定）
  live: string // 编辑器当前内容（事件同步）
}

/** 缓存键（存于 IndexedDB KV，单键覆盖=只保留最后一次，见 @/services/kvStore） */
const CACHE_KEY = 'json-tool:last'

/** 首次进入展示的示例（左右刻意有差异，方便演示「对比」） */
const EXAMPLE_LEFT = JSON.stringify(
  {
    name: 'fafa-note',
    version: '0.1.0',
    features: ['笔记', '标签', '全文搜索'],
    settings: { theme: 'light', fontSize: 14 },
    stars: 128,
  },
  null,
  2,
)
const EXAMPLE_RIGHT = JSON.stringify(
  {
    name: 'fafa-note',
    version: '0.2.0',
    features: ['笔记', '标签', 'JSON 工具'],
    settings: { theme: 'dark', fontSize: 14 },
    author: 'youzhirong',
  },
  null,
  2,
)

// 初始为空；挂载后从 IndexedDB 异步恢复（有缓存→上次内容；无→示例），见 onMounted
const panes = reactive<Record<Side, Pane>>({
  left: { feed: '', live: '' },
  right: { feed: '', live: '' },
})

/** 编辑模式（两栏共用）：文本 / 树形 */
const mode = ref<'text' | 'tree'>('text')

/** 缓存恢复完成前不触发写回，避免「空内容」覆盖掉真实缓存 */
const restored = ref(false)

/** 对比结果：null=尚未对比；[]=完全一致 */
const diffs = ref<JsonDiffEntry[] | null>(null)

// onRenderMenu / onRenderContextMenu 的类型较严，这里用 any 透传汉化处理器
const onRenderMenu: any = renderMenuZh
const onRenderContextMenu: any = renderContextMenuZh

/** 把编辑器内容写回某侧（同时更新 feed 与 live，并使对比结果失效） */
function setSide(side: Side, value: string) {
  panes[side].feed = value
  panes[side].live = value
  diffs.value = null
}

/** 解析某侧当前内容；失败则 toast 提示并返回哨兵 */
const PARSE_FAIL = Symbol('parse-fail')
function parseSide(side: Side): unknown | typeof PARSE_FAIL {
  const raw = panes[side].live.trim()
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch (e) {
    toast.add({
      severity: 'warn',
      summary: `${side === 'left' ? '左' : '右'}侧 JSON 解析失败`,
      detail: (e as Error).message,
      life: 3000,
    })
    return PARSE_FAIL
  }
}

/** 递归按 key 排序对象（数组保持顺序，元素递归处理） */
function deepSortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(deepSortKeys)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = deepSortKeys((v as Record<string, unknown>)[k])
    }
    return out
  }
  return v
}

function format(side: Side) {
  const v = parseSide(side)
  if (v === PARSE_FAIL || v === undefined) return
  setSide(side, JSON.stringify(v, null, 2))
}
function compact(side: Side) {
  const v = parseSide(side)
  if (v === PARSE_FAIL || v === undefined) return
  setSide(side, JSON.stringify(v))
}
function sortKeys(side: Side) {
  const v = parseSide(side)
  if (v === PARSE_FAIL || v === undefined) return
  setSide(side, JSON.stringify(deepSortKeys(v), null, 2))
}
function clear(side: Side) {
  setSide(side, '')
}

/**
 * 导出某侧 JSON 为 Excel(.xlsx)。
 * 对象→1 行；数组→逐行；所有单元格以文本形式写入（避免大数字科学计数法）。
 */
async function exportExcel(side: Side) {
  const v = parseSide(side)
  if (v === PARSE_FAIL) return
  if (v === undefined) {
    toast.add({ severity: 'warn', summary: '内容为空，无法导出', life: 2500 })
    return
  }
  try {
    const bytes = await jsonToXlsxBytes(v)
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    const where = await exportBinaryFile(
      bytes,
      `json-${side}-${stamp}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    toast.add({ severity: 'success', summary: '已导出 Excel', detail: where, life: 3000 })
  } catch (e) {
    toast.add({ severity: 'warn', summary: '导出失败', detail: (e as Error).message, life: 3000 })
  }
}

/** 交换左右内容 */
function swap() {
  const l = panes.left.live
  const r = panes.right.live
  setSide('left', r)
  setSide('right', l)
}

/** 重新载入示例数据（覆盖当前两侧内容） */
function loadExample() {
  setSide('left', EXAMPLE_LEFT)
  setSide('right', EXAMPLE_RIGHT)
}

// —— 缓存：内容/模式变更后防抖写入 IndexedDB，下次进入自动恢复 ——
let saveTimer: ReturnType<typeof setTimeout> | undefined
function saveCache() {
  if (!restored.value) return // 恢复完成前不写，避免空内容覆盖缓存
  // 异步写，失败静默（IndexedDB 容量极大，基本不会超限）
  kvSet(CACHE_KEY, JSON.stringify({ left: panes.left.live, right: panes.right.live, mode: mode.value })).catch(
    () => {},
  )
}
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveCache, 400)
}
watch(() => [panes.left.live, panes.right.live, mode.value], scheduleSave)

/** 直接套用一份状态到两侧（用于缓存恢复，不经 setSide 以免触发额外逻辑） */
function applyState(left: string, right: string, m: 'text' | 'tree') {
  panes.left.feed = left
  panes.left.live = left
  panes.right.feed = right
  panes.right.live = right
  mode.value = m
  diffs.value = null
}

/** 从 IndexedDB 恢复上次内容；无缓存则载入示例 */
async function restoreOrSeed() {
  const raw = await kvGet(CACHE_KEY)
  if (raw) {
    try {
      const c = JSON.parse(raw)
      applyState(
        typeof c.left === 'string' ? c.left : '',
        typeof c.right === 'string' ? c.right : '',
        c.mode === 'tree' ? 'tree' : 'text',
      )
    } catch {
      applyState(EXAMPLE_LEFT, EXAMPLE_RIGHT, 'text')
    }
  } else {
    applyState(EXAMPLE_LEFT, EXAMPLE_RIGHT, 'text')
  }
  restored.value = true
}

/** 对比两侧 JSON 结构 */
function compare() {
  const l = parseSide('left')
  const r = parseSide('right')
  if (l === PARSE_FAIL || r === PARSE_FAIL) return
  diffs.value = diffJson(l, r)
}

/** 差异类型 → 中文标签 / 样式 */
const DIFF_LABEL: Record<JsonDiffEntry['type'], string> = {
  added: '右侧新增',
  removed: '左侧独有',
  changed: '值不同',
}

/** 值的简洁展示（截断过长内容） */
function fmtVal(v: unknown): string {
  if (v === undefined) return '—'
  const s = JSON.stringify(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

// —— 暗色主题跟随：监听 <html class="dark-theme"> ——
const isDark = ref(false)
let themeObs: MutationObserver | null = null
function syncDark() {
  isDark.value = document.documentElement.classList.contains('dark-theme')
}

// —— 汉化观察器 ——
const pageRef = useTemplateRef<HTMLElement>('page')
let stopLocalize: (() => void) | null = null

onMounted(() => {
  syncDark()
  themeObs = new MutationObserver(syncDark)
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  if (pageRef.value) stopLocalize = localizeJsonEditor(pageRef.value)
  void restoreOrSeed()
})
onBeforeUnmount(() => {
  themeObs?.disconnect()
  stopLocalize?.()
  // 离开页面前把最后一次内容立即落盘（避免防抖未触发就卸载）
  clearTimeout(saveTimer)
  saveCache()
})
</script>

<template>
  <div ref="page" class="json-tool">
    <!-- 顶部工具栏 -->
    <header class="toolbar">
      <h2>JSON 工具</h2>
      <div class="actions">
        <Button
          :label="mode === 'text' ? '树形视图' : '文本视图'"
          :icon="mode === 'text' ? 'pi pi-sitemap' : 'pi pi-align-left'"
          text
          size="small"
          @click="mode = mode === 'text' ? 'tree' : 'text'"
        />
        <span class="sep" />
        <Button icon="pi pi-sparkles" label="示例" text size="small" @click="loadExample" />
        <Button icon="pi pi-arrow-right-arrow-left" label="交换左右" text size="small" @click="swap" />
        <Button icon="pi pi-equals" label="对比" size="small" @click="compare" />
      </div>
    </header>

    <!-- 双栏编辑器 -->
    <div class="panes">
      <section v-for="side in (['left', 'right'] as const)" :key="side" class="pane">
        <div class="pane-bar">
          <span class="pane-title">{{ side === 'left' ? '左侧' : '右侧' }}</span>
          <div class="pane-actions">
            <Button label="格式化" text size="small" @click="format(side)" />
            <Button label="压缩" text size="small" @click="compact(side)" />
            <Button label="排序键" text size="small" @click="sortKeys(side)" />
            <Button
              icon="pi pi-file-excel"
              label="导出 Excel"
              text
              size="small"
              @click="exportExcel(side)"
            />
            <Button label="清空" text size="small" severity="danger" @click="clear(side)" />
          </div>
        </div>
        <div class="editor-wrap">
          <JsonEditor
            :text="panes[side].feed"
            :mode="mode"
            :dark-theme="isDark"
            :main-menu-bar="true"
            :navigation-bar="false"
            :status-bar="true"
            :on-render-menu="onRenderMenu"
            :on-render-context-menu="onRenderContextMenu"
            @update:text="(v: string) => (panes[side].live = v)"
            @update:json="(v: unknown) => (panes[side].live = JSON.stringify(v, null, 2))"
          />
        </div>
      </section>
    </div>

    <!-- 差异面板 -->
    <section class="diff-panel">
      <div class="diff-head">
        <h3>对比结果</h3>
        <span v-if="diffs && diffs.length" class="diff-count">共 {{ diffs.length }} 处差异</span>
      </div>
      <p v-if="diffs === null" class="diff-hint">点击右上角「对比」查看两侧 JSON 的结构差异。</p>
      <p v-else-if="diffs.length === 0" class="diff-ok"><i class="pi pi-check-circle" /> 两边 JSON 完全一致</p>
      <table v-else class="diff-table">
        <thead>
          <tr><th>类型</th><th>路径</th><th>左侧</th><th>右侧</th></tr>
        </thead>
        <tbody>
          <tr v-for="(d, i) in diffs" :key="i" :class="`row-${d.type}`">
            <td><span class="badge" :class="`badge-${d.type}`">{{ DIFF_LABEL[d.type] }}</span></td>
            <td class="path">{{ d.path }}</td>
            <td class="val">{{ fmtVal(d.leftValue) }}</td>
            <td class="val">{{ fmtVal(d.rightValue) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.json-tool {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--fafa-bg);
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--fafa-border);
  flex-shrink: 0;
}
.toolbar h2 {
  margin: 0;
  font-size: 16px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sep {
  width: 1px;
  height: 18px;
  background: var(--fafa-border);
  margin: 0 6px;
}

/* 双栏区：占据剩余高度，左右各半 */
.panes {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 1px;
  background: var(--fafa-border); /* 充当中缝分隔线 */
}
.pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--fafa-bg);
}
.pane-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid var(--fafa-border);
  flex-shrink: 0;
}
.pane-title {
  font-size: 12px;
  color: var(--fafa-text-soft);
  padding-left: 4px;
}
.pane-actions {
  display: flex;
  gap: 2px;
}
.editor-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
/* 让编辑器填满容器高度 */
.editor-wrap :deep(.vue-ts-json-editor),
.editor-wrap :deep(.jse-main) {
  height: 100%;
}

/* 差异面板 */
.diff-panel {
  flex-shrink: 0;
  max-height: 38%;
  overflow: auto;
  border-top: 1px solid var(--fafa-border);
  padding: 12px 16px;
  background: var(--fafa-bg-soft);
}
.diff-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
}
.diff-head h3 {
  margin: 0;
  font-size: 14px;
}
.diff-count {
  font-size: 12px;
  color: var(--fafa-text-soft);
}
.diff-hint {
  margin: 0;
  color: var(--fafa-text-soft);
  font-size: 13px;
}
.diff-ok {
  margin: 0;
  color: #16a34a;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.diff-table th,
.diff-table td {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid var(--fafa-border);
  vertical-align: top;
}
.diff-table th {
  color: var(--fafa-text-soft);
  font-weight: 600;
}
.path {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--fafa-accent);
  white-space: nowrap;
}
.val {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}
.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
}
.badge-added {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}
.badge-removed {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}
.badge-changed {
  background: rgba(234, 179, 8, 0.18);
  color: #ca8a04;
}
</style>

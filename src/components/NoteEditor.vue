<script setup lang="ts">
/**
 * 内容编辑区（第 3 列）。
 *   - md 格式：用 md-editor-v3，支持三种视图模式：编辑 / 编辑预览 / 纯预览；
 *   - txt 格式：用纯文本域；
 *   - 顶部工具栏：标题、格式切换、视图模式、置顶、导出、删除。
 * 编辑时做防抖保存，避免每个按键都写库。
 */
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { MdEditor, MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
// md-editor 全局配置（本地 highlight.js 离线高亮）。放在这里 import，
// 使 highlight.js 随「笔记页」懒加载，不拖累首屏；config() 在组件渲染前执行。
import '@/config/mdEditorSetup'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import SelectButton from 'primevue/selectbutton'
import Chip from 'primevue/chip'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useNotesStore } from '@/stores/notes'
import { useSettingsStore } from '@/stores/settings'
import { saveImage } from '@/services/ImageService'
import { exportTextFile } from '@/services/BackupService'
import { EV_FLUSH_SAVE } from '@/composables/useShortcuts'
import type { NoteFormat, EditorViewMode } from '@/types'

const store = useNotesStore()
const settingsStore = useSettingsStore()
const confirm = useConfirm()
const toast = useToast()

// 本地草稿（与选中笔记同步），编辑时改这里，再防抖写回 store
const title = ref('')
const content = ref('')
const format = ref<NoteFormat>('md')
const newTag = ref('')

// 视图模式（初始取设置里的默认值，用户可即时切换）
const viewMode = ref<EditorViewMode>(settingsStore.settings.defaultViewMode)

const note = computed(() => store.selectedNote)
/** 当前笔记的标签（直接读 store，增删即时落库） */
const tags = computed<string[]>(() => note.value?.tags ?? [])

// md-editor 主题跟随应用主题
const editorTheme = computed<'light' | 'dark'>(() =>
  document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light',
)

/** 字号 CSS 变量，注入到编辑区，供 :deep 选择器使用 */
const fontVars = computed(() => ({ '--editor-fs': `${settingsStore.settings.editorFontSize}px` }))

// ---- 双链 [[标题]] ----
/** 从正文提取所有 [[标题]] */
function extractWikiTitles(content: string): string[] {
  const out: string[] = []
  const re = /\[\[([^\]]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) out.push(m[1].trim())
  return out
}
/** 反向链接：哪些笔记用 [[本笔记标题]] 引用了当前笔记 */
const backlinks = computed(() => {
  const cur = (note.value?.title || '').trim().toLowerCase()
  if (!cur || !note.value) return []
  return store.notes.filter(
    (n) =>
      n.deletedAt === null &&
      n.id !== note.value!.id &&
      extractWikiTitles(n.content).some((t) => t.toLowerCase() === cur),
  )
})
/** 点击预览里的双链：打开（或新建）目标笔记 */
async function onBodyClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest?.('.wikilink') as HTMLElement | null
  if (!el) return
  e.preventDefault()
  const title = el.getAttribute('data-wikilink')
  if (!title) return
  const existed = !!store.findByTitle(title)
  await store.openOrCreateByTitle(title)
  if (!existed) toast.add({ severity: 'info', summary: `已新建笔记「${title}」`, life: 2500 })
}

const formatOptions = [
  { label: 'Markdown', value: 'md' },
  { label: '纯文本', value: 'txt' },
]
const viewModeOptions = [
  { label: '编辑', value: 'edit' },
  { label: '编辑预览', value: 'live' },
  { label: '纯预览', value: 'preview' },
]

// 切换选中笔记时，载入其内容到本地草稿
watch(
  note,
  (n) => {
    title.value = n?.title ?? ''
    content.value = n?.content ?? ''
    format.value = n?.format ?? 'md'
  },
  { immediate: true },
)

// ---- 防抖保存 ----
let timer: ReturnType<typeof setTimeout> | null = null
function scheduleSave() {
  if (!note.value) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    if (!note.value) return
    store.updateNote(note.value.id, {
      title: title.value,
      content: content.value,
      format: format.value,
    })
  }, 400)
}

watch([title, content, format], scheduleSave)

/** 立即保存（Ctrl/Cmd+S 触发）：清掉防抖直接落库 */
function flushSave() {
  if (!note.value) return
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  store.updateNote(note.value.id, {
    title: title.value,
    content: content.value,
    format: format.value,
  })
  toast.add({ severity: 'success', summary: '已保存', life: 1500 })
}
onMounted(() => window.addEventListener(EV_FLUSH_SAVE, flushSave))
onUnmounted(() => window.removeEventListener(EV_FLUSH_SAVE, flushSave))

function togglePin() {
  if (note.value) store.updateNote(note.value.id, { pinned: !note.value.pinned })
}

// ---- 导出单篇为 .md / .txt ----
async function exportNote() {
  if (!note.value) return
  const safeTitle = (title.value.trim() || '未命名笔记').replace(/[\\/:*?"<>|]/g, '_')
  const ext = format.value === 'md' ? 'md' : 'txt'
  try {
    const where = await exportTextFile(content.value, `${safeTitle}.${ext}`)
    toast.add({ severity: 'success', summary: '已导出', detail: where, life: 3000 })
  } catch (e: any) {
    if (String(e?.message).includes('取消')) return
    toast.add({ severity: 'error', summary: '导出失败', detail: String(e?.message ?? e), life: 4000 })
  }
}

// ---- 标签 ----
function addTag() {
  const t = newTag.value.trim()
  newTag.value = ''
  if (!t || !note.value || tags.value.includes(t)) return
  store.updateNote(note.value.id, { tags: [...tags.value, t] })
}
function removeTag(t: string) {
  if (!note.value) return
  store.updateNote(note.value.id, { tags: tags.value.filter((x) => x !== t) })
}
/** 标签色：取设置中的自定义色，否则用主题强调色 */
function tagStyle(t: string) {
  const c = settingsStore.settings.tagColors[t]
  return c ? { background: c, color: '#fff' } : {}
}

// ---- 图片上传/粘贴（md-editor 的 onUploadImg 回调） ----
// 用户粘贴/拖入/选择图片时触发；Web 转 base64，Tauri 写本地文件。
async function onUploadImg(files: File[], callback: (urls: string[]) => void) {
  try {
    const urls = await Promise.all(files.map((f) => saveImage(f)))
    callback(urls)
  } catch (e: any) {
    toast.add({ severity: 'error', summary: '图片处理失败', detail: String(e?.message ?? e), life: 4000 })
    callback([])
  }
}

function remove() {
  if (!note.value) return
  const id = note.value.id
  confirm.require({
    message: '确定删除这条笔记吗？删除后可在回收站还原。',
    header: '删除确认',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: '取消',
    acceptLabel: '删除',
    acceptProps: { severity: 'danger' },
    accept: () => store.deleteNote(id),
  })
}
</script>

<template>
  <div class="fafa-col editor">
    <!-- 空状态 -->
    <div v-if="!note" class="placeholder">
      <i class="pi pi-file-edit" />
      <p>选择左侧笔记，或新建一条开始记录</p>
    </div>

    <template v-else>
      <!-- 工具栏（允许换行，避免窄列裁剪按钮） -->
      <div class="editor-toolbar">
        <InputText v-model="title" placeholder="标题" class="title-input" />
        <div class="toolbar-actions">
          <SelectButton
            v-model="format"
            :options="formatOptions"
            optionLabel="label"
            optionValue="value"
            :allowEmpty="false"
            size="small"
          />
          <SelectButton
            v-if="format === 'md'"
            v-model="viewMode"
            :options="viewModeOptions"
            optionLabel="label"
            optionValue="value"
            :allowEmpty="false"
            size="small"
          />
          <Button
            :icon="note.pinned ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'"
            text
            rounded
            :title="note.pinned ? '取消置顶' : '置顶'"
            @click="togglePin"
          />
          <Button icon="pi pi-download" text rounded title="导出为文件" @click="exportNote" />
          <Button icon="pi pi-trash" text rounded severity="danger" title="删除" @click="remove" />
        </div>
      </div>

      <!-- 标签栏 -->
      <div class="tag-bar">
        <i class="pi pi-tags" />
        <Chip
          v-for="t in tags"
          :key="t"
          :label="t"
          removable
          class="tag-chip"
          :style="tagStyle(t)"
          @remove="removeTag(t)"
        />
        <InputText
          v-model="newTag"
          placeholder="加标签，回车确认"
          class="tag-input"
          @keydown.enter="addTag"
        />
      </div>

      <!-- 编辑区（点击捕获双链跳转） -->
      <div class="editor-body" :style="fontVars" @click="onBodyClick">
        <!-- 纯文本 -->
        <Textarea
          v-if="format === 'txt'"
          v-model="content"
          class="plain-text"
          placeholder="在此输入纯文本…"
          :autoResize="false"
        />
        <!-- Markdown 纯预览：用 MdPreview 保证格式化渲染 -->
        <MdPreview
          v-else-if="viewMode === 'preview'"
          :modelValue="content"
          :theme="editorTheme"
          language="zh-CN"
          class="md-preview"
        />
        <!-- Markdown 编辑 / 编辑预览：用 preview 开关控制是否显示预览栏。
             注意：md-editor-v3 的 preview 仅在挂载时读取一次，运行中改 prop 无效，
             因此用 :key 在 编辑/编辑预览 间切换时强制重挂载，使预览栏真正显隐。 -->
        <MdEditor
          v-else
          :key="viewMode"
          v-model="content"
          :theme="editorTheme"
          language="zh-CN"
          :preview="viewMode === 'live'"
          :toolbars="settingsStore.settings.editorToolbars as any"
          :onUploadImg="onUploadImg"
          style="height: 100%"
        />
      </div>

      <!-- 反向链接：哪些笔记用 [[本标题]] 引用了当前笔记 -->
      <div v-if="backlinks.length" class="backlinks">
        <div class="backlinks-head"><i class="pi pi-link" /> 反向链接 ({{ backlinks.length }})</div>
        <div class="backlinks-list">
          <button
            v-for="b in backlinks"
            :key="b.id"
            class="backlink"
            @click="store.select(b.id)"
          >
            {{ b.title || '未命名笔记' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.editor {
  background: var(--fafa-bg);
}
.placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--fafa-text-soft);
  gap: 12px;
}
.placeholder i {
  font-size: 40px;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap; /* 窄列时换行，绝不裁剪 */
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--fafa-border);
}
.title-input {
  flex: 1 1 160px;
  min-width: 0; /* 关键：允许收缩，否则会把右侧按钮挤出可视区被裁剪 */
  font-size: 15px;
  font-weight: 600;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0; /* 按钮组不收缩，保证删除等图标始终可见 */
}
.tag-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--fafa-border);
  color: var(--fafa-text-soft);
}
.tag-chip {
  font-size: 12px;
}
.tag-input {
  flex: 1;
  min-width: 120px;
  border: none;
  background: transparent;
  box-shadow: none;
  font-size: 13px;
}
.tag-input:focus {
  box-shadow: none;
}
.editor-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
/* 双链样式（预览中的 [[标题]]） */
.editor-body :deep(.wikilink) {
  color: var(--fafa-accent);
  cursor: pointer;
  text-decoration: none;
  border-bottom: 1px dashed var(--fafa-accent);
}
.editor-body :deep(.wikilink):hover {
  background: color-mix(in srgb, var(--fafa-accent) 12%, transparent);
}
/* 反向链接面板 */
.backlinks {
  flex-shrink: 0;
  max-height: 28%;
  overflow-y: auto;
  padding: 8px 12px;
  border-top: 1px solid var(--fafa-border);
  background: var(--fafa-bg-soft);
}
.backlinks-head {
  font-size: 12px;
  color: var(--fafa-text-soft);
  margin-bottom: 6px;
}
.backlinks-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.backlink {
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--fafa-accent);
  font-size: 13px;
  padding: 4px 6px;
  border-radius: 6px;
}
.backlink:hover {
  background: rgba(127, 127, 127, 0.12);
}
/* 字号跟随设置（注入的 --editor-fs） */
.editor-body :deep(.cm-editor) {
  font-size: var(--editor-fs, 14px);
}
.editor-body :deep(.md-editor-preview) {
  font-size: var(--editor-fs, 14px);
}
.md-preview {
  height: 100%;
  overflow-y: auto;
}
/* 纯预览内边距：md-editor-v3 v5 的 previewOnly 把 .md-editor-preview 的 padding 重置成 0
   （见 lib/style.css 的 .md-editor-previewOnly .md-editor-preview{padding:0}），导致正文贴边、
   且滚动条（在外层 .md-preview 上）会压住右侧文字。这里补回左右内边距，并在底部留余量。 */
.md-preview :deep(.md-editor-preview) {
  padding: 16px 20px 48px;
}
/* 代码块头部（语言名/复制按钮）库内默认 position:sticky; z-index:10000，会盖住
   PrimeVue 弹窗（如「新建文件夹」，modal 默认 z-index ~1100）。降到 2 即可——
   只需在自身代码内容之上保持吸顶，不应高过任何对话框。 */
.editor-body :deep(.md-editor-code-head) {
  z-index: 2;
}
.plain-text {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 0;
  resize: none;
  padding: 16px 16px 48px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--editor-fs, 14px);
  line-height: 1.6;
}
.plain-text:focus {
  box-shadow: none;
}
</style>

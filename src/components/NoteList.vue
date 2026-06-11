<script setup lang="ts">
/**
 * 笔记列表（第 2 列）。
 * 顶部：文件夹筛选 + 新建 + 搜索框 + 标签筛选条；下方：笔记条目列表。
 * 交互：
 *   - 点击选中、右键弹出菜单（置顶 / 移动到文件夹 / 删除）；
 *   - 拖拽条目可手动排序（持久化到 order 字段）。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Dialog from 'primevue/dialog'
import ContextMenu from 'primevue/contextmenu'
import type { MenuItem } from 'primevue/menuitem'
import { useConfirm } from 'primevue/useconfirm'
import { useNotesStore, FILTER_ALL, FILTER_UNFILED } from '@/stores/notes'
import { EV_FOCUS_SEARCH } from '@/composables/useShortcuts'
import type { Note } from '@/types'

const store = useNotesStore()
const confirm = useConfirm()

// 搜索框引用 + 响应「聚焦搜索」快捷键（Ctrl/Cmd+F）
const searchRef = ref<{ $el?: HTMLElement } | null>(null)
function focusSearch() {
  const el = searchRef.value?.$el as HTMLInputElement | undefined
  el?.focus()
  el?.select()
}
onMounted(() => window.addEventListener(EV_FOCUS_SEARCH, focusSearch))
onUnmounted(() => window.removeEventListener(EV_FOCUS_SEARCH, focusSearch))

/** 文件夹下拉选项：全部 / 未分类 / 各文件夹 */
const folderOptions = computed(() => [
  { label: '全部笔记', value: FILTER_ALL },
  { label: '未分类', value: FILTER_UNFILED },
  ...store.folders.map((f) => ({ label: f.name, value: f.id })),
])

/** 当前筛选是否为「真实文件夹」（而非 全部/未分类），用于显示重命名/删除按钮 */
const isRealFolder = computed(
  () => store.currentFilter !== FILTER_ALL && store.currentFilter !== FILTER_UNFILED,
)
const currentFolderName = computed(
  () => store.folders.find((f) => f.id === store.currentFilter)?.name ?? '',
)

/** 取正文摘要（去掉 markdown 符号，截断） */
function excerpt(content: string): string {
  return content.replace(/[#>*`_\-\[\]]/g, '').replace(/\n+/g, ' ').trim().slice(0, 60)
}

/** HTML 转义，防止笔记内容里的标签被当成 HTML 渲染（用于 v-html 前） */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

/** 把命中的关键词用 <mark> 包裹（已先转义，安全） */
function highlight(text: string): string {
  const esc = escapeHtml(text)
  const kw = store.keyword.trim()
  if (!kw) return esc
  // 多个词以空白分隔，逐个高亮；转义正则元字符
  const terms = kw
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!terms.length) return esc
  const re = new RegExp(`(${terms.join('|')})`, 'gi')
  return esc.replace(re, '<mark>$1</mark>')
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function newNote() {
  await store.createNote()
}

// ---------- 文件夹管理（用 Dialog，兼容 Tauri：其 WebView 不支持 window.prompt） ----------
const folderDialog = ref(false)
const folderDialogMode = ref<'create' | 'rename'>('create')
const folderName = ref('')

function openCreateFolder() {
  folderDialogMode.value = 'create'
  folderName.value = ''
  folderDialog.value = true
}
function openRenameFolder() {
  folderDialogMode.value = 'rename'
  folderName.value = currentFolderName.value
  folderDialog.value = true
}
async function confirmFolderDialog() {
  const name = folderName.value.trim()
  if (!name) return
  if (folderDialogMode.value === 'create') {
    const f = await store.createFolder(name)
    store.currentFilter = f.id // 创建后自动切到该文件夹
  } else {
    await store.renameFolder(store.currentFilter, name)
  }
  folderDialog.value = false
}
function deleteCurrentFolder() {
  confirm.require({
    message: `删除文件夹「${currentFolderName.value}」？其中的笔记会变为「未分类」，不会被删除。`,
    header: '删除文件夹',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '删除',
    rejectLabel: '取消',
    acceptProps: { severity: 'danger' },
    accept: () => store.deleteFolder(store.currentFilter),
  })
}

// ---------- 拖拽排序 ----------
const dragId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

function onDragStart(e: DragEvent, id: string) {
  dragId.value = id
  // 写入 dataTransfer，供「侧边栏文件夹」作为跨组件拖放目标读取
  e.dataTransfer?.setData('text/plain', id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(id: string) {
  dragOverId.value = id
}
function onDrop(targetId: string) {
  const ids = store.visibleNotes.map((n) => n.id)
  const from = ids.indexOf(dragId.value ?? '')
  const to = ids.indexOf(targetId)
  dragId.value = null
  dragOverId.value = null
  if (from < 0 || to < 0 || from === to) return
  ids.splice(to, 0, ids.splice(from, 1)[0]) // 把拖动项移动到目标位置
  store.reorderNotes(ids)
}

// ---------- 右键菜单 ----------
const menu = ref<InstanceType<typeof ContextMenu> | null>(null)
const ctxNote = ref<Note | null>(null)

const menuModel = computed<MenuItem[]>(() => {
  const n = ctxNote.value
  if (!n) return []
  return [
    {
      label: n.pinned ? '取消置顶' : '置顶',
      icon: n.pinned ? 'pi pi-bookmark-fill' : 'pi pi-bookmark',
      command: () => store.updateNote(n.id, { pinned: !n.pinned }),
    },
    {
      label: '移动到',
      icon: 'pi pi-folder',
      items: [
        { label: '未分类', command: () => store.moveToFolder(n.id, null) },
        ...store.folders.map((f) => ({
          label: f.name,
          command: () => store.moveToFolder(n.id, f.id),
        })),
      ],
    },
    { separator: true },
    {
      label: '删除',
      icon: 'pi pi-trash',
      command: () => store.deleteNote(n.id),
    },
  ]
})

function onContext(e: MouseEvent, n: Note) {
  ctxNote.value = n
  menu.value?.show(e)
}

// ---------- 批量操作（多选模式） ----------
const selectMode = ref(false)
const selectedIds = ref<string[]>([])

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selectedIds.value = []
}
function isSelected(id: string) {
  return selectedIds.value.includes(id)
}
function toggleSelect(id: string) {
  const i = selectedIds.value.indexOf(id)
  if (i === -1) selectedIds.value.push(id)
  else selectedIds.value.splice(i, 1)
}
/** 点击条目：多选模式下切换勾选，否则打开笔记 */
function onItemClick(n: Note) {
  if (selectMode.value) toggleSelect(n.id)
  else store.select(n.id)
}
const allSelected = computed(
  () => store.visibleNotes.length > 0 && selectedIds.value.length === store.visibleNotes.length,
)
function toggleSelectAll() {
  selectedIds.value = allSelected.value ? [] : store.visibleNotes.map((n) => n.id)
}
async function bulkDeleteSelected() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  await store.bulkDelete(ids)
  selectedIds.value = []
}

// 批量移动：复用 ContextMenu 弹出文件夹列表
const bulkMenu = ref<InstanceType<typeof ContextMenu> | null>(null)
const bulkMenuModel = computed<MenuItem[]>(() => [
  { label: '未分类', command: () => doBulkMove(null) },
  ...store.folders.map((f) => ({ label: f.name, command: () => doBulkMove(f.id) })),
])
function openBulkMove(e: MouseEvent) {
  if (selectedIds.value.length) bulkMenu.value?.show(e)
}
async function doBulkMove(folderId: string | null) {
  const ids = [...selectedIds.value]
  await store.bulkMove(ids, folderId)
  selectedIds.value = []
}
</script>

<template>
  <div class="fafa-col note-list">
    <!-- 工具条 -->
    <div class="toolbar">
      <Select
        v-model="store.currentFilter"
        :options="folderOptions"
        optionLabel="label"
        optionValue="value"
        class="folder-select"
        size="small"
        filter
        filterPlaceholder="搜索文件夹"
      />
      <Button
        v-if="isRealFolder"
        icon="pi pi-pencil"
        text
        rounded
        title="重命名文件夹"
        @click="openRenameFolder"
      />
      <Button
        v-if="isRealFolder"
        icon="pi pi-trash"
        text
        rounded
        severity="danger"
        title="删除文件夹"
        @click="deleteCurrentFolder"
      />
      <Button icon="pi pi-folder-plus" text rounded title="新建文件夹" @click="openCreateFolder" />
      <Button
        :icon="selectMode ? 'pi pi-check-square' : 'pi pi-list-check'"
        text
        rounded
        :title="selectMode ? '退出多选' : '多选'"
        :class="{ 'select-on': selectMode }"
        @click="toggleSelectMode"
      />
      <Button icon="pi pi-plus" rounded title="新建笔记" @click="newNote" />
    </div>

    <!-- 搜索框 -->
    <div class="search-box">
      <i class="pi pi-search" />
      <InputText ref="searchRef" v-model="store.keyword" placeholder="搜索标题或正文…" class="search-input" />
      <i v-if="store.keyword" class="pi pi-times clear" title="清空" @click="store.keyword = ''" />
    </div>

    <!-- 标签筛选条 -->
    <div v-if="store.allTags.length" class="tag-filter">
      <button
        v-for="t in store.allTags"
        :key="t"
        class="tag"
        :class="{ on: store.selectedTags.includes(t) }"
        @click="store.toggleTagFilter(t)"
      >
        #{{ t }}
      </button>
      <button
        v-if="store.selectedTags.length"
        class="tag clear-tags"
        @click="store.clearTagFilter()"
      >
        清除筛选
      </button>
    </div>

    <!-- 批量操作栏（多选模式显示） -->
    <div v-if="selectMode" class="bulk-bar">
      <button class="bulk-link" @click="toggleSelectAll">
        {{ allSelected ? '取消全选' : '全选' }}
      </button>
      <span class="bulk-count">已选 {{ selectedIds.length }}</span>
      <span class="bulk-spacer" />
      <Button
        label="移动"
        icon="pi pi-folder"
        text
        size="small"
        :disabled="!selectedIds.length"
        @click="openBulkMove"
      />
      <Button
        label="删除"
        icon="pi pi-trash"
        text
        size="small"
        severity="danger"
        :disabled="!selectedIds.length"
        @click="bulkDeleteSelected"
      />
    </div>

    <!-- 列表 -->
    <div class="fafa-scroll items">
      <p v-if="store.visibleNotes.length === 0" class="empty">暂无笔记，点右上角 + 新建</p>
      <div
        v-for="note in store.visibleNotes"
        :key="note.id"
        class="item"
        :class="{
          active: !selectMode && note.id === store.selectedId,
          selected: selectMode && isSelected(note.id),
          over: note.id === dragOverId,
        }"
        :draggable="!selectMode"
        @click="onItemClick(note)"
        @contextmenu.prevent="onContext($event, note)"
        @dragstart="onDragStart($event, note.id)"
        @dragover.prevent="onDragOver(note.id)"
        @drop="onDrop(note.id)"
        @dragend="dragOverId = null"
      >
        <div class="item-title">
          <i v-if="selectMode" class="check" :class="isSelected(note.id) ? 'pi pi-check-circle' : 'pi pi-circle'" />
          <i v-else-if="note.pinned" class="pi pi-bookmark-fill pin" />
          <span class="title-text" v-html="highlight(note.title || '未命名笔记')" />
        </div>
        <div class="item-excerpt" v-html="highlight(excerpt(note.content) || '（空白）')" />
        <div class="item-foot">
          <span class="item-time">{{ formatTime(note.updatedAt) }}</span>
          <span v-if="note.tags.length" class="item-tags">{{ note.tags.map((t) => '#' + t).join(' ') }}</span>
        </div>
      </div>
    </div>

    <!-- 批量移动的文件夹菜单 -->
    <ContextMenu ref="bulkMenu" :model="bulkMenuModel" />

    <!-- 右键菜单 -->
    <ContextMenu ref="menu" :model="menuModel" />

    <!-- 新建 / 重命名文件夹弹窗（替代 window.prompt，兼容桌面端） -->
    <Dialog
      v-model:visible="folderDialog"
      modal
      :header="folderDialogMode === 'create' ? '新建文件夹' : '重命名文件夹'"
      :style="{ width: '320px' }"
    >
      <InputText
        v-model="folderName"
        class="dialog-input"
        placeholder="文件夹名称"
        autofocus
        @keydown.enter="confirmFolderDialog"
      />
      <template #footer>
        <Button label="取消" text @click="folderDialog = false" />
        <Button label="确定" :disabled="!folderName.trim()" @click="confirmFolderDialog" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.note-list {
  background: var(--fafa-bg);
  border-right: 1px solid var(--fafa-border);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--fafa-border);
}
.folder-select {
  flex: 1;
  min-width: 0;
}
.select-on :deep(.p-button-icon),
.select-on {
  color: var(--fafa-accent);
}
.bulk-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--fafa-border);
  background: color-mix(in srgb, var(--fafa-accent) 8%, transparent);
  font-size: 13px;
}
.bulk-link {
  border: none;
  background: none;
  color: var(--fafa-accent);
  cursor: pointer;
  font-size: 13px;
}
.bulk-count {
  color: var(--fafa-text-soft);
}
.bulk-spacer {
  flex: 1;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--fafa-border);
  color: var(--fafa-text-soft);
}
.search-input {
  flex: 1;
  border: none;
  background: transparent;
  box-shadow: none;
}
.search-input:focus {
  box-shadow: none;
}
.clear {
  cursor: pointer;
}
.tag-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--fafa-border);
}
.tag {
  border: 1px solid var(--fafa-border);
  background: transparent;
  color: var(--fafa-text-soft);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}
.tag.on {
  background: var(--fafa-accent);
  border-color: var(--fafa-accent);
  color: #fff;
}
.clear-tags {
  color: #ef4444;
  border-color: transparent;
}
.items {
  padding: 6px;
}
.empty {
  color: var(--fafa-text-soft);
  text-align: center;
  margin-top: 32px;
  font-size: 13px;
}
.item {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 2px;
}
.item:hover {
  background: var(--fafa-bg-soft);
}
.item.active {
  background: color-mix(in srgb, var(--fafa-accent) 14%, transparent);
}
.item.selected {
  background: color-mix(in srgb, var(--fafa-accent) 18%, transparent);
}
.item.over {
  border-color: var(--fafa-accent); /* 拖拽悬停目标提示 */
}
.check {
  color: var(--fafa-accent);
  font-size: 14px;
}
/* 搜索命中高亮 */
.item :deep(mark) {
  background: #fde68a;
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}
:global(.dark-theme) .item :deep(mark) {
  background: #a16207;
  color: #fff;
}
.item-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--fafa-text);
  font-size: 14px;
}
.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pin {
  color: var(--fafa-accent);
  font-size: 12px;
}
.item-excerpt {
  color: var(--fafa-text-soft);
  font-size: 12px;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}
.item-time {
  color: var(--fafa-text-soft);
  font-size: 11px;
}
.item-tags {
  color: var(--fafa-accent);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dialog-input {
  width: 100%;
}
</style>

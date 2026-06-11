<script setup lang="ts">
/**
 * 左侧菜单栏（第 1 列）。
 *
 * 特性：
 *   - 数据驱动：菜单项来自 config/navigation.ts，新增功能不用改本组件；
 *   - 可收起：点击顶部按钮在「展开(显示文字)」与「收起(仅图标)」间切换，
 *     状态持久化在 settings.layout.sidebarCollapsed；
 *   - 高亮当前路由。
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ContextMenu from 'primevue/contextmenu'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import type { MenuItem } from 'primevue/menuitem'
import { useConfirm } from 'primevue/useconfirm'
import { NAV_ITEMS, type NavItem } from '@/config/navigation'
import { useUiStore } from '@/stores/ui'
import { useNotesStore, FILTER_UNFILED } from '@/stores/notes'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const notes = useNotesStore()
const settingsStore = useSettingsStore()
const confirm = useConfirm()

const collapsed = computed(() => ui.sidebarCollapsed)

const topItems = computed(() => NAV_ITEMS.filter((i) => (i.placement ?? 'top') === 'top'))
const bottomItems = computed(() => NAV_ITEMS.filter((i) => i.placement === 'bottom'))

function isActive(item: NavItem): boolean {
  return !!item.route && route.path === item.route
}

function go(item: NavItem) {
  if (item.route && route.path !== item.route) router.push(item.route)
}

/** 点击标签：跳到笔记页并切换该标签的筛选 */
function clickTag(tag: string) {
  if (route.path !== '/') router.push('/')
  notes.toggleTagFilter(tag)
}

// ---------- 文件夹区（可点筛选 + 笔记拖入归类 + 文件夹拖动重排） ----------
const dropFolderId = ref<string | null | undefined>(undefined) // 当前拖放悬停的目标
const draggingFolderId = ref<string | null>(null) // 正在拖动的文件夹（用于重排）

const FOLDER_MIME = 'application/x-fafa-folder'

/** 点击文件夹：跳到笔记页并切换筛选 */
function clickFolder(id: string) {
  if (route.path !== '/') router.push('/')
  notes.currentFilter = id
}

/** 开始拖动文件夹（重排） */
function onFolderDragStart(e: DragEvent, id: string) {
  draggingFolderId.value = id
  e.dataTransfer?.setData(FOLDER_MIME, id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

/**
 * 放置到某文件夹上。根据拖动来源区分：
 *   - 拖的是文件夹 → 重排（把被拖文件夹移动到目标位置）
 *   - 拖的是笔记   → 把笔记移动到该文件夹
 */
function onDropToFolder(e: DragEvent, folderId: string | null) {
  dropFolderId.value = undefined
  const folderDragId = e.dataTransfer?.getData(FOLDER_MIME)
  if (folderDragId) {
    draggingFolderId.value = null
    if (folderId === null || folderDragId === folderId) return // 不能排到「未分类」上，也不和自己换
    const ids = notes.folders.map((f) => f.id)
    const from = ids.indexOf(folderDragId)
    const to = ids.indexOf(folderId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    notes.reorderFolders(ids)
    return
  }
  // 否则按「笔记拖入归类」处理
  const noteId = e.dataTransfer?.getData('text/plain')
  if (noteId) notes.moveToFolder(noteId, folderId)
}

/** 标签自定义颜色（圆点 / 选中态用） */
function tagColor(tag: string): string {
  return settingsStore.settings.tagColors[tag] || 'var(--fafa-accent)'
}

// ---------- 标签右键菜单 ----------
const tagMenu = ref<InstanceType<typeof ContextMenu> | null>(null)
const ctxTag = ref<string>('')
const tagMenuModel = computed<MenuItem[]>(() => [
  { label: '重命名', icon: 'pi pi-pencil', command: openRename },
  { label: '设置颜色', icon: 'pi pi-palette', command: openColor },
  {
    label: '清除颜色',
    icon: 'pi pi-times',
    command: () => delete settingsStore.settings.tagColors[ctxTag.value],
  },
  { separator: true },
  { label: '删除标签', icon: 'pi pi-trash', command: confirmDeleteTag },
])
function onTagContext(e: MouseEvent, tag: string) {
  ctxTag.value = tag
  tagMenu.value?.show(e)
}

// ---------- 重命名弹窗 ----------
const renameDialog = ref(false)
const renameValue = ref('')
function openRename() {
  renameValue.value = ctxTag.value
  renameDialog.value = true
}
async function confirmRename() {
  const oldTag = ctxTag.value
  const next = renameValue.value.trim()
  renameDialog.value = false
  if (!next || next === oldTag) return
  await notes.renameTag(oldTag, next)
  // 颜色随标签迁移
  const colors = settingsStore.settings.tagColors
  if (colors[oldTag]) {
    colors[next] = colors[oldTag]
    delete colors[oldTag]
  }
}

// ---------- 颜色弹窗（用原生颜色选择器，桌面端可用） ----------
const colorDialog = ref(false)
const colorValue = ref('#6366f1')
function openColor() {
  colorValue.value = settingsStore.settings.tagColors[ctxTag.value] || '#6366f1'
  colorDialog.value = true
}
function confirmColor() {
  settingsStore.settings.tagColors[ctxTag.value] = colorValue.value
  colorDialog.value = false
}

function confirmDeleteTag() {
  const tag = ctxTag.value
  confirm.require({
    message: `从所有笔记移除标签「${tag}」？笔记本身不会被删除。`,
    header: '删除标签',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '删除',
    rejectLabel: '取消',
    acceptProps: { severity: 'danger' },
    accept: async () => {
      await notes.deleteTag(tag)
      delete settingsStore.settings.tagColors[tag]
    },
  })
}
</script>

<template>
  <nav class="sidebar" :class="{ collapsed }">
    <!-- 顶部：品牌 + 收起按钮 -->
    <div class="sidebar-head">
      <span v-if="!collapsed" class="brand">fafa-note</span>
      <button class="toggle" :title="collapsed ? '展开' : '收起'" @click="ui.toggleSidebar()">
        <i :class="collapsed ? 'pi pi-angle-double-right' : 'pi pi-angle-double-left'" />
      </button>
    </div>

    <!-- 顶部菜单项 -->
    <ul class="nav-list">
      <li v-for="item in topItems" :key="item.key">
        <button
          class="nav-item"
          :class="{ active: isActive(item) }"
          v-tooltip.right="collapsed ? item.label : undefined"
          @click="go(item)"
        >
          <i :class="item.icon" />
          <span v-if="!collapsed" class="label">{{ item.label }}</span>
        </button>
      </li>
    </ul>

    <!-- 中部可滚动区：文件夹 + 标签（展开时显示） -->
    <div v-if="!collapsed" class="mid-scroll">
      <!-- 文件夹区：点击筛选，可把笔记拖到上面归类 -->
      <div v-if="notes.folders.length" class="section">
        <div class="section-head">文件夹（可拖入笔记）</div>
        <button
          class="folder-item"
          :class="{ active: notes.currentFilter === FILTER_UNFILED, drop: dropFolderId === null }"
          @click="clickFolder(FILTER_UNFILED)"
          @dragover.prevent="dropFolderId = null"
          @dragleave="dropFolderId = undefined"
          @drop="onDropToFolder($event, null)"
        >
          <i class="pi pi-inbox" />
          <span class="label">未分类</span>
        </button>
        <button
          v-for="f in notes.folders"
          :key="f.id"
          class="folder-item"
          :class="{
            active: notes.currentFilter === f.id,
            drop: dropFolderId === f.id,
            dragging: draggingFolderId === f.id,
          }"
          @click="clickFolder(f.id)"
          @dragover.prevent="dropFolderId = f.id"
          @dragleave="dropFolderId = undefined"
          @drop="onDropToFolder($event, f.id)"
        >
          <!-- 拖动手柄（6 点）：只有这里可拖动来排序，避免误触 -->
          <span
            class="grip"
            title="拖动排序"
            draggable="true"
            @click.stop
            @dragstart="onFolderDragStart($event, f.id)"
            @dragend="draggingFolderId = null"
          >
            <i class="pi pi-ellipsis-v" />
            <i class="pi pi-ellipsis-v" />
          </span>
          <i class="pi pi-folder" />
          <span class="label">{{ f.name }}</span>
          <span class="count">{{ notes.folderCounts[f.id] || 0 }}</span>
        </button>
      </div>

      <!-- 标签区：点击筛选；右键可重命名/配色/删除 -->
      <div v-if="notes.allTags.length" class="section">
        <div class="section-head">标签</div>
        <button
          v-for="t in notes.allTags"
          :key="t"
          class="tag-item"
          :class="{ active: notes.selectedTags.includes(t) }"
          @click="clickTag(t)"
          @contextmenu.prevent="onTagContext($event, t)"
        >
          <span class="tag-dot" :style="{ background: tagColor(t) }" />
          <span class="label">{{ t }}</span>
        </button>
      </div>
    </div>

    <!-- 底部菜单项（设置等） -->
    <ul class="nav-list bottom">
      <li v-for="item in bottomItems" :key="item.key">
        <button
          class="nav-item"
          :class="{ active: isActive(item) }"
          v-tooltip.right="collapsed ? item.label : undefined"
          @click="go(item)"
        >
          <i :class="item.icon" />
          <span v-if="!collapsed" class="label">{{ item.label }}</span>
        </button>
      </li>
    </ul>

    <!-- 标签右键菜单 -->
    <ContextMenu ref="tagMenu" :model="tagMenuModel" />

    <!-- 标签重命名弹窗 -->
    <Dialog v-model:visible="renameDialog" modal header="重命名标签" :style="{ width: '320px' }">
      <InputText
        v-model="renameValue"
        class="dialog-input"
        placeholder="标签名称"
        autofocus
        @keydown.enter="confirmRename"
      />
      <template #footer>
        <Button label="取消" text @click="renameDialog = false" />
        <Button label="确定" :disabled="!renameValue.trim()" @click="confirmRename" />
      </template>
    </Dialog>

    <!-- 标签颜色弹窗 -->
    <Dialog v-model:visible="colorDialog" modal header="标签颜色" :style="{ width: '300px' }">
      <div class="color-row">
        <input type="color" v-model="colorValue" class="color-input" />
        <span class="color-preview" :style="{ background: colorValue }">#{{ ctxTag }}</span>
      </div>
      <template #footer>
        <Button label="取消" text @click="colorDialog = false" />
        <Button label="应用" @click="confirmColor" />
      </template>
    </Dialog>
  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: 200px;
  flex-shrink: 0;
  height: 100%;
  background: var(--fafa-bg-soft);
  border-right: 1px solid var(--fafa-border);
  transition: width 0.18s ease;
}
.sidebar.collapsed {
  width: 56px;
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 12px;
  border-bottom: 1px solid var(--fafa-border);
}
.brand {
  font-weight: 700;
  color: var(--fafa-accent);
}
.toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--fafa-text-soft);
  padding: 6px;
  border-radius: 6px;
}
.toggle:hover {
  background: rgba(127, 127, 127, 0.12);
}
.nav-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-list.bottom {
  margin-top: auto; /* 推到底部 */
  border-top: 1px solid var(--fafa-border);
}
.mid-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}
.section-head {
  font-size: 11px;
  color: var(--fafa-text-soft);
  padding: 4px 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.folder-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--fafa-text);
  font-size: 13px;
  text-align: left;
}
.folder-item:hover {
  background: rgba(127, 127, 127, 0.12);
}
.folder-item.active {
  background: color-mix(in srgb, var(--fafa-accent) 16%, transparent);
  color: var(--fafa-accent);
}
.folder-item.drop {
  border-color: var(--fafa-accent);
  background: color-mix(in srgb, var(--fafa-accent) 10%, transparent);
}
.folder-item.dragging {
  opacity: 0.5;
}
/* 拖动手柄：两列 pi-ellipsis-v 拼成 6 点；默认淡，悬停行时显现 */
.grip {
  display: inline-flex;
  align-items: center;
  cursor: grab;
  color: var(--fafa-text-soft);
  opacity: 0.35;
  margin-left: -4px;
  margin-right: -2px;
  flex-shrink: 0;
}
.grip:active {
  cursor: grabbing;
}
.folder-item:hover .grip {
  opacity: 0.8;
}
.grip i {
  font-size: 12px;
  margin: 0 -4px; /* 两列点靠拢 */
}
.folder-item i {
  font-size: 13px;
}
.folder-item .label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-item .count {
  font-size: 11px;
  color: var(--fafa-text-soft);
}
.tag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: none;
  cursor: pointer;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--fafa-text);
  font-size: 13px;
  text-align: left;
}
.tag-item:hover {
  background: rgba(127, 127, 127, 0.12);
}
.tag-item.active {
  background: color-mix(in srgb, var(--fafa-accent) 16%, transparent);
  color: var(--fafa-accent);
}
.tag-item i {
  font-size: 12px;
}
.tag-item .label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dialog-input {
  width: 100%;
}
.color-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.color-input {
  width: 48px;
  height: 36px;
  border: none;
  background: none;
  cursor: pointer;
}
.color-preview {
  flex: 1;
  padding: 6px 12px;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: none;
  cursor: pointer;
  padding: 9px 10px;
  border-radius: 8px;
  color: var(--fafa-text);
  font-size: 14px;
  text-align: left;
}
.collapsed .nav-item {
  justify-content: center;
}
.nav-item:hover {
  background: rgba(127, 127, 127, 0.12);
}
.nav-item.active {
  background: var(--fafa-accent);
  color: #fff;
}
.nav-item i {
  font-size: 16px;
}
</style>

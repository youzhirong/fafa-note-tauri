<script setup lang="ts">
/**
 * 命令面板（Ctrl/Cmd+P）。
 * 一个输入框 + 结果列表：可快速跳转笔记、切换页面、新建笔记。
 * 键盘：↑/↓ 选择，Enter 执行，Esc 关闭。开关状态在 ui store。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useNotesStore } from '@/stores/notes'
import type { Note } from '@/types'

const router = useRouter()
const ui = useUiStore()
const notes = useNotesStore()

const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

interface Item {
  key: string
  label: string
  sub?: string
  icon: string
  run: () => unknown
}

/** 固定命令（跳转/新建） */
const commands = computed<Item[]>(() => [
  {
    key: 'cmd:new',
    label: '新建笔记',
    icon: 'pi pi-plus',
    run: async () => {
      await goNotes()
      await notes.createNote()
    },
  },
  { key: 'cmd:notes', label: '前往：笔记', icon: 'pi pi-book', run: () => router.push('/') },
  { key: 'cmd:stats', label: '前往：统计', icon: 'pi pi-chart-bar', run: () => router.push('/stats') },
  { key: 'cmd:trash', label: '前往：回收站', icon: 'pi pi-trash', run: () => router.push('/trash') },
  { key: 'cmd:logs', label: '前往：日志', icon: 'pi pi-receipt', run: () => router.push('/logs') },
  { key: 'cmd:settings', label: '前往：设置', icon: 'pi pi-cog', run: () => router.push('/settings') },
])

async function goNotes() {
  if (router.currentRoute.value.path !== '/') await router.push('/')
}

function openNote(n: Note) {
  goNotes().then(() => notes.select(n.id))
}

/** 笔记结果（按查询过滤；空查询时取最近更新的若干条） */
const noteItems = computed<Item[]>(() => {
  const q = query.value.trim().toLowerCase()
  let list = notes.notes.filter((n) => n.deletedAt === null)
  if (q) {
    list = list.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    )
  }
  list = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20)
  return list.map((n) => ({
    key: `note:${n.id}`,
    label: n.title || '未命名笔记',
    sub: n.content.replace(/\s+/g, ' ').trim().slice(0, 50),
    icon: 'pi pi-file',
    run: () => openNote(n),
  }))
})

/** 命令按查询过滤 */
const commandItems = computed<Item[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return commands.value
  return commands.value.filter((c) => c.label.toLowerCase().includes(q))
})

/** 合并结果：命令在前，笔记在后 */
const items = computed<Item[]>(() => [...commandItems.value, ...noteItems.value])

// 查询变化时把选中项归位
watch(query, () => (selectedIndex.value = 0))

// 打开时重置并聚焦
watch(
  () => ui.paletteOpen,
  (open) => {
    if (open) {
      query.value = ''
      selectedIndex.value = 0
      nextTick(() => inputRef.value?.focus())
    }
  },
)

function move(delta: number) {
  const n = items.value.length
  if (!n) return
  selectedIndex.value = (selectedIndex.value + delta + n) % n
}

async function runSelected() {
  const item = items.value[selectedIndex.value]
  if (!item) return
  ui.closePalette()
  await item.run()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runSelected()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    ui.closePalette()
  }
}

async function clickItem(i: number) {
  selectedIndex.value = i
  await runSelected()
}
</script>

<template>
  <div v-if="ui.paletteOpen" class="palette-backdrop" @click.self="ui.closePalette()">
    <div class="palette">
      <div class="palette-input">
        <i class="pi pi-search" />
        <input
          ref="inputRef"
          v-model="query"
          placeholder="搜索笔记，或输入命令（前往/新建）…"
          @keydown="onKeydown"
        />
        <kbd>Esc</kbd>
      </div>

      <div class="palette-list">
        <p v-if="items.length === 0" class="palette-empty">没有匹配项</p>
        <button
          v-for="(item, i) in items"
          :key="item.key"
          class="palette-item"
          :class="{ active: i === selectedIndex }"
          @mousemove="selectedIndex = i"
          @click="clickItem(i)"
        >
          <i :class="item.icon" />
          <span class="p-label">{{ item.label }}</span>
          <span v-if="item.sub" class="p-sub">{{ item.sub }}</span>
        </button>
      </div>

      <div class="palette-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>Enter</kbd> 打开</span>
        <span><kbd>Esc</kbd> 关闭</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  z-index: 2000;
}
.palette {
  width: min(560px, 92vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--fafa-bg);
  border: 1px solid var(--fafa-border);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
.palette-input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--fafa-border);
  color: var(--fafa-text-soft);
}
.palette-input input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fafa-text);
  font-size: 15px;
}
.palette-list {
  overflow-y: auto;
  padding: 6px;
}
.palette-empty {
  color: var(--fafa-text-soft);
  text-align: center;
  padding: 20px;
  font-size: 13px;
}
.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--fafa-text);
}
.palette-item.active {
  background: color-mix(in srgb, var(--fafa-accent) 16%, transparent);
}
.palette-item i {
  color: var(--fafa-accent);
  font-size: 14px;
  flex-shrink: 0;
}
.p-label {
  flex-shrink: 0;
  font-size: 14px;
}
.p-sub {
  color: var(--fafa-text-soft);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.palette-foot {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--fafa-border);
  color: var(--fafa-text-soft);
  font-size: 11px;
}
kbd {
  background: var(--fafa-bg-soft);
  border: 1px solid var(--fafa-border);
  border-radius: 4px;
  padding: 0 5px;
  font-size: 11px;
  font-family: inherit;
}
</style>

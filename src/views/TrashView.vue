<script setup lang="ts">
/**
 * 回收站页面。
 * 展示已软删除的笔记，支持「还原」和「永久删除」，以及「清空回收站」。
 * 这是一个完整的「新增功能页」示例（菜单项 + 路由 + 视图 + store 动作）。
 */
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useNotesStore } from '@/stores/notes'

const store = useNotesStore()
const confirm = useConfirm()
const toast = useToast()

function formatTime(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function restore(id: string) {
  await store.restoreNote(id)
  toast.add({ severity: 'success', summary: '已还原', life: 2000 })
}

function removeForever(id: string) {
  confirm.require({
    message: '永久删除这条笔记？不可恢复。',
    header: '永久删除',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '永久删除',
    rejectLabel: '取消',
    acceptProps: { severity: 'danger' },
    accept: () => store.deleteNotePermanent(id),
  })
}

function empty() {
  confirm.require({
    message: `清空回收站将永久删除全部 ${store.trashedNotes.length} 条笔记，不可恢复。`,
    header: '清空回收站',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '清空',
    rejectLabel: '取消',
    acceptProps: { severity: 'danger' },
    accept: async () => {
      await store.emptyTrash()
      toast.add({ severity: 'warn', summary: '回收站已清空', life: 2000 })
    },
  })
}
</script>

<template>
  <div class="fafa-scroll trash-page">
    <header class="head">
      <h2>回收站</h2>
      <Button
        v-if="store.trashedNotes.length"
        label="清空回收站"
        icon="pi pi-trash"
        severity="danger"
        outlined
        size="small"
        @click="empty"
      />
    </header>

    <p v-if="store.trashedNotes.length === 0" class="empty">回收站是空的</p>

    <ul v-else class="list">
      <li v-for="note in store.trashedNotes" :key="note.id" class="item">
        <div class="info">
          <div class="title">{{ note.title || '未命名笔记' }}</div>
          <div class="time">删除于 {{ formatTime(note.deletedAt) }}</div>
        </div>
        <div class="ops">
          <Button icon="pi pi-undo" label="还原" text size="small" @click="restore(note.id)" />
          <Button
            icon="pi pi-times"
            label="永久删除"
            text
            severity="danger"
            size="small"
            @click="removeForever(note.id)"
          />
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.trash-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.head h2 {
  margin: 0;
}
.empty {
  color: var(--fafa-text-soft);
  text-align: center;
  margin-top: 48px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--fafa-border);
  border-radius: 10px;
  margin-bottom: 10px;
  background: var(--fafa-bg-soft);
}
.title {
  font-weight: 600;
  color: var(--fafa-text);
}
.time {
  font-size: 12px;
  color: var(--fafa-text-soft);
  margin-top: 3px;
}
.ops {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
</style>

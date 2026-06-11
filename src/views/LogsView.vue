<script setup lang="ts">
/**
 * 日志查看页。
 * 展示运行期收集的 console 输出与全局错误（桌面端看不到控制台时用它排查）。
 * 支持按级别筛选、清空、复制、导出为文件。
 */
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import { useToast } from 'primevue/usetoast'
import { logs, clearLogs, logsToText, type LogLevel } from '@/services/logger'
import { exportTextFile } from '@/services/BackupService'

const toast = useToast()

const levelFilter = ref<'all' | LogLevel>('all')
const filterOptions = [
  { label: '全部', value: 'all' },
  { label: '错误', value: 'error' },
  { label: '警告', value: 'warn' },
  { label: '信息', value: 'info' },
]

/** 倒序（最新在上）+ 级别筛选 */
const visible = computed(() => {
  const list = levelFilter.value === 'all' ? logs.value : logs.value.filter((l) => l.level === levelFilter.value)
  return [...list].reverse()
})

const errorCount = computed(() => logs.value.filter((l) => l.level === 'error').length)

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function copyAll() {
  try {
    await navigator.clipboard.writeText(logsToText())
    toast.add({ severity: 'success', summary: '已复制到剪贴板', life: 2000 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: '复制失败', detail: String(e?.message ?? e), life: 3000 })
  }
}

async function exportLogs() {
  try {
    const where = await exportTextFile(logsToText(), 'fafa-note-logs.txt')
    toast.add({ severity: 'success', summary: '已导出', detail: where, life: 3000 })
  } catch (e: any) {
    if (String(e?.message).includes('取消')) return
    toast.add({ severity: 'error', summary: '导出失败', detail: String(e?.message ?? e), life: 3000 })
  }
}
</script>

<template>
  <div class="fafa-col logs-page">
    <div class="logs-toolbar">
      <h2>日志</h2>
      <span class="muted">共 {{ logs.length }} 条<template v-if="errorCount">，{{ errorCount }} 个错误</template></span>
      <span class="spacer" />
      <SelectButton
        v-model="levelFilter"
        :options="filterOptions"
        optionLabel="label"
        optionValue="value"
        :allowEmpty="false"
        size="small"
      />
      <Button icon="pi pi-copy" label="复制" text size="small" @click="copyAll" />
      <Button icon="pi pi-download" label="导出" text size="small" @click="exportLogs" />
      <Button icon="pi pi-trash" label="清空" text size="small" severity="danger" @click="clearLogs" />
    </div>

    <div class="fafa-scroll log-list">
      <p v-if="visible.length === 0" class="empty">暂无日志</p>
      <div v-for="l in visible" :key="l.id" class="log-row" :class="l.level">
        <span class="lv">{{ l.level.toUpperCase() }}</span>
        <span class="time">{{ fmtTime(l.time) }}</span>
        <span class="text">{{ l.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.logs-page {
  height: 100%;
}
.logs-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--fafa-border);
}
.logs-toolbar h2 {
  margin: 0;
  font-size: 18px;
}
.muted {
  color: var(--fafa-text-soft);
  font-size: 12px;
}
.spacer {
  flex: 1;
}
.log-list {
  padding: 8px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
}
.empty {
  color: var(--fafa-text-soft);
  text-align: center;
  margin-top: 40px;
}
.log-row {
  display: flex;
  gap: 10px;
  padding: 4px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--fafa-border) 60%, transparent);
  white-space: pre-wrap;
  word-break: break-word;
}
.log-row .lv {
  flex-shrink: 0;
  width: 44px;
  font-weight: 700;
  color: var(--fafa-text-soft);
}
.log-row .time {
  flex-shrink: 0;
  color: var(--fafa-text-soft);
}
.log-row .text {
  flex: 1;
}
.log-row.error .lv {
  color: #ef4444;
}
.log-row.error {
  background: color-mix(in srgb, #ef4444 8%, transparent);
}
.log-row.warn .lv {
  color: #f59e0b;
}
</style>

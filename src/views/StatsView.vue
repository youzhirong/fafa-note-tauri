<script setup lang="ts">
/**
 * 数据统计页：笔记/文件夹/标签/回收站数量 + 标签云。
 * 标签云按使用频次决定字号；点击标签可跳到笔记页按该标签筛选。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useNotesStore } from '@/stores/notes'
import { useSettingsStore } from '@/stores/settings'

const store = useNotesStore()
const settingsStore = useSettingsStore()
const router = useRouter()

/** 未删除的笔记 */
const activeNotes = computed(() => store.notes.filter((n) => n.deletedAt === null))

const stats = computed(() => [
  { label: '笔记', value: activeNotes.value.length, icon: 'pi pi-book' },
  { label: '文件夹', value: store.folders.length, icon: 'pi pi-folder' },
  { label: '标签', value: store.allTags.length, icon: 'pi pi-tags' },
  { label: '回收站', value: store.trashedNotes.length, icon: 'pi pi-trash' },
])

/** [标签, 频次]，按频次降序 */
const tagFreq = computed<[string, number][]>(() => {
  const m: Record<string, number> = {}
  for (const n of activeNotes.value) for (const t of n.tags) m[t] = (m[t] || 0) + 1
  return Object.entries(m).sort((a, b) => b[1] - a[1])
})
const maxFreq = computed(() => tagFreq.value.reduce((mx, [, c]) => Math.max(mx, c), 1))

/** 频次映射到字号（12~30px） */
function fontSize(count: number): string {
  const min = 12
  const max = 30
  return `${Math.round(min + (max - min) * (count / maxFreq.value))}px`
}
function tagColor(t: string): string {
  return settingsStore.settings.tagColors[t] || 'var(--fafa-accent)'
}

function gotoTag(t: string) {
  store.clearTagFilter()
  store.toggleTagFilter(t)
  router.push('/')
}

/** 简单统计：平均正文长度、最近更新 */
const extra = computed(() => {
  const ns = activeNotes.value
  const totalChars = ns.reduce((s, n) => s + n.content.length, 0)
  const avg = ns.length ? Math.round(totalChars / ns.length) : 0
  const last = ns.reduce((mx, n) => Math.max(mx, n.updatedAt), 0)
  return { avg, totalChars, last }
})
function formatTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <div class="fafa-scroll stats-page">
    <h2>数据统计</h2>

    <!-- 数字卡片 -->
    <div class="cards">
      <div v-for="c in stats" :key="c.label" class="stat-card">
        <i :class="c.icon" />
        <div class="num">{{ c.value }}</div>
        <div class="lbl">{{ c.label }}</div>
      </div>
    </div>

    <!-- 概览 -->
    <section class="card">
      <h3>概览</h3>
      <div class="line"><span>正文总字数</span><b>{{ extra.totalChars }}</b></div>
      <div class="line"><span>平均每篇字数</span><b>{{ extra.avg }}</b></div>
      <div class="line"><span>最近更新</span><b>{{ formatTime(extra.last) }}</b></div>
    </section>

    <!-- 标签云 -->
    <section class="card">
      <h3>标签云</h3>
      <p v-if="tagFreq.length === 0" class="empty">还没有标签</p>
      <div v-else class="cloud">
        <button
          v-for="[t, count] in tagFreq"
          :key="t"
          class="cloud-tag"
          :style="{ fontSize: fontSize(count), color: tagColor(t) }"
          :title="`${count} 篇`"
          @click="gotoTag(t)"
        >
          #{{ t }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stats-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px;
}
h2 {
  margin: 0 0 16px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}
.stat-card {
  background: var(--fafa-bg-soft);
  border: 1px solid var(--fafa-border);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}
.stat-card i {
  color: var(--fafa-accent);
  font-size: 18px;
}
.stat-card .num {
  font-size: 26px;
  font-weight: 700;
  margin-top: 6px;
}
.stat-card .lbl {
  color: var(--fafa-text-soft);
  font-size: 12px;
}
.card {
  background: var(--fafa-bg-soft);
  border: 1px solid var(--fafa-border);
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 18px;
}
.card h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
.line {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
  color: var(--fafa-text-soft);
}
.line b {
  color: var(--fafa-text);
}
.empty {
  color: var(--fafa-text-soft);
}
.cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
}
.cloud-tag {
  border: none;
  background: none;
  cursor: pointer;
  line-height: 1.2;
  font-weight: 600;
}
.cloud-tag:hover {
  text-decoration: underline;
}

@media (max-width: 560px) {
  .cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

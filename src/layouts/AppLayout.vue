<script setup lang="ts">
/**
 * 应用主布局：左侧「菜单栏」(可收起) + 右侧主区域(router-view)。
 *
 * 三列结构说明：
 *   ┌────────┬─────────────────────────────────┐
 *   │ 菜单栏  │  主区域 (router-view)             │
 *   │(本组件) │  · 笔记页 = 列表 + 内容(见 NotesView，自带左右两栏) │
 *   │ 可收起  │  · 设置页 = 单栏                   │
 *   └────────┴─────────────────────────────────┘
 * 在笔记页时，菜单栏 + 列表 + 内容 = 你要的「三列」。
 */
import Sidebar from '@/components/Sidebar.vue'
</script>

<template>
  <div class="app-layout">
    <!-- 第 1 列：可收起的菜单栏 -->
    <Sidebar />
    <!-- 第 2/3 列：由各页面决定（笔记页内部再分列表/内容两栏） -->
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100%;
  width: 100%;
}
.app-main {
  flex: 1;
  min-width: 0; /* 防止内容撑破 flex 布局 */
  height: 100%;
  background: var(--fafa-bg);
}
</style>

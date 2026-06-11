<script setup lang="ts">
/**
 * 根组件。
 * 在这里完成应用级初始化（加载笔记数据），并套上全局布局 AppLayout。
 * 路由内容通过 AppLayout 内部的 <router-view> 渲染。
 */
import { onMounted } from 'vue'
import AppLayout from '@/layouts/AppLayout.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useNotesStore } from '@/stores/notes'
import { useShortcuts } from '@/composables/useShortcuts'
import { useAutoBackup } from '@/composables/useAutoBackup'

const notesStore = useNotesStore()

// 全局快捷键（新建/搜索/保存）
useShortcuts()
// 自动定时备份调度
useAutoBackup()

onMounted(async () => {
  // 启动时加载本地数据并建立搜索索引
  await notesStore.init()
})
</script>

<template>
  <AppLayout />
  <!-- 命令面板（Ctrl/Cmd+P） -->
  <CommandPalette />
  <!-- 全局组件：消息提示 + 确认弹窗（供各页面调用） -->
  <Toast position="top-right" />
  <ConfirmDialog />
</template>

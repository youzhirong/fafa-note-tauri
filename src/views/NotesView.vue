<script setup lang="ts">
/**
 * 笔记页：第 2 列(笔记列表) + 第 3 列(内容区)。
 * 用 PrimeVue Splitter 实现可拖拽分栏，拖拽结束后把列宽存进设置。
 */
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import NoteList from '@/components/NoteList.vue'
import NoteEditor from '@/components/NoteEditor.vue'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()

/** 拖拽结束：PrimeVue 给出各面板百分比，记住列表列宽度 */
function onResizeEnd(e: { sizes: number[] }) {
  if (e.sizes?.length) {
    settingsStore.settings.layout.listSizePct = Math.round(e.sizes[0])
  }
}
</script>

<template>
  <Splitter class="fafa-fill" layout="horizontal" @resizeend="onResizeEnd">
    <!-- 第 2 列：笔记列表 -->
    <SplitterPanel :size="settingsStore.settings.layout.listSizePct" :minSize="18">
      <NoteList />
    </SplitterPanel>
    <!-- 第 3 列：内容编辑区 -->
    <SplitterPanel :size="100 - settingsStore.settings.layout.listSizePct" :minSize="30">
      <NoteEditor />
    </SplitterPanel>
  </Splitter>
</template>

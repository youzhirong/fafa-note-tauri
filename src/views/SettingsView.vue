<script setup lang="ts">
/**
 * 设置页。
 * 分区：外观 / 备份与还原 / 网络代理 / 危险操作。
 * 备份相关的「目录选择」仅在 Tauri 下可用；Web 端用下载 + 文件选择器代替。
 */
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import { AVAILABLE_TOOLBARS } from '@/config/editor'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { isTauri } from '@/platform'
import { useSettingsStore } from '@/stores/settings'
import { useNotesStore } from '@/stores/notes'
import { getNoteRepository } from '@/services/repository'
import type { BackupBundle } from '@/types'
import {
  buildBundle,
  exportBackup,
  readBackupViaDialog,
  readBackupFromFile,
  pickDirectory,
} from '@/services/BackupService'
import { getAppVersion, checkAndInstall } from '@/services/UpdateService'

const settingsStore = useSettingsStore()
const notesStore = useNotesStore()
const repo = getNoteRepository()
const toast = useToast()
const confirm = useConfirm()

const tauri = isTauri()
const s = settingsStore.settings

// ---------- 竖向菜单分区 ----------
const sections = [
  { key: 'appearance', label: '外观', icon: 'pi pi-palette' },
  { key: 'editor', label: '编辑器', icon: 'pi pi-pencil' },
  { key: 'backup', label: '备份', icon: 'pi pi-database' },
  { key: 'network', label: '网络', icon: 'pi pi-globe' },
  { key: 'data', label: '数据', icon: 'pi pi-exclamation-triangle' },
  { key: 'about', label: '关于', icon: 'pi pi-info-circle' },
]
const active = ref('appearance')

// ---------- 关于 / 更新 ----------
const version = ref('—')
const checking = ref(false)
const updateMsg = ref('')
onMounted(async () => {
  version.value = await getAppVersion()
})
async function checkUpdate() {
  checking.value = true
  updateMsg.value = '正在检查更新…'
  const r = await checkAndInstall((p) => (updateMsg.value = p))
  updateMsg.value = r.message
  checking.value = false
  if (r.status === 'error' || r.status === 'unconfigured') {
    toast.add({ severity: 'warn', summary: '检查更新', detail: r.message, life: 5000 })
  } else if (r.status === 'latest') {
    toast.add({ severity: 'success', summary: '检查更新', detail: r.message, life: 3000 })
  }
}
function reloadPage() {
  location.reload()
}

/** 上次自动备份时间的可读文本 */
const lastBackupText = computed(() => {
  if (!s.lastAutoBackupAt) return ''
  return new Date(s.lastAutoBackupAt).toLocaleString()
})

const viewModeOptions = [
  { label: '编辑', value: 'edit' },
  { label: '编辑预览', value: 'live' },
  { label: '纯预览', value: 'preview' },
]

const themeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '亮色', value: 'light' },
  { label: '暗色', value: 'dark' },
]

// 隐藏的文件 input，用于 Web 端还原
const fileInput = ref<HTMLInputElement | null>(null)

// ---------- 目录选择（Tauri） ----------
async function chooseBackupDir() {
  const dir = await pickDirectory()
  if (dir) s.backupPath = dir
}
async function chooseRestoreDir() {
  const dir = await pickDirectory()
  if (dir) s.restorePath = dir
}

// ---------- 导出 ----------
async function doExport() {
  try {
    const bundle = buildBundle(notesStore.notes, notesStore.folders)
    const where = await exportBackup(bundle, s.backupPath)
    toast.add({ severity: 'success', summary: '导出成功', detail: where, life: 4000 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: '导出失败', detail: String(e?.message ?? e), life: 4000 })
  }
}

// ---------- 还原 ----------
async function doRestore() {
  if (tauri) {
    // Tauri：弹文件对话框
    try {
      const bundle = await readBackupViaDialog(s.restorePath)
      confirmAndImport(bundle)
    } catch (e: any) {
      if (String(e?.message).includes('取消')) return
      toast.add({ severity: 'error', summary: '读取失败', detail: String(e?.message ?? e), life: 4000 })
    }
  } else {
    // Web：触发文件选择
    fileInput.value?.click()
  }
}

async function onFilePicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const bundle = await readBackupFromFile(file)
    confirmAndImport(bundle)
  } catch (err: any) {
    toast.add({ severity: 'error', summary: '文件无效', detail: String(err?.message ?? err), life: 4000 })
  } finally {
    ;(e.target as HTMLInputElement).value = '' // 允许再次选同一文件
  }
}

/** 让用户选择「替换」还是「合并」后导入 */
function confirmAndImport(bundle: BackupBundle) {
  confirm.require({
    message: `备份含 ${bundle.notes.length} 条笔记。选择「替换」会清空现有数据，「合并」则按 id 合并。`,
    header: '还原方式',
    icon: 'pi pi-question-circle',
    rejectLabel: '合并',
    acceptLabel: '替换',
    accept: () => importBundle(bundle, true),
    reject: () => importBundle(bundle, false),
  })
}

async function importBundle(bundle: BackupBundle, replace: boolean) {
  try {
    await repo.bulkImport({ notes: bundle.notes, folders: bundle.folders }, replace)
    await notesStore.reloadFromRepo()
    toast.add({ severity: 'success', summary: '还原完成', detail: `已导入 ${bundle.notes.length} 条`, life: 4000 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: '还原失败', detail: String(e?.message ?? e), life: 4000 })
  }
}

// ---------- 危险操作 ----------
function resetSettings() {
  confirm.require({
    message: '将所有设置恢复为默认值（不影响笔记数据）。',
    header: '重置设置',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '重置',
    rejectLabel: '取消',
    accept: () => {
      settingsStore.reset()
      toast.add({ severity: 'info', summary: '已重置设置', life: 3000 })
    },
  })
}

function clearAllData() {
  confirm.require({
    message: '危险！将删除全部笔记和文件夹，且不可恢复。建议先导出备份。',
    header: '清空所有数据',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '全部删除',
    rejectLabel: '取消',
    acceptProps: { severity: 'danger' },
    accept: async () => {
      await repo.clearAll()
      await notesStore.reloadFromRepo()
      toast.add({ severity: 'warn', summary: '已清空所有数据', life: 3000 })
    },
  })
}
</script>

<template>
  <div class="settings-page">
    <!-- 左侧竖向菜单 -->
    <nav class="settings-menu">
      <div class="menu-title">设置</div>
      <button
        v-for="sec in sections"
        :key="sec.key"
        class="menu-item"
        :class="{ active: active === sec.key }"
        @click="active = sec.key"
      >
        <i :class="sec.icon" />
        <span>{{ sec.label }}</span>
      </button>
    </nav>

    <!-- 右侧内容 -->
    <div class="fafa-scroll settings-content">
      <!-- 外观 -->
      <section v-show="active === 'appearance'">
        <h3>外观</h3>
        <div class="row">
          <label>主题</label>
          <Select v-model="s.theme" :options="themeOptions" optionLabel="label" optionValue="value" />
        </div>
      </section>

      <!-- 编辑器 -->
      <section v-show="active === 'editor'">
        <h3>编辑器</h3>
        <div class="row">
          <label>默认视图</label>
          <Select
            v-model="s.defaultViewMode"
            :options="viewModeOptions"
            optionLabel="label"
            optionValue="value"
          />
        </div>
        <div class="row">
          <label>字号</label>
          <InputNumber v-model="s.editorFontSize" :min="12" :max="28" showButtons suffix=" px" />
        </div>
        <div class="row column">
          <label>Markdown 工具栏按钮</label>
          <MultiSelect
            v-model="s.editorToolbars"
            :options="AVAILABLE_TOOLBARS"
            optionLabel="label"
            optionValue="value"
            display="chip"
            filter
            placeholder="选择要显示的按钮"
          />
          <p class="hint">勾选的按钮会显示在 Markdown 编辑器顶部工具栏；顺序以编辑器默认顺序为准。</p>
        </div>
      </section>

      <!-- 备份与还原 -->
      <section v-show="active === 'backup'">
        <h3>备份与还原</h3>
        <div v-if="tauri" class="row">
          <label>备份目录</label>
          <div class="path-field">
            <InputText v-model="s.backupPath" placeholder="导出默认保存到此目录" />
            <Button icon="pi pi-folder-open" text @click="chooseBackupDir" />
          </div>
        </div>
        <div v-if="tauri" class="row">
          <label>还原目录</label>
          <div class="path-field">
            <InputText v-model="s.restorePath" placeholder="还原时默认从此目录查找" />
            <Button icon="pi pi-folder-open" text @click="chooseRestoreDir" />
          </div>
        </div>
        <p v-else class="hint">
          Web 端无法访问本机目录：导出将触发浏览器下载，还原请手动选择备份文件。
        </p>

        <div class="actions">
          <Button icon="pi pi-download" label="导出备份 (JSON)" @click="doExport" />
          <Button icon="pi pi-upload" label="导入 / 还原" severity="secondary" @click="doRestore" />
          <input
            ref="fileInput"
            type="file"
            accept="application/json,.json"
            style="display: none"
            @change="onFilePicked"
          />
        </div>

        <div class="row auto-row">
          <label>自动定时备份</label>
          <ToggleSwitch v-model="s.autoBackup" />
        </div>
        <div v-if="s.autoBackup" class="row">
          <label>备份间隔</label>
          <InputNumber v-model="s.autoBackupIntervalMinutes" :min="1" :max="1440" showButtons suffix=" 分钟" />
        </div>
        <p v-if="s.autoBackup" class="hint">
          <template v-if="tauri">
            覆盖写入备份目录下的 <code>fafa-note-autobackup.json</code>（每次覆盖，不堆积）。
            需先设置上方「备份目录」，否则会跳过。
          </template>
          <template v-else> Web 端写入浏览器本地存储作为可恢复快照（不下载文件）。 </template>
          <template v-if="s.lastAutoBackupAt"> 上次：{{ lastBackupText }}</template>
        </p>
      </section>

      <!-- 网络代理 -->
      <section v-show="active === 'network'">
        <h3>网络代理（Web 跨域）</h3>
        <div class="row column">
          <label>代理地址</label>
          <InputText v-model="s.proxyUrl" placeholder="https://my-proxy.com/?url={url}" />
          <p class="hint">
            仅 Web 端生效，用于绕过浏览器 CORS 限制。支持 <code>{url}</code> 占位符（会替换为目标地址并 URL 编码），
            或直接填前缀。Tauri 桌面/移动端无跨域问题，自动忽略此项。
          </p>
        </div>
      </section>

      <!-- 数据 / 危险操作 -->
      <section v-show="active === 'data'">
        <h3>数据</h3>
        <p class="hint">这些操作会影响本地数据，请谨慎。建议先到「备份」导出。</p>
        <div class="actions">
          <Button label="重置设置" severity="secondary" outlined @click="resetSettings" />
          <Button label="清空所有数据" severity="danger" outlined @click="clearAllData" />
        </div>
        <p class="env-tag">当前运行环境：{{ tauri ? 'Tauri（桌面/移动）' : 'Web 浏览器' }}</p>
      </section>

      <!-- 关于 -->
      <section v-show="active === 'about'">
        <h3>关于</h3>
        <div class="about">
          <div class="app-name">fafa-note</div>
          <div class="about-line">版本 <b>{{ version }}</b></div>
          <div class="about-line">{{ tauri ? '桌面客户端 (Tauri)' : 'Web 网页版' }}</div>
          <div class="about-line">fafa跨平台笔记管理软件 by: yzrydf</div>
          <div class="update-box">
            <template v-if="tauri">
              <Button
                icon="pi pi-sync"
                label="检查更新"
                :loading="checking"
                @click="checkUpdate"
              />
              <p v-if="updateMsg" class="hint">{{ updateMsg }}</p>
              <p class="hint">检查到新版本会自动下载并重启完成升级。</p>
            </template>
            <template v-else>
              <p class="hint">Web 版随网页托管更新，刷新页面即为最新版本，无需手动升级。</p>
              <Button icon="pi pi-refresh" label="刷新页面" outlined @click="reloadPage" />
            </template>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 竖向菜单 + 内容 两栏布局 */
.settings-page {
  display: flex;
  height: 100%;
}
.settings-menu {
  width: 180px;
  flex-shrink: 0;
  border-right: 1px solid var(--fafa-border);
  background: var(--fafa-bg-soft);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.menu-title {
  font-size: 12px;
  color: var(--fafa-text-soft);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 6px 10px 10px;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: none;
  cursor: pointer;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--fafa-text);
  font-size: 14px;
}
.menu-item:hover {
  background: rgba(127, 127, 127, 0.12);
}
.menu-item.active {
  background: var(--fafa-accent);
  color: #fff;
}
.settings-content {
  flex: 1;
  min-width: 0;
  padding: 24px 28px;
}
.settings-content section {
  max-width: 640px;
}
.settings-content h3 {
  margin: 0 0 18px;
  font-size: 16px;
}
/* 关于页 */
.about .app-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--fafa-accent);
}
.about-line {
  color: var(--fafa-text-soft);
  margin-top: 6px;
  font-size: 14px;
}
.about-line b {
  color: var(--fafa-text);
}
.update-box {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.row.column {
  flex-direction: column;
  align-items: stretch;
}
.row label {
  width: 96px;
  flex-shrink: 0;
  color: var(--fafa-text-soft);
  font-size: 14px;
}
.row.column label {
  width: auto;
  margin-bottom: 6px;
}
.path-field {
  display: flex;
  flex: 1;
  gap: 6px;
}
.path-field .p-inputtext {
  flex: 1;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.hint {
  color: var(--fafa-text-soft);
  font-size: 12.5px;
  line-height: 1.6;
  margin: 6px 0 0;
}
.hint code {
  background: rgba(127, 127, 127, 0.15);
  padding: 1px 5px;
  border-radius: 4px;
}
.danger {
  border-color: color-mix(in srgb, #ef4444 40%, var(--fafa-border));
}
.env-tag {
  text-align: center;
  color: var(--fafa-text-soft);
  font-size: 12px;
}
</style>

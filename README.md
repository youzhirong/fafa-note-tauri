# fafa-note-tauri

跨平台笔记管理软件。一套代码同时运行在 **Web 浏览器 / Windows / macOS / Linux / iOS / Android**。

- **前端**：Vue 3 + TypeScript + Vite
- **UI**：PrimeVue 4（响应式，网页和移动端都友好）+ md-editor-v3（Markdown 编辑器）
- **桌面/移动壳**：Tauri 2
- **存储**：IndexedDB（Dexie）—— 无需后端，浏览器与 Tauri 通用
- **搜索**：MiniSearch 内存全文索引

## ✨ 功能

- 笔记的增删改查，支持 **Markdown** 与**纯文本**两种格式
- Markdown **三种视图模式**：编辑 / 编辑预览 / 纯预览（可切换，默认模式可在设置里定）
- 文件夹分类（新建/重命名/删除，下拉可搜索，**侧边栏可拖拽排序**）、置顶
- **笔记双链 `[[标题]]`**：预览中可点击跳转（不存在则新建），编辑器显示**反向链接**
- **标签**：编辑、多标签筛选、左侧菜单可点、**重命名 / 配色 / 删除**
- 笔记列表支持**拖拽排序**、**右键菜单**、**多选批量**（批量删除 / 移动）
- **图片粘贴/上传**：Web 内联 base64（随笔记存入 IndexedDB），桌面端存本地文件
- **可配置编辑器**：工具栏按钮、字号、默认视图模式
- **导出**：单篇导出 `.md`/`.txt`，整库备份/还原 JSON
- **回收站**：软删除可还原，支持永久删除与清空
- **关键词全文快速搜索**（标题 + 正文 + **文件夹名**），列表内**命中词高亮**
- **拖拽笔记到左侧文件夹**即可归类
- **数据统计页**：笔记/文件夹/标签数量 + 标签云
- 代码块**离线语法高亮**（内置 highlight.js，不依赖 CDN）
- **全局快捷键**：`Ctrl/Cmd+N` 新建、`Ctrl/Cmd+F` 搜索、`Ctrl/Cmd+S` 保存、`Ctrl/Cmd+P` 命令面板
- **命令面板**（`Ctrl/Cmd+P`）：快速跳转笔记 / 切换页面 / 新建，方向键 + 回车操作
- **自动定时备份**（可在设置开启并设间隔）
- **应用内日志页**：收集 console 输出与全局错误，桌面端也能排查问题
- **设置页竖向分类菜单**（外观/编辑器/备份/网络/数据/关于）
- **关于页**：显示版本与应用信息（统一来自 `app.config.json`）；桌面端「检查更新」先展示新版本与更新说明、**由用户确认后**再下载安装并重启（进度跨页面切换不丢失；需配置更新源，见 docs），Web 端刷新即最新
- 三列布局：可收起的**菜单栏** + **笔记列表** + **内容区**，列宽可拖拽并记忆
- 设置：主题（亮/暗/跟随系统）、**备份目录**、**还原目录**、**代理地址**
- 备份/还原：导出导入 **JSON**（Web 端下载/选文件，桌面端读写磁盘目录）
- 亮暗主题

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 1) 纯 Web 开发（浏览器打开 http://localhost:1420）
npm run dev

# 2) 桌面端开发（需已安装 Rust 工具链）
npm run tauri:dev

# 构建 Web 静态产物（输出到 dist/，可直接托管到任意静态服务器）
npm run build

# 构建桌面安装包
npm run tauri:build
```

> 移动端构建见 Tauri 官方文档：`npm run tauri ios init` / `npm run tauri android init` 后用
> `npm run tauri ios dev` / `npm run tauri android dev`。

### 环境要求

- Node.js ≥ 18
- 桌面/移动构建需要 **Rust ≥ 1.85**（Tauri 2 的部分依赖使用 edition 2024，旧版本会报
  `feature edition2024 is required`；用 `rustup update stable` 升级即可），
  以及各平台系统依赖（见 Tauri 文档）
- 纯 Web 开发**不需要** Rust

## 📁 目录结构

```
app.config.json            ★ 应用元信息唯一来源（版本/产品名/关于页文案）——发版只改这里
scripts/
├─ sync-app-config.mjs      把 app.config.json 的版本/镜像源同步到 package.json / tauri.conf.json / Cargo.*
└─ make-proxy-manifest.mjs  CI 用：生成内链走镜像的 latest-proxy.json（国内自动更新，见 docs）
src/
├─ main.ts                  应用入口（装配 Vue/Pinia/Router/PrimeVue）
├─ App.vue                  根组件
├─ assets/main.css          全局样式 + 亮暗主题变量
├─ platform/                平台检测（isTauri / isWeb）
├─ types/                   数据模型（Note / Folder / AppSettings / 备份结构）
├─ config/navigation.ts     ★ 左侧菜单栏配置（新增功能入口在这里）
├─ router/index.ts          路由
├─ stores/                  Pinia 状态：notes / settings / ui / update（检查更新进度，跨页面留存）
├─ services/
│   ├─ repository/          ★ 存储层抽象 + IndexedDB 实现（可换 SQLite）
│   ├─ SearchService.ts     全文搜索
│   ├─ BackupService.ts     备份导入导出（平台自适应）
│   └─ HttpService.ts       HTTP（Web 走代理解决跨域，Tauri 直连）
├─ layouts/AppLayout.vue    三列主布局
├─ components/              Sidebar / NoteList / NoteEditor
└─ views/                   NotesView / SettingsView
src-tauri/                  Tauri（Rust）配置、插件、权限
docs/                       架构说明与扩展指南
```

## 💻 安装包下载与首次打开

到 [GitHub Releases](https://github.com/youzhirong/fafa-note-tauri/releases) 下载对应平台的包：

- **macOS（Apple Silicon：M1/M2/M3…）** → `*_aarch64.dmg`
- **macOS（Intel）** → `*_x64.dmg`
- **Windows** → `*-setup.exe`（推荐）或 `*.msi`
- **Linux** → `*.deb` / `*.AppImage`

### ⚠️ macOS 首次打开提示「已损坏，无法打开」

本应用**暂未做 Apple 开发者签名与公证**，从网上下载的包会被系统打上隔离标记，
首次打开会报「**"fafa-note" 已损坏，无法打开，您应该将它移到废纸篓**」。
这**不是包坏了，也不是下错了架构**，去掉隔离标记即可正常使用：

```bash
# 已拖入「应用程序」后执行（会提示输入开机密码）
sudo xattr -rd com.apple.quarantine /Applications/fafa-note.app
```

执行后再正常双击打开即可。

> 注意：对「已损坏」这种提示，**右键 →「打开」通常无效**（那招只对「无法验证开发者」有效），
> 必须用上面的 `xattr` 命令。彻底解决（下载即可直接双击打开）需要 Apple 开发者证书做签名+公证，
> 见 [docs/打包构建.md](docs/打包构建.md) 第五节。

## 📖 文档

- [docs/架构说明.md](docs/架构说明.md) —— 分层架构与设计取舍
- [docs/扩展指南.md](docs/扩展指南.md) —— **如何新增菜单栏项、路由、页面、存储引擎**
- [docs/打包构建.md](docs/打包构建.md) —— **打包安装程序（含 Mac 出 Windows exe 的方法）**
- [docs/auto-update-github.md](docs/auto-update-github.md) —— 用 GitHub Releases 做桌面端自动更新

## 🔌 关于「纯前端 + 跨域」

Web 版托管在静态页面、无后端。若要请求第三方接口，浏览器会有 **CORS** 限制：

- 在 **设置 → 网络代理** 填入代理地址即可绕过，支持 `https://proxy/?url={url}` 占位符写法；
- Tauri 桌面/移动端由 Rust 侧发请求，**没有跨域问题**，会自动忽略代理。

详见 `src/services/HttpService.ts`。

# 用 GitHub Releases 做桌面端自动更新

目标：用户在「关于 → 检查更新」点一下，应用就能从 GitHub Releases 拉到新版本、下载安装并重启。
Web 版不涉及（重新托管即最新）。

代码侧（updater / process 插件、关于页逻辑）已就绪，只需完成下面的**发布配置**。

---

## 一、生成签名密钥（只做一次）

更新包必须用你的私钥签名，应用用对应公钥校验，防止被篡改。

```bash
# 在项目根目录执行；-w 指定私钥保存路径，会提示设置密码
npm run tauri signer generate -- -w ~/.tauri/fafa-note.key
```

输出里会有：
- **私钥**（保存在 `~/.tauri/fafa-note.key`）—— 绝不能公开/提交，只放进 GitHub Secrets。
- **公钥**（一串 base64）—— 填进 `tauri.conf.json`。

---

## 二、改 `src-tauri/tauri.conf.json`

加入 updater 配置，并开启更新产物生成：

```jsonc
{
  // ...
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": true,   // ← 新增：构建时生成可更新产物 + 签名
    "icon": [ /* 保持原样 */ ]
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/<OWNER>/<REPO>/releases/latest/download/latest.json"
      ],
      "pubkey": "把第一步生成的公钥粘到这里"
    }
  }
}
```

把 `<OWNER>/<REPO>` 换成你的 GitHub 仓库，例如 `zhangsan/fafa-note-tauri`。
`latest.json` 是更新清单，由下面的工作流自动生成并上传到每个 Release。

> 📌 本仓库里 `endpoints` **不用手填**：它由 `app.config.json` 的 `repo` + `updaterMirror` 经
> `scripts/sync-app-config.mjs` 自动生成（含国内镜像源，见文末「国内访问」一节）。你只需保证 `pubkey` 正确。

> ⚠️ 重要：
> - `plugins.updater` 配置块**一旦写了就必须保证完整且有效**（含 `endpoints` 和合法的 `pubkey`）。
>   updater 插件在**应用启动时**就会读取它，缺失或为 null 会导致**启动即崩溃**
>   （报错 `PluginInitialization("updater", ... invalid type: null, expected struct Config)`）。
> - 粘贴 `pubkey` 时注意**别带上结尾的 `%`**（zsh 显示无换行文件时会多出这个符号），否则签名校验会失败。
> - `createUpdaterArtifacts: true` 会让**本地** `npm run tauri:build` 要求签名私钥，没有就构建失败。
>   因此本仓库默认设为 `false`（本地能正常出包、应用能正常启动并检查更新）；
>   **只在发布(CI)时**改成 `true` 并提供私钥（见下）。日常 `tauri:dev` 不受影响。

---

## 三、配置 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions，新增：
- `TAURI_SIGNING_PRIVATE_KEY`：私钥文件 `~/.tauri/fafa-note.key` 的**内容**。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成私钥时设的密码（没设就留空）。

---

## 四、加发布工作流

项目已附带示例：`.github/workflows/release.yml`（见该文件）。
它会在你推送 `v*` 标签时，在三大平台构建、签名，并把安装包和 `latest.json` 上传到对应 Release。

---

## 五、发版流程

版本号与应用元信息**只在一个地方维护**：根目录的 `app.config.json`（见下方「应用元信息唯一来源」）。

```bash
# 1. 改 app.config.json 里的 version（只此一处；其它配置文件由脚本自动同步）
# 2. 打与之匹配的标签并推送（tag 用 v + 版本号）
git commit -am "release v0.2.0"
git tag v0.2.0
git push origin v0.2.0
```

工作流跑完后，GitHub 上会出现 `v0.2.0` Release，含各平台安装包 + `latest.json`。
此时旧版本客户端在「关于 → 检查更新」就能检测到 0.2.0 并自助升级。

> CI 在构建前会先跑 `node scripts/sync-app-config.mjs`，把 `app.config.json` 的版本同步进
> `tauri.conf.json` 等，确保打出的包版本与 `app.config.json` 一致。**记得让 tag 的版本号与
> `app.config.json` 的 `version` 对应**（如 `app.config.json` 是 `0.2.0`，tag 就用 `v0.2.0`）。

---

## 应用元信息唯一来源：`app.config.json`

升版本曾经要改好几处（`package.json` / `tauri.conf.json` / `Cargo.toml` 的 version，外加「关于」页文案），
容易漏改、不一致。现统一到根目录 **`app.config.json`** 一处：

```jsonc
{
  "version": "1.0.0",                 // 版本号（发版改这里）
  "productName": "fafa-note",         // 应用/窗口产品名
  "identifier": "com.fafa.note",      // 应用唯一标识
  "author": "yzrydf",                 // 关于页作者署名
  "description": "…",                 // 应用描述（同步到 package.json / Cargo.toml）
  "aboutTagline": "fafa跨平台笔记管理软件", // 关于页副标题
  "homepage": "https://github.com/youzhirong/fafa-note-tauri"
}
```

它如何生效：

- **构建工具配置**（`package.json` / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock`）的版本号等，由
  `scripts/sync-app-config.mjs` 同步写入。`npm run sync` 手动跑一次即可；`npm run tauri:dev`、
  `npm run tauri:build` 已在启动 tauri 前自动先跑，CI 也会跑（见上）。
- **「关于」页文案与版本号**：`vite.config.ts` 在编译期把 `app.config.json` 注入为常量
  （`__APP_VERSION__` / `__APP_NAME__` / `__APP_AUTHOR__` 等），无需手动同步。

所以发版只改 `app.config.json`，其余自动对齐。

---

## 工作原理简述（检查更新流程）

点「检查更新」**只检查、不直接下载**，是否升级交给用户决定：

```
点击「检查更新」
  → 读取 endpoints 里的 latest.json（GitHub Releases 上），比较 version 与当前版本
  → 已是最新：提示「已是最新版本」
  → 发现新版本：弹框展示版本号 + 更新说明(notes)，等用户确认
        · 点「稍后」 → 不下载
        · 点「立即更新」→ 下载签名包 → 用 pubkey 校验 → 安装 → relaunch 重启
```

> 下载进度由全局 store（`src/stores/update.ts`）承载，**切换菜单再切回「关于」页进度不丢失**
> （下载始终在后台进行）。

清单 `latest.json` 形如（tauri-action 自动生成，无需手写）：

```json
{
  "version": "0.2.0",
  "notes": "更新说明",
  "pub_date": "2026-01-01T00:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "...", "url": "https://github.com/.../fafa-note_0.2.0_aarch64.app.tar.gz" },
    "windows-x86_64": { "signature": "...", "url": "https://github.com/.../fafa-note_0.2.0_x64-setup.nsis.zip" }
  }
}
```

---

## 国内访问：github.com 被墙怎么办（镜像源 + 代理）

**问题**：默认更新源是 `https://github.com/.../releases/latest/download/latest.json`，它走 `github.com`
主站并跳转到 `objects.githubusercontent.com` 下载。这两个域名在国内常被墙，点「检查更新」会报
`error sending request for url (...latest.json)`——这是网络层连不上，不是配置错。
而且 `latest.json` 内部每个平台的 `url` 也指向 `github.com`，即使清单拿到了，**下载那步同样会失败**。

本仓库用**两条互补的方案**解决，无需额外服务器：

### 方案 B：镜像源（默认开启，对所有用户自动生效）

思路：再发布一份**内部下载地址已改成镜像地址**的清单 `latest-proxy.json`，并把更新源里
**镜像清单放第一、GitHub 原址兜底**。国内客户端命中第一个（镜像可达）→ 清单内的 url 也是镜像地址 →
检查和下载全程走镜像；国外客户端镜像若慢/失败，回退到第二个 GitHub 原址。

涉及三处，都已就绪：

1. **镜像地址只配一处** —— `app.config.json`：

   ```jsonc
   {
     "repo": "youzhirong/fafa-note-tauri",
     "updaterMirror": "https://gh-proxy.com/"   // 末尾要带斜杠；留空则不启用镜像
   }
   ```

2. **`scripts/sync-app-config.mjs`** 据此推导 `tauri.conf.json` 的 endpoints（`npm run sync` 自动跑）：

   ```jsonc
   "endpoints": [
     "https://gh-proxy.com/https://github.com/youzhirong/fafa-note-tauri/releases/latest/download/latest-proxy.json",
     "https://github.com/youzhirong/fafa-note-tauri/releases/latest/download/latest.json"
   ]
   ```

3. **CI**（`release.yml` 的 `proxy-manifest` 任务）在构建后，用 `scripts/make-proxy-manifest.mjs`
   把 `latest.json` 里每个 `platforms.*.url` 前面加上镜像前缀，生成 `latest-proxy.json` 上传到同一 Release。
   例如 `…/fafa-note_x64.dmg` → `https://gh-proxy.com/https://github.com/…/fafa-note_x64.dmg`。

   > 签名(`signature`)是对**文件内容**签的、与 url 无关，所以只改 url 不动签名，客户端校验照常通过、安全性不降低。

**想换镜像 / 关镜像**：只改 `app.config.json` 的 `updaterMirror`（如换成 `https://ghfast.top/`
或 `https://ghproxy.net/`，或留空 `""` 关闭），重新发版即可。常见可用镜像：`gh-proxy.com`、`ghfast.top`、`ghproxy.net`
（免费镜像稳定性会波动，所以才保留 GitHub 原址兜底 + 下面的方案 A）。

### 方案 A：本地代理（可选，给有科学上网的用户兜底）

镜像万一全挂了，用户可在「**关于 → 更新走代理**」打开开关，填本机代理端口（点预设按钮可快速填入）：

```
http://127.0.0.1:7890      # Clash
http://127.0.0.1:7897      # Clash 混合端口
http://127.0.0.1:10809     # V2RayN
socks5://127.0.0.1:1080    # SOCKS5
```

开启后，检查与下载都会走这个**转发代理**（对应 `check({ proxy })`，见 `src/services/UpdateService.ts`）。
注意它和方案 B 的「镜像网站」是两码事：这里填的是你本机科学上网软件监听的代理地址，不是 `gh-proxy.com`。
设置存在 `updaterProxyEnabled` / `updaterProxyUrl`（`src/types/index.ts`），持久化在本地。

### 一句话总结

- 普通用户：**什么都不用设**，默认走镜像源更新（方案 B）。
- 有代理的用户：镜像不灵时，打开「更新走代理」填本机端口（方案 A）。
- 维护者：换镜像只改 `app.config.json` 的 `updaterMirror` 一处。

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

```bash
# 1. 升版本号（package.json 和 tauri.conf.json 的 version 要一致）
# 2. 打标签并推送
git tag v0.2.0
git push origin v0.2.0
```

工作流跑完后，GitHub 上会出现 `v0.2.0` Release，含各平台安装包 + `latest.json`。
此时旧版本客户端在「关于 → 检查更新」就能检测到 0.2.0 并自助升级。

---

## 工作原理简述

```
点击「检查更新」
  → 读取 endpoints 里的 latest.json（GitHub Releases 上）
  → 比较其中 version 与当前版本
  → 有更新：下载对应平台的签名包 → 用 pubkey 校验 → 安装 → relaunch 重启
```

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

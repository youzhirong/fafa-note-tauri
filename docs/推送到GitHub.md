# 推送到 GitHub 仓库

仓库：https://github.com/youzhirong/fafa-note-tauri

## 一、首次推送（项目还不是 git 仓库时）

```bash
cd /Users/youzhirong/Documents/AikoProject/fafa-note-tauri

# 1) 初始化
git init

# 2) 配置身份（只需第一次，全局设置过就跳过）
git config user.name  "youzhirong"
git config user.email "你的邮箱@example.com"

# 3) 添加并提交
git add .
git commit -m "init: fafa-note tauri 笔记应用"

# 4) 关联远程并推送（默认分支用 main）
git branch -M main
git remote add origin https://github.com/youzhirong/fafa-note-tauri.git
git push -u origin main
```

> `.gitignore` 已排除 `node_modules` / `dist` / `src-tauri/target`，这些不会被提交。
> 提交前可 `git status` 看一眼，确认没有把大目录或私钥加进去。

### 如果远程仓库创建时勾选了 README/LICENSE（已有提交）

直接 `push` 会被拒绝（远程有本地没有的提交）。先合并：

```bash
git pull --rebase origin main   # 把远程的 README 等拉下来
git push -u origin main
```

## 二、以后的日常推送

```bash
git add .
git commit -m "feat: 说明这次改了什么"
git push
```

## 三、安全检查（重要）

- **绝不要提交签名私钥**（`~/.tauri/*.key`）。它不在项目目录内，正常不会被加进来。
- `tauri.conf.json` 里的 `pubkey` 是**公钥**，可以放心提交。
- 私钥要放到 **GitHub Secrets**（见下），不是仓库里。

## 四、启用自动构建 / 发版（可选，推完代码后）

仓库里已带 `.github/workflows/release.yml`，推送后即生效。要让它能签名打包：

1. 仓库 → Settings → Secrets and variables → Actions → New repository secret，新增：
   - `TAURI_SIGNING_PRIVATE_KEY`：私钥文件 `~/.tauri/fafa-note.key` 的**内容**
     （`cat ~/.tauri/fafa-note.key` 复制全部，注意别带结尾的 `%`）
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成私钥时设的密码（没设就留空）
2. 打版本标签触发三平台构建 + 发布 Release：
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. 跑完后 Release 里会有 macOS / Windows / Linux 安装包和 `latest.json`，
   旧客户端即可在「关于 → 检查更新」自助升级。详见 auto-update-github.md。

## 五、版本号（发版前必做，共 4 处）

发版前要把版本号同步改到 **4 个文件**，并与标签一致（标签 `v1.0.0` ↔ version `1.0.0`，
标签前面带 `v`，文件里不带）。少改任何一个都可能导致"关于页/安装包版本不一致"。

| 文件 | 位置 | 改哪一行 | 作用 |
|---|---|---|---|
| `package.json` | 项目根目录 | `"version": "1.0.0",` | Web 端关于页版本（编译期注入 `__APP_VERSION__`） |
| `tauri.conf.json` | `src-tauri/` | `"version": "1.0.0",`（在 `productName` 下面） | **Tauri 应用 / 安装包版本**；桌面端关于页、自动更新都看它 |
| `Cargo.toml` | `src-tauri/` | `[package]` 下的 `version = "1.0.0"` | Rust 外壳程序的版本（相当于 Rust 的 package.json） |
| `Cargo.lock` | `src-tauri/` | `name = "fafa-note-tauri"` 那一节下面的 `version = "1.0.0"` | 锁定文件，同步改避免构建时文件变"脏" |

> **`Cargo.toml` / `Cargo.lock` 是什么**：Rust 项目的清单与锁定文件，相当于前端的
> `package.json` / `package-lock.json`。都是纯文本，在 IDEA 项目树里展开 `src-tauri` 双击打开，
> 改掉 `version` 那一行即可。`Cargo.lock` 里 `version = "x"` 出现很多次（每个依赖一行），
> **只改 `name = "fafa-note-tauri"` 紧跟着的那一行**，别动别的。

改完提交并打标签：

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: 版本升级到 1.0.0"
git push origin main          # 推代码（不触发构建）
git tag v1.0.0                # 打标签
git push origin v1.0.0        # 推标签 → 触发三平台构建 + 发布 Release
```

> ⚠️ 打标签前务必确认 GitHub Secret `TAURI_SIGNING_PRIVATE_KEY` 是**干净的密钥**
> （末尾不能带 `cat` 时 zsh 显示的 `%`），否则构建会在"签名更新包"这步失败。
> 干净复制密钥：`cat ~/.tauri/fafa-note.key | pbcopy`，再粘进 Secret。

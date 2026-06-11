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

## 五、版本号

发版前同步改 `package.json` 与 `src-tauri/tauri.conf.json` 的 `version`，并与标签一致
（标签 `v0.1.0` ↔ version `0.1.0`）。

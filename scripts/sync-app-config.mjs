#!/usr/bin/env node
/**
 * 把 app.config.json（应用元信息的唯一来源）同步到各构建工具的配置文件：
 *   - package.json              version / description
 *   - src-tauri/tauri.conf.json version / productName / identifier
 *   - src-tauri/Cargo.toml      version / description
 *   - src-tauri/Cargo.lock      本 crate 的 version（否则下次 cargo build 才更新，工作树会变脏）
 *
 * 前端（关于页）的版本号与文案不走这里，而是 vite 在编译期直接从 app.config.json 注入
 * （见 vite.config.ts）——所以发版时只需改 app.config.json 一处。
 *
 * 运行：npm run sync
 *   tauri:dev / tauri:build 会在启动 tauri 前自动先跑（保证 tauri 读到的版本是最新的）；
 *   CI 发布流程也在构建前调用本脚本（见 .github/workflows/release.yml）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cfg = JSON.parse(readFileSync(join(root, 'app.config.json'), 'utf-8'))

/** 读取 JSON、按 patch 覆盖指定字段、仅在有变化时写回（保留其余字段与缩进风格） */
function patchJson(relPath, patch) {
  const file = join(root, relPath)
  const data = JSON.parse(readFileSync(file, 'utf-8'))
  let changed = false
  for (const [k, v] of Object.entries(patch)) {
    if (data[k] !== v) {
      data[k] = v
      changed = true
    }
  }
  if (changed) {
    writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
    console.log(`  ✓ ${relPath}`)
  }
}

patchJson('package.json', { version: cfg.version, description: cfg.description })

patchJson('src-tauri/tauri.conf.json', {
  version: cfg.version,
  productName: cfg.productName,
  identifier: cfg.identifier,
})

// Cargo.toml：行首匹配，仅改 [package] 段的 version / description，避免误伤依赖项里的 version
const cargoPath = join(root, 'src-tauri/Cargo.toml')
const cargoBefore = readFileSync(cargoPath, 'utf-8')
let cargo = cargoBefore
  .replace(/^version\s*=\s*".*"/m, `version = "${cfg.version}"`)
  .replace(/^description\s*=\s*".*"/m, `description = "${cfg.description}"`)
if (cargo !== cargoBefore) {
  writeFileSync(cargoPath, cargo)
  console.log('  ✓ src-tauri/Cargo.toml')
}

// crate 名（用于在 Cargo.lock 里精确定位本项目的包块）
const crateName = cargoBefore.match(/^name\s*=\s*"(.+)"/m)?.[1]

// Cargo.lock：只改「本 crate」那一段的 version（name 行紧随其后的 version 行），不动依赖
const lockPath = join(root, 'src-tauri/Cargo.lock')
const lockBefore = readFileSync(lockPath, 'utf-8')
const lockRe = new RegExp(`(name = "${crateName}"\\nversion = )"[^"]*"`)
const lock = lockBefore.replace(lockRe, `$1"${cfg.version}"`)
if (lock !== lockBefore) {
  writeFileSync(lockPath, lock)
  console.log('  ✓ src-tauri/Cargo.lock')
}

console.log(`app.config.json → 已同步版本 ${cfg.version}`)

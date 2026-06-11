#!/usr/bin/env node
/**
 * 由 GitHub 生成的 latest.json 派生出「镜像版」清单 latest-proxy.json：
 * 把每个平台下载地址 platforms.*.url 前面加上镜像前缀（app.config.json 的 updaterMirror），
 * 使国内客户端检查到更新后能直接从镜像下载安装包。
 *
 * 签名(signature)是对文件内容签的、与 url 无关，所以只改 url、不动签名，客户端校验照常通过。
 *
 * 用法：node scripts/make-proxy-manifest.mjs [输入latest.json] [输出latest-proxy.json]
 * 在 CI 发布流程里调用（见 .github/workflows/release.yml）。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const cfg = JSON.parse(readFileSync(new URL('../app.config.json', import.meta.url), 'utf-8'))
const mirror = cfg.updaterMirror
if (!mirror) {
  console.log('app.config.json 未配置 updaterMirror，跳过镜像清单生成。')
  process.exit(0)
}

const src = process.argv[2] || 'latest.json'
const out = process.argv[3] || 'latest-proxy.json'

const manifest = JSON.parse(readFileSync(src, 'utf-8'))
for (const platform of Object.values(manifest.platforms ?? {})) {
  if (platform?.url && !platform.url.startsWith(mirror)) {
    platform.url = mirror + platform.url
  }
}
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')
console.log(`已写出 ${out}（镜像前缀：${mirror}）`)

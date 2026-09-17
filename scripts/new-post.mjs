#!/usr/bin/env node
/**
 * 新建一篇博客文章
 *
 * 用法：
 *   pnpm new                          交互式，逐项询问
 *   pnpm new "文章标题"                只给标题，其余自动生成
 *   pnpm new "文章标题" my-post-slug   同时指定 URL 标识
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = path.join(ROOT, 'src', 'content', 'blog');
const USAGE = '用法：pnpm new "文章标题" [url-标识]';

/** 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC，跨时区会差一天） */
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 规整成可用的 URL 标识：保留中文、字母、数字、连字符 */
function toSlug(raw) {
  return raw
    .trim()
    .replace(/\.mdx?$/i, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const [titleArg, slugArg, descArg] = process.argv.slice(2);
const rl = readline.createInterface({ input, output });

async function ask(text) {
  // 不是交互式终端（管道、重定向、CI）就别问了，直接告诉用户怎么带参数跑
  if (!process.stdin.isTTY) {
    throw new Error(`当前不是交互式终端，请把参数直接写在命令里。\n  ${USAGE}`);
  }
  try {
    return (await rl.question(text)).trim();
  } catch {
    throw new Error(`没读到输入。\n  ${USAGE}`);
  }
}

try {
  const title = titleArg?.trim() || (await ask('文章标题：'));
  if (!title) throw new Error(`标题不能为空。${USAGE}`);

  let slugInput = slugArg;
  if (slugInput === undefined) {
    slugInput = await ask('URL 标识（英文或拼音，留空自动生成）：');
  }
  const slug = toSlug(slugInput) || `post-${today()}`;

  const description = descArg === undefined
    ? await ask('一句话描述（可留空）：')
    : descArg.trim();

  const file = path.join(POSTS_DIR, `${slug}.md`);
  const rel = path.relative(ROOT, file);

  if (fs.existsSync(file)) {
    throw new Error(`文件已存在，没有覆盖：${rel}`);
  }

  const body = `---
title: "${title.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
pubDate: ${today()}
tags: []
---

在这里开始写正文，支持全部 Markdown 语法。写完把这一段删掉即可。

## 小标题

- 列表项一
- 列表项二

> 引用格式是这样
`;

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(file, body, 'utf8');

  console.log('');
  console.log(`✓ 已创建 ${rel}`);
  console.log('');
  console.log('  接着做：');
  console.log('    pnpm dev     本地预览（http://localhost:4321）');
  console.log('    pnpm ship    校验、提交并推送到线上');
  console.log('');
} catch (err) {
  console.error('');
  console.error(`✗ ${err.message}`);
  console.error('');
  process.exitCode = 1;
} finally {
  rl.close();
}

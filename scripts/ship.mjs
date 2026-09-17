#!/usr/bin/env node
/**
 * 一键发布：构建校验 → 提交 → 推送
 *
 * 用法：
 *   pnpm ship                     提交说明自动用时间
 *   pnpm ship "新增一篇文章"        自定义提交说明
 *
 * 设计原则：构建不通过就什么都别提交，避免把坏版本推上线。
 */
import { execSync, execFileSync } from 'node:child_process';

const parts = process.argv.slice(2);
const message = parts.length
  ? parts.join(' ')
  : `更新博客 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;

const git = (...args) => execFileSync('git', args, { stdio: 'inherit' });
const gitQuiet = (...args) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim();

try {
  console.log('\n▶ 1/3 构建校验');
  execSync('pnpm build', { stdio: 'inherit' });

  console.log('\n▶ 2/3 提交改动');
  const dirty = gitQuiet('status', '--porcelain');
  if (dirty) {
    git('add', '-A');
    git('commit', '-m', message);
  } else {
    console.log('  （工作区没有改动，跳过提交）');
  }

  console.log('\n▶ 3/3 推送到远程');
  git('push');

  console.log('\n✓ 完成。Vercel 会自动构建部署，一两分钟后线上就更新了。\n');
} catch {
  console.error('');
  console.error('✗ 中断了，原因看上面的输出。');
  console.error('  构建失败 → 先本地 pnpm dev 看看页面，别急着发。');
  console.error('  推送被拒 → 远程可能有新提交，先 git pull --rebase 再试。');
  console.error('  本次没有提交任何东西之前，你的仓库都是安全的。');
  console.error('');
  process.exit(1);
}

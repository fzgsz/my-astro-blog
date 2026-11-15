#!/usr/bin/env node
/**
 * 发布博客：先展示将要提交的改动，确认后执行 pnpm ship。
 * 由桌面「发布博客」快捷方式调用，也可以手动 node scripts/publish.mjs。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import net from 'node:net';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const PORT = 4321;

function isPortBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(600);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

const rl = readline.createInterface({ input: stdin, output: stdout });

try {
  console.log('=== 当前改动 ===');
  const status = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim();
  console.log(status || '（工作区没有改动）');
  console.log('');

  if (process.env.PUBLISH_DRY === '1') {
    console.log('DRY RUN：只检查，不执行 pnpm ship。');
    rl.close();
    process.exit(0);
  }

  if (await isPortBusy(PORT)) {
    console.log('⚠ 4321 端口还有写作台 dev 在运行。');
    console.log('  建议先到写作台窗口按 Ctrl+C 停掉，避免构建缓存冲突。');
    const answer = (await rl.question('仍然继续？(y/N) ')).trim().toLowerCase();
    if (answer !== 'y') {
      console.log('已取消，没有提交任何内容。');
      rl.close();
      process.exit(0);
    }
  }

  const message = (await rl.question('提交说明（可留空，回车用默认）：')).trim();
  rl.close();

  const command = message
    ? `pnpm ship "${message.replace(/"/g, '\\"')}"`
    : 'pnpm ship';

  console.log('');
  console.log(`> ${command}`);
  console.log('');

  const result = spawnSync(command, { stdio: 'inherit', shell: true });
  process.exit(result.status ?? 0);
} catch (error) {
  rl.close();
  console.error('发布失败：', error.message);
  process.exit(1);
}

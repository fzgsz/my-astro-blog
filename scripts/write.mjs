#!/usr/bin/env node
/**
 * pnpm write：启动开发服务器并自动打开写作台 /admin。
 */
import { spawn } from 'node:child_process';

const PORT = 4321;
const URL = `http://localhost:${PORT}/admin`;

const dev = spawn('astro', ['dev', '--port', String(PORT)], {
  stdio: 'inherit',
  shell: true,
});

setTimeout(() => {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', URL], { stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    spawn('open', [URL], { stdio: 'ignore' });
  } else {
    spawn('xdg-open', [URL], { stdio: 'ignore' });
  }
}, 2500);

dev.on('exit', (code) => process.exit(code ?? 0));

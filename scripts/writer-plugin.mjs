/**
 * 本地写作台的保存端点
 *
 * 通过 Vite 的 configureServer 挂载，**只在 `astro dev` 时生效**，
 * 生产构建（`astro build`）完全不会包含它 —— 所以线上站点没有写文件的能力。
 *
 * 接收 POST JSON：{ title, slug, description, tags, content }
 * 写入 src/content/blog/<slug>.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC，会差一天） */
function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 规整 URL 标识：保留中文、字母、数字、连字符 */
function toSlug(raw) {
  return String(raw || '')
    .trim()
    .replace(/\.mdx?$/i, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeYaml(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function handleSave(req, res) {
  const send = (code, obj) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  };

  if (req.method !== 'POST') {
    return send(405, { ok: false, error: '只接受 POST 请求' });
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    // 防止超大请求打爆内存
    if (raw.length > 5 * 1024 * 1024) {
      send(413, { ok: false, error: '内容太大了' });
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      const payload = JSON.parse(raw || '{}');
      const title = String(payload.title || '').trim();
      if (!title) throw new Error('标题不能为空');

      const slug = toSlug(payload.slug) || `post-${localDate()}`;
      const description = String(payload.description || '').trim();
      const content = String(payload.content || '').trim();

      const tagList = (Array.isArray(payload.tags) ? payload.tags : String(payload.tags || '').split(/[,，]/))
        .map((t) => String(t).trim())
        .filter(Boolean);

      const dir = path.resolve(process.cwd(), 'src', 'content', 'blog');
      const file = path.join(dir, `${slug}.md`);

      // 防路径穿越：解析后的路径必须仍在目标目录内
      if (!file.startsWith(dir + path.sep)) {
        throw new Error('非法的 URL 标识');
      }

      const exists = fs.existsSync(file);

      const frontmatter = [
        '---',
        `title: "${escapeYaml(title)}"`,
        `description: "${escapeYaml(description)}"`,
        `pubDate: ${localDate()}`,
        `tags: [${tagList.map((t) => `"${escapeYaml(t)}"`).join(', ')}]`,
        '---',
        '',
      ].join('\n');

      fs.mkdirSync(dir, { recursive: true });
      // frontmatter 与正文之间留一个空行
      fs.writeFileSync(file, `${frontmatter}\n${content}\n`, 'utf8');

      send(200, {
        ok: true,
        overwritten: exists,
        slug,
        path: path.relative(process.cwd(), file).split(path.sep).join('/'),
      });
    } catch (err) {
      send(400, { ok: false, error: err.message || String(err) });
    }
  });
}

export default function writerPlugin() {
  return {
    name: 'local-writer',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'local-writer-endpoint',
                // configureServer 只会在 dev server 启动时调用，构建时不会执行
                configureServer(server) {
                  server.middlewares.use('/__writer/save', handleSave);
                },
              },
            ],
          },
        });
      },

      // 写作台是本地工具，不该出现在线上：
      // 构建完成后把 /admin 从产物里整个移除（线上访问它会 404，而不是看到一个空壳）
      'astro:build:done': ({ dir }) => {
        const target = fileURLToPath(new URL('admin', dir));
        if (fs.existsSync(target)) {
          fs.rmSync(target, { recursive: true, force: true });
          console.log('[local-writer] 已从构建产物移除 /admin（本地工具，不对外发布）');
        }
      },
    },
  };
}

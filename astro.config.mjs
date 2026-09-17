// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import writerPlugin from './scripts/writer-plugin.mjs';
// https://astro.build/config
export default defineConfig({
	site: 'https://my-astro-blog-zeta.vercel.app',
	trailingSlash: 'never',
	// writerPlugin 只在 astro dev 时挂载保存端点，构建产物里没有任何写入能力
	// sitemap 排除 /admin：那是本地写作工具，不对外发布
	integrations: [
		mdx(),
		sitemap({ filter: (page) => !page.includes('/admin') }),
		writerPlugin(),
	],
});

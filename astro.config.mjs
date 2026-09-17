// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
// https://astro.build/config
export default defineConfig({
	site: 'https://my-blog.vercel.app',
	trailingSlash: "never", // 新增这一行
	integrations: [mdx(), sitemap()],
});

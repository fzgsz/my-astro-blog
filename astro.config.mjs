// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
// https://astro.build/config
export default defineConfig({
	site: 'https://my-astro-blog-zeta.vercel.app',
	trailingSlash: 'never',
	integrations: [mdx(), sitemap()],
});

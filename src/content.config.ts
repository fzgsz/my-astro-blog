import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			// 描述可以留空：留空时详情页的 SEO 描述会退回用标题
			description: z.string().optional(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			// 标签：用于分类展示与筛选
			tags: z.array(z.string()).default([]),
			// 标记为精选，用于首页单独推荐
			featured: z.boolean().default(false),
		}),
});

export const collections = { blog };

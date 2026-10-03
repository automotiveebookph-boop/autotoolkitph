import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Products collection — one YAML file per product in src/content/products/.
 * Files starting with "_" (e.g. _TEMPLATE.yaml) are ignored.
 * The build fails with a field-level error if anything required is missing or malformed.
 * See _TEMPLATE.yaml for documentation of every field.
 */

const text = (field: string) =>
  z.string({ error: `"${field}" is required and must be text` }).trim().min(1, `"${field}" cannot be empty`);

const RESERVED_SLUGS = ['privacy', '404', 'sitemap', 'robots', 'index', 'brand', '_astro'];

const products = defineCollection({
  loader: glob({ base: './src/content/products', pattern: ['**/*.{yaml,yml}', '!**/_*'] }),
  schema: z
    .object({
      slug: text('slug')
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '"slug" must be lowercase letters, numbers and dashes (e.g. "inspection-kit")')
        .refine((s) => !RESERVED_SLUGS.includes(s), '"slug" clashes with a reserved page name'),
      status: z.enum(['active', 'coming-soon', 'hidden'], {
        error: '"status" must be one of: active, coming-soon, hidden',
      }),
      sortOrder: z.number({ error: '"sortOrder" is required and must be a number' }),
      category: text('category'),

      name: text('name'),
      shortName: text('shortName'),
      eyebrow: text('eyebrow'),
      h1: text('h1'),
      subhead: text('subhead'),
      mockupLine: text('mockupLine'),
      /** One-line summary used on homepage cards. Falls back to subhead. */
      cardBlurb: z.string().trim().optional(),

      /** Leave out while the price isn't decided: pages show "₱___" and production builds refuse the product while it's active. */
      price: z.number({ error: '"price" must be a number (no ₱ sign)' }).positive().optional(),
      regularPrice: z.number().positive().optional(),
      priceLabel: text('priceLabel'),
      valueLine: text('valueLine'),

      problem: z.object({
        heading: text('problem.heading'),
        body: text('problem.body'),
        bullets: z.array(text('problem.bullets[]')).min(1, '"problem.bullets" needs at least 1 item'),
      }),

      modulesHeading: text('modulesHeading'),
      modules: z
        .array(
          z.object({
            number: text('modules[].number'),
            title: text('modules[].title'),
            description: text('modules[].description'),
          }),
        )
        .min(1, '"modules" needs at least 1 item'),

      previewsHeading: z.string().trim().default('Silipin ang loob'),
      previews: z
        .array(
          z.object({
            /** File name inside src/assets/products/<slug>/, e.g. "preview-1.webp". */
            image: text('previews[].image'),
            label: text('previews[].label'),
          }),
        )
        .max(6, '"previews" can have at most 6 items')
        .default([]),

      audienceHeading: z.string().trim().default('Para kanino ito?'),
      audience: z.array(text('audience[]')).min(1, '"audience" needs at least 1 item'),

      creatorNoteHeading: z.string().trim().default('Sino ang gumawa nito?'),
      creatorNote: z.array(text('creatorNote[]')).min(1, '"creatorNote" needs at least 1 paragraph'),

      /** Optional. Without it the pricing card shows no guarantee box and the pay line drops the guarantee. */
      guarantee: z
        .object({
          body: text('guarantee.body'),
        })
        .optional(),

      /** Optional strip of short trust points shown under the hero, e.g. what is up to date. */
      trust: z
        .object({
          heading: text('trust.heading'),
          items: z.array(text('trust.items[]')).min(1, '"trust.items" needs at least 1 item'),
        })
        .optional(),

      howToOrder: z.array(text('howToOrder[]')).min(1, '"howToOrder" needs at least 1 step'),

      faqs: z
        .array(z.object({ q: text('faqs[].q'), a: text('faqs[].a') }))
        .min(1, '"faqs" needs at least 1 item'),

      finalCta: z.object({
        heading: text('finalCta.heading'),
        body: z.string().trim().optional(),
      }),

      disclaimer: text('disclaimer'),

      seo: z.object({
        title: text('seo.title'),
        description: text('seo.description'),
        /** Optional file name inside src/assets/products/<slug>/ (1200×630). Falls back to /brand/og-default.jpg. */
        ogImage: z.string().trim().optional(),
      }),

      /** Supported by the schema, not rendered anywhere yet. */
      addOns: z
        .array(
          z.object({
            name: text('addOns[].name'),
            price: z.number().positive(),
            description: text('addOns[].description'),
          }),
        )
        .default([]),
    })
    .refine((p) => p.regularPrice === undefined || (p.price !== undefined && p.regularPrice > p.price), {
      message: '"regularPrice" must be higher than "price" (or remove it)',
      path: ['regularPrice'],
    }),
});

export const collections = { products };

import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import {
  BRAND_NAME,
  DELIVERY_HOURS,
  MESSENGER_BASE,
  SHOW_COMING_SOON,
  YEARS_EXPERIENCE,
} from '../config/site';

export type Product = CollectionEntry<'products'>['data'];
export type CtaLocation = 'hero' | 'pricing' | 'final' | 'sticky';

const bySortOrder = (a: Product, b: Product) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

async function allProducts(): Promise<Product[]> {
  const entries = await getCollection('products');
  const data = entries.map((e) => e.data);
  const seen = new Set<string>();
  for (const p of data) {
    if (seen.has(p.slug)) throw new Error(`[products] Two product files use the slug "${p.slug}". Slugs must be unique.`);
    seen.add(p.slug);
  }
  return data;
}

/** Products that get their own page and appear in the sitemap. */
export async function getActiveProducts(): Promise<Product[]> {
  return (await allProducts()).filter((p) => p.status === 'active').sort(bySortOrder);
}

/** Products to show on the homepage: active first, then coming-soon (only if SHOW_COMING_SOON). */
export async function getListedProducts(): Promise<Product[]> {
  const all = await allProducts();
  const active = all.filter((p) => p.status === 'active').sort(bySortOrder);
  const soon = SHOW_COMING_SOON ? all.filter((p) => p.status === 'coming-soon').sort(bySortOrder) : [];
  return [...active, ...soon];
}

export const formatPrice = (n: number) => `₱${n.toLocaleString('en-PH')}`;

/** Replace {BRAND_NAME}, {YEARS_EXPERIENCE}, {DELIVERY_HOURS} and (with a product) {PRICE}. */
export function fill(text: string, product?: Pick<Product, 'price'>): string {
  let out = text
    .replaceAll('{BRAND_NAME}', BRAND_NAME)
    .replaceAll('{YEARS_EXPERIENCE}', YEARS_EXPERIENCE)
    .replaceAll('{DELIVERY_HOURS}', DELIVERY_HOURS);
  if (product) out = out.replaceAll('{PRICE}', formatPrice(product.price));
  return out;
}

/** https://m.me/<page>?ref=<slug>_<location> — lets you see which product and button started the chat. */
export function messengerLink(slug: string, location: CtaLocation | string): string {
  return `${MESSENGER_BASE}?ref=${encodeURIComponent(`${slug}_${location}`)}`;
}

/* ── Product images: src/assets/products/<slug>/<file> ─────────────────────── */

const productImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/products/**/*.{webp,png,jpg,jpeg,avif}',
  { eager: true },
);

/** Returns the image if the file exists, otherwise undefined (caller renders a placeholder). */
export function getProductImage(slug: string, file: string | undefined): ImageMetadata | undefined {
  if (!file) return undefined;
  return productImages[`/src/assets/products/${slug}/${file}`]?.default;
}

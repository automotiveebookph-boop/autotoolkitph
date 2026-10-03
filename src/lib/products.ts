import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import {
  BRAND_NAME,
  BUILD_ENV,
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
  const active = (await allProducts()).filter((p) => p.status === 'active').sort(bySortOrder);
  assertImagesExist(active);
  assertPricesSet(active);
  return active;
}

/** Products to show on the homepage: active first, then coming-soon (only if SHOW_COMING_SOON). */
export async function getListedProducts(): Promise<Product[]> {
  const all = await allProducts();
  const active = all.filter((p) => p.status === 'active').sort(bySortOrder);
  const soon = SHOW_COMING_SOON ? all.filter((p) => p.status === 'coming-soon').sort(bySortOrder) : [];
  return [...active, ...soon];
}

/** "₱199", or the placeholder "₱___" while a product's price isn't set yet. */
export const formatPrice = (n: number | undefined) => (n === undefined ? '₱___' : `₱${n.toLocaleString('en-PH')}`);

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

export const IMAGE_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg', 'avif'];

const productImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/products/**/*.{webp,png,jpg,jpeg,avif,WEBP,PNG,JPG,JPEG,AVIF}',
  { eager: true },
);

const stem = (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase();

/**
 * Finds src/assets/products/<slug>/<file>. If the exact file isn't there, a file with the same
 * base name and any accepted extension is used (so preview-1.png satisfies "preview-1.webp").
 */
export function getProductImage(slug: string, file: string | undefined): ImageMetadata | undefined {
  if (!file) return undefined;
  const dir = `/src/assets/products/${slug}/`;
  const exact = productImages[dir + file];
  if (exact) return exact.default;
  const key = Object.keys(productImages).find((k) => k.startsWith(dir) && stem(k.slice(dir.length)) === stem(file));
  return key ? productImages[key].default : undefined;
}

/** A "₱___" placeholder may show locally and on preview deploys, never on the live site. */
function assertPricesSet(products: Product[]) {
  const unpriced = products.filter((p) => p.price === undefined).map((p) => p.slug);
  if (unpriced.length && BUILD_ENV === 'production') {
    throw new Error(
      `[products] Active product(s) without a price: ${unpriced.join(', ')}.
` +
        `Production build stopped so "₱___" never goes live. Set "price" in the YAML, or set status to "hidden".`,
    );
  }
}

/**
 * Active products must never show an empty preview box: stop the build, naming every missing
 * file, if a listed preview image or seo.ogImage can't be found.
 */
function assertImagesExist(products: Product[]) {
  const problems: string[] = [];
  for (const p of products) {
    const missing = p.previews
      .filter((v) => !getProductImage(p.slug, v.image))
      .map((v) => `${v.image}  (${v.label})`);
    if (p.seo.ogImage && !getProductImage(p.slug, p.seo.ogImage)) missing.push(`${p.seo.ogImage}  (seo.ogImage share image)`);
    if (missing.length) {
      problems.push(
        `Product "${p.slug}" is active but these images are missing from src/assets/products/${p.slug}/:\n` +
          missing.map((m) => `    - ${m}`).join('\n'),
      );
    }
  }
  if (problems.length) {
    throw new Error(
      `[products] Missing product images. Build stopped so no empty preview boxes go live.\n\n` +
        problems.join('\n\n') +
        `\n\nAccepted formats: ${IMAGE_EXTENSIONS.map((e) => '.' + e).join(', ')} (the extension may differ from the YAML).` +
        `\nFix: add the files, or set the product's status to "hidden" or "coming-soon" until they're ready.`,
    );
  }
}

import type { APIRoute } from 'astro';
import { getActiveProducts } from '../lib/products';

/** Homepage, privacy, and ACTIVE products only (hidden and coming-soon are excluded). */
export const GET: APIRoute = async ({ site }) => {
  const products = await getActiveProducts();
  const paths = ['/', ...products.map((p) => `/${p.slug}`), '/privacy'];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};

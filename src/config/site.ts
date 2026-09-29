/**
 * Brand-level configuration. Everything that could change about the brand lives here.
 * Pages and components import from this file — never hard-code these values elsewhere.
 */

// TODO(pre-launch): confirm final brand name.
export const BRAND_NAME = 'AutoToolKitPH';

export const TAGLINE = 'Practical automotive tools, guides & systems for Filipinos';

// TODO(pre-launch): your Facebook Page username, as it appears in m.me/<name> links.
export const FB_PAGE_NAME: string = 'TotoGaragehomeservice';

// TODO(pre-launch): replace with a number, e.g. "15". Used via the {YEARS_EXPERIENCE} token.
export const YEARS_EXPERIENCE: string = '[X]';

// Used via the {DELIVERY_HOURS} token.
export const DELIVERY_HOURS = '8AM–9PM';

// TODO(pre-launch): your Meta Pixel ID. While empty, the Pixel script is NOT loaded at all.
export const META_PIXEL_ID: string = '';

/**
 * TODO(pre-launch): your production URL with no trailing slash, e.g. "https://autotoolkitph.com".
 * Used for canonical URLs, Open Graph URLs, JSON-LD and the sitemap.
 * While empty, builds on Vercel fall back to the project's production domain
 * (VERCEL_PROJECT_PRODUCTION_URL); local builds fall back to http://localhost:4321.
 */
export const SITE_URL: string = '';

export const PAYMENT_METHODS = ['GCash', 'Maya'];

export const GUARANTEE_TEXT = '7-day money-back guarantee';

/** Show products with status "coming-soon" on the homepage as non-clickable cards. */
export const SHOW_COMING_SOON: boolean = false;

export const FB_PAGE_URL = `https://www.facebook.com/${FB_PAGE_NAME}`;
export const MESSENGER_BASE = `https://m.me/${FB_PAGE_NAME}`;

export const LOGOS = {
  /** Header, on light backgrounds */
  horizontalLight: { src: '/brand/logo-horizontal-light.svg', width: 200, height: 40 },
  /** Dark sections and footer */
  stackedDark: { src: '/brand/logo-stacked-dark.svg', width: 160, height: 96 },
  /** Favicon and small uses */
  mark: { src: '/brand/logo-mark.svg', width: 64, height: 64 },
};

export const OG_DEFAULT = '/brand/og-default.jpg';

export function resolveSiteUrl(): string {
  if (SITE_URL) return SITE_URL.replace(/\/+$/, '');
  // Vercel sets this at build time; read via globalThis so the file needs no Node typings.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const vercel = env?.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:4321';
}

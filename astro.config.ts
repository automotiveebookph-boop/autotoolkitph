import { defineConfig, fontProviders } from 'astro/config';
import { resolveSiteUrl } from './src/config/site';

export default defineConfig({
  site: resolveSiteUrl(),
  output: 'static',
  // Short, clean URLs for ads: /inspection-kit (Vercel serves inspection-kit.html via cleanUrls).
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'always',
  },
  // Self-hosted fonts (downloaded at build time) with metric-matched fallbacks.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Bricolage Grotesque',
      cssVariable: '--font-heading',
      weights: [600, 800],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'], // latin-ext carries ₱ (U+20B1); fetched only on pages that use it
      formats: ['woff2'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Source Sans 3',
      cssVariable: '--font-body',
      weights: [400, 600, 700],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'], // latin-ext carries ₱ (U+20B1); fetched only on pages that use it
      formats: ['woff2'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
  ],
});

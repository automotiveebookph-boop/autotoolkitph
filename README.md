# AutoToolKitPH

Mobile-first product site for AutoToolKitPH. It's a static Astro site with no checkout: every buy button opens Facebook Messenger.

- **Stack:** Astro 7 (static output), plain CSS with design tokens, self-hosted fonts, no UI framework.
- **JavaScript:** there are no JS bundles. The only scripts are three tiny inline ones: the sticky CTA, the preview lightbox, and the Meta Pixel (which only loads when an ID is set).
- **Products:** each product is one YAML file plus a folder of images. You never need to edit page code to add one.

---

## 1. Run it locally

Requires **Node.js 22.12 or newer**.

```bash
npm install
npm run dev        # http://localhost:4321, live reload while editing
npm run build      # production build into dist/ (also validates every product file)
npm run preview    # serve the production build at http://localhost:4321
npm run check      # TypeScript / Astro type check
```

## 2. Deploy on Vercel

1. Push this folder to a GitHub (or GitLab/Bitbucket) repository.
2. In Vercel, click **Add New → Project** and import the repository.
3. Vercel detects **Astro** automatically. Keep the defaults (build command `astro build`, output directory `dist`).
4. Click **Deploy**.
5. Add your domain under **Settings → Domains**, then set `SITE_URL` in `src/config/site.ts` to that domain and push again.

`vercel.json` turns on clean URLs, so `/inspection-kit` works without `.html`, and it sets long cache headers on hashed assets. Every push to the main branch redeploys the site.

> Until `SITE_URL` is set, canonical URLs, OG tags and the sitemap use Vercel's production domain automatically (`VERCEL_PROJECT_PRODUCTION_URL`).

---

## 3. Where things live

| What | Where |
| --- | --- |
| Brand name, tagline, FB page, Pixel ID, site URL, payment methods, guarantee, coming-soon flag | `src/config/site.ts` |
| Colors, fonts, spacing | `src/styles/tokens.css` |
| Font choices (families and weights) | `astro.config.ts` → `fonts` |
| Product data (one file each) | `src/content/products/*.yaml` |
| Product schema and validation | `src/content.config.ts` |
| Product images | `src/assets/products/<slug>/` |
| Logos, default share image | `public/brand/` |
| Pixel / tracking | `src/components/MetaPixel.astro` |
| Homepage copy (why us, FAQ) | `src/pages/index.astro` |
| Privacy policy | `src/pages/privacy.astro` |

Text tokens that work inside product files: `{BRAND_NAME}`, `{YEARS_EXPERIENCE}`, `{DELIVERY_HOURS}`, `{PRICE}`.

---

## 4. How to add a new product

1. **Copy the template.**
   Duplicate `src/content/products/_TEMPLATE.yaml` and rename it, for example `src/content/products/maintenance-log.yaml`. The new name must **not** start with `_`, because files starting with `_` are ignored.

2. **Fill in the fields.** Every field is explained inside the template. Pay attention to these:
   - `slug`: the URL (`yoursite.com/<slug>`). Keep it short, since it appears in ads.
   - `price` / `regularPrice`: numbers only, no `₱`.
   - `category`: the homepage groups products by category once there is more than one.
   - `sortOrder`: lower numbers appear first.

3. **Add the images.**
   Create `src/assets/products/<slug>/` and put the preview images there, with the same file names as the `previews:` list (for example `preview-1.webp`).
   - Accepted formats: `.webp`, `.png`, `.jpg`, `.jpeg`, `.avif`. The extension doesn't have to match the YAML: `preview-1.png` satisfies `preview-1.webp`. Phone screenshots are fine as-is. Astro converts everything to compressed WebP (320/640px thumbnails and a 1200px lightbox version).
   - Portrait pages around 3:4 look best. Thumbnails are cropped to 3:4 from the top of the page.
   - Optional share image: a 1200×630 `og.jpg` in the same folder, then set `seo.ogImage: og.jpg`.
   - **If a product is `active` and any listed image is missing, the build fails** with a message naming each missing file, and Vercel keeps the previous version live. A product can't go live with empty preview boxes.

4. **Choose a status.**
   - `hidden`: builds nothing. Use this while drafting.
   - `coming-soon`: no page. The product appears on the homepage as a greyed "Coming soon" card, but **only** if `SHOW_COMING_SOON = true` in `src/config/site.ts`.
   - `active`: the page is built at `/<slug>`, and the product is listed on the homepage, in the footer and in the sitemap.

5. **Test locally.** Run `npm run build`. If a required field is missing or wrong, the build stops with a message naming the file and field, for example:
   ```
   products → maintenance-log data does not match collection schema.
     price: "price" is required and must be a number (no ₱ sign)
   ```
   Then run `npm run preview` and open `http://localhost:4321/<slug>`.

6. **Deploy.** Commit and push, and Vercel publishes it.

### Launching as "coming soon" first
1. Set `status: coming-soon` in the product file. Only the fields needed for the card are displayed (`name`, `category`, `mockupLine`, `cardBlurb`), but the whole file must still be valid.
2. Set `SHOW_COMING_SOON = true` in `src/config/site.ts`.
3. Deploy. The card appears on the homepage, not clickable, with no page and no sitemap entry.
4. On launch day, change it to `status: active` and deploy. If no other product is coming soon, set `SHOW_COMING_SOON` back to `false`.

### About the sample product
`src/content/products/sample-maintenance-log.yaml` is a dummy with `status: hidden`, kept only to show that multiple products work. Delete it whenever you like.

---

## 5. Messenger links and tracking

Every buy button links to:

```
https://m.me/<FB_PAGE_NAME>?ref=<slug>_<location>
```

`location` is one of `hero`, `pricing`, `final` or `sticky`, for example `?ref=inspection-kit_hero`. The ref shows up in your Messenger inbox, so you can tell which product and which button started each chat.

**Meta Pixel** (only when `META_PIXEL_ID` is set; otherwise nothing loads):

| Event | When | Parameters |
| --- | --- | --- |
| `PageView` | Every page load | — |
| `ViewContent` | Once per page, when the pricing block scrolls into view | `content_ids: [slug]`, `content_name`, `content_type`, `value`, `currency: PHP` |
| `Contact` | Every Messenger button tap | the same, plus `ref` |

Test it with the **Meta Pixel Helper** Chrome extension, or in Events Manager under **Test Events**.

---

## 6. Pre-launch checklist

- [ ] `FB_PAGE_NAME` in `src/config/site.ts` is your real page username. Open `https://m.me/<name>` to check.
- [ ] `YEARS_EXPERIENCE` is a real number, not `[X]`.
- [ ] `DELIVERY_HOURS` is correct.
- [ ] `META_PIXEL_ID` is set, and all three events show up in Events Manager → Test Events.
- [ ] `SITE_URL` is set to your final domain (no trailing slash).
- [ ] **Exact logo colors** are pasted into `src/styles/tokens.css` (see the TODO). If you change the greens, re-check contrast at <https://webaim.org/resources/contrastchecker/>. Lime `--color-accent-bright` must never be used as text on a light background.
- [ ] **Logo files** replace the placeholders in `public/brand/`:
  - `logo-horizontal-light.svg`: header on light backgrounds, around 5:1
  - `logo-stacked-dark.svg`: footer on dark backgrounds, around 5:3
  - `logo-mark.svg`: square, used as the favicon
- [ ] **4 preview images** are in `src/assets/products/inspection-kit/` (`preview-1.webp` … `preview-4.webp`).
- [ ] **OG images**: `public/brand/og-default.jpg` (1200×630) is replaced with a real design, plus an optional per-product `og.jpg`. Check it with Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/).
- [ ] **Privacy policy** (`src/pages/privacy.astro`) has been reviewed by a qualified person, and its "Last updated" date is correct.
- [ ] You've tapped every buy button on a real phone and confirmed Messenger opens with the right `ref`.
- [ ] You've run a Lighthouse mobile audit on the live product page.
